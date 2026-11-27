/**
 * シナリオの修正提案の中身。提案はほかの人が書くので、読むときに形を確かめ、決まった欄の決まった型だけを残す。
 * 型の違う値（数や入れ子）が混じっても、差分の表示が落ちて却下もできない、ということがないように。
 * 長さの上限は共有シナリオ一覧と同じ（firestore.rules の validScenario）
 */
import type { ScenarioEditChanges } from "../types";

const LIMITS = { title: 200, author: 200, systemId: 64, sourceUrl: 500, description: 2000 } as const;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

/** 読めないものは null（一覧からは外す） */
export function sanitizeEditChanges(raw: unknown): ScenarioEditChanges | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: ScenarioEditChanges = {};
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = src[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > LIMITS[key]) return null;
    out[key] = value;
  }
  if (src.tags !== undefined) {
    if (!Array.isArray(src.tags) || src.tags.length > MAX_TAGS) return null;
    if (!src.tags.every((t) => typeof t === "string" && t.length <= MAX_TAG_LENGTH)) return null;
    out.tags = src.tags as string[];
  }
  return Object.keys(out).length > 0 ? out : null;
}
