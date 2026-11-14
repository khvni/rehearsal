import type {
  AgentRunArgs,
  BrowserFunctionParams,
  BrowserRun,
  BrowserRunner,
  BrowserbaseFunctionRunnerOptions,
  DomPatch,
  OpenPageResult,
  TrajectoryArgs,
  Viewport,
} from "../contracts";
import { RehearsalError } from "../errors";
import { assertPublicUrl } from "../fetch/guards";
import { errorText } from "./types";

const API_BASE = "https://api.browserbase.com";
const TERMINAL = new Set(["COMPLETED", "FAILED"]);

interface Invocation {
  id: string;
  status: string;
  results?: unknown;
  error?: unknown;
}

/**
 * Runs each browser operation inside the published Browserbase Function
 * (functions/rehearsal-browser), so Stagehand executes next to its browser session.
 * Used on workerd, where Stagehand itself cannot run.
 */
export class BrowserbaseFunctionRunner implements BrowserRunner {
  readonly name = "browserbase-function";
  readonly supportsAgent = true;
  private fetchImpl: typeof fetch;
  private sleep: (ms: number) => Promise<void>;

  constructor(private opts: BrowserbaseFunctionRunnerOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async openPage(url: string, viewport: Viewport, opts?: { patches?: DomPatch[]; shotName?: string }): Promise<OpenPageResult> {
    await assertPublicUrl(url);
    return (await this.call({ op: "openPage", args: { url, viewport, ...(opts?.patches ? { patches: opts.patches } : {}) } })) as OpenPageResult;
  }

  async runTrajectory(args: TrajectoryArgs): Promise<BrowserRun> {
    await assertPublicUrl(args.url);
    return (await this.call({ op: "runTrajectory", args: { ...args } })) as BrowserRun;
  }

  async runAgentTask(args: AgentRunArgs): Promise<BrowserRun> {
    await assertPublicUrl(args.url);
    return (await this.call({ op: "runAgentTask", args: { ...args } })) as BrowserRun;
  }

  async close(): Promise<void> {}

  private async api(path: string, init?: RequestInit): Promise<Invocation> {
    const base = this.opts.apiBase ?? API_BASE;
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-bb-api-key": this.opts.apiKey },
      });
    } catch (e) {
      throw new RehearsalError("BROWSER_REMOTE_FAILED", `Browserbase Function API unreachable: ${errorText(e, 160)}`);
    }
    if (!res.ok) {
      const body = errorText(await res.text().catch(() => ""), 200);
      throw new RehearsalError("BROWSER_REMOTE_FAILED", `Browserbase Function API ${res.status} on ${path.split("/").slice(0, 4).join("/")}: ${body}`);
    }
    return (await res.json()) as Invocation;
  }

  private async call(params: BrowserFunctionParams): Promise<unknown> {
    const timeoutMs = this.opts.timeoutMs ?? 180_000;
    const pollMs = this.opts.pollMs ?? 2_000;
    let inv = await this.api(`/v1/functions/${this.opts.functionId}/invoke`, {
      method: "POST",
      body: JSON.stringify({ params, sessionCreateParams: {
          timeout: Math.max(60, Math.ceil(timeoutMs / 1000)),
          ...(this.opts.extensionId ? { extensionId: this.opts.extensionId } : {}),
        },
      }),
    });
    for (let waited = 0; !TERMINAL.has(inv.status); waited += pollMs) {
      if (waited >= timeoutMs) {
        throw new RehearsalError("BROWSER_REMOTE_FAILED", `Browserbase Function ${params.op} still ${inv.status} after ${timeoutMs} ms (invocation ${inv.id})`);
      }
      await this.sleep(pollMs);
      inv = await this.api(`/v1/functions/invocations/${inv.id}`);
    }
    if (inv.status === "FAILED") {
      throw new RehearsalError("BROWSER_REMOTE_FAILED", `Browserbase Function ${params.op} failed (invocation ${inv.id}): ${errorText(JSON.stringify(inv.error ?? inv.results ?? "no details"), 240)}`);
    }
    const out = inv.results as { ok?: boolean; value?: unknown; error?: string } | undefined;
    if (!out || out.ok !== true) {
      // The Function reports its own errors as { ok: false, error } so the original message (and its code) survives.
      throw new Error(out?.error ?? `Browserbase Function ${params.op} returned no result (invocation ${inv.id})`);
    }
    return out.value;
  }
}

/** Stand-in on runtimes that cannot start a browser; every call fails with BROWSER_UNAVAILABLE. */
export class UnavailableRunner implements BrowserRunner {
  readonly name = "no-browser";
  constructor(private reason: string) {}
  private fail(): never {
    throw new RehearsalError("BROWSER_UNAVAILABLE", this.reason);
  }
  async openPage(): Promise<OpenPageResult> {
    this.fail();
  }
  async runTrajectory(): Promise<BrowserRun> {
    this.fail();
  }
  async close(): Promise<void> {}
}
