import type { CodeSandbox, EnvVars, SandboxPreference } from "../contracts";
import { logEvent } from "../telemetry";
import { CloudflareCodeSandbox, cloudflareSandboxBinding } from "./cloudflare";
import { NodeCodeSandbox } from "./node";

export { CloudflareCodeSandbox, cloudflareSandboxBinding, SandboxUnavailableError } from "./cloudflare";
export { NodeCodeSandbox } from "./node";

function preference(env: EnvVars): SandboxPreference {
  const v = env.REHEARSAL_SANDBOX?.trim().toLowerCase();
  return v === "node" || v === "cloudflare" ? v : "auto";
}

/** `REHEARSAL_SANDBOX`: node | cloudflare | auto (default: cloudflare when a `Sandbox` binding resolves, else node). */
export async function selectSandbox(env: EnvVars = process.env): Promise<CodeSandbox> {
  const pref = preference(env);
  const node = new NodeCodeSandbox();
  if (pref === "node") return node;
  const binding = await cloudflareSandboxBinding();
  if (binding) return new CloudflareCodeSandbox(binding, node);
  if (pref === "cloudflare") {
    logEvent({ stage: "sandbox", kind: "sandbox-fallback", data: { from: "cloudflare-sandbox", to: node.name, reason: "no Sandbox binding" } });
  }
  return node;
}

export async function sandboxName(env: EnvVars = process.env): Promise<string> {
  return (await selectSandbox(env)).name;
}
