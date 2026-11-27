/**
 * キャラクターシートの汎用モデル。
 *
 * 卓譜の中核はシステムに依存しない。取り込んだキャラシは「見出しつきの区分（section）に、
 * ラベルと値の組（entry）を並べたもの」に正規化して JSON のまま保存し、表示はシステムごとの
 * 見せ方（src/components/sheet.tsx）が区分の種類（kind）を見て決める。
 * サイトごとの読み取りは src/lib/sheet-sources.ts。
 */

/** キャラシの取得元 */
export type SheetProvider =
  | "charaeno"
  | "charash"
  | "charasheet"
  | "ytsheet"
  | "souko"
  | "lhrpg"
  | "iachara"
  | "emoklore"
  | "ccfolia"
  | "udonarium"
  | "text";

export interface SheetEntry {
  label: string;
  value: number | string;
  /** 上限（SAN 99 など）。ゲージや「/ 99」の表示に使う */
  max?: number;
  /** 初期値。技能で value > base なら「伸ばした技能」 */
  base?: number;
  /** 伸ばした・手を入れた技能（初期値が分からないサイト用） */
  grown?: boolean;
  /** 段階（エモクロアの技能レベルなど）。value とは別に ●●○ で見せる */
  rank?: { value: number; max: number };
  /** 技能の分類（戦闘技能・探索技能など） */
  group?: string;
  /** 補足（能力値ボーナス・技能の元になる能力値など） */
  note?: string;
}

/**
 * 区分の種類。見せ方はこれで決まる。
 * - abilities: 能力値（数値の格子）
 * - resources: HP・MP・SAN などの副能力値
 * - skills: 技能（数値か段階。group で分類）
 * - levels: 技能レベル・クラス（名前 + Lv）
 * - list: 所持品・武器・特技などの名前つきの行
 * - text: 経歴・メモの本文
 */
export type SheetSectionKind = "abilities" | "resources" | "skills" | "levels" | "list" | "text";

export interface SheetSection {
  id: string;
  title: string;
  kind: SheetSectionKind;
  entries: SheetEntry[];
  /** kind === "text" の本文 */
  text?: string;
}

export interface CharacterSheet {
  v: 1;
  provider: SheetProvider;
  /** 卓譜に無いシステム（ダブルクロス 3rd など）の名前 */
  systemLabel?: string;
  /** キャラシの閲覧 URL（「キャラシで開く」） */
  url?: string;
  /** この内容を受け取った日時（ISO） */
  fetchedAt?: string;
  /** 職業・年齢・性別などの文字の項目 */
  profile: SheetEntry[];
  sections: SheetSection[];
}

/**
 * システムごとの読み取り（src/lib/sheet-games/）が返すもの。sheet-sources.ts がこれに URL と取得元を足してシートにする。
 * stats は卓をまたいで続く値などを、システム定義（src/data/systems.ts の stats）の key で持つ
 */
export interface GameSheetParts {
  profile: (SheetEntry | null)[];
  sections: (SheetSection | null)[];
  stats: Record<string, number>;
  systemLabel: string;
}

export const SHEET_PROVIDER_LABELS: Record<SheetProvider, string> = {
  charaeno: "キャラエノ",
  charash: "キャラッシュ",
  charasheet: "キャラクター保管所",
  ytsheet: "ゆとシートⅡ",
  souko: "キャラクターシート倉庫",
  lhrpg: "冒険窓口",
  iachara: "いあきゃら",
  emoklore: "エモクロアキャラクターシート",
  ccfolia: "ココフォリアのコマ",
  udonarium: "ユドナリウムのコマ",
  text: "テキスト",
};

/* ---------- 組み立ての補助 ---------- */

export function numOf(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim().replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
    if (/^[+-]?\d+(?:\.\d+)?$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export function textOf(v: unknown): string | undefined {
  if (typeof v === "string") {
    const t = v.replace(/\r\n?/g, "\n").trim();
    return t ? t : undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

/** 空の値を落として entry を作る（数値にできる文字列は数値にする） */
export function entry(
  label: string,
  raw: unknown,
  extra: Omit<SheetEntry, "label" | "value"> = {},
): SheetEntry | null {
  const n = numOf(raw);
  const value = n ?? textOf(raw);
  if (value === undefined || !label.trim()) return null;
  return { label: label.trim(), value, ...dropUndefined(extra) };
}

/** 一覧の 1 行（所持品・特技など）。数や値が空でも名前があれば残す */
export function listEntry(
  label: string,
  raw: unknown,
  extra: Omit<SheetEntry, "label" | "value"> = {},
): SheetEntry | null {
  if (!label.trim()) return null;
  return { label: label.trim(), value: numOf(raw) ?? textOf(raw) ?? "", ...dropUndefined(extra) };
}

function dropUndefined<T extends object>(obj: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function compact<T>(arr: (T | null | undefined | false)[]): T[] {
  return arr.filter((x): x is T => Boolean(x));
}

/** 空の区分を落としてシートを組み立てる */
export function buildSheet(
  provider: SheetProvider,
  parts: {
    profile?: (SheetEntry | null)[];
    sections: (SheetSection | null)[];
    url?: string;
    systemLabel?: string;
  },
): CharacterSheet | undefined {
  const sections = compact(parts.sections).filter((s) =>
    s.kind === "text" ? Boolean(s.text?.trim()) : s.entries.length > 0,
  );
  const profile = compact(parts.profile ?? []);
  if (sections.length === 0 && profile.length === 0) return undefined;
  return {
    v: 1,
    provider,
    ...(parts.systemLabel ? { systemLabel: parts.systemLabel } : {}),
    ...(parts.url ? { url: parts.url } : {}),
    profile,
    sections,
  };
}

export function section(
  id: string,
  title: string,
  kind: SheetSectionKind,
  entries: (SheetEntry | null)[],
): SheetSection {
  return { id, title, kind, entries: compact(entries) };
}

export function textSection(id: string, title: string, raw: unknown): SheetSection | null {
  const text = typeof raw === "string" ? textOf(raw) : undefined;
  if (!text) return null;
  return { id, title, kind: "text", entries: [], text: text.replace(/<br\s*\/?>/gi, "\n") };
}

/* ---------- 読み出し ---------- */

/** 伸ばした技能か（初期値より高い・サイトが手を入れた印を付けている） */
export function isGrownSkill(e: SheetEntry): boolean {
  if (e.grown) return true;
  if (e.rank) return e.rank.value > 0;
  if (typeof e.value === "number" && typeof e.base === "number") return e.value > e.base;
  return false;
}

export function sheetSection(sheet: CharacterSheet | undefined, id: string): SheetSection | undefined {
  return sheet?.sections.find((s) => s.id === id);
}

/** 技能名から値を引く（「運転（自動車）」も「運転」で引ける） */
export function sheetSkillValue(sheet: CharacterSheet | undefined, name: string): number | undefined {
  const skills = sheet?.sections.filter((s) => s.kind === "skills").flatMap((s) => s.entries) ?? [];
  const exact = skills.find((e) => e.label === name);
  const hit = exact ?? skills.find((e) => e.label.replace(/[（(].*$/, "") === name);
  return typeof hit?.value === "number" ? hit.value : undefined;
}

/** 最初に見せる技能の数（伸ばした印のないキャラシだけ） */
const UNMARKED_SKILLS_SHOWN = 12;

/**
 * 技能を、最初に見せるものと開閉にしまうものに分ける。どちらも段階・値の高い順（同じなら元の順）。
 * 見せるのは伸ばした技能。伸ばした印のないキャラシは、多ければ高いほうから
 */
export function splitSkills(entries: SheetEntry[]): { main: SheetEntry[]; rest: SheetEntry[] } {
  const rankOf = (e: SheetEntry) => e.rank?.value ?? -1;
  const valueOf = (e: SheetEntry) => (typeof e.value === "number" ? e.value : -1);
  const sorted = [...entries].sort((a, b) => rankOf(b) - rankOf(a) || valueOf(b) - valueOf(a));
  const grown = sorted.filter(isGrownSkill);
  if (grown.length > 0) return { main: grown, rest: sorted.filter((e) => !isGrownSkill(e)) };
  if (sorted.length <= UNMARKED_SKILLS_SHOWN + 4) return { main: sorted, rest: [] };
  return { main: sorted.slice(0, UNMARKED_SKILLS_SHOWN), rest: sorted.slice(UNMARKED_SKILLS_SHOWN) };
}

/** 技能の分類の並び（クトゥルフの分類。ほかは元の順で後ろに並ぶ） */
const GROUP_ORDER = ["戦闘技能", "探索技能", "行動技能", "交渉技能", "知識技能"];

/** 技能の一覧を区分名つきでまとめる（分類は既知の順、その中は元の順） */
export function groupSkills(entries: SheetEntry[]): { group: string; entries: SheetEntry[] }[] {
  const groups: { group: string; entries: SheetEntry[] }[] = [];
  for (const e of entries) {
    const g = e.group ?? "";
    let bucket = groups.find((x) => x.group === g);
    if (!bucket) {
      bucket = { group: g, entries: [] };
      groups.push(bucket);
    }
    bucket.entries.push(e);
  }
  const rank = (g: string) => {
    const i = GROUP_ORDER.indexOf(g);
    return i === -1 ? GROUP_ORDER.length : i;
  };
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g.group) - rank(b.g.group) || a.i - b.i)
    .map((x) => x.g);
}

export interface SheetSkillChange {
  label: string;
  from: number;
  to: number;
}

/** 前のシートから上がった技能（数値のものだけ）。同期のときに成長として残す */
export function diffSheetSkills(
  prev: CharacterSheet | undefined,
  next: CharacterSheet | undefined,
): SheetSkillChange[] {
  if (!prev || !next) return [];
  const before = new Map<string, number>();
  for (const s of prev.sections) {
    if (s.kind !== "skills" && s.kind !== "levels") continue;
    for (const e of s.entries) {
      const v = e.rank?.value ?? e.value;
      if (typeof v === "number") before.set(`${s.id}:${e.label}`, v);
    }
  }
  const out: SheetSkillChange[] = [];
  for (const s of next.sections) {
    if (s.kind !== "skills" && s.kind !== "levels") continue;
    for (const e of s.entries) {
      const v = e.rank?.value ?? e.value;
      const was = before.get(`${s.id}:${e.label}`);
      if (typeof v === "number" && was !== undefined && v > was)
        out.push({ label: e.label, from: was, to: v });
    }
  }
  return out;
}

/**
 * 保存済みの値を緩く検証する。壊れた区分は落とし、読めなければ undefined
 * （キャラクター本体の復元をシートの不備で止めない）。
 */
export function coerceSheet(raw: unknown): CharacterSheet | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.provider !== "string" || !Array.isArray(r.sections)) return undefined;
  const okEntry = (e: unknown): e is SheetEntry =>
    Boolean(e) &&
    typeof e === "object" &&
    typeof (e as SheetEntry).label === "string" &&
    (typeof (e as SheetEntry).value === "number" || typeof (e as SheetEntry).value === "string");
  const sections = r.sections.flatMap((s): SheetSection[] => {
    if (!s || typeof s !== "object") return [];
    const sec = s as Record<string, unknown>;
    if (typeof sec.id !== "string" || typeof sec.title !== "string" || typeof sec.kind !== "string")
      return [];
    const entries = Array.isArray(sec.entries) ? sec.entries.filter(okEntry) : [];
    return [
      {
        id: sec.id,
        title: sec.title,
        kind: sec.kind as SheetSectionKind,
        entries,
        ...(typeof sec.text === "string" ? { text: sec.text } : {}),
      },
    ];
  });
  return {
    ...(r as object),
    v: 1,
    provider: r.provider as SheetProvider,
    profile: Array.isArray(r.profile) ? r.profile.filter(okEntry) : [],
    sections,
  } as CharacterSheet;
}
