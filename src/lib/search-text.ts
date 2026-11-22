/**
 * 候補の絞り込み（Combobox / MultiCombobox が使う）。
 * 全角・半角、大文字・小文字、ひらがな・カタカナ、中黒や空白の有無を区別せずに照らし合わせる。
 */

/** 候補 1 件。`keywords` は表示しない別名・読み（BCDice の ID や読みがな）で、検索にだけ使う */
export interface SearchOption<T extends string = string> {
  value: T;
  label: string;
  keywords?: readonly string[];
  /** 見出しでまとめるときの群の名前。同じ群は続けて並べる */
  group?: string;
  /** 行の右に添える短い補足（人数など） */
  hint?: string;
}

// 区切りに使われがちな記号。表記ゆれ（「ソード・ワールド」と「ソードワールド」）を吸収するため落とす
const SEPARATORS_RE = /[\s・･\-‐‑–—―_.,、。/／:：;；'"`’”()（）[\]［］「」『』【】〈〉《》!！?？~〜]/g;

const normalizeCache = new Map<string, string>();

/** 照らし合わせ用の形に直す。NFKC → 小文字 → カタカナをひらがなに → 区切り記号を除く */
export function normalizeForSearch(text: string): string {
  const hit = normalizeCache.get(text);
  if (hit !== undefined) return hit;
  let out = text.normalize("NFKC").toLowerCase();
  out = out.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  out = out.replace(SEPARATORS_RE, "");
  if (normalizeCache.size >= 5000) normalizeCache.clear();
  normalizeCache.set(text, out);
  return out;
}

/**
 * 1 件の一致の強さ。小さいほど強い。一致しなければ -1。
 * 0 名前と完全一致 / 1 名前の先頭 / 2 名前の途中 / 3 別名の先頭 / 4 別名の途中
 */
export function matchRank(option: Pick<SearchOption, "label" | "keywords">, query: string): number {
  const q = normalizeForSearch(query);
  if (!q) return 2;
  const label = normalizeForSearch(option.label);
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q)) return 2;
  let best = -1;
  for (const k of option.keywords ?? []) {
    const nk = normalizeForSearch(k);
    if (nk.startsWith(q)) return 3;
    if (best < 0 && nk.includes(q)) best = 4;
  }
  return best;
}

/** 名前が入力と同じ（表記ゆれを除いて）候補があるか。「追加」を出すかどうかに使う */
export function hasExactLabel(options: readonly Pick<SearchOption, "label">[], query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return options.some((o) => normalizeForSearch(o.label) === q);
}

export interface FilterResult<O> {
  /** 表示する候補（最大 limit 件） */
  items: O[];
  /** 一致した総数（limit を超えた分も数える） */
  total: number;
}

/**
 * 入力に合う候補を、一致の強い順（同じ強さなら元の順）に並べ、群ごとにまとめて返す。
 * 入力が空なら元の順のまま。描画を軽く保つため limit 件で切る。
 */
export function filterOptions<O extends SearchOption>(
  options: readonly O[],
  query: string,
  limit = 50,
): FilterResult<O> {
  const q = normalizeForSearch(query);
  let matched: O[];
  if (!q) {
    matched = options.slice();
  } else {
    const ranked: { o: O; rank: number; idx: number }[] = [];
    options.forEach((o, idx) => {
      const rank = matchRank(o, q);
      if (rank >= 0) ranked.push({ o, rank, idx });
    });
    ranked.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
    matched = ranked.map((r) => r.o);
  }
  const grouped = groupInOrder(matched);
  return { items: grouped.slice(0, Math.max(0, limit)), total: grouped.length };
}

/** 群が飛び飛びにならないよう、最初に現れた群の順にまとめる（群の中の順は保つ） */
export function groupInOrder<O extends Pick<SearchOption, "group">>(items: readonly O[]): O[] {
  if (!items.some((o) => o.group)) return items.slice();
  const order: (string | undefined)[] = [];
  const buckets = new Map<string | undefined, O[]>();
  for (const o of items) {
    const key = o.group;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(o);
  }
  return order.flatMap((k) => buckets.get(k) ?? []);
}

/** 候補の一覧に並べる 1 行。`section` は見出し（最近使ったもの・群の名前）。「追加」行は一致がないときだけ */
export type ComboEntry<T extends string = string> =
  | { kind: "option"; option: SearchOption<T>; section?: string }
  | { kind: "create"; text: string; section?: string };

/**
 * 入力から候補の並び（見出し・「追加」行を含む）を作る。Web とアプリの Combobox / MultiCombobox で共通。
 * 入力が空で `pinned` があれば、それを `pinnedLabel` の見出しで先頭に出し、残りを `allLabel`（群があれば群の名前）で続ける。
 * `hidden` は limit で描かなかった数（「ほか N 件」）
 */
export function comboEntries<T extends string>({
  options,
  query,
  pinned,
  pinnedLabel,
  allLabel,
  canCreate,
  limit,
}: {
  options: readonly SearchOption<T>[];
  query: string;
  pinned?: readonly T[];
  pinnedLabel: string;
  allLabel: string;
  canCreate: boolean;
  limit: number;
}): { entries: ComboEntry<T>[]; hidden: number } {
  const entries: ComboEntry<T>[] = [];
  let total: number;
  const q = query.trim();
  if (!q && pinned && pinned.length > 0) {
    const pinnedSet = new Set<string>(pinned);
    const pinnedOpts = pinned
      .map((v) => options.find((o) => o.value === v))
      .filter((o): o is SearchOption<T> => Boolean(o));
    const rest = groupInOrder(options.filter((o) => !pinnedSet.has(o.value)));
    for (const o of pinnedOpts) entries.push({ kind: "option", option: o, section: pinnedLabel });
    for (const o of rest.slice(0, Math.max(0, limit - pinnedOpts.length))) {
      entries.push({ kind: "option", option: o, section: o.group ?? allLabel });
    }
    total = pinnedOpts.length + rest.length;
  } else {
    const res = filterOptions(options, q, limit);
    for (const o of res.items) entries.push({ kind: "option", option: o, section: o.group });
    total = res.total;
  }
  const shown = entries.length;
  if (canCreate && q && !hasExactLabel(options, q)) entries.push({ kind: "create", text: q });
  return { entries, hidden: Math.max(0, total - shown) };
}
