import { test, expect } from "@playwright/test";
import { extractPage } from "../../src/lib/browser/extract";
import { LivePagePersonaDriver } from "../../src/lib/browser/persona";

process.env.REHEARSAL_ALLOW_PRIVATE = "1";

const cases = [
  { name: "plain text", html: "<button>Menu</button>", label: "Menu" },
  { name: "aria-hidden label descendants", html: '<button aria-labelledby="l">Menu</button><span id="l"><span aria-hidden="true">☰</span>Toggle navigation</span>', label: "Toggle navigation" },
  { name: "aria-hidden button descendants", html: '<button><span aria-hidden="true">☰</span>Menu</button>', label: "Menu" },
  { name: "aria-label", html: '<button aria-label="Toggle navigation">Menu</button>', label: "Toggle navigation" },
  { name: "aria-labelledby", html: '<button aria-labelledby="toggle navigation" aria-label="Ignored">Menu</button><span id="navigation">navigation</span><span id="toggle">Toggle <b>site</b></span>', label: "Toggle site navigation" },
  { name: "empty ARIA labels", html: '<button aria-labelledby="empty" aria-label="  ">Menu</button><span id="empty"></span>', label: "Menu" },
  { name: "missing reference", html: '<button aria-labelledby="missing" aria-label="Toggle navigation">Menu</button>', label: "Toggle navigation" },
];

for (const { name, html, label } of cases) {
  test(`extracts and clicks a button with ${name}`, async ({ page }) => {
    await page.route("https://fixture.test/", (route) => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("https://fixture.test/");
    await page.locator("button").evaluate((button) => button.addEventListener("click", () => button.setAttribute("data-clicked", "true")));
    const extracted = extractPage(await page.content(), page.url());
    expect(extracted.actions.map((action) => action.label)).toEqual([label]);
    const driver = new LivePagePersonaDriver(page, { name: "desktop", width: 1440, height: 900 }, undefined);
    const snapshot = await driver.snapshot();
    expect(await driver.act(snapshot.candidates[0])).toEqual({ ok: true });
    await expect(page.locator("button")).toHaveAttribute("data-clicked", "true");
  });
}
