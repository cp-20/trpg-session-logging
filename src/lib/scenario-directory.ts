/**
 * シナリオの共有シナリオ一覧。シナリオは利用者みんなで共有するもので、TALTO の公開シナリオと、利用者が足したものからなる。
 * 共有シナリオ一覧は Firestore の scenarios/{id} にあり（TALTO の分は scripts/sync-scenario-directory.ts がボットで書く）、
 * サーバー（/api/scenarios、src/server/scenario-directory.ts）が切れ端の索引で問い合わせて並べ直す。
 * ブラウザは探した結果と、自分の記録に使ったものの写し（state.scenarios）だけを持つ。
 * ここはフレームワークに依らない部分: 文書の形・切れ端・並べ方・画面のシナリオの形への直し方。
 */
import type { Scenario } from "../types";
// node で動かすスクリプト（scripts/sync-scenario-directory.ts）からも読むので、拡張子まで書く
import { SYSTEMS } from "../data/systems.ts";
import { normalizeForSearch } from "./search-text.ts";
import { taltoProjectUrl, taltoRowToScenario, type TaltoCatalogEntry } from "./talto-scenarios.ts";

/** 共有シナリオ一覧の 1 件（/api/scenarios が返す形） */
export interface DirectoryScenario {
  id: string;
  title: string;
  author: string;
  systemId: string;
  /** 卓譜のシステムに結べなかったときの、配布元のカテゴリ名 */
  systemLabel?: string;
  source: Scenario["source"];
  sourceUrl?: string;
  tags: string[];
  description?: string;
  /** 遊べるかを決める材料（分からなければ null） */
  playersMin?: number | null;
  playersMax?: number | null;
  hours?: number | null;
  /** 足した人（TALTO のものは持たない） */
  addedByUid?: string;
}

const TALTO_PREFIX = "sc_talto_";
export const taltoScenarioId = (taltoId: string) => `${TALTO_PREFIX}${taltoId}`;
const TALTO_URL_RE = /talto\.cc\/projects\/([\w-]+)/;

/** TALTO の作品なら TALTO の ID（シナリオ ID か配布ページの URL から） */
export function taltoIdOf(s: Pick<Scenario, "id" | "sourceUrl">): string | null {
  if (s.id.startsWith(TALTO_PREFIX) && s.id.length > TALTO_PREFIX.length)
    return s.id.slice(TALTO_PREFIX.length);
  return s.sourceUrl?.match(TALTO_URL_RE)?.[1] ?? null;
}

export function taltoToDirectory(
  e: TaltoCatalogEntry,
  systems: Readonly<Record<string, { emoji: string }>>,
): DirectoryScenario {
  const sc = taltoRowToScenario({ ...e, url: taltoProjectUrl(e.id), thumbnail: null }, systems);
  return {
    id: sc.id,
    title: sc.title,
    author: sc.author,
    systemId: sc.systemId,
    ...(sc.systemId === "general" && e.systemSlug !== "other" && e.systemName
      ? { systemLabel: e.systemName }
      : {}),
    source: "talto",
    sourceUrl: sc.sourceUrl,
    tags: [],
    playersMin: e.playersMin,
    playersMax: e.playersMax,
    hours: e.hours,
  };
}

/** 共有シナリオ一覧の 1 件の文書（Firestore の scenarios/{id}）。共有シナリオ一覧の 1 件に、探すための欄を足したもの */
export interface DirectoryDoc extends DirectoryScenario {
  /** 並び（小さいほど先）。TALTO はよく遊ばれている順、利用者が足したものは USER_RANK */
  rank: number;
  /** システムごとの並び（"coc6:0000000123"）。システムで絞って並べる問い合わせを単一の索引で済ませる */
  sysRank: string;
  /** 探す手がかり: 正規化したタイトル・作者・キーワード・システム名の、1 文字と 2 文字の切れ端 */
  t: Record<string, true>;
}

/** 利用者が足したものの並び（TALTO のものの後ろ） */
export const USER_RANK = 1_000_000_000;

export const sysRankOf = (systemId: string, rank: number) => `${systemId}:${String(rank).padStart(10, "0")}`;

type SystemNames = Readonly<Record<string, { name: string }>>;

function fieldsFor(s: DirectoryScenario, systems: SystemNames): string[] {
  return [s.title, s.author, ...s.tags, s.systemLabel ?? systems[s.systemId]?.name ?? ""]
    .map(normalizeForSearch)
    .filter(Boolean);
}

/** 1 文字と 2 文字の切れ端。欄をまたいだ切れ端は作らない */
export function gramsOf(fields: readonly string[]): string[] {
  const out = new Set<string>();
  for (const f of fields) {
    const chars = [...f];
    chars.forEach((c, i) => {
      out.add(c);
      if (i + 1 < chars.length) out.add(c + chars[i + 1]);
    });
  }
  return [...out];
}

/** 文書の切れ端の上限（索引の項目を増やしすぎない。長い欄は後ろを捨てる） */
const MAX_DOC_GRAMS = 400;

export function toDirectoryDoc(s: DirectoryScenario, rank: number, systems: SystemNames): DirectoryDoc {
  const t: Record<string, true> = {};
  for (const g of gramsOf(fieldsFor(s, systems)).slice(0, MAX_DOC_GRAMS)) t[g] = true;
  return { ...s, rank, sysRank: sysRankOf(s.systemId, rank), t };
}

/** 文書から共有シナリオ一覧の 1 件へ（探すための欄を外す） */
export function fromDirectoryDoc(d: DirectoryDoc): DirectoryScenario {
  const { rank: _rank, sysRank: _sysRank, t: _t, ...rest } = d;
  return rest;
}

/** 問い合わせに使う切れ端の上限。どれも文書が持っているはずのもの */
const MAX_QUERY_GRAMS = 6;
const HIRAGANA_ONLY = /^[ぁ-ゖー]+$/;

/**
 * 言葉から、合う文書が必ず持つ切れ端を選ぶ。1 文字の言葉はその字、ほかは 2 文字の切れ端。
 * ひらがなだけの切れ端（「の」「した」）は多くの文書が持つので後回しにし、言葉の端から順に散らして取る
 */
export function queryGrams(q: string): string[] {
  const grams: string[] = [];
  for (const w of q.split(/\s+/).map(normalizeForSearch).filter(Boolean)) {
    const chars = [...w];
    if (chars.length === 1) grams.push(chars[0]!);
    else for (let i = 0; i + 1 < chars.length; i++) grams.push(chars[i]! + chars[i + 1]);
  }
  const unique = [...new Set(grams)];
  const strong = unique.filter((g) => !HIRAGANA_ONLY.test(g));
  const weak = unique.filter((g) => HIRAGANA_ONLY.test(g));
  return [...strong, ...weak].slice(0, MAX_QUERY_GRAMS);
}

export interface DirectoryQuery {
  q?: string;
  /** このシステムのものだけ */
  systemId?: string;
  /** 同じ強さなら先に出すシステム（遊んでいるシステム） */
  prefer?: readonly string[];
  offset?: number;
  limit?: number;
}

export interface DirectoryResult {
  items: DirectoryScenario[];
  /** 合うものの総数 */
  total: number;
}

export const DIRECTORY_MAX_LIMIT = 50;
/** 言葉で探すときに読む文書の上限（切れ端がみな合ったもの）。並べ直しはサーバーでする */
export const CANDIDATE_LIMIT = 300;

/** 共有シナリオ一覧の置き場所。本番は Firestore（src/server/scenario-directory.ts）、テストは memoryScenarioStore */
export interface ScenarioStore {
  byIds(ids: readonly string[]): Promise<DirectoryScenario[]>;
  /** 切れ端をみな持つ文書（システムで絞る）。多くても limit 件 */
  withGrams(grams: readonly string[], systemId: string | undefined, limit: number): Promise<DirectoryDoc[]>;
  /** よく遊ばれている順の 1 ページと総数 */
  page(systemId: string | undefined, offset: number, limit: number): Promise<DirectoryResult>;
}

/**
 * 候補を並べる。強さの順: タイトルと同じ → タイトルの先頭 → タイトルの途中 → 空白で区切った言葉がみなどこか（作者・キーワード・システム名を含む）にある。
 * 同じ強さなら遊んでいるシステムのもの、次によく遊ばれている順。切れ端は合っても言葉が合わないものは落とす
 */
export function rankCandidates(
  docs: readonly DirectoryDoc[],
  q: string,
  prefer: readonly string[],
  systems: SystemNames,
): DirectoryScenario[] {
  const whole = normalizeForSearch(q);
  const words = q.split(/\s+/).map(normalizeForSearch).filter(Boolean);
  const preferred = new Set(prefer);
  const hits: { d: DirectoryDoc; score: number }[] = [];
  for (const d of docs) {
    const [title = "", ...others] = fieldsFor(d, systems);
    const rest = others.join(" ");
    let strength: number;
    if (title === whole) strength = 0;
    else if (title.startsWith(whole)) strength = 1;
    else if (title.includes(whole)) strength = 2;
    else if (words.every((w) => title.includes(w) || rest.includes(w))) strength = 3;
    else continue;
    hits.push({ d, score: strength * 2 + (preferred.has(d.systemId) ? 0 : 1) });
  }
  hits.sort((a, b) => a.score - b.score || a.d.rank - b.d.rank);
  // 利用者が足したもののうち、同じ TALTO の作品が並んでいるものは TALTO の方だけ
  const talto = new Set(hits.filter((h) => h.d.source === "talto").map((h) => taltoIdOf(h.d)));
  return hits
    .filter((h) => h.d.id.startsWith(TALTO_PREFIX) || !talto.has(taltoIdOf(h.d)))
    .map((h) => fromDirectoryDoc(h.d));
}

/** 探す。言葉があれば切れ端で候補を読んで並べ直し、なければよく遊ばれている順のページを読む */
export async function searchScenarios(
  store: ScenarioStore,
  { q = "", systemId, prefer = [], offset = 0, limit = 30 }: DirectoryQuery,
  systems: SystemNames,
): Promise<DirectoryResult> {
  const from = Math.max(0, offset);
  const size = Math.min(Math.max(1, limit), DIRECTORY_MAX_LIMIT);
  const grams = queryGrams(q);
  if (grams.length === 0) return store.page(systemId, from, size);
  const ranked = rankCandidates(await store.withGrams(grams, systemId, CANDIDATE_LIMIT), q, prefer, systems);
  return { items: ranked.slice(from, from + size), total: ranked.length };
}

/** 記憶の中に持つ共有シナリオ一覧（テストと、Firestore のない開発用） */
export function memoryScenarioStore(docs: readonly DirectoryDoc[]): ScenarioStore {
  const sorted = [...docs].sort((a, b) => a.rank - b.rank);
  return {
    byIds: async (ids) => ids.flatMap((id) => sorted.filter((d) => d.id === id)).map(fromDirectoryDoc),
    withGrams: async (grams, systemId, limit) =>
      sorted
        .filter((d) => (!systemId || d.systemId === systemId) && grams.every((g) => d.t[g]))
        .slice(0, limit),
    page: async (systemId, offset, limit) => {
      const all = sorted.filter((d) => !systemId || d.systemId === systemId);
      return { items: all.slice(offset, offset + limit).map(fromDirectoryDoc), total: all.length };
    },
  };
}

/** 人数と時間（「2〜3人」「〜4時間」）。分からないものは出さない */
export function scenarioFacts(c: Pick<DirectoryScenario, "playersMin" | "playersMax" | "hours">): string[] {
  const out: string[] = [];
  const min = c.playersMin ?? null;
  const max = c.playersMax ?? null;
  if (min != null || max != null) {
    if (max == null) out.push(min != null && min > 1 ? `${min}人〜` : "人数不問");
    else if (min == null || min === max) out.push(max === 1 ? "ソロ" : `${max}人`);
    else out.push(`${min}〜${max}人`);
  }
  if (c.hours != null && c.hours > 0) out.push(`〜${c.hours}時間`);
  return out;
}

const BG = "#e8e3dc";

/**
 * 共有シナリオ一覧の 1 件を、記録に結ぶためのシナリオの写しに（state.scenarios）。
 * 人数・時間は写しのキーワードに残す（オフラインでも分かるように）
 */
export function directoryToScenario(
  d: DirectoryScenario,
  systems: Readonly<Record<string, { emoji: string }>>,
): Scenario {
  const facts = scenarioFacts(d);
  const tags = [
    ...(d.systemLabel ? [d.systemLabel] : []),
    ...d.tags,
    ...facts.filter((f) => !d.tags.includes(f)),
  ];
  return {
    id: d.id,
    title: d.title,
    author: d.author,
    systemId: d.systemId,
    source: d.source,
    ...(d.sourceUrl ? { sourceUrl: d.sourceUrl } : {}),
    emoji: systems[d.systemId]?.emoji ?? "汎用",
    bg: BG,
    tags,
    ...(d.description ? { description: d.description } : {}),
    claimedBy: null,
    addedBy: d.addedByUid ? "user" : "system",
    ...(d.addedByUid ? { addedByUid: d.addedByUid } : {}),
  };
}

/** 写しを共有シナリオ一覧の形に（自分が足して、まだ共有シナリオ一覧に届いていないものを一緒に並べるとき） */
export function scenarioToDirectory(s: Scenario): DirectoryScenario {
  return {
    id: s.id,
    title: s.title,
    author: s.author,
    systemId: s.systemId,
    source: s.source,
    ...(s.sourceUrl ? { sourceUrl: s.sourceUrl } : {}),
    tags: s.tags,
    ...(s.description ? { description: s.description } : {}),
    ...(s.addedByUid ? { addedByUid: s.addedByUid } : {}),
  };
}

/** 利用者が足したシナリオのうち、共有シナリオ一覧に出すもの（TALTO の写しは出さない） */
export function isSharedByUser(s: Scenario, uid: string): boolean {
  return s.addedByUid === uid && !s.id.startsWith(TALTO_PREFIX) && !s.private;
}

/** 利用者が足したシナリオを、共有シナリオ一覧の文書に（Firestore の scenarios/{id}。firestore.rules と同じ欄だけ） */
export function sharedScenarioDoc(s: Scenario, uid: string): DirectoryDoc {
  const d: DirectoryScenario = {
    id: s.id,
    title: s.title.slice(0, 200),
    author: s.author.slice(0, 200),
    systemId: s.systemId,
    source: s.source,
    ...(s.sourceUrl ? { sourceUrl: s.sourceUrl.slice(0, 500) } : {}),
    tags: s.tags.slice(0, 20).map((t) => t.slice(0, 50)),
    ...(s.description ? { description: s.description.slice(0, 2000) } : {}),
    addedByUid: uid,
  };
  return toDirectoryDoc(d, USER_RANK, SYSTEMS);
}

/** 文書の欄（ID は文書の名前なので持たない） */
export const docFields = ({ id: _id, ...fields }: DirectoryDoc) => fields;

const SOURCES = new Set<Scenario["source"]>(["booth", "talto", "url", "manual"]);

/** Firestore の文書（素の値に直したもの）を共有シナリオ一覧の文書に。形が違えば null */
export function parseDirectoryDoc(id: string, d: Record<string, unknown>): DirectoryDoc | null {
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const title = str(d.title)?.trim();
  const systemId = str(d.systemId);
  const source = str(d.source) as Scenario["source"] | undefined;
  const rank = num(d.rank);
  if (!title || !systemId || !source || !SOURCES.has(source) || rank === null) return null;
  const tags = Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [];
  const t: Record<string, true> = {};
  if (d.t && typeof d.t === "object") for (const k of Object.keys(d.t)) t[k] = true;
  const facts = (["playersMin", "playersMax", "hours"] as const).flatMap((k) =>
    k in d ? [[k, num(d[k])] as const] : [],
  );
  return {
    id,
    title,
    author: str(d.author) ?? "",
    systemId,
    ...(str(d.systemLabel) ? { systemLabel: str(d.systemLabel) } : {}),
    source,
    ...(str(d.sourceUrl) ? { sourceUrl: str(d.sourceUrl) } : {}),
    tags,
    ...(str(d.description) ? { description: str(d.description) } : {}),
    ...Object.fromEntries(facts),
    ...(str(d.addedByUid) ? { addedByUid: str(d.addedByUid) } : {}),
    rank,
    sysRank: str(d.sysRank) ?? sysRankOf(systemId, rank),
    t,
  };
}

/**
 * 共有シナリオ一覧の結果から、手元の写しと同じ作品（同じ ID か、同じ TALTO の作品）を除く。
 * TALTO の作品でないもの同士は ID だけで比べる（TALTO の ID がないことを「同じ」と見なさない）
 */
export function withoutKnown<T extends Pick<DirectoryScenario, "id" | "sourceUrl">>(
  known: readonly Pick<DirectoryScenario, "id" | "sourceUrl">[],
  items: readonly T[],
): T[] {
  const ids = new Set(known.map((s) => s.id));
  const talto = new Set(known.map(taltoIdOf).filter((t): t is string => t !== null));
  return items.filter((d) => {
    if (ids.has(d.id)) return false;
    const t = taltoIdOf(d);
    return t === null || !talto.has(t);
  });
}
