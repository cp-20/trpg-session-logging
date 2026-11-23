/**
 * システムを選ぶ Combobox の候補。BCDice のすべてのシステムを、読み・BCDice の ID でも探せるようにする。
 */
import { SYSTEM_LIST, isInternationalSystem } from "../data/systems";
import type { Log, SystemDef } from "../types";
import type { SearchOption } from "./search-text";
import { sessionStart } from "./sittings";

/** 国際化版（韓国語・中国語・英語）の見出し */
export const INTERNATIONAL_GROUP = "ほかの言語の版";

/**
 * システムの候補。日本語の版を先に、国際化版は見出しを分けて後ろに置く。
 * @param systems 候補にするシステム（絞り込みでは使われているものだけを渡す）
 */
export function systemOptions(systems: readonly SystemDef[] = SYSTEM_LIST): SearchOption[] {
  // 「汎用・その他」はどのシステムにも当たらないときの逃げ道なので、50 音の途中ではなく先頭に置く
  const ordered = [
    ...systems.filter((s) => s.id === "general"),
    ...systems.filter((s) => s.id !== "general"),
  ];
  return ordered.map((s) => ({
    value: s.id,
    label: s.name,
    keywords: s.keywords,
    group: isInternationalSystem(s) ? INTERNATIONAL_GROUP : undefined,
  }));
}

/** 最近のセッションで使ったシステム（新しい順・重複なし）。Combobox の pinned に渡す */
export function recentSystemIds(
  logs: readonly Pick<Log, "systemId" | "sittings" | "createdAt">[],
  limit = 5,
): string[] {
  const sorted = logs
    .slice()
    .sort(
      (a, b) =>
        (sessionStart(b) || Date.parse(b.createdAt) / 1000 || 0) -
        (sessionStart(a) || Date.parse(a.createdAt) / 1000 || 0),
    );
  const out: string[] = [];
  for (const l of sorted) {
    if (l.systemId && !out.includes(l.systemId)) out.push(l.systemId);
    if (out.length >= limit) break;
  }
  return out;
}
