/**
 * キャラクターの成長と「今の値」。
 *
 * - 成長は必ずどれかのセッションのあとのもの（`GrowthRecord.logId` は必須）。日付はそのセッションの日付。
 * - キャラシと結び付いたキャラクターは、同期で上がった技能を成長として自動で残す（手で打たせない）。
 *   どのセッションのあとかの既定は「前の同期のあとに遊んだうち、いちばん新しいセッション」。
 * - キャラシのないキャラクターだけ手で記録する。そのときも前の値は分かる範囲で埋める。
 */
import { SYSTEMS, carriedStats } from "../data/systems";
import type { Character, GrowthRecord, SessionStat } from "../types";
import { sheetSection, sheetSkillValue } from "./sheet";

/** 新しい順のセッション */
export function sessionsNewestFirst(c: Pick<Character, "sessions">): SessionStat[] {
  return [...c.sessions].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * 同期で見つかった成長を、どのセッションのあとのものとするかの既定。
 * 前の同期（`since`）の日以降に遊んだうち、いちばん新しいもの。なければいちばん新しいセッション。
 * セッションが 1 つもなければ undefined（成長として残さない）。
 */
export function defaultGrowthSession(
  c: Pick<Character, "sessions">,
  since: string | undefined,
): SessionStat | undefined {
  const sorted = sessionsNewestFirst(c);
  const sinceDay = since?.slice(0, 10);
  const played = sinceDay ? sorted.find((s) => s.date >= sinceDay) : undefined;
  return played ?? sorted[0];
}

/** 卓ごとの状態の値（SAN・HP・幸運など）。上がっても成長とは呼ばない */
const STATE_KEYS = new Set(["hp", "mp", "san", "luck", "mov", "build", "db"]);

export interface GrowthChange {
  skill: string;
  from: number;
  to: number;
}

/**
 * 同期の差分から成長を導く。上がった技能・技能レベルだけ（能力値の stats は状態の値を除いて上がったものだけ）。
 * `sheetChanges` はシート同士の比較（diffSheetSkills）、`statChanges` は数値の項目の比較。
 */
export function growthFromSync(
  systemId: string,
  sheetChanges: { label: string; from: number; to: number }[],
  statChanges: { key: string; label: string; from: number; to: number }[],
): GrowthChange[] {
  const systemKeys = new Set((SYSTEMS[systemId]?.stats ?? []).map((s) => s.key));
  const out: GrowthChange[] = [];
  for (const d of statChanges) {
    if (d.to <= d.from) continue;
    if (STATE_KEYS.has(d.key.toLowerCase()) || systemKeys.has(d.key)) continue;
    out.push({ skill: d.label, from: d.from, to: d.to });
  }
  for (const d of sheetChanges) {
    if (d.to <= d.from) continue;
    if (out.some((x) => x.skill === d.label)) continue;
    out.push({ skill: d.label, from: d.from, to: d.to });
  }
  return out;
}

/** 成長をセッションに結ぶ（日付はそのセッションの日付） */
export function growthRecords(
  changes: GrowthChange[],
  session: Pick<SessionStat, "logId" | "date">,
  newId: () => string,
): GrowthRecord[] {
  return changes.map((d) => ({
    id: newId(),
    logId: session.logId,
    date: session.date,
    skill: d.skill,
    from: d.from,
    to: d.to,
  }));
}

/** 記録した成長を別のセッションのあとのものに付け替える */
export function reassignGrowth(
  c: Character,
  ids: readonly string[],
  session: Pick<SessionStat, "logId" | "date">,
) {
  const set = new Set(ids);
  for (const g of c.growth) {
    if (!set.has(g.id)) continue;
    g.logId = session.logId;
    g.date = session.date;
  }
}

/**
 * 技能の今の値。キャラシにあればキャラシ、なければ最後に記録した成長の値。分からなければ undefined
 * （そのときだけ前の値を尋ねる）。
 */
export function currentSkillValue(c: Pick<Character, "sheet" | "growth">, skill: string): number | undefined {
  const fromSheet = sheetSkillValue(c.sheet, skill);
  if (fromSheet != null) return fromSheet;
  const last = c.growth
    .filter((g) => g.skill === skill)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  return last?.to;
}

/**
 * 卓をまたいで続く値の今の値。セッションの記録とキャラシ（stats）のうち新しいほう。
 * キャラシと結び付いていて、最後の同期が最後に遊んだ日より後ならキャラシの値を使う。
 */
export function currentCarriedValue(
  c: Pick<Character, "sessions" | "stats" | "externalSync" | "sheet">,
  key: string,
): number | undefined {
  let latest: { date: string; val: number } | undefined;
  for (const s of c.sessions) {
    const d = s.delta[key];
    if (d?.after == null) continue;
    if (!latest || s.date >= latest.date) latest = { date: s.date, val: d.after };
  }
  const sheetVal = c.stats[key];
  if (!latest) return sheetVal;
  const syncedDay = (c.externalSync?.lastSyncedAt ?? c.sheet?.fetchedAt)?.slice(0, 10);
  if (sheetVal != null && syncedDay && syncedDay > latest.date) return sheetVal;
  return latest.val;
}

/** 見せる「今の値」。続く値（`carry`）だけ。上限はキャラシにあればそれ */
export function carriedValues(
  c: Pick<Character, "systemId" | "sessions" | "stats" | "externalSync" | "sheet">,
): { key: string; label: string; value: number; max?: number }[] {
  const resources = sheetSection(c.sheet, "resources")?.entries ?? [];
  return carriedStats(SYSTEMS[c.systemId]).flatMap((st) => {
    const value = currentCarriedValue(c, st.key);
    if (value == null) return [];
    const max = resources.find((e) => e.label === st.label)?.max ?? st.max;
    return [{ key: st.key, label: st.label, value, ...(max != null ? { max } : {}) }];
  });
}

/** セッションの増減のうち、続く値（`carry`）のものだけ */
export function carriedDeltas(
  systemId: string,
  delta: SessionStat["delta"],
): { key: string; label: string; before: number; after: number }[] {
  return carriedStats(SYSTEMS[systemId]).flatMap((st) => {
    const d = delta[st.key];
    return d ? [{ key: st.key, label: st.label, before: d.before, after: d.after }] : [];
  });
}
