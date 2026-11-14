import type { EnvVars } from "../contracts";

/**
 * Chromium renders untrusted pages, so its sandbox stays on. REHEARSAL_CHROMIUM_NO_SANDBOX=1 turns it off
 * for hosts without unprivileged user namespaces (some containers); never set it in a deployment.
 */
export function chromiumSandboxEnabled(env: EnvVars = process.env): boolean {
  return env.REHEARSAL_CHROMIUM_NO_SANDBOX !== "1";
}
