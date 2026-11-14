import { SandboxRunArgs, SandboxRunResult, type CodeSandbox } from "../contracts";
import { logEvent } from "../telemetry";
import { failedResult, harnessSource, resolveTarget, SANDBOX_LIMITS, toResult } from "./node";

const DEFAULT_TIMEOUT_MS = 5000;
const HEREDOC = "REHEARSAL_HARNESS_EOF";

/** Cloudflare sandbox can't run here (no binding, no container, exec failed). Callers fall back to node. */
export class SandboxUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SandboxUnavailableError";
  }
}

/** `env.Sandbox` from the Cloudflare runtime, or null anywhere else. */
export async function cloudflareSandboxBinding(): Promise<unknown | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as Record<string, unknown>).Sandbox ?? null;
  } catch {
    return null;
  }
}

interface SandboxStub {
  run(script: string): Promise<{ exitCode: number | null; stdout: string }>;
}

interface SandboxNamespace {
  getByName?(name: string): SandboxStub;
  idFromName?(name: string): unknown;
  get?(id: unknown): SandboxStub;
}

// SDK 1.x has no Sandbox class: `env.Sandbox` is the app's own Durable Object namespace whose stub
// exposes `run(script)` → `{exitCode, stdout}` (Files.writeFile + container.exec, as in the SDK's
// examples/minimal template). The script writes our harness and runs it under node.
function sandboxStub(binding: unknown, name: string): SandboxStub {
  const ns = binding as SandboxNamespace | null;
  const stub = ns?.getByName ? ns.getByName(name) : ns?.idFromName && ns.get ? ns.get(ns.idFromName(name)) : undefined;
  if (!stub || typeof stub.run !== "function") throw new SandboxUnavailableError("Sandbox binding has no run(script) stub");
  return stub;
}

function containerScript(payload: object, timeoutMs: number): string {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const prelude = `const workerData = JSON.parse(Buffer.from(${JSON.stringify(b64)}, "base64").toString("utf8"));
const emit = (o) => process.stdout.write("\\n" + JSON.stringify(o) + "\\n");`;
  return [
    "set -e",
    "mkdir -p /workspace/rehearsal && cd /workspace/rehearsal",
    "[ -d node_modules/linkedom ] || npm install linkedom --no-save --silent >/dev/null 2>&1 || true",
    `cat > harness.cjs <<'${HEREDOC}'`,
    harnessSource(prelude),
    HEREDOC,
    `timeout ${Math.ceil(timeoutMs / 1000) + 5} node harness.cjs`,
  ].join("\n");
}

function lastJsonLine(stdout: string): unknown {
  const lines = stdout.trim().split("\n").reverse();
  for (const line of lines) {
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

/** Runs the harness inside a Cloudflare Sandbox container (the Workers path; workerd can't eval). */
export class CloudflareCodeSandbox implements CodeSandbox {
  readonly name = "cloudflare-sandbox";

  constructor(
    private readonly binding: unknown,
    private readonly fallback?: CodeSandbox,
  ) {}

  async run(raw: SandboxRunArgs): Promise<SandboxRunResult> {
    try {
      return await this.runInContainer(raw);
    } catch (e) {
      if (!(e instanceof SandboxUnavailableError) || !this.fallback) throw e;
      logEvent({ stage: "sandbox", kind: "sandbox-fallback", data: { from: this.name, to: this.fallback.name, reason: e.message } });
      return this.fallback.run(raw);
    }
  }

  private async runInContainer(raw: SandboxRunArgs): Promise<SandboxRunResult> {
    const started = performance.now();
    const parsed = SandboxRunArgs.safeParse(raw);
    if (!parsed.success) return failedResult([`Invalid sandbox args: ${parsed.error.message}`]);
    const { code, target, timeoutMs = DEFAULT_TIMEOUT_MS } = parsed.data;

    let page: { html: string; url: string };
    try {
      page = await resolveTarget(target);
    } catch (e) {
      return failedResult([`Target rejected: ${(e as Error).message}`], performance.now() - started);
    }

    const stub = sandboxStub(this.binding, `rehearsal-${crypto.randomUUID()}`);
    let stdout: string;
    try {
      ({ stdout } = await stub.run(containerScript({ ...page, code, timeoutMs, ...SANDBOX_LIMITS }, timeoutMs)));
    } catch (e) {
      throw new SandboxUnavailableError(`Sandbox exec failed: ${(e as Error).message}`, { cause: e });
    }
    const out = lastJsonLine(stdout);
    if (!out) throw new SandboxUnavailableError("Sandbox harness produced no result (node or linkedom missing in the image?)");
    const result = SandboxRunResult.safeParse(toResult(out as Parameters<typeof toResult>[0], timeoutMs, performance.now() - started));
    if (!result.success) throw new SandboxUnavailableError(`Sandbox harness returned an invalid result: ${result.error.message}`);
    return result.data;
  }
}
