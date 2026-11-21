/**
 * LP 用の書体ファイルを作る: LP に出てくる文字だけに絞った WOFF2。
 *   node scripts/subset-lp-fonts.ts        （pnpm run fonts:lp）
 * 元の書体（Google Fonts のリポジトリ、OFL）は node_modules/.cache/takufu-fonts に取ってくる。
 * 必要なもの: python3 と fonttools・brotli（pip install fonttools brotli）。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lpFontChars, lpRightsLabels } from "../src/lib/lp-font-chars.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "node_modules/.cache/takufu-fonts");
const OUT = path.join(ROOT, "public/fonts");

const SOURCES = {
  dela: {
    file: "DelaGothicOne-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/delagothicone/DelaGothicOne-Regular.ttf",
  },
  noto: {
    file: "NotoSansJP-wght.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf",
  },
} as const;

async function source(key: keyof typeof SOURCES): Promise<string> {
  const { file, url } = SOURCES[key];
  const p = path.join(CACHE, file);
  if (!existsSync(p)) {
    mkdirSync(CACHE, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return p;
}

function py(args: string[]): void {
  // 書体の更新日時を固定し、同じ入力から同じファイル（同じハッシュ）ができるようにする
  execFileSync("python3", args, { stdio: "inherit", env: { ...process.env, SOURCE_DATE_EPOCH: "0" } });
}

const landing = readFileSync(path.join(ROOT, "src/screens/Landing.tsx"), "utf8");
const rights = readFileSync(path.join(ROOT, "src/lib/rights.ts"), "utf8");
// 外枠のフッターに出るリンク名（LEGAL_LINKS）だけを足す
const chars = lpFontChars(landing, [lpRightsLabels(rights)]);
mkdirSync(OUT, { recursive: true });
const textFile = path.join(CACHE, "lp-chars.txt");
mkdirSync(CACHE, { recursive: true });
writeFileSync(textFile, chars);

const common = [
  `--text-file=${textFile}`,
  "--flavor=woff2",
  // 横書きの LP で使う機能だけ残す（縦書き・旧字形の切り替えなどを外すと本文の書体が半分近くになる）。
  // tnum は時刻・ダイスの数字（tabular-nums）、palt は本文の詰め（styles.css で切り替え）に使う
  "--layout-features=kern,liga,calt,ccmp,locl,mark,mkmk,palt,tnum,pnum",
  "--no-hinting",
  "--desubroutinize",
  "--name-IDs=0,1,2,3,4,5,6",
];

// 見出し（1 ウェイト）
py([
  "-m",
  "fontTools.subset",
  await source("dela"),
  ...common,
  `--output-file=${path.join(OUT, "lp-display.woff2")}`,
]);

// 本文: 可変フォントのまま、LP で使う 400〜700 に幅を絞ってから文字を絞る
const notoRange = path.join(CACHE, "NotoSansJP-400-700.ttf");
py(["-m", "fontTools.varLib.instancer", await source("noto"), "wght=400:700", "-o", notoRange, "-q"]);
py(["-m", "fontTools.subset", notoRange, ...common, `--output-file=${path.join(OUT, "lp-sans.woff2")}`]);

// 中身のハッシュをファイル名に入れ、ずっとキャッシュしてよいことにする（next.config.ts の headers）
for (const f of readdirSync(OUT)) {
  if (/^lp-(display|sans)\.[0-9a-f]{8}\.woff2$/.test(f)) rmSync(path.join(OUT, f));
}
const hashed: Record<string, string> = {};
for (const name of ["lp-display", "lp-sans"]) {
  const tmp = path.join(OUT, `${name}.woff2`);
  const hash = createHash("sha256").update(readFileSync(tmp)).digest("hex").slice(0, 8);
  const file = `${name}.${hash}.woff2`;
  renameSync(tmp, path.join(OUT, file));
  hashed[name] = `/fonts/${file}`;
}
writeFileSync(path.join(OUT, "lp-chars.txt"), chars);
writeFileSync(
  path.join(ROOT, "src/data/lp-fonts.ts"),
  `// scripts/subset-lp-fonts.ts が書き出す（手で直さない）
export const LP_FONT_FILES = {
  display: "${hashed["lp-display"]}",
  sans: "${hashed["lp-sans"]}",
} as const;
`,
);
console.log(`LP fonts: ${[...chars].length} chars -> ${Object.values(hashed).join(", ")}`);
