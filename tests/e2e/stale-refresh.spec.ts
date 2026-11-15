import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";

const baseUrl = "http://localhost:3108";
let server: ChildProcess;

test.beforeAll(async () => {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3108"], {
    stdio: "inherit",
  });
  await expect.poll(async () => {
    try { return (await fetch(baseUrl)).ok; } catch { return false; }
  }, { timeout: 60000 }).toBe(true);
});

test.afterAll(() => server?.kill());

for (const surface of ["detail", "rebuild"] as const) {
  const pathname = `/experiments/stale-refresh${surface === "rebuild" ? "/rebuild" : ""}`;

  test(`${surface}: initial load failure keeps the existing error and retry`, async ({ page }) => {
    await page.route("**/api/experiments/stale-refresh", (route) =>
      route.fulfill({ status: 503, json: { error: "offline" } }));
    await page.goto(`${baseUrl}${pathname}`);
    await expect(page.getByText("Couldn't load this experiment", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
    await expect(page.getByText("Couldn't refresh this experiment", { exact: true })).toHaveCount(0);
  });

  test(`${surface}: failed poll retains data, retry and later poll clear the warning`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-06-01T12:00:00Z") });
    let offline = false;
    let requests = 0;
    await page.route("**/api/experiments/stale-refresh", async (route) => {
      requests++;
      await route.fulfill(offline ? { status: 503, json: { error: "offline" } } : {
        json: {
          id: "stale-refresh", targetUrl: "https://example.com/", goal: "Find the right plan for your team",
          status: "rebuilding", createdAt: "2026-06-01T11:00:00Z",
          simulations: [], personas: [], findings: [], comparisons: [], browserTests: [], variants: [], errors: [],
          configuration: { viewports: ["desktop", "mobile"], maxStates: 20 },
        },
      });
    });
    await page.goto(`${baseUrl}${pathname}`);
    const heading = page.getByRole("heading", { name: "Find the right plan for your team", exact: true });
    await expect(heading).toBeVisible();
    offline = true;
    const first = requests;
    await page.clock.fastForward(2000);
    await expect.poll(() => requests).toBeGreaterThan(first);
    // Wait for the intercepted response to be applied before capturing evidence.
    await page.clock.runFor(100);
    if (process.env.REFRESH_SHOTS) {
      await page.screenshot({ path: `${process.env.REFRESH_SHOTS}/${surface}-${process.env.REFRESH_BEFORE ? "before" : "after"}.png`, animations: "disabled" });
    }
    const warning = page.getByRole("alert").filter({ hasText: "Couldn't refresh this experiment" });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Showing data from the last successful load");
    await expect(heading).toBeVisible();
    await expect(page.getByText("Couldn't load this experiment", { exact: true })).toHaveCount(0);
    const failed = requests;
    await warning.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => requests).toBeGreaterThan(failed);
    await expect(warning).toBeVisible();
    offline = false;
    await warning.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(warning).toHaveCount(0);
    offline = true;
    await page.clock.fastForward(2000);
    await expect(warning).toBeVisible();
    offline = false;
    await page.clock.fastForward(2000);
    await expect(warning).toHaveCount(0);
    await expect(heading).toBeVisible();
  });
}
