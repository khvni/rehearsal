// Captures dashboard screenshots for the video. Usage: node scripts/capture.mjs <experimentId>
import { chromium } from "playwright";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const id = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
await page.goto(`${base}/`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: "assets/home.png" });
if (id) {
  await page.goto(`${base}/experiments/${id}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "assets/dashboard.png", fullPage: true });
}
await browser.close();
