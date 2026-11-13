import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractPage } from "../../src/lib/browser/extract";

process.env.REHEARSAL_ALLOW_PRIVATE = "1";

const html = readFileSync(
  path.join(__dirname, "..", "evals", "fixtures", "aie-code-2026.html"),
  "utf8",
);

let server: Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/code/2026" || req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/code/2026`;
});

test.afterAll(async () => {
  await new Promise((r) => server.close(r));
});

test("fixture page loads in a real browser and yields extractable actions", async ({ page }) => {
  await page.goto(baseUrl);
  const rendered = await page.content();
  const extracted = extractPage(rendered, baseUrl);
  expect(extracted.actions.length).toBeGreaterThan(20);
  expect(extracted.title.toLowerCase()).toContain("ai engineer code summit");
});

test("stale 'apply' CTA is present on the fixture (Scenario B precondition)", async ({ page }) => {
  await page.goto(baseUrl);
  const body = (await page.textContent("body")) ?? "";
  expect(/apply|register/i.test(body)).toBe(true);
  expect(/nov\w*\.?\s*10/i.test(body)).toBe(true);
});
