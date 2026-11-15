import { test, expect } from "@playwright/test";
import { LivePagePersonaDriver } from "../../src/lib/browser/persona";

process.env.REHEARSAL_ALLOW_PRIVATE = "1";

const form = '<form id="checkout" action="/submitted"><input name="purchase" value="yes"></form>';
const label = "Confirm purchase";
const viewport = { name: "desktop" as const, width: 1440, height: 900 };

for (const scenario of [
  { name: "inside form", html: '<form action="/submitted"><button>Confirm purchase</button></form>', safe: false },
  { name: "linked outside form", html: `${form}<button form="checkout">${label}</button>`, safe: false },
  { name: "explicit non-submit", html: `${form}<button type="button" form="checkout">${label}</button>`, safe: true },
  { name: "missing form owner", html: `<button form="missing">${label}</button>`, safe: true },
  { name: "invalid type defaults to submit", html: `${form}<button type="invalid" form="checkout">${label}</button>`, safe: false },
]) {
  test(`live persona click: ${scenario.name}`, async ({ page }) => {
    await page.route("http://127.0.0.1:32123/**", (route) => route.fulfill({ contentType: "text/html", body: scenario.html }));
    await page.goto("http://127.0.0.1:32123/");
    const driver = new LivePagePersonaDriver(page, viewport, undefined);
    const before = await driver.snapshot();
    const result = await driver.act({ actionId: "act_0", label, role: "button" });
    process.stdout.write(`${JSON.stringify({ scenario: scenario.name, candidates: before.candidates.map(({ label, role }) => ({ label, role })), result, urlAfterAct: page.url() })}\n`);
    expect(result.ok).toBe(scenario.safe);
    expect(page.url()).toBe("http://127.0.0.1:32123/");
  });
}

test("live guard catches form ownership added after snapshot", async ({ page }) => {
  await page.route("http://127.0.0.1:32123/**", (route) => route.fulfill({ contentType: "text/html", body: `${form}<button>${label}</button>` }));
  await page.goto("http://127.0.0.1:32123/");
  const driver = new LivePagePersonaDriver(page, viewport, undefined);
  const { candidates } = await driver.snapshot();
  await page.locator("button").evaluate((el) => el.setAttribute("form", "checkout"));
  expect((await driver.act(candidates[0])).ok).toBe(false);
  expect(page.url()).toBe("http://127.0.0.1:32123/");
});

for (const hidden of [false, true]) {
  test(`safe button beside unrelated ${hidden ? "hidden" : "visible"} submit button`, async ({ page }) => {
    const html = `${form}<button type="button" onclick="this.dataset.clicked = 'yes'">Continue</button>
      <button form="checkout" ${hidden ? "hidden" : ""}>Continue to checkout</button>`;
    await page.route("http://127.0.0.1:32123/**", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("http://127.0.0.1:32123/");
    const driver = new LivePagePersonaDriver(page, viewport, undefined);
    expect(await driver.act({ actionId: "act_0", label: "Continue", role: "button" })).toEqual({ ok: true });
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toHaveAttribute("data-clicked", "yes");
    expect(page.url()).toBe("http://127.0.0.1:32123/");
  });
}
