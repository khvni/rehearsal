import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SandboxRunArgs } from "../../src/lib/contracts";
import { CloudflareCodeSandbox, NodeCodeSandbox, SandboxUnavailableError, sandboxName, selectSandbox } from "../../src/lib/sandbox";

const html = readFileSync(path.join(__dirname, "..", "evals", "fixtures", "aie-code-2026.html"), "utf8");
const URL_ = "https://aie-code-2026.example/";
const sandbox = new NodeCodeSandbox();
const run = (code: string, timeoutMs?: number) => sandbox.run({ code, target: { kind: "html", html, url: URL_ }, timeoutMs });

afterEach(() => vi.restoreAllMocks());

describe("NodeCodeSandbox", () => {
  it("passes assertions, captures console, returns report output", async () => {
    const r = await run(`
      assert("has links", page.count("a[href]") > 0);
      assert("nav exists", page.exists("nav"));
      console.log("title", page.title());
      console.warn({ n: 1 });
      report({ url: page.url(), links: page.count("a[href]"), missing: page.attr("nav", "data-nope") });
    `);
    expect(r.errors).toEqual([]);
    expect(r.success).toBe(true);
    expect(r.assertions.map((a) => a.passed)).toEqual([true, true]);
    expect(r.console[0]).toMatchObject({ level: "log" });
    expect(r.console[0].text.startsWith("title ")).toBe(true);
    expect(r.console[1]).toEqual({ level: "warn", text: '{"n":1}' });
    expect(r.output).toMatchObject({ url: URL_ });
    expect((r.output as { links: number }).links).toBeGreaterThan(0);
  });

  it("reports failed assertions and thrown conditions without throwing", async () => {
    const r = await run(`
      assert("absent", page.exists("section.teleporter"));
      assert("throws", () => { throw new Error("boom"); });
    `);
    expect(r.success).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.assertions).toEqual([
      { name: "absent", passed: false },
      { name: "throws", passed: false, error: "boom" },
    ]);
  });

  it("surfaces uncaught errors and keeps earlier assertions", async () => {
    const r = await run(`assert("ok", true); page.count("::::bad");`);
    expect(r.success).toBe(false);
    expect(r.assertions).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });

  it("caps console at 200 entries of 500 chars", async () => {
    const r = await run(`for (let i = 0; i < 300; i++) console.log("x".repeat(600));`);
    expect(r.console).toHaveLength(200);
    expect(r.console[0].text).toHaveLength(500);
  });

  it("exposes no require/process/fetch and blocks realm escapes", async () => {
    const r = await run(`
      report({
        require: typeof require, process: typeof process, fetch: typeof fetch,
        escape: (() => { try { return typeof page.text.constructor("return process")(); } catch (e) { return "blocked"; } })(),
      });
    `);
    expect(r.output).toEqual({ require: "undefined", process: "undefined", fetch: "undefined", escape: "blocked" });
  });

  it("kills an infinite loop at the timeout", async () => {
    const r = await run(`while (true) {}`, 300);
    expect(r.success).toBe(false);
    expect(r.errors[0]).toMatch(/timed out/);
  });

  it("rejects private/loopback url targets before any fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const url of ["http://127.0.0.1:3000/", "http://localhost/", "http://169.254.169.254/latest/meta-data"]) {
      const r = await sandbox.run({ code: `assert("x", true)`, target: { kind: "url", url } });
      expect(r.success).toBe(false);
      expect(r.errors[0]).toMatch(/Target rejected: Blocked/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("SandboxRunArgs rejects code over 64k", async () => {
    const big = "x".repeat(64_001);
    expect(SandboxRunArgs.safeParse({ code: big, target: { kind: "html", html } }).success).toBe(false);
    const r = await sandbox.run({ code: big, target: { kind: "html", html } });
    expect(r.errors[0]).toMatch(/Invalid sandbox args/);
  });
});

describe("selectSandbox", () => {
  it("node / cloudflare-off-CF / auto all resolve to node", async () => {
    expect((await selectSandbox({ REHEARSAL_SANDBOX: "node" })).name).toBe("node-vm-worker");
    expect((await selectSandbox({ REHEARSAL_SANDBOX: "cloudflare" })).name).toBe("node-vm-worker");
    expect((await selectSandbox({ REHEARSAL_SANDBOX: "auto" })).name).toBe("node-vm-worker");
    expect(await sandboxName({})).toBe("node-vm-worker");
  });
});

describe("CloudflareCodeSandbox", () => {
  it("parses the harness JSON line from the stub's stdout", async () => {
    const stdout = `npm noise\n${JSON.stringify({ assertions: [{ name: "a", passed: true }], console: [], errors: [], output: 1 })}\n`;
    const binding = { getByName: () => ({ run: async () => ({ exitCode: 0, stdout }) }) };
    const r = await new CloudflareCodeSandbox(binding).run({ code: "", target: { kind: "html", html: "<p>" } });
    expect(r).toMatchObject({ success: true, output: 1, assertions: [{ name: "a", passed: true }] });
  });

  it("throws SandboxUnavailableError without a usable binding, or falls back when given one", async () => {
    const args = { code: `assert("ok", page.exists("p"))`, target: { kind: "html" as const, html: "<p>hi</p>" } };
    await expect(new CloudflareCodeSandbox({}).run(args)).rejects.toBeInstanceOf(SandboxUnavailableError);
    const r = await new CloudflareCodeSandbox({}, sandbox).run(args);
    expect(r.success).toBe(true);
  });
});
