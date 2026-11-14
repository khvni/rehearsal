import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeCodeSandbox, selectSandbox } from "../../src/lib/sandbox";
import { agentVerifyEnabled, runnerName, selectRunner } from "../../src/lib/browser/runner";
import type { SandboxRunResult } from "../../src/lib/contracts";

const aieHtml = readFileSync(path.join(__dirname, "fixtures", "aie-code-2026.html"), "utf8");
const AIE_URL = "https://aie-code-2026.example/";

const T = {
  minLinks: 15,
  maxDurationMs: 10_000,
};

async function runFixture(code: string): Promise<SandboxRunResult> {
  return new NodeCodeSandbox().run({
    code,
    target: { kind: "html", html: aieHtml, url: AIE_URL },
    timeoutMs: T.maxDurationMs,
  });
}

describe("eval: code sandbox on the AIE fixture", () => {
  it("runs agent-style assertions and returns console + report output", async () => {
    const r = await runFixture(`
      assert("nav links exist", page.count("nav a") > 0);
      assert("page names the conference", page.text().toLowerCase().includes("aie"));
      console.log("links: " + page.count("a[href]"));
      report({ links: page.count("a[href]"), title: page.title(), url: page.url() });
    `);
    expect(r.success).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.assertions).toHaveLength(2);
    expect(r.assertions.every((a) => a.passed)).toBe(true);
    expect(r.console.some((e) => e.level === "log" && e.text.startsWith("links:"))).toBe(true);
    const out = r.output as { links: number; title: string; url: string };
    expect(out.links).toBeGreaterThanOrEqual(T.minLinks);
    expect(out.url).toBe(AIE_URL);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic across repeated runs", async () => {
    const code = `assert("cta count stable", page.count("a[href]") >= ${T.minLinks}); report({ n: page.count("a") });`;
    const [a, b] = [await runFixture(code), await runFixture(code)];
    expect(a.assertions).toEqual(b.assertions);
    expect(a.output).toEqual(b.output);
    expect(a.success && b.success).toBe(true);
  });

  it("failing assertions surface in the result without throwing", async () => {
    const r = await runFixture(`assert("never true", page.count("section.teleporter") > 0);`);
    expect(r.success).toBe(false);
    expect(r.assertions[0]).toMatchObject({ name: "never true", passed: false });
  });
});

describe("eval: sandbox + runner selection", () => {
  it("selectSandbox honours REHEARSAL_SANDBOX and falls back gracefully", async () => {
    expect((await selectSandbox({ REHEARSAL_SANDBOX: "node" })).name).toBe("node-vm-worker");
    // No Sandbox binding exists outside a Cloudflare runtime: explicit + auto both land on node.
    expect((await selectSandbox({ REHEARSAL_SANDBOX: "cloudflare" })).name).toBe("node-vm-worker");
    expect((await selectSandbox({})).name).toBe("node-vm-worker");
  });

  it("agent verify is opt-in and gated on the runner's model support", () => {
    expect(agentVerifyEnabled({})).toBe(false);
    expect(agentVerifyEnabled({ REHEARSAL_VERIFY_AGENT: "1" })).toBe(true);
    // A runner only takes the agent path when it declares model support.
    expect(selectRunner({}).supportsAgent ?? false).toBe(false);
    expect(runnerName({})).toBe("local-playwright");
  });
});
