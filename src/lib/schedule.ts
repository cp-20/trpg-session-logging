/**
 * 予定・日程調整の純粋な計算（カレンダーと卓の画面で共用）。React に依存しない。
 */
import type { BusyRange, Prefs, State, TableEvent, TableEventCandidate } from "../types";
import { sessionDays } from "./sittings";

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

/**
 * 候補・題名を直せるのは、日程調整を作った人だけ。卓の日程調整は作った人の記録が定義の正で、
 * ほかの人の記録にあるのは写し（src/lib/table-polls.ts）
 */
export function canEditPoll(ev: TableEvent, state: Pick<State, "me">): boolean {
  return ev.createdBy === state.me;
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

/** a から b まで何日あるか（同じ日は 0、過去は負） */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 近い予定の言い方。2 週間より先は日付で足りるので出さない */
export function relativeDayLabel(today: string, date: string): string | null {
  const d = daysBetween(today, date);
  if (d === 0) return "今日";
  if (d === 1) return "あす";
  if (d > 1 && d <= 13) return `あと${d}日`;
  return null;
}

/** 終わったのに記録がない予定を「記録がまだ」と促す期間 */
export const UNRECORDED_LOOKBACK_DAYS = 30;

/**
 * 自分に関係する予定の見え方（ホームとカレンダーで共用）。
 * 卓の予定 + 自分が作った・返事した個人の予定を、返事待ち・これから・記録がまだ、に分ける。
 */
export function myScheduleView(
  state: Pick<State, "tables" | "events" | "logs" | "me">,
  today: string,
): {
  pollsNeedingReply: TableEvent[];
  upcoming: TableEvent[];
  unrecorded: TableEvent[];
} {
  const myTableIds = new Set(
    Object.values(state.tables)
      .filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me)
      .map((t) => t.id),
  );
  const mine = Object.values(state.events ?? {})
    .filter((ev) =>
      ev.tableId ? myTableIds.has(ev.tableId) : ev.createdBy === state.me || Boolean(ev.responses[state.me]),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const confirmed = mine.filter((ev) => ev.status !== "poll");
  const myLogs = Object.values(state.logs).filter(
    (l) => l.ownerId === state.me || Boolean(l.players[state.me]),
  );
  const from = addDays(today, -UNRECORDED_LOOKBACK_DAYS);
  return {
    pollsNeedingReply: mine.filter((ev) => ev.status === "poll" && unansweredCount(ev, state.me) > 0),
    upcoming: confirmed.filter((ev) => ev.date >= today),
    unrecorded: confirmed
      .filter((ev) => ev.date < today && ev.date >= from)
      .filter(
        (ev) =>
          !myLogs.some(
            (l) =>
              sessionDays(l).includes(ev.date) && (!ev.tableId || !l.tableId || l.tableId === ev.tableId),
          ),
      )
      .reverse(),
  };
}

/** 日程調整の候補日に自分の返事を書き込む */
export function applyCandidateRsvp(
  s: Pick<State, "events" | "me">,
  eventId: string,
  candidateId: string,
  value: "ok" | "maybe" | "ng",
): void {
  const target = s.events?.[eventId];
  if (!target) return;
  if (target.candidates && target.candidates.length > 0) {
    const cand = target.candidates.find((c) => c.id === candidateId);
    if (cand) cand.responses[s.me] = value;
  } else {
    target.responses[s.me] = value;
  }
}

/** 日程調整の候補日を確定して通常の予定にする */
export function applyConfirmCandidate(
  s: Pick<State, "events">,
  eventId: string,
  cand: TableEventCandidate,
): void {
  const target = s.events?.[eventId];
  if (!target) return;
  target.status = "confirmed";
  target.date = cand.date;
  target.startTime = cand.startTime;
  target.endTime = cand.endTime;
  target.durationMin = eventDurationMinutes(cand.startTime, cand.endTime, target.durationMin);
  target.responses = { ...cand.responses };
  delete target.candidates;
}

/* ============================================================
 * 自分の予定との照らし合わせ
 *   候補の「日」ではなく「開始から長さぶんの時間帯」と重なるかで判定する。
 *   昼の予定がある日に夜の候補を「予定あり」としないため。
 * ============================================================ */

const DAY_MS = 86_400_000;
const JST_MS = 9 * 3600 * 1000;

/** JST の日付の 0:00 を epoch ミリ秒で */
function jstMidnightMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - JST_MS;
}

/** 候補（日付・開始・長さ）の時間帯。開始は 25:00 のような翌日表記も受け付ける */
export function slotRange(
  date: string,
  startTime: string,
  durationMin: number,
): { start: number; end: number } | null {
  if (!VALID_DATE.test(date) || !VALID_TIME.test(startTime.trim())) return null;
  const [h, m] = startTime.trim().split(":").map(Number);
  const start = jstMidnightMs(date) + (h! * 60 + m!) * 60_000;
  const minutes = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 180;
  return { start, end: start + minutes * 60_000 };
}

/** JST の 0:00 から 0:00 まで丸ごと埋まる時間帯（終日の予定）か */
export function isAllDayRange(start: number, end: number): boolean {
  return end - start >= DAY_MS && (start + JST_MS) % DAY_MS === 0 && (end + JST_MS) % DAY_MS === 0;
}

export type BusyCheck = (date: string, startTime: string, durationMin: number) => boolean;

/**
 * 設定から「この候補の時間帯に自分の予定があるか」を返す関数を作る。
 * - Google の時間帯は、許可しているときだけ・オンにしたカレンダーの分だけ使う
 * - 終日の時間帯は countAllDay のときだけ数える（祝日・誕生日などの取りこぼしを避ける）
 */
export function busyChecker(prefs: Pick<Prefs, "googleBusy">): BusyCheck {
  const ranges: { start: number; end: number }[] = [];
  const g = prefs.googleBusy;
  if (g) {
    const on = new Set(g.calendars.filter((c) => c.on).map((c) => c.id));
    for (const r of g.ranges) {
      if (!on.has(r.calendarId)) continue;
      const start = Date.parse(r.start);
      const end = Date.parse(r.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      if (!g.countAllDay && isAllDayRange(start, end)) continue;
      ranges.push({ start, end });
    }
  }
  if (ranges.length === 0) return () => false;
  return (date, startTime, durationMin) => {
    const slot = slotRange(date, startTime, durationMin);
    if (!slot) return false;
    return ranges.some((r) => r.start < slot.end && r.end > slot.start);
  };
}

/** 照らし合わせに使える予定が 1 件でもあるか（「予定のない日をまとめて◯」の出し分け） */
export function hasBusySource(prefs: Pick<Prefs, "googleBusy">): boolean {
  return Boolean(prefs.googleBusy?.calendars.some((c) => c.on) && prefs.googleBusy.ranges.length > 0);
}

/** 日程調整の長さ（分）。候補はすべて同じ長さで、開始だけが違う */
export function pollDurationMinutes(ev: TableEvent): number {
  const first = pollCandidates(ev)[0];
  return eventDurationMinutes(first?.startTime ?? ev.startTime, first?.endTime ?? ev.endTime, ev.durationMin);
}

/**
 * 日程調整を編集した内容を書き込む。候補の長さはそろえ、日時を変えた候補の回答は消す
 * （別の日時への回答として残さないため）。
 */
export function applyPollEdit(
  s: Pick<State, "events">,
  eventId: string,
  patch: {
    title: string;
    note?: string;
    durationMin: number;
    candidates: { id: string; date: string; startTime: string }[];
  },
): void {
  const target = s.events?.[eventId];
  if (!target || patch.candidates.length === 0) return;
  const prev = new Map(pollCandidates(target).map((c) => [c.id, c]));
  const next: TableEventCandidate[] = patch.candidates.map((c) => {
    const old = prev.get(c.id);
    const startTime = c.startTime.trim();
    const same = old && old.date === c.date && old.startTime === startTime;
    return {
      id: c.id,
      date: c.date,
      startTime,
      endTime: computeEndTime(startTime, patch.durationMin),
      responses: same ? { ...old.responses } : {},
    };
  });
  next.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const first = next[0]!;
  target.title = patch.title.trim();
  target.note = patch.note?.trim() || undefined;
  target.durationMin = patch.durationMin;
  target.candidates = next;
  target.date = first.date;
  target.startTime = first.startTime;
  target.endTime = first.endTime;
  target.responses = {};
}

/** 自分の回答をまとめて書き込む（回答画面の「回答を保存」） */
export function applyPollAnswers(
  s: Pick<State, "events" | "me">,
  eventId: string,
  answers: Record<string, "ok" | "maybe" | "ng">,
): void {
  for (const [cid, v] of Object.entries(answers)) applyCandidateRsvp(s, eventId, cid, v);
}

/**
 * 終わった時間帯と重複を落とす（保存量を抑える）。
 * 終日の判定が変わらないよう、隣り合う時間帯はまとめない。
 */
export function compactBusyRanges(ranges: readonly BusyRange[], nowMs: number): BusyRange[] {
  const seen = new Set<string>();
  const out: BusyRange[] = [];
  for (const r of ranges) {
    const start = Date.parse(r.start);
    const end = Date.parse(r.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= nowMs) continue;
    const key = `${r.calendarId}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      calendarId: r.calendarId,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
