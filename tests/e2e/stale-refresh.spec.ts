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

test.describe("landing onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/experiments", (route) => route.fulfill({ json: [] }));
  });

  test("starts empty, validates the URL, fills a goal and retains inputs after a failed request", async ({ page }) => {
    await page.goto(baseUrl);
    const address = page.getByLabel("Website URL");
    await expect(address).toHaveValue("");
    await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
    await expect(page.locator("#url-error")).toContainText("Enter a public website address");
    await expect(address).toBeFocused();
    await address.fill("example.com:8080");
    await page.getByRole("button", { name: "Book a demo", exact: true }).click();
    let submitted: unknown;
    await page.route("**/api/experiments", async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 429, json: { error: "rate limited" } });
    });
    await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
    await expect(page.locator(".submit-error")).toContainText("Try again tomorrow");
    expect(submitted).toEqual({ targetUrl: "https://example.com:8080/", goal: "Book a demo" });
    await expect(address).toHaveValue("https://example.com:8080/");
    await expect(page.getByLabel("What should a visitor do?")).toHaveValue("Book a demo");
    await expect(page.getByRole("button", { name: "Start rehearsal", exact: true })).toBeEnabled();
  });

  test("submits an inferred goal once and opens the returned rehearsal", async ({ page }) => {
    let requests = 0;
    let release!: () => void;
    const response = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/experiments", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: [] });
      requests++;
      expect(route.request().postDataJSON()).toEqual({ targetUrl: "https://example.com/" });
      await response;
      await route.fulfill({ json: { id: "landing-created" } });
    });
    await page.route("**/api/experiments/landing-created", (route) => route.fulfill({ status: 404, json: { error: "fixture" } }));
    await page.goto(baseUrl);
    await page.getByLabel("Website URL").fill("example.com");
    await page.getByRole("button", { name: "Start rehearsal", exact: true }).click();
    await expect(page.getByRole("button", { name: "Starting rehearsal…", exact: true })).toBeDisabled();
    await page.locator("#start").evaluate((form: HTMLFormElement) => form.requestSubmit());
    release();
    await expect(page).toHaveURL(`${baseUrl}/experiments/landing-created`, { timeout: 30000 });
    expect(requests).toBe(1);
  });

  test("switches the illustrative layout and fits narrow screens", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(baseUrl);
    await expect(page.getByText("Why black and white?", { exact: true })).toBeVisible();
    await expect(page.locator("figcaption")).toContainText("not a tested result");
    await page.getByRole("button", { name: "Proposed wireframe", exact: true }).click();
    await expect(page.getByRole("button", { name: "Proposed wireframe", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("$12 / month", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Before", exact: true }).click();
    await expect(page.getByText("Visitors have to look elsewhere", { exact: false })).toBeVisible();
  });

  test("recovers the recent list and reveals older public runs", async ({ page }) => {
    let failed = true;
    const experiments = Array.from({ length: 5 }, (_, i) => ({
      id: `landing-${i}`, targetUrl: `https://site${i}.example.com/`, goal: "Find pricing",
      status: "complete", createdAt: `2026-06-0${i + 1}T12:00:00Z`, exampleEligible: i === 0,
    }));
    await page.route("**/api/experiments", (route) => route.fulfill(failed
      ? { status: 503, json: { error: "offline" } } : { json: experiments }));
    await page.goto(baseUrl);
    await expect(page.locator(".recent-state[role='alert']")).toContainText("Could not load recent rehearsals");
    failed = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("link", { name: "View an example rehearsal" })).toHaveAttribute("href", "/experiments/landing-0");
    await expect(page.locator(".recent-list li")).toHaveCount(4);
    await expect(page.locator(".recent-list li").first()).toContainText("site4.example.com");
    await expect(page.locator(".recent-list")).not.toContainText("site0.example.com");
    await page.getByRole("button", { name: "Show all 5 rehearsals" }).click();
    await expect(page.locator(".recent-list li")).toHaveCount(5);
  });
});

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
      await page.screenshot({ path: `${process.env.REFRESH_SHOTS}/${surface}-${process.env.REFRESH_BEFORE ? "before" : "after"}.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
    }
    const warning = page.getByRole("alert").filter({ hasText: "Couldn't refresh this experiment" });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Showing data from the last successful load");
    const warningBox = await warning.boundingBox();
    const headingBox = await page.locator(".exp-head").boundingBox();
    expect(warningBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(warningBox!.x).toBe(headingBox!.x);
    expect(warningBox!.width).toBe(headingBox!.width);
    expect(warningBox!.y + warningBox!.height).toBeLessThan(headingBox!.y);
    await expect(heading).toBeVisible();
    await expect(page.getByText("Couldn't load this experiment", { exact: true })).toHaveCount(0);
    const failed = requests;
    await warning.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => requests).toBeGreaterThan(failed);
    await expect(warning).toBeVisible();
    offline = false;
    await warning.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(warning).toHaveCount(0);
    if (process.env.REFRESH_SHOTS && surface === "detail") {
      await page.screenshot({ path: `${process.env.REFRESH_SHOTS}/detail-recovered.png`, animations: "disabled", style: "nextjs-portal { display: none !important; }" });
    }
    offline = true;
    await page.clock.fastForward(2000);
    await expect(warning).toBeVisible();
    offline = false;
    await page.clock.fastForward(2000);
    await expect(warning).toHaveCount(0);
    await expect(heading).toBeVisible();
  });
}
