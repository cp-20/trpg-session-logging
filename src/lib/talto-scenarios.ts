/**
 * TALTO（https://talto.cc）の公開シナリオ一覧から取ったサンプル行を、卓譜の Scenario に直す。
 * 取得は scripts/fetch-talto-scenarios.ts。体験版（/demo）の見本データにだけ使う。
 */
import type { Scenario } from "../types";

/** src/data/talto-scenarios.json の 1 行。事実情報だけを持つ（あらすじ・画像本体は持たない） */
export interface TaltoScenarioRow {
  /** TALTO のプロジェクト ID */
  id: string;
  title: string;
  author: string;
  /** TALTO のカテゴリ（システム）。slug は英字、name は表示名 */
  systemSlug: string;
  systemName: string;
  playersMin: number | null;
  /** 99 以上は TALTO で「人数不問」なので null にしてある */
  playersMax: number | null;
  /** 想定プレイ時間の上限（時間） */
  hours: number | null;
  url: string;
  /** 表紙画像の URL（画像は取り込まない） */
  thumbnail: string | null;
}

/**
 * TALTO のカテゴリ slug → 卓譜の systemId（詳しい定義のあるものは卓譜の ID、ほかは BCDice のゲームシステム ID）。
 * ここにないもの・システム一覧にまだないものは "general" に入れ、システム名をタグの先頭に残す。
 * 対応を足せば、取り直さなくても体験版の読み込み時に直る。
 */
export const TALTO_SYSTEM_MAP: Readonly<Record<string, string>> = {
  call_of_cthulhu_6th: "coc6",
  call_of_cthulhu_7th: "coc7",
  emoklore: "emoklore",
  "sword_world_2.5": "sw25",
  murder_mystery: "madamis",
  aionia: "Aionia",
  alshard_savior: "Alshard",
  deadline_heroes: "DeadlineHeroes",
  double_cross: "DoubleCross",
  dungeons_and_dragons: "DungeonsAndDragons",
  futarisousa: "FutariSousa",
  giacare: "GaiaCare",
  insane: "Insane",
  kizuna_bullet: "KizunaBullet",
  kurayami_crying: "KurayamiCrying",
  kutulu: "Kutulu",
  kyoko_shinsyoku: "KyokoShinshoku",
  magicalogia: "MagicaLogia",
  monotone_museum: "MonotoneMuseum",
  mork_borg: "MorkBorg",
  nechronica: "Nechronica",
  rogue_like_half: "RogueLikeHalf",
  satasupe: "Satasupe",
  shinobigami: "ShinobiGami",
  stellar_knights: "StellarKnights",
  tokyo_nova: "TokyoNova",
  ventangle_ar: "Ventangle",
  yuuyake_koyake: "GoldenSkyStories",
};

const ADULT_RE = /R-?18|R18G|18禁|成人向け|アダルト|NSFW/i;

/** 成人向けと明示された作品か（タイトル・タグ・説明文のどれかに表示があるもの） */
export function isAdultListing(fields: {
  name?: string;
  tags?: readonly string[];
  description?: string;
}): boolean {
  return [fields.name ?? "", ...(fields.tags ?? []), fields.description ?? ""].some((t) => ADULT_RE.test(t));
}

const NON_SCENARIO_RE = /データ集|追加エネミー|サプリメント|ルールブック|画面素材|立ち?絵素材|BGM素材/;

/** シナリオ以外（データ集・配信用素材など）の出品か。TALTO にはシナリオ以外も並ぶので見本からは外す */
export function isNonScenarioListing(title: string): boolean {
  return NON_SCENARIO_RE.test(title);
}

/**
 * TALTO の slug を卓譜の systemId に。knownIds（システム一覧の ID）を渡すと、一覧にない ID は返さない。
 * 対応表にない slug でも、一覧に同じ ID があればそれを使う。
 */
export function taltoSystemId(slug: string, knownIds?: ReadonlySet<string>): string | null {
  const mapped = TALTO_SYSTEM_MAP[slug];
  if (mapped && (!knownIds || knownIds.has(mapped))) return mapped;
  if (knownIds?.has(slug)) return slug;
  return null;
}

function playersTag(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (max == null) return min != null && min > 1 ? `${min}人〜` : "人数不問";
  if (min == null || min === max) return max === 1 ? "ソロ" : `${max}人`;
  return `${min}〜${max}人`;
}

const SYSTEM_BG: Readonly<Record<string, string>> = {
  coc6: "#e9e4dc",
  coc7: "#ece4d8",
  emoklore: "#eedfe1",
  sw25: "#e8e9da",
  madamis: "#e7e2da",
};

export function taltoRowToScenario(
  row: TaltoScenarioRow,
  systems: Readonly<Record<string, { emoji: string }>>,
): Scenario {
  const known = new Set(Object.keys(systems));
  const systemId = taltoSystemId(row.systemSlug, known) ?? "general";
  const tags: string[] = [];
  if (systemId === "general" && row.systemSlug !== "other" && row.systemName) tags.push(row.systemName);
  const players = playersTag(row.playersMin, row.playersMax);
  if (players) tags.push(players);
  if (row.hours != null && row.hours > 0) tags.push(`〜${row.hours}時間`);
  return {
    id: `sc_talto_${row.id}`,
    title: row.title,
    author: row.author,
    systemId,
    source: "talto",
    sourceUrl: row.url,
    emoji: systems[systemId]?.emoji ?? "汎用",
    bg: SYSTEM_BG[systemId] ?? "#e8e3dc",
    tags,
    claimedBy: null,
    addedBy: "system",
  };
}
