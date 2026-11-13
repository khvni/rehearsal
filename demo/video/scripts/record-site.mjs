// Records a visitor hunting for the schedule on the live AIE page. Usage: node scripts/record-site.mjs <outDir>
import { chromium } from "playwright";
import { cursorScript } from "./cursor.mjs";
const out = process.argv[2] ?? "/tmp/footage";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } }, colorScheme: "light" });
await ctx.addInitScript(cursorScript);
const page = await ctx.newPage();
await page.goto("https://ai.engineer/code/2026", { waitUntil: "load" });
await page.waitForTimeout(2500);
const move = async (x, y, steps = 30) => { await page.mouse.move(x, y, { steps }); await page.waitForTimeout(350); };
await move(700, 300, 10);
await move(200, 340); await move(200, 420); await move(200, 520); await move(200, 600); await move(200, 700);
await move(900, 500);
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 420); await page.waitForTimeout(260); }
await move(1100, 400);
await page.waitForTimeout(800);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -900); await page.waitForTimeout(200); }
await move(200, 450);
await page.waitForTimeout(1200);
await ctx.close();
await browser.close();
