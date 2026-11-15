import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ACTIVITY_EVENT_LIMIT,
  ActivityEvent,
  Experiment,
  isExperimentId,
  type ExperimentStore,
  type RunLeaseStore,
} from "../contracts";
import { logEvent } from "../telemetry";

/** Experiment ids are `exp_<hex>`; anything else (e.g. `../x` from the URL) never touches the filesystem. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Rewrites a JSONL activity file to its newest ACTIVITY_EVENT_LIMIT lines once it passes this size. */
const ACTIVITY_FILE_MAX_BYTES = 256 * 1024;

function trimActivityFile(file: string): void {
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-ACTIVITY_EVENT_LIMIT);
  writeFileSync(file, lines.join("\n") + "\n");
}

/** Default persistence: JSON files under data/experiments/. */
export class JsonFileStore implements ExperimentStore {
  readonly name = "json-file";
  private dir: string;

  constructor(dir = path.join(process.cwd(), "data", "experiments")) {
    this.dir = dir;
    // Edge runtimes (workerd) ship a read-only fs — the store stays usable (empty reads).
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* json-file store degrades to empty */
    }
  }

  /** Path for a valid experiment id that resolves inside the store dir; null otherwise. */
  private fileFor(id: string): string | null {
    if (!isExperimentId(id)) return null;
    const root = path.resolve(this.dir);
    const p = path.resolve(root, `${id}.json`);
    return p.startsWith(root + path.sep) ? p : null;
  }

  async save(e: Experiment): Promise<void> {
    const p = this.fileFor(e.id);
    if (!p) throw new Error("invalid experiment id");
    const doc = JSON.stringify(Experiment.parse(e), null, 2);
    const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
    if (!onWorkers) {
      // Node/local: real write errors (disk full, permissions) must surface — a silent
      // drop would let create() report success for an experiment reads can't find.
      writeFileSync(p, doc);
      return;
    }
    try {
      writeFileSync(p, doc);
    } catch {
      /* workerd fs is read-only — writes no-op (D1Store is the real store there) */
    }
  }

  async get(id: string): Promise<Experiment | null> {
    if (!SAFE_ID.test(id)) return null;
    const p = this.fileFor(id);
    if (!p) return null;
    try {
      if (!existsSync(p)) return null;
      return Experiment.parse(JSON.parse(readFileSync(p, "utf8")));
    } catch {
      return null;
    }
  }

  async list(): Promise<Experiment[]> {
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    } catch {
      return [];
    }
    return files.flatMap((f) => {
      try {
        return parseListed(JSON.parse(readFileSync(path.join(this.dir, f), "utf8")), f);
      } catch {
        return parseListed(undefined, f);
      }
    });
  }

  private activityFile(id: string): string | null {
    if (!isExperimentId(id)) return null;
    const root = path.resolve(this.dir);
    const p = path.resolve(root, `${id}.activity.jsonl`);
    return p.startsWith(root + path.sep) ? p : null;
  }

  async appendActivity(id: string, event: ActivityEvent): Promise<void> {
    const file = this.activityFile(id);
    if (!file) return;
    try {
      appendFileSync(file, JSON.stringify(ActivityEvent.parse(event)) + "\n");
      if (statSync(file).size > ACTIVITY_FILE_MAX_BYTES) trimActivityFile(file);
    } catch {
      /* activity writes are best-effort — workerd fs is read-only */
    }
  }

  async activity(id: string, limit = ACTIVITY_EVENT_LIMIT): Promise<ActivityEvent[]> {
    const file = this.activityFile(id);
    if (!file) return [];
    try {
      if (!existsSync(file)) return [];
      return readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .flatMap((line) => {
          try {
            return [ActivityEvent.parse(JSON.parse(line))];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }
}

/**
 * Tiger Data (Postgres/TimescaleDB) persistence.
 * Active when DATABASE_URL or TIGERDATA_URL is set; `pg` is lazily imported.
 */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    target_url TEXT NOT NULL,
    goal TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS experiment_activity (
    seq BIGSERIAL PRIMARY KEY,
    id TEXT NOT NULL,
    ts TEXT NOT NULL,
    stage TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    url TEXT
  );`;

export class TigerDataStore implements ExperimentStore {
  readonly name = "tigerdata";
  private url: string;
  private client: import("pg").Client | null = null;

  constructor() {
    this.url = process.env.TIGERDATA_URL ?? process.env.DATABASE_URL ?? "";
    if (!this.url) throw new Error("TigerDataStore requires TIGERDATA_URL or DATABASE_URL");
  }

  private async conn(): Promise<import("pg").Client> {
    if (this.client) return this.client;
    const { Client } = await import("pg");
    this.client = new Client({ connectionString: this.url, ...sslOptions(this.url) });
    await this.client.connect();
    await this.client.query(SCHEMA_SQL);
    return this.client;
  }

  async save(experiment: Experiment): Promise<void> {
    const e = Experiment.parse(experiment);
    const c = await this.conn();
    await c.query(
      `INSERT INTO experiments (id, status, target_url, goal, payload)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET status=$2, payload=$5`,
      [e.id, e.status, e.targetUrl, e.goal, JSON.stringify(e)],
    );
  }

  async get(id: string): Promise<Experiment | null> {
    const c = await this.conn();
    const { rows } = await c.query(`SELECT payload FROM experiments WHERE id=$1`, [id]);
    return rows[0] ? Experiment.parse(rows[0].payload) : null;
  }

  async list(): Promise<Experiment[]> {
    const c = await this.conn();
    const { rows } = await c.query(`SELECT payload FROM experiments ORDER BY created_at DESC`);
    return rows.flatMap((r) => parseListed(r.payload, String(r.payload?.id ?? "unknown")));
  }

  async appendActivity(id: string, event: ActivityEvent): Promise<void> {
    const c = await this.conn();
    await c.query(
      `INSERT INTO experiment_activity (id, ts, stage, kind, message, url) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, event.ts, event.stage, event.kind, event.message, event.url ?? null],
    );
    await c.query(
      `DELETE FROM experiment_activity WHERE id=$1
         AND seq <= (SELECT seq FROM experiment_activity WHERE id=$1 ORDER BY seq DESC LIMIT 1 OFFSET $2)`,
      [id, ACTIVITY_EVENT_LIMIT],
    );
  }

  async activity(id: string, limit = ACTIVITY_EVENT_LIMIT): Promise<ActivityEvent[]> {
    const c = await this.conn();
    const { rows } = await c.query(
      `SELECT ts, stage, kind, message, url FROM experiment_activity WHERE id=$1 ORDER BY seq DESC LIMIT $2`,
      [id, limit],
    );
    return rows
      .reverse()
      .map((r) => ActivityEvent.parse({ ...r, url: r.url ?? undefined }));
  }
}

/** Minimal D1 surface this store uses — avoids a @cloudflare/workers-types dep. */
interface D1Prepared {
  bind(...values: unknown[]): D1Prepared;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
}
interface D1Binding {
  prepare(sql: string): D1Prepared;
}

const D1_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    target_url TEXT NOT NULL,
    goal TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS experiment_activity (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    ts TEXT NOT NULL,
    stage TEXT NOT NULL,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    url TEXT
  );
  CREATE TABLE IF NOT EXISTS run_leases (
    key TEXT PRIMARY KEY,
    holder TEXT NOT NULL,
    stage TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );`;

const D1_SCHEMA_STATEMENTS = D1_SCHEMA_SQL.split(";").map((s) => s.trim()).filter(Boolean);

/**
 * Bindings whose schema setup already succeeded in this isolate. Only success is recorded, so a
 * failed setup retries on the next call. Concurrent first calls each run the idempotent DDL
 * rather than sharing one pending promise across request contexts.
 */
const d1SchemaReady = new WeakSet<D1Binding>();

async function ensureD1Schema(db: D1Binding): Promise<void> {
  if (d1SchemaReady.has(db)) return;
  // D1 prepare() accepts exactly one statement — run each separately.
  for (const stmt of D1_SCHEMA_STATEMENTS) await db.prepare(stmt).run();
  d1SchemaReady.add(db);
}

/**
 * Cloudflare D1 persistence — the primary store on Workers (pg sockets can't
 * reach Tiger Cloud from workerd). The DB binding lives on the request context
 * env and is resolved per call; the context itself is per-request.
 */
export class D1Store implements ExperimentStore {
  readonly name = "d1";
  /** Adapters no-op without keys: a missing DB binding degrades to empty reads / dropped writes. */
  private fallback = new JsonFileStore();

  async db(): Promise<D1Binding | null> {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as { DB?: D1Binding }).DB;
    if (!db) return null;
    await ensureD1Schema(db);
    return db;
  }

  async save(experiment: Experiment): Promise<void> {
    const e = Experiment.parse(experiment);
    const db = await this.db();
    if (!db) return this.fallback.save(e);
    await db
      .prepare(
        `INSERT INTO experiments (id, status, target_url, goal, payload, created_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT (id) DO UPDATE SET status=excluded.status, payload=excluded.payload`,
      )
      .bind(e.id, e.status, e.targetUrl, e.goal, JSON.stringify(e), e.createdAt)
      .run();
  }

  async get(id: string): Promise<Experiment | null> {
    const db = await this.db();
    if (!db) return this.fallback.get(id);
    const row = await db.prepare(`SELECT payload FROM experiments WHERE id=?`).bind(id).first<{ payload: string }>();
    return row ? Experiment.parse(JSON.parse(row.payload)) : null;
  }

  async list(): Promise<Experiment[]> {
    const db = await this.db();
    if (!db) return this.fallback.list();
    const { results } = await db
      .prepare(`SELECT payload FROM experiments ORDER BY created_at DESC`)
      .all<{ payload: string }>();
    return results.flatMap((r, i) => {
      try {
        return parseListed(JSON.parse(r.payload), `d1:${i}`);
      } catch {
        return parseListed(undefined, `d1:${i}`);
      }
    });
  }

  async appendActivity(id: string, event: ActivityEvent): Promise<void> {
    const db = await this.db();
    if (!db) return this.fallback.appendActivity(id, event);
    await db
      .prepare(
        `INSERT INTO experiment_activity (id, ts, stage, kind, message, url) VALUES (?,?,?,?,?,?)`,
      )
      .bind(id, event.ts, event.stage, event.kind, event.message, event.url ?? null)
      .run();
    await db
      .prepare(
        `DELETE FROM experiment_activity WHERE id=?
           AND seq <= (SELECT seq FROM experiment_activity WHERE id=? ORDER BY seq DESC LIMIT 1 OFFSET ?)`,
      )
      .bind(id, id, ACTIVITY_EVENT_LIMIT)
      .run();
  }

  async activity(id: string, limit = ACTIVITY_EVENT_LIMIT): Promise<ActivityEvent[]> {
    const db = await this.db();
    if (!db) return this.fallback.activity(id, limit);
    const { results } = await db
      .prepare(
        `SELECT ts, stage, kind, message, url FROM experiment_activity WHERE id=? ORDER BY seq DESC LIMIT ?`,
      )
      .bind(id, limit)
      .all<{ ts: string; stage: string; kind: string; message: string; url: string | null }>();
    return results
      .reverse()
      .map((r) => ActivityEvent.parse({ ...r, url: r.url ?? undefined }));
  }
}

/**
 * Snowflake Cortex Search — optional knowledge base over past findings.
 * Queries the Cortex Search REST endpoint; disabled without env config.
 */
export class SnowflakeCortex {
  private baseUrl: string;
  private token: string;
  private service: string;

  constructor() {
    const account = process.env.SNOWFLAKE_ACCOUNT_URL ?? "";
    this.baseUrl = account.endsWith("/") ? account.slice(0, -1) : account;
    this.token = process.env.SNOWFLAKE_TOKEN ?? "";
    this.service = process.env.SNOWFLAKE_CORTEX_SERVICE ?? "";
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.token && this.service);
  }

  /** Query Cortex Search for related past findings; [] when not configured. */
  async search(query: string, limit = 5): Promise<{ text: string; score?: number }[]> {
    if (!this.configured) return [];
    const res = await fetch(`${this.baseUrl}/api/v2/cortex/search:query`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query,
        service: this.service,
        limit,
        columns: ["title", "description", "recommendation"],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: { title?: string; description?: string }[] };
    return (data.results ?? []).map((r: { title?: string; description?: string }) => ({
      text: [r.title, r.description].filter(Boolean).join(" — "),
    }));
  }
}

/** Listing skips records that no longer match the contract so one bad document can't break the list. */
function parseListed(doc: unknown, ref: string): Experiment[] {
  const r = Experiment.safeParse(doc);
  if (r.success) return [r.data];
  logEvent({ stage: "storage", kind: "invalid-experiment-skipped", data: { ref, error: r.error.message.slice(0, 160) } });
  return [];
}

export class MemoryRunLeaseStore implements RunLeaseStore {
  private leases = new Map<string, { holder: string; stage: string; expiresAt: number }>();

  async acquireSlot(holder: string, limit: number, ttlMs: number, now: number): Promise<boolean> {
    for (const [key, lease] of this.leases) if (lease.expiresAt <= now) this.leases.delete(key);
    if ([...this.leases.keys()].filter((key) => key.startsWith("slot:")).length >= limit) return false;
    this.leases.set(`slot:${holder}`, { holder, stage: "slot", expiresAt: now + ttlMs });
    return true;
  }

  async acquireLock(id: string, holder: string, stage: string, ttlMs: number, now: number): Promise<boolean> {
    const key = `lock:${id}`;
    if ((this.leases.get(key)?.expiresAt ?? 0) > now) return false;
    this.leases.set(key, { holder, stage, expiresAt: now + ttlMs });
    return true;
  }

  async activeLock(id: string, now: number): Promise<{ stage: string } | null> {
    const lease = this.leases.get(`lock:${id}`);
    return lease && lease.expiresAt > now ? { stage: lease.stage } : null;
  }

  async release(holder: string): Promise<void> {
    for (const [key, lease] of this.leases) if (lease.holder === holder) this.leases.delete(key);
  }
}

const memoryRunLeases = new MemoryRunLeaseStore();

export class D1RunLeaseStore implements RunLeaseStore {
  private store = new D1Store();

  async acquireSlot(holder: string, limit: number, ttlMs: number, now: number): Promise<boolean> {
    const db = await this.store.db();
    if (!db) return memoryRunLeases.acquireSlot(holder, limit, ttlMs, now);
    await db.prepare("DELETE FROM run_leases WHERE expires_at <= ?").bind(now).run();
    const row = await db.prepare(`INSERT INTO run_leases (key, holder, stage, expires_at)
      SELECT ?, ?, 'slot', ? WHERE (SELECT COUNT(*) FROM run_leases WHERE stage = 'slot' AND key LIKE 'slot:%' AND expires_at > ?) < ? RETURNING holder`)
      .bind(`slot:${holder}`, holder, now + ttlMs, now, limit).first();
    return row !== null;
  }

  async acquireLock(id: string, holder: string, stage: string, ttlMs: number, now: number): Promise<boolean> {
    const db = await this.store.db();
    if (!db) return memoryRunLeases.acquireLock(id, holder, stage, ttlMs, now);
    const row = await db.prepare(`INSERT INTO run_leases (key, holder, stage, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET holder = excluded.holder, stage = excluded.stage, expires_at = excluded.expires_at
      WHERE run_leases.expires_at <= ? RETURNING holder`).bind(`lock:${id}`, holder, stage, now + ttlMs, now).first();
    return row !== null;
  }

  async activeLock(id: string, now: number): Promise<{ stage: string } | null> {
    const db = await this.store.db();
    if (!db) return memoryRunLeases.activeLock(id, now);
    return db.prepare("SELECT stage FROM run_leases WHERE key = ? AND expires_at > ?").bind(`lock:${id}`, now).first<{ stage: string }>();
  }

  async release(holder: string): Promise<void> {
    const db = await this.store.db();
    if (!db) return memoryRunLeases.release(holder);
    await db.prepare("DELETE FROM run_leases WHERE holder = ?").bind(holder).run();
  }
}

export function selectRunLeaseStore(): RunLeaseStore {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers"
    ? new D1RunLeaseStore() : memoryRunLeases;
}

export function selectStore(): ExperimentStore {
  if (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers") {
    return new D1Store();
  }
  if (process.env.TIGERDATA_URL || process.env.DATABASE_URL) {
    try {
      return new TigerDataStore();
    } catch {
      /* fall through to JSON */
    }
  }
  return new JsonFileStore();
}

/**
 * `sslmode=require` means "encrypt, don't verify the chain" in libpq, but node-postgres
 * treats it as verify-full and rejects Tiger Cloud's CA. Honour the libpq meaning so a
 * standard Tiger Data connection string works; verify-full/verify-ca stay strict.
 */
function sslOptions(url: string): { ssl?: { rejectUnauthorized: boolean } } {
  const mode = /[?&]sslmode=([^&]+)/.exec(url)?.[1];
  return mode === "require" || mode === "prefer" ? { ssl: { rejectUnauthorized: false } } : {};
}
