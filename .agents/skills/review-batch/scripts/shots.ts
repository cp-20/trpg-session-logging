/**
 * 指摘を直した画面の状態を撮る雛形（`node .agents/skills/review-batch/scripts/shots.ts [名前,名前]`、リポジトリの直下で）。
 * 全画面の巡回は `pnpm run review`。ここは段の中（記録の完了・はじめの設定・初めての人のホーム）まで進めて撮る。
 * 撮ったら Read で見る。新しい状態を撮るときはブロックを足す
 */
import path from "node:path";
const { chromium } = await import(path.resolve("node_modules/playwright/index.mjs"));
type Page = import("playwright").Page;

const OUT = process.env.SHOTS_DIR ?? path.resolve(".impeccable/shots");
await import("node:fs").then((fs) => fs.mkdirSync(OUT, { recursive: true }));
const BASE = "http://127.0.0.1:5173";
const only = process.argv[2];

async function demo(page: Page) {
  await page.goto(`${BASE}/demo`);
  await page.waitForURL(/\/home$/);
  await page.waitForTimeout(900);
}
async function patch(page: Page, fn: string) {
  await page.evaluate((src) => {
    const key = "takufu-state-v4";
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
    new Function("s", src)(s);
    localStorage.setItem(key, JSON.stringify(s));
  }, fn);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const shot = async (name: string, full = false) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
};
const run = (k: string) => !only || only.split(",").includes(k);

if (run("signin")) {
  await page.goto(`${BASE}/signin`);
  await shot("signin");
}
await demo(page);
if (run("redirect")) {
  await page.goto(`${BASE}/signin?next=%2Fcalendar`);
  await page.waitForTimeout(1500);
  console.log("signin redirect →", page.url());
}
if (run("session")) {
  await page.goto(`${BASE}/sessions/s08`);
  await shot("session-s08");
}
if (run("scenarios")) {
  await page.goto(`${BASE}/scenarios`);
  await shot("scenarios");
}
if (run("poll")) {
  await page.goto(`${BASE}/tables/t_haikou`);
  await page.waitForTimeout(600);
  await shot("table");
  const row = page.getByRole("button", { name: /日程調整中/ }).first();
  if (await row.count()) await row.click();
  else {
    await page.goto(`${BASE}/calendar`);
    await page.getByRole("button", { name: "詳しく見る" }).first().click();
  }
  await shot("poll-view");
  const edit = page.getByRole("button", { name: "編集" }).last();
  if (await edit.count()) {
    await edit.click();
    const other = page.getByRole("radio", { name: "その他" });
    if (await other.count()) await other.click();
    await shot("poll-edit");
  }
  await page.keyboard.press("Escape");
}
if (run("upload")) {
  await page.goto(`${BASE}/upload`);
  await shot("upload-pick");
  await page.getByRole("button", { name: "サンプルログで試す" }).click();
  await page.waitForTimeout(800);
  await shot("upload-studio", true);
  console.log(await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(".input, .btn, [role=radiogroup]")) {
      const r = el.getBoundingClientRect();
      if (r.top > 700 && r.top < 1000 && r.width) out.push(`${el.className.toString().slice(0, 40)} h=${r.height} top=${Math.round(r.top)} left=${Math.round(r.left)}`);
    }
    return out.join(" | ");
  }));
}
if (run("done")) {
  await page.goto(`${BASE}/upload`);
  await page.getByRole("button", { name: "サンプルログで試す" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("textbox", { name: "タイトル" }).fill("廃校の十三時間目");
  await page.getByRole("button", { name: /^記録する$|記録して/ }).last().click();
  await page.waitForTimeout(250);
  await shot("done-0250");
  await page.waitForTimeout(500);
  await shot("done-0750");
  await page.waitForTimeout(1000);
  await shot("done-1750");
}
if (run("welcome")) {
  await patch(page, "delete s.users[s.me].handle; s.prefs.onboardingDone = false;");
  await page.goto(`${BASE}/welcome?next=%2Fsettings`);
  await page.waitForTimeout(600);
  await shot("welcome-id");
  await page.getByRole("textbox", { name: "ユーザー ID" }).fill("mikan_shot");
  await page.getByRole("button", { name: "この ID にする" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page.waitForTimeout(400);
  await shot("welcome-icon");
  await page.getByRole("button", { name: "はじめる" }).click();
  await page.waitForTimeout(450);
  await shot("welcome-done-0450");
  await page.waitForTimeout(800);
  await shot("welcome-done-1250");
}
if (run("empty")) {
  await patch(page, "s.logs = {}; s.characters = {}; s.tables = {}; s.events = {};");
  await page.goto(`${BASE}/home`);
  await shot("home-new");
  await page.goto(`${BASE}/characters`);
  await shot("characters-empty");
  await page.goto(`${BASE}/settings`);
  await shot("settings");
}
await browser.close();
