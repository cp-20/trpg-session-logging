/** セッション固有の日時・所要時間ロジック。汎用フォーマット関数は ./format から再エクスポートする */

import { JST_OFFSET } from "./format";
import { sittingsMinutes, type Sitting } from "./sittings";

export {
  deriveSittings,
  endsNextDay,
  fmtSessionWhen,
  fmtSitting,
  sessionDays,
  sessionEnd,
  sessionStart,
  type Sitting,
} from "./sittings";

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

export function sessionMinutes(t0: number, t1: number): number {
  return Math.max(1, Math.round((t1 - t0) / 60));
}

/** 遊んだ時間（分）。集まりごとの長さの合計で、集まりの間の空白は数えない */
export function sessionPlayMinutes(log: { sittings: readonly Sitting[] }): number {
  return sittingsMinutes(log.sittings);
}
