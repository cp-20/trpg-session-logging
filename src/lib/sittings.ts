/**
 * セッションを遊んだ時間帯（集まり）。1 つのセッションは 1 回以上の集まりでできている。
 * 1 回の集まりは開始と終了の日時（epoch 秒）で持つ。終了は翌日でもよい（21:00〜翌 2:00）。
 *
 * 「実施日の一覧 + 初日の開始時刻 + 最終日の終了時刻（25:30 のような 30 時間制）」という以前の持ち方は、
 * 2 日目以降の時間帯が表せず、入力も不自然だったのでやめた（P1）。古い保存データは migrateLegacySchedule で読み替える。
 */
import { fmtDate, fmtDates, jstDate, jstEpoch, jstTime } from "./format";

export interface Sitting {
  /** 開始（epoch 秒） */
  start: number;
  /** 終了（epoch 秒）。start より後 */
  end: number;
}

/** 発言の間がこれより空いたら、別の集まりとみなす */
export const SITTING_GAP_SECONDS = 4 * 3600;

const JST_OFFSET = 9 * 3600;

/** 集まりの日付キー。6:00 を日替わりとする（深夜 2 時開始は前日の集まり） */
export function sittingDay(ts: number): string {
  return new Date((ts + JST_OFFSET - 6 * 3600) * 1000).toISOString().slice(0, 10);
}

/** 並べ替え、壊れた区間を落とし、重なり・接した区間はまとめる */
export function normalizeSittings(list: readonly Sitting[]): Sitting[] {
  const valid = list
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start > 0 && s.end >= s.start)
    .map((s) => ({ start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start);
  const out: Sitting[] = [];
  for (const s of valid) {
    const last = out.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push(s);
  }
  return out;
}

/**
 * ログの発言時刻から集まりを導く。発言の間が SITTING_GAP_SECONDS 以上空いたところで区切る。
 * 時刻のない発言（CCFOLIA の HTML 書き出しなど、ts = 0）は使わない。時刻が一つもなければ空。
 */
export function deriveSittings(channels: readonly { msgs: readonly { ts: number }[] }[]): Sitting[] {
  const all = channels
    .flatMap((c) => c.msgs.map((m) => m.ts))
    .filter((ts) => Number.isFinite(ts) && ts > 0)
    .sort((a, b) => a - b);
  if (all.length === 0) return [];
  const out: Sitting[] = [{ start: all[0]!, end: all[0]! }];
  for (const ts of all.slice(1)) {
    const cur = out.at(-1)!;
    if (ts - cur.end >= SITTING_GAP_SECONDS) out.push({ start: ts, end: ts });
    else cur.end = ts;
  }
  return out;
}

/** ログの発言に時刻が入っているか（入っていなければ、集まりは手で入れてもらう） */
export function hasMessageTimes(channels: readonly { msgs: readonly { ts: number }[] }[]): boolean {
  return channels.some((c) => c.msgs.some((m) => m.ts > 0));
}

type WithSittings = { sittings: readonly Sitting[] };

/** セッションの開始（最初の集まりの開始）。集まりがなければ 0 */
export function sessionStart(log: WithSittings): number {
  return log.sittings[0]?.start ?? 0;
}

/** セッションの終了（最後の集まりの終了）。集まりがなければ 0 */
export function sessionEnd(log: WithSittings): number {
  return log.sittings.at(-1)?.end ?? 0;
}

/** 遊んだ日（集まりごとの開始日。同じ日は 1 つ） */
export function sessionDays(log: WithSittings): string[] {
  return [...new Set(log.sittings.map((s) => sittingDay(s.start)))];
}

/** 遊んだ時間の合計（分）。集まりの間の空白は数えない */
export function sittingsMinutes(sittings: readonly Sitting[]): number {
  const sec = sittings.reduce((n, s) => n + Math.max(0, s.end - s.start), 0);
  return Math.round(sec / 60);
}

/** 終了が開始の翌日以降か（「翌 2:00」と書く） */
export function endsNextDay(s: Sitting): boolean {
  return jstDate(s.end) !== jstDate(s.start);
}

/** 「10月17日(土) 19:30〜23:50」「10月17日(土) 21:00〜翌2:00」 */
export function fmtSitting(s: Sitting): string {
  const end = jstTime(s.end);
  return `${fmtDate(jstDate(s.start))} ${jstTime(s.start)}〜${endsNextDay(s) ? `翌${end}` : end}`;
}

/**
 * セッションの「いつ」を 1 行で。集まりが 1 回なら時刻まで、複数回なら日付と回数。
 * 例: 「10月17日(土) 19:30〜23:50」「11月8日(土)・15日(土)（2回）」
 */
export function fmtSessionWhen(log: WithSittings): string {
  if (log.sittings.length === 0) return "日付未定";
  if (log.sittings.length === 1) return fmtSitting(log.sittings[0]!);
  return `${fmtDates(sessionDays(log))}（${log.sittings.length}回）`;
}

/* ---------- 入力（日付・開始時刻・終了時刻） ---------- */

/** 入力欄の値。日付は YYYY-MM-DD、時刻は HH:MM（0〜23 時）。終了が開始以前なら翌日の終了とみなす */
export interface SittingFields {
  date: string;
  start: string;
  end: string;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]?\d|2[0-3])[:：]([0-5]\d)$/;

/** "9:05" / "09:05" / "9：05" / "0905" → "09:05"。読めなければ null */
export function normalizeTime(raw: string): string | null {
  const s = raw.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const compact = /^(\d{1,2})(\d{2})$/.exec(s);
  const m = HM.exec(compact ? `${compact[1]}:${compact[2]}` : s);
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export function sittingToFields(s: Sitting): SittingFields {
  return { date: jstDate(s.start), start: jstTime(s.start), end: jstTime(s.end) };
}

/** 入力欄の値を集まりにする。終了が開始と同じかそれより前なら、翌日の終了とする */
export function sittingFromFields(f: SittingFields): Sitting | null {
  const start = normalizeTime(f.start);
  const end = normalizeTime(f.end);
  if (!YMD.test(f.date) || !start || !end) return null;
  const s = jstEpoch(f.date, start);
  let e = jstEpoch(f.date, end);
  if (e <= s) e += 24 * 3600;
  return { start: s, end: e };
}

/** 入力欄の並びを検証して集まりの並びにする。問題があれば最初の問題を返す */
export function sittingsFromFields(
  rows: readonly SittingFields[],
): { ok: true; sittings: Sitting[] } | { ok: false; index: number; error: string } {
  if (rows.length === 0) return { ok: false, index: 0, error: "遊んだ日時を入れてください。" };
  const parsed: Sitting[] = [];
  for (const [i, row] of rows.entries()) {
    if (!YMD.test(row.date))
      return { ok: false, index: i, error: "日付を YYYY/MM/DD の形で入れてください。" };
    const s = sittingFromFields(row);
    if (!s) return { ok: false, index: i, error: "時刻を 21:00 のように入れてください。" };
    parsed.push(s);
  }
  const sorted = [...parsed].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.start < sorted[i - 1]!.end) {
      return { ok: false, index: parsed.indexOf(sorted[i]!), error: "時間帯が重なっています。" };
    }
  }
  return { ok: true, sittings: sorted };
}

/** 次に足す集まりの初期値: 直前の集まりの翌日、同じ時刻 */
export function nextSittingFields(rows: readonly SittingFields[], today: string): SittingFields {
  const last = rows.at(-1);
  if (!last || !YMD.test(last.date)) return { date: today, start: "21:00", end: "00:00" };
  const d = new Date(`${last.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { date: d.toISOString().slice(0, 10), start: last.start, end: last.end };
}

/* ---------- 古い保存データの読み替え ---------- */

interface LegacySchedule {
  dates?: unknown;
  t0?: unknown;
  t1?: unknown;
  channels?: unknown;
  sittings?: unknown;
}

function isSitting(v: unknown): v is Sitting {
  return (
    Boolean(v) &&
    typeof v === "object" &&
    Number.isFinite((v as Sitting).start) &&
    Number.isFinite((v as Sitting).end)
  );
}

/**
 * 以前の持ち方（dates + t0 + t1）から集まりを作る。
 * 1. ログに発言時刻があれば、それから導く（いちばん確か）
 * 2. 実施日が 1 日なら t0〜t1 の 1 回
 * 3. 複数日なら、初日の開始時刻と最終日の長さを各日に当てる（以前は 2 日目以降の時刻を持っていなかった）
 */
export function migrateLegacySchedule(log: LegacySchedule): Sitting[] {
  const channels = Array.isArray(log.channels)
    ? (log.channels as { msgs?: unknown }[]).map((c) => ({
        msgs: Array.isArray(c?.msgs)
          ? (c.msgs as { ts: number }[]).filter((m) => typeof m?.ts === "number")
          : [],
      }))
    : [];
  const fromLog = deriveSittings(channels);
  if (fromLog.length > 0) return fromLog;
  const t0 = typeof log.t0 === "number" && Number.isFinite(log.t0) ? log.t0 : 0;
  const t1 = typeof log.t1 === "number" && Number.isFinite(log.t1) ? Math.max(log.t1, t0) : t0;
  const dates = Array.isArray(log.dates)
    ? [
        ...new Set((log.dates as unknown[]).filter((d): d is string => typeof d === "string" && YMD.test(d))),
      ].sort()
    : [];
  if (t0 <= 0) return [];
  if (dates.length <= 1) return [{ start: t0, end: t1 }];
  const startClock = jstTime(t0);
  const lastStart = jstEpoch(dates.at(-1)!, startClock);
  const length = Math.max(0, t1 - lastStart);
  return normalizeSittings(
    dates.map((d, i) => {
      const start = i === 0 ? t0 : jstEpoch(d, startClock);
      return { start, end: i === dates.length - 1 ? t1 : start + length };
    }),
  );
}

/**
 * 保存データの 1 件を今の形にする（その場で書き換える）。sittings があればそれを正とし、古い欄は消す。
 * 読み替えられなければ false。
 */
export function upgradeLogSchedule(log: Record<string, unknown>): boolean {
  if (Array.isArray(log.sittings) && log.sittings.every(isSitting)) {
    log.sittings = normalizeSittings(log.sittings as Sitting[]);
  } else {
    log.sittings = migrateLegacySchedule(log as LegacySchedule);
  }
  delete log.dates;
  delete log.t0;
  delete log.t1;
  return (log.sittings as Sitting[]).length > 0;
}
