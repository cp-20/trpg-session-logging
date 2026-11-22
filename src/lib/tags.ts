/**
 * タグ・キーワードの候補（MultiCombobox に渡す）。カンマ区切りの文字入力は使わない（P7）。
 */
import { normalizeForSearch } from "./search-text";
import type { SearchOption } from "./search-text";

/** すでに付いているタグを、よく使われている順（同数なら最初に現れた順）に重複なく並べる。表記ゆれは最初の表記にまとめる */
export function tagOptions(items: readonly { tags?: readonly string[] }[]): SearchOption[] {
  const counts = new Map<string, { label: string; count: number; first: number }>();
  let order = 0;
  for (const item of items) {
    for (const raw of item.tags ?? []) {
      const label = raw.trim();
      if (!label) continue;
      const key = normalizeForSearch(label);
      const hit = counts.get(key);
      if (hit) hit.count++;
      else counts.set(key, { label, count: 1, first: order++ });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((t) => ({ value: t.label, label: t.label }));
}

/** 保存する前に整える: 前後の空白を除き、空と表記ゆれの重複を落とす */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim();
    const key = normalizeForSearch(t);
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
