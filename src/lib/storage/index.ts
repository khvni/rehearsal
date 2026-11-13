import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { Experiment, type ExperimentStore } from "../contracts";

/** Default persistence: JSON files under data/experiments/. */
export class JsonFileStore implements ExperimentStore {
  readonly name = "json-file";
  private dir: string;

  constructor(dir = path.join(process.cwd(), "data", "experiments")) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  async save(e: Experiment): Promise<void> {
    writeFileSync(path.join(this.dir, `${e.id}.json`), JSON.stringify(e, null, 2));
  }

  async get(id: string): Promise<Experiment | null> {
    const p = path.join(this.dir, `${id}.json`);
    if (!existsSync(p)) return null;
    return Experiment.parse(JSON.parse(readFileSync(p, "utf8")));
  }

  async list(): Promise<Experiment[]> {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => Experiment.parse(JSON.parse(readFileSync(path.join(this.dir, f), "utf8"))));
  }
}

/**
 * Tiger Data (Postgres/TimescaleDB) persistence.
 * Active when DATABASE_URL or TIGERDATA_URL is set; `pg` is lazily imported.
 */
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
    this.client = new Client({ connectionString: this.url });
    await this.client.connect();
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS experiments (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        target_url TEXT NOT NULL,
        goal TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    return this.client;
  }

  async save(e: Experiment): Promise<void> {
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
    return rows.map((r) => Experiment.parse(r.payload));
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

export function selectStore(): ExperimentStore {
  if (process.env.TIGERDATA_URL || process.env.DATABASE_URL) {
    try {
      return new TigerDataStore();
    } catch {
      /* fall through to JSON */
    }
  }
  return new JsonFileStore();
}
