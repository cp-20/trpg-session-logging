/** セッション固有の日時・所要時間ロジック。汎用フォーマット関数は ./format から再エクスポートする */

import { JST_OFFSET, jstEpoch } from "./format";

export {
  jstDate,
  jstTime,
  jstTime30,
  fmtDate,
  fmtDateShort,
  fmtDates,
  fmtDur,
  todayStr,
  jstEpoch,
  fmtTs,
  sleep,
  uid,
  download,
} from "./format";

/** JSONツリーから text プロパティを持つ要素を数える（実ファイル解析の疑似処理） */
export function countTextNodes(o: unknown): number {
  let n = 0;
  if (Array.isArray(o)) {
    for (const v of o) n += countTextNodes(v);
  } else if (o && typeof o === "object") {
    const obj = o as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text) n++;
    for (const k in obj) {
      if (k === "text") continue;
      n += countTextNodes(obj[k]);
    }
  }
  return n;
}

/** セッションの日付キー。6:00 を日替わりとする（30時間制: 深夜2時は前日の日に含める） */
export function sessionDay(ts: number): string {
  return new Date((ts + JST_OFFSET - 6 * 3600) * 1000).toISOString().slice(0, 10);
}

/**
 * ログのタイムスタンプからセッション時刻を算出する（本実装で入れるアルゴリズムのモック）。
 * 実データでは CCFOLIA JSON の createdAt がそのまま入る。
 * 日付は sessionDay（6:00区切り）でグルーピングする。
 */
export function deriveSessionFromMessages(
  channels: { msgs: { ts: number }[] }[],
): { dates: string[]; t0: number; t1: number } | null {
  const all = channels.flatMap((c) => c.msgs.map((m) => m.ts)).sort((a, b) => a - b);
  if (all.length === 0) return null;
  const t0 = all[0];
  const t1 = all[all.length - 1];
  const dates: string[] = [];
  let cur = "";
  for (const ts of all) {
    const d = sessionDay(ts);
    if (d !== cur) {
      dates.push(d);
      cur = d;
    }
  }
  return { dates, t0, t1 };
}

export function sessionMinutes(t0: number, t1: number): number {
  return Math.max(1, Math.round((t1 - t0) / 60));
}

const playMinutesCache = new WeakMap<object, number>();

/**
 * 実プレイ時間の概算（分）。複数日セッションでは日ごとの区間を合算する
 * （夜間の空白を含まない）。ログがなければ t1−t0 を使う。
 */
export function sessionPlayMinutes(log: {
  hasLog: boolean;
  channels: { msgs: { ts: number }[] }[];
  t0: number;
  t1: number;
}): number {
  if (!log.hasLog) return sessionMinutes(log.t0, log.t1);
  const cached = playMinutesCache.get(log.channels);
  if (cached !== undefined) return cached;
  const bounds = new Map<string, [number, number]>();
  for (const c of log.channels) {
    for (const m of c.msgs) {
      const d = sessionDay(m.ts);
      const b = bounds.get(d);
      if (!b) {
        bounds.set(d, [m.ts, m.ts]);
      } else {
        if (m.ts < b[0]) b[0] = m.ts;
        if (m.ts > b[1]) b[1] = m.ts;
      }
    }
  }
  if (bounds.size === 0) return sessionMinutes(log.t0, log.t1);
  let total = 0;
  for (const [min, max] of bounds.values()) {
    total += (max - min) / 60;
  }
  const result = Math.max(1, Math.round(total));
  playMinutesCache.set(log.channels, result);
  return result;
}

export interface SessionRangeInput {
  dates: string[];
  startTime: string;
  endTime: string;
}

export interface SessionRangeResult {
  ok: boolean;
  t0: number;
  t1: number;
  error?: string;
}

const VALID_TIME = /^(?:[01]?\d|2\d|3[01]):[0-5]\d$/;

/**
 * 複数実施日 + 開始(初日)/終了(最終日)の時刻からセッション区間を組み立てる。
 * 終了は「最終日の時刻」をそのまま解釈する(25:00 は翌日 01:00)。日数の追加加算はしない。
 * QuickSessionModal / EditLogModal / シナリオからの作成の共通ロジック。
 */
export function buildSessionRange({ dates, startTime, endTime }: SessionRangeInput): SessionRangeResult {
  if (dates.length === 0) return { ok: false, t0: 0, t1: 0, error: "実施日を入力してください" };
  if (!VALID_TIME.test(startTime) || !VALID_TIME.test(endTime)) {
    return { ok: false, t0: 0, t1: 0, error: "時刻は「時間:分」(例: 21:00, 27:30)で入力してください" };
  }
  const t0 = jstEpoch(dates[0], startTime);
  const t1 = jstEpoch(dates[dates.length - 1], endTime);
  if (t1 <= t0)
    return { ok: false, t0, t1, error: "終了は開始より後にしてください（翌朝は+24hの時刻で入力）" };
  return { ok: true, t0, t1 };
}

/**
 * 実施日基準でセッション内の時刻を 30時間制(26:40 等)の文字列に復元する。
 * EditLogModal の初期値に使う。t1 が最終日の深夜にまたがる場合も 24+ の表記になる。
 */
export function sessionClock(ts: number, date: string): string {
  const base = jstEpoch(date, "00:00");
  const minutes = Math.max(0, Math.round((ts - base) / 60));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
