/**
 * TALTO（https://talto.cc）の公開シナリオ一覧から事実情報だけを取る。
 *   node scripts/fetch-talto-scenarios.ts [--cache <dir>] [--offline]
 *
 * 出力は scripts/data/talto-catalog.json: 公開シナリオの一覧（全件を新着順にたどり、いいねの多い順に並べる）。
 * これを scripts/sync-scenario-directory.ts が Firestore の scenarios（共有シナリオ一覧）へ書き込む。画面は /api/scenarios で探す。
 * - talto.cc/robots.txt は /search 等を禁止しているが、カテゴリ一覧とプロジェクトページは許可。
 *   ここで使うのはサイト自身がカテゴリ一覧の表示に使う公開 API（GET /v1/projects?category=…）だけ。
 * - 1 秒に 1 回まで。応答はキャッシュに保存し、再実行では取りに行かない（--offline でキャッシュのみ）。
 * - 持つのはタイトル・作者・システム・人数・時間・URL・表紙画像 URL。あらすじや画像本体は持たない。
 * - 成人向けと明示された作品と、シナリオ以外の出品（データ集・配信用素材など）は入れない。
 * - 一覧は表紙画像の URL も持たない（一覧にも詳細にも出さないので。P5）。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  encodeTaltoCatalog,
  isAdultListing,
  isNonScenarioCategory,
  isNonScenarioListing,
  type TaltoCatalogEntry,
  type TaltoScenarioRow,
} from "../src/lib/talto-scenarios.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG_OUT = path.join(ROOT, "scripts/data/talto-catalog.json");
/** 一覧に入れる最大数。全件たどったうえで、いいねの多い順にここまで残す */
const CATALOG_MAX = 20000;
/** 全件をたどるときのページ数の上限（暴走しないための歯止め） */
const MAX_PAGES = 2000;
const API = "https://us-central1-talto-trpg.cloudfunctions.net/api";
const UA = "Mozilla/5.0 (compatible; sample-data-fetcher)";
const PAGE = 30; // API の上限

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const CACHE = path.resolve(argValue("--cache") ?? path.join(ROOT, "node_modules/.cache/talto"));
const OFFLINE = args.includes("--offline");

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
  likes?: number;
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

/** 新着順の全体一覧を最後までたどる。各ページはキャッシュに残るので、途中で止めても続きから取れる */
async function fetchAll(): Promise<Project[]> {
  const out: Project[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await getJson<Project[]>(`/v1/projects?limit=${PAGE}&offset=${i * PAGE}`);
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

async function writeCatalog(slugById: Map<number, string>): Promise<void> {
  const all = await fetchAll();
  const seen = new Set<string>();
  const kept: { p: Project; idx: number }[] = [];
  let adult = 0;
  all.forEach((p, idx) => {
    if (seen.has(p.id) || !p.name?.trim()) return;
    seen.add(p.id);
    if (isAdultListing(p)) {
      adult++;
      return;
    }
    if (isNonScenarioListing(p.name) || isNonScenarioCategory(slugById.get(p.category_id) ?? "")) return;
    kept.push({ p, idx });
  });
  // いいねの多い順（同じなら新しい順）。一覧の並びがそのまま「よく遊ばれている順」の候補になる
  kept.sort((a, b) => (b.p.likes ?? 0) - (a.p.likes ?? 0) || a.idx - b.idx);
  const entries: TaltoCatalogEntry[] = kept.slice(0, CATALOG_MAX).map(({ p }) => {
    const { thumbnail: _cover, ...row } = toRow(p, slugById);
    return row;
  });
  const text = encodeTaltoCatalog(entries, new Date().toISOString().slice(0, 10));
  writeFileSync(CATALOG_OUT, text);
  console.log(
    `wrote ${entries.length} of ${all.length} listings to ${path.relative(ROOT, CATALOG_OUT)} ` +
      `(${(text.length / 1024).toFixed(0)} KiB, skipped ${adult} adult listings)`,
  );
}

async function main(): Promise<void> {
  await checkRobots();
  const categories = await getJson<Category[]>("/v1/categories");
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));
  await writeCatalog(slugById);
}

await main();
