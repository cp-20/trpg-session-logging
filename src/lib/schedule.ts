/**
 * 予定・日程調整の純粋な計算（カレンダーと卓の画面で共用）。React に依存しない。
 */
import type { State, TableEvent, TableEventCandidate } from "../types";

export const VALID_TIME = /^(?:[01]?\d|2\d|3[01]):[0-5]\d$/;
export const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11" を delta か月ずらす */
export function shiftYearMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 日程調整の候補にすぐ足せる週末（今日が土曜なら今日を「今週土曜」とする） */
export function quickWeekendDates(today: string): { thisSat: string; thisSun: string; nextSat: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const thisSat = addDays(today, (6 - dow + 7) % 7);
  return { thisSat, thisSun: addDays(thisSat, 1), nextSat: addDays(thisSat, 7) };
}

/** 開始時刻と長さ（分）から終了時刻。日付をまたぐときは 25:00 のように 24 以上で返す */
export function computeEndTime(startTime: string, durationMin: number): string {
  if (!VALID_TIME.test(startTime.trim())) return "";
  const [h, m] = startTime.trim().split(":").map(Number);
  const safeMin = Number.isFinite(durationMin) ? Math.max(15, Math.round(durationMin)) : 180;
  const total = h! * 60 + m! + safeMin;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** 予定の長さ（分）。保存済みの長さがあればそれを、なければ開始と終了から求める */
export function eventDurationMinutes(startTime: string, endTime: string, durationMin?: number): number {
  if (typeof durationMin === "number" && Number.isFinite(durationMin) && durationMin > 0) return durationMin;
  if (!VALID_TIME.test(startTime) || !VALID_TIME.test(endTime)) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let diff = eh! * 60 + em! - (sh! * 60 + sm!);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

/**
 * カレンダーアプリから書き出したファイルの本文から、予定のある日（日本時間）を取り出す。
 * 内容は読まず、開始日だけを使う。
 */
export function parseBusyDates(calendarText: string): string[] {
  const lines = calendarText.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const dates = new Set<string>();
  let inTimezone = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VTIMEZONE") inTimezone = true;
    else if (line === "END:VTIMEZONE") inTimezone = false;
    if (inTimezone) continue;
    const m = /^DTSTART(?:;[^:]*)?:(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/i.exec(line);
    if (!m) continue;
    const [, y, mo, d, hh, mm, ss, isUtc] = m;
    if (isUtc) {
      const utcMs = Date.UTC(+y!, +mo! - 1, +d!, +(hh ?? 0), +(mm ?? 0), +(ss ?? 0));
      dates.add(new Date(utcMs + 9 * 3600 * 1000).toISOString().slice(0, 10));
    } else {
      dates.add(`${y}-${mo}-${d}`);
    }
  }
  return [...dates].sort();
}

/** 候補日を持たない古い形式の日程調整も、候補 1 件として扱う */
export function pollCandidates(ev: TableEvent): TableEventCandidate[] {
  return ev.candidates && ev.candidates.length > 0
    ? ev.candidates
    : [
        {
          id: "default",
          date: ev.date,
          startTime: ev.startTime,
          endTime: ev.endTime,
          responses: ev.responses,
        },
      ];
}

/** 日程調整の回答者として数える人: 卓のメンバー + 実際に回答した人 */
export function pollMemberIds(ev: TableEvent, state: Pick<State, "tables" | "users">): string[] {
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  const responders = pollCandidates(ev).flatMap((c) => Object.keys(c.responses));
  return [...new Set([...(tb ? tb.memberIds : [ev.createdBy]), ...responders])].filter((id) =>
    Boolean(state.users[id]),
  );
}

/** 候補日を確定できるのは、日程調整を作った人か卓の作成者だけ */
export function canConfirmPoll(ev: TableEvent, state: Pick<State, "tables" | "me">): boolean {
  if (ev.createdBy === state.me) return true;
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  return tb?.ownerId === state.me;
}

/** 自分がまだ返事していない候補日の数 */
export function unansweredCount(ev: TableEvent, me: string): number {
  return pollCandidates(ev).filter((c) => !c.responses[me]).length;
}

export function groupBy<T>(items: readonly T[], keys: (item: T) => string[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    for (const k of keys(item)) {
      const list = map.get(k) ?? [];
      list.push(item);
      map.set(k, list);
    }
  }
  return map;
}

/** 月表示のマス: 前後の空きを null で埋めて 7 の倍数にする */
export function monthCells(ym: string): (number | null)[] {
  const [year, month] = ym.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year!, month! - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  const out: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) out.push(null);
  for (let d = 1; d <= daysInMonth; d++) out.push(d);
  while (out.length % 7 !== 0) out.push(null);
  return out;
}

/**
 * 購読リンクから、各カレンダーアプリで開くためのリンクを作る。
 * feedUrl は https の配信 URL（サーバー側で配信しているときだけ存在する）。
 */
export function calendarSubscribeLinks(feedUrl: string): { feed: string; apple: string; google: string } {
  const apple = feedUrl.replace(/^https?:/, "webcal:");
  return {
    feed: feedUrl,
    apple,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(apple)}`,
  };
}
