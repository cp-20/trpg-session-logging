/**
 * ブランドマーク（src/components/brand.ts）から、ブラウザ・OS・SNS 向けの画像を書き出す。
 *   node scripts/gen-brand.ts        （pnpm run gen:brand）
 *
 * - src/app/icon.svg              タブのアイコン（SVG に対応したブラウザ）
 * - src/app/favicon.ico           16 / 32 / 48px（SVG に対応しないところ・検索結果）
 * - src/app/apple-icon.png        180px（iOS のホーム画面。角は OS が切るので四角）
 * - public/icon-192.png / icon-512.png / icon-maskable-512.png   manifest.ts が参照する
 * - src/app/opengraph-image.png   1200×630（LP の「卓報告ポスター」と同じ柿色の地）
 * - mobile/assets/*.png           アプリのアイコン・スプラッシュ
 *
 * ラスタ化は Playwright の Chromium を使う（画像ライブラリを足さない）。
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "@playwright/test";
import {
  BRAND_COLORS,
  MARK_BODY,
  MARK_PIP_R,
  MARK_PIPS,
  markContent,
  markSvg,
} from "../src/components/brand.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const out = (p: string) => {
  const full = path.join(ROOT, p);
  mkdirSync(path.dirname(full), { recursive: true });
  return full;
};

/** LP のポスターの色（src/styles.css の .pst-hero と同じ） */
const POSTER = { field: "#bf3a16", paper: "#fff9f1", tint: "#f5cdb9", yellow: "#ffc233" };

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function rasterSvg(p: Page, svg: string, size: number, transparent = true): Promise<Buffer> {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`,
  );
  return p.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
}

/** PNG を並べた ICO（Vista 以降はすべて PNG 埋め込みを読める） */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

// --- ブラウザのアイコン ---
writeFileSync(out("src/app/icon.svg"), markSvg() + "\n");
// 同じページに描くので 1 つずつ。並行すると後の大きさが前の絵を上書きし、小さいアイコンが切れる
const faviconImages: { size: number; png: Buffer }[] = [];
for (const size of [16, 32, 48]) faviconImages.push({ size, png: await rasterSvg(page, markSvg(), size) });
writeFileSync(out("src/app/favicon.ico"), ico(faviconImages));
writeFileSync(out("src/app/apple-icon.png"), await rasterSvg(page, markSvg({ radius: 0 }), 180, false));
writeFileSync(out("public/icon-192.png"), await rasterSvg(page, markSvg(), 192));
writeFileSync(out("public/icon-512.png"), await rasterSvg(page, markSvg(), 512));
// マスカブル: OS が円や角丸で切るので、中身を中央の安全域（直径 80% の円）に収める
writeFileSync(
  out("public/icon-maskable-512.png"),
  await rasterSvg(page, markSvg({ radius: 0, contentScale: 0.9 }), 512, false),
);

// --- モバイルアプリ ---
const padded = (scale: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${markSvg().replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g></svg>`;
writeFileSync(out("mobile/assets/icon.png"), await rasterSvg(page, markSvg({ radius: 0 }), 1024, false));
// Android のアダプティブアイコンは前景の中央 66% だけが必ず見える（背景は app.config.ts の地の色）
writeFileSync(out("mobile/assets/adaptive-icon.png"), await rasterSvg(page, padded(0.6), 1024));
writeFileSync(out("mobile/assets/splash-icon.png"), await rasterSvg(page, markSvg(), 512));
writeFileSync(out("mobile/assets/favicon.png"), await rasterSvg(page, markSvg(), 64));

// --- OG 画像（LP の「卓報告ポスター」と同じ地・書体。見出しは LP の h1） ---
const display = readdirSync(path.join(ROOT, "public/fonts")).find((f) => f.startsWith("lp-display"));
const sans = pathToFileURL(path.join(ROOT, "node_modules/@fontsource-variable/noto-sans-jp/index.css")).href;
const ogMark = `<svg viewBox="0 0 32 32" width="64" height="64"><rect width="32" height="32" rx="7" fill="${POSTER.paper}"/>${markContent(POSTER.field)}</svg>`;
const ogHtml = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${sans}">
<style>
@font-face { font-family: "LP Display"; src: url("${pathToFileURL(path.join(ROOT, "public/fonts", display ?? "")).href}") format("woff2"); }
html, body { margin: 0; }
.og { box-sizing: border-box; width: 1200px; height: 630px; padding: 72px 88px; background: ${POSTER.field}; color: ${POSTER.paper};
  font-family: "Noto Sans JP Variable", sans-serif; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.watermark { position: absolute; right: -150px; top: -40px; width: 640px; height: 640px; }
.og > :not(.watermark) { position: relative; }
.brand { display: flex; align-items: center; gap: 20px; font-size: 44px; font-weight: 800; letter-spacing: 0.02em; }
h1 { margin: auto 0 0; font-family: "LP Display", sans-serif; font-weight: 400; font-size: 104px; line-height: 1.22; letter-spacing: 0.01em; }
p { margin: 36px 0 0; font-size: 34px; font-weight: 700; color: ${POSTER.tint}; }
</style></head><body><div class="og">
<svg class="watermark" viewBox="0 0 32 32" aria-hidden="true"><path d="${MARK_BODY}" fill="none" stroke="${POSTER.paper}" stroke-opacity="0.16" stroke-width="0.5"/>${MARK_PIPS.map((p, i) => `<circle cx="${p.cx}" cy="${p.cy}" r="${MARK_PIP_R}" ${i === 1 ? `fill="${POSTER.yellow}"` : `fill="${POSTER.paper}" fill-opacity="0.16"`}/>`).join("")}</svg>
<div class="brand">${ogMark}<span>卓譜</span></div>
<h1>卓が終わったら、<br>ぜんぶここ。</h1>
<p>TRPG のセッション記録をひとつのページに</p>
</div></body></html>`;
const ogFile = path.join(ROOT, "node_modules/.cache/takufu-og.html");
mkdirSync(path.dirname(ogFile), { recursive: true });
writeFileSync(ogFile, ogHtml);
await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(pathToFileURL(ogFile).href);
await page.evaluate(() => document.fonts.ready);
writeFileSync(out("src/app/opengraph-image.png"), await page.screenshot({ type: "png" }));
writeFileSync(
  out("src/app/opengraph-image.alt.txt"),
  "卓譜「卓が終わったら、ぜんぶここ。」TRPG のセッション記録をひとつのページに\n",
);

await browser.close();
console.log(`Generated brand assets (tile ${BRAND_COLORS.tile})`);
