/** 卓譜の主要画面を .impeccable/review/ にキャプチャする(レビュー用) */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = ".impeccable/review";
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const F = { force: true };

await p.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
try { await p.click("text=サンプルデータをそのまま見る（デモ）", F); } catch {}
await p.waitForTimeout(700);

const shots = [
  ["/#/sessions", "desktop-sessions.png"],
  ["/#/sessions/s08", "desktop-session-detail.png"],
  ["/#/characters/ch_towa", "desktop-carte.png"],
  ["/#/scenarios", "desktop-scenarios.png"],
  ["/#/upload", "desktop-upload.png"],
  ["/#/settings", "desktop-settings.png"],
  ["/#/tables/t_haikou", "desktop-table.png"],
];
for (const [path, file] of shots) {
  await p.goto(`http://localhost:5173/${path}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(600);
  try {
    await p.screenshot({ path: `${OUT}/${file}`, fullPage: false, timeout: 8000 });
  } catch (e) {
    console.log(`skip ${file}: ${String(e).slice(0, 60)}`);
  }
}

const mob = await ctx.newPage();
await mob.setViewportSize({ width: 390, height: 844 });
await mob.goto("http://localhost:5173/#/sessions", { waitUntil: "domcontentloaded" });
await mob.waitForTimeout(600);
try {
  await mob.screenshot({ path: `${OUT}/mobile-sessions.png`, fullPage: false, timeout: 8000 });
} catch (e) {
  console.log(`skip mobile: ${String(e).slice(0, 60)}`);
}

await b.close();
console.log("captured into .impeccable/review/");
