/**
 * ブラウザスモークテスト: 実際にヘッドレスChromeでページを開き、
 * コンソールエラー・未描画(白画面)を検出する。
 *   node scripts/smoke.mjs [baseURL]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:5173";
const SHOT_DIR = process.env.SHOT_DIR ?? "/tmp/opencode";
const results = [];
let failures = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text().slice(0, 300));
});
page.on("pageerror", (err) => errors.push("PAGEERROR: " + String(err).slice(0, 300)));

async function visit(path, expectText, shot) {
  errors.length = 0;
  await page.goto(BASE + "/#" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const body = (await page.textContent("body")) ?? "";
  const has = expectText.filter((t) => body.includes(t));
  const blank = body.trim().length < 10;
  const ok = !blank && has.length === expectText.length && errors.length === 0;
  if (!ok) failures++;
  results.push({ path, ok, blank, missing: expectText.filter((t) => !body.includes(t)), errors: [...errors] });
  if (shot && process.env.SMOKE_SHOTS) {
    try {
      await page.screenshot({ path: `${SHOT_DIR}/shot-${shot}.png`, fullPage: false, timeout: 8000 });
    } catch {
      /* スクショ失敗は回帰判定に影響させない */
    }
  }
}

/* 1. 初回はサインイン画面 */
await visit("/", ["卓譜", "Google"], "signin");

/* 2. デモとして入る */
await page.click("text=サンプルデータをそのまま見る（デモ）", { force: true });
await page.waitForTimeout(900);
{
  const body = (await page.textContent("body")) ?? "";
  const ok = body.includes("セッション") && body.includes("セッションを記録");
  if (!ok) failures++;
  results.push({ path: "/sessions (dashboard)", ok, blank: body.trim().length < 10, missing: [], errors: [] });
}
if (process.env.SMOKE_SHOTS) { try { await page.screenshot({ path: `${SHOT_DIR}/shot-dashboard.png`, timeout: 8000 }); } catch {} }

/* 3. 主要ルートを巡回 */
await visit("/sessions", ["セッション", "セッションを記録"], "sessions");
await visit("/sessions/s08", ["深淵の呼び声", "タイムライン", "参加者"], "session-detail");
await visit("/tables", ["卓", "メンバー"], "tables");
await visit("/tables/t_haikou", ["廃校部", "この卓のセッション"], "table-detail");
await visit("/characters", ["キャラクター", "キャラシートを取り込む"], "characters");
await visit("/characters/ch_towa", ["遠沢澄花", "セッション時系列", "SAN"], "char-detail");
await visit("/scenarios", ["シナリオ", "シナリオを追加"], "scenarios");
await visit("/scenarios/sc_kankyo", ["廃校の十三時間目", "ラン一覧"], "scenario-detail");
await visit("/upload", ["セッションを記録", "サンプルログで試す"], "upload");
await visit("/settings", ["設定・連携", "BOOTH"], "settings");
await visit("/invite/s01", ["この卓への参加", "すでにこの卓に参加"], "invite");
const slug = await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem("takufu-state-v4") ?? "{}");
  return st.logs?.s03?.slug ?? "";
});
await visit("/share/l/" + slug, ["共有ビュー", "深淵の呼び声"], "share-log");
await visit("/share/c/ch_towa", ["遠沢澄花", "カルテ"], "share-char");

/* 4. モバイル幅でも確認 */
const mob = await ctx.newPage();
await mob.setViewportSize({ width: 390, height: 844 });
const mobErrors = [];
mob.on("pageerror", (e) => mobErrors.push(String(e).slice(0, 200)));
await mob.goto(BASE + "/#/sessions", { waitUntil: "networkidle" });
await mob.waitForTimeout(700);
const mobBody = (await mob.textContent("body")) ?? "";
if (process.env.SMOKE_SHOTS) { try { await mob.screenshot({ path: `${SHOT_DIR}/shot-mobile.png`, timeout: 8000 }); } catch {} }
const mobOk = mobBody.trim().length >= 10 && mobBody.includes("セッション") && mobErrors.length === 0;
if (!mobOk) failures++;
results.push({ path: "/sessions (mobile 390px)", ok: mobBody.includes("セッション") && mobErrors.length === 0, blank: false, missing: [], errors: mobErrors });

await browser.close();

console.log("=== SMOKE RESULTS ===");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.path}${r.blank ? " [BLANK]" : ""}${r.missing?.length ? " missing:" + r.missing.join("/") : ""}${r.errors?.length ? "\n   errors: " + r.errors.join(" | ") : ""}`);
}
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);
