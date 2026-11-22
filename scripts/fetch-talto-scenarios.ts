/**
 * 体験版の見本用に、TALTO（https://talto.cc）の公開シナリオ一覧から事実情報だけを取る。
 *   node scripts/fetch-talto-scenarios.ts [--cache <dir>] [--offline]
 *
 * - talto.cc/robots.txt は /search 等を禁止しているが、カテゴリ一覧とプロジェクトページは許可。
 *   ここで使うのはサイト自身がカテゴリ一覧の表示に使う公開 API（GET /v1/projects?category=…）だけ。
 * - 1 秒に 1 回まで。応答はキャッシュに保存し、再実行では取りに行かない（--offline でキャッシュのみ）。
 * - 持つのはタイトル・作者・システム・人数・時間・URL・表紙画像 URL。あらすじや画像本体は持たない。
 * - 成人向けと明示された作品と、シナリオ以外の出品（データ集・配信用素材など）は入れない。
 * 出力: src/data/talto-scenarios.json（src/data/seed.ts が体験版の読み込み時にだけ使う）
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isAdultListing, isNonScenarioListing, type TaltoScenarioRow } from "../src/lib/talto-scenarios.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src/data/talto-scenarios.json");
const API = "https://us-central1-talto-trpg.cloudfunctions.net/api";
const UA = "Mozilla/5.0 (compatible; sample-data-fetcher)";
const PAGE = 30; // API の上限
const TARGET = 500;

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const CACHE = path.resolve(argValue("--cache") ?? path.join(ROOT, "node_modules/.cache/talto"));
const OFFLINE = args.includes("--offline");

/** 新着順の全体一覧（サイトの実際の偏りがそのまま出る）のページ数 */
const RECENT_PAGES = 7;
/** 全体一覧だけでは少ないシステムを、カテゴリ一覧から足す（slug: ページ数） */
const CATEGORY_TOPUPS: Record<string, number> = {
  call_of_cthulhu_7th: 1,
  emoklore: 2,
  "sword_world_2.5": 2,
  murder_mystery: 1,
  shinobigami: 1,
  double_cross: 1,
  insane: 1,
  nechronica: 1,
  stellar_knights: 1,
};

interface Category {
  id: number;
  slug: string;
  name: string;
}
interface Project {
  id: string;
  name: string;
  author: string;
  cover_url: string | null;
  category_id: number;
  category_name: string;
  tags?: string[];
  description?: string;
  players_min?: number | null;
  players_max?: number | null;
  playing_hour_max?: number | null;
}

let lastFetch = 0;
async function getJson<T>(pathAndQuery: string): Promise<T> {
  const url = `${API}${pathAndQuery}`;
  const file = path.join(CACHE, `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  if (OFFLINE) throw new Error(`not cached: ${url}`);
  const wait = lastFetch + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = await res.text();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, text);
  console.log(`fetched ${pathAndQuery}`);
  return JSON.parse(text) as T;
}

async function checkRobots(): Promise<void> {
  const file = path.join(CACHE, "robots.txt");
  let text: string;
  if (existsSync(file)) text = readFileSync(file, "utf8");
  else {
    if (OFFLINE) return;
    const res = await fetch("https://talto.cc/robots.txt", { headers: { "user-agent": UA } });
    text = await res.text();
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, text);
    lastFetch = Date.now();
  }
  // 一般向け（User-agent: *）の Disallow にカテゴリ一覧・プロジェクトページが入っていたら止める
  const general = text.split(/User-agent:\s*\*/i)[1] ?? "";
  const disallow = [...general.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]!);
  const blocked = disallow.filter((d) => d === "/" || /^\/(categories|projects)(\/\*?)?$/.test(d));
  if (blocked.length) throw new Error(`robots.txt disallows ${blocked.join(", ")}; stopping`);
}

function toRow(p: Project, slugById: Map<number, string>): TaltoScenarioRow {
  const max = p.players_max ?? null;
  return {
    id: p.id,
    title: p.name.trim(),
    author: p.author.trim(),
    systemSlug: slugById.get(p.category_id) ?? "other",
    systemName: p.category_name,
    playersMin: p.players_min ?? null,
    playersMax: max != null && max >= 99 ? null : max,
    hours: p.playing_hour_max ?? null,
    url: `https://talto.cc/projects/${p.id}`,
    thumbnail: p.cover_url ?? null,
  };
}

async function main(): Promise<void> {
  await checkRobots();
  const categories = await getJson<Category[]>("/v1/categories");
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));
  const idBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const rows = new Map<string, TaltoScenarioRow>();
  let adult = 0;
  const add = (list: Project[]) => {
    for (const p of list) {
      if (rows.has(p.id) || !p.name?.trim()) continue;
      if (isAdultListing(p)) {
        adult++;
        continue;
      }
      if (isNonScenarioListing(p.name)) continue;
      rows.set(p.id, toRow(p, slugById));
    }
  };

  for (let i = 0; i < RECENT_PAGES; i++)
    add(await getJson<Project[]>(`/v1/projects?limit=${PAGE}&offset=${i * PAGE}`));
  for (const [slug, pages] of Object.entries(CATEGORY_TOPUPS)) {
    const id = idBySlug.get(slug);
    if (id == null) {
      console.warn(`unknown TALTO category: ${slug}`);
      continue;
    }
    for (let i = 0; i < pages; i++)
      add(await getJson<Project[]>(`/v1/projects?category=${id}&limit=${PAGE}&offset=${i * PAGE}`));
  }

  const out = [...rows.values()].slice(0, TARGET);
  // 1 行 1 作品にして差分を読みやすくする
  writeFileSync(OUT, `[\n${out.map((r) => JSON.stringify(r)).join(",\n")}\n]\n`);
  const bySystem = new Map<string, number>();
  out.forEach((r) => bySystem.set(r.systemName, (bySystem.get(r.systemName) ?? 0) + 1));
  console.log(
    `wrote ${out.length} scenarios to ${path.relative(ROOT, OUT)} (skipped ${adult} adult listings)`,
  );
  [...bySystem].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}\t${k}`));
}

await main();
