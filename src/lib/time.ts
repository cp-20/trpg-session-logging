/** JST (UTC+9) の日付・時刻ユーティリティ。ts は epoch 秒 */

const JST_OFFSET = 9 * 3600;

export function jstDate(ts: number): string {
  const d = new Date((ts + JST_OFFSET) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function jstTime(ts: number): string {
  const d = new Date((ts + JST_OFFSET) * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "21:02" 表記（+1日なら "26:40" の30時間制も表示できる） */
export function jstTime30(ts: number, baseTs: number): string {
  const dayOffset = Math.floor((jstDate(ts) === jstDate(baseTs) ? 0 : 1));
  const d = new Date((ts + JST_OFFSET) * 1000);
  const h = d.getUTCHours();
  return dayOffset > 0 && h < 6 ? `${String(h + 24).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : `${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function fmtDate(s: string): string {
  const d = new Date(s + "T00:00:00");
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const [, m, dd] = s.split("-");
  return `${+m}月${+dd}日(${w})`;
}

export function fmtDateShort(s: string): string {
  const [, m, dd] = s.split("-");
  return `${+m}/${+dd}`;
}

export function todayStr(): string {
  return jstDate(Math.floor(Date.now() / 1000));
}

/** date + "21:00" (JST) → epoch秒 */
export function jstEpoch(date: string, time: string): number {
  const [h, m] = time.split(":").map(Number);
  const dt = new Date(date + "T00:00:00Z");
  return Math.floor(dt.getTime() / 1000) + h * 3600 + m * 60 - JST_OFFSET;
}

/** ts → "21:02" (その日のJST時刻) */
export function fmtTs(ts: number): string {
  return jstTime(ts);
}

export function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}時間${m ? `${m}分` : ""}` : `${m}分`;
}

export function fmtDurShort(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`;
}

/** 複数日セッションの見せ方: "11月8日(土)", "11月8日(土)〜9日(日)", "11月8日(土)・14日(金)" */
export function fmtDates(dates: string[]): string {
  if (dates.length === 0) return "日付未定";
  if (dates.length === 1) return fmtDate(dates[0]);
  const first = fmtDate(dates[0]);
  const rest = dates.slice(1).map((d) => {
    const sameMonth = d.slice(0, 7) === dates[0].slice(0, 7);
    const dayNum = +d.split("-")[2];
    const w = ["日", "月", "火", "水", "木", "金", "土"][new Date(d + "T00:00:00").getDay()];
    return sameMonth ? `${dayNum}日(${w})` : fmtDate(d);
  });
  return `${first}・${rest.join("・")}`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8);

export function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

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
export function deriveSessionFromMessages(channels: { msgs: { ts: number }[] }[]): { dates: string[]; t0: number; t1: number } | null {
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

/**
 * 実プレイ時間の概算（分）。複数日セッションでは日ごとの区間を合算する
 * （夜間の空白を含まない）。ログがなければ t1−t0 を使う。
 */
export function sessionPlayMinutes(log: { hasLog: boolean; channels: { msgs: { ts: number }[] }[]; t0: number; t1: number }): number {
  if (!log.hasLog) return sessionMinutes(log.t0, log.t1);
  const byDay = new Map<string, number[]>();
  log.channels.forEach((c) =>
    c.msgs.forEach((m) => {
      const d = sessionDay(m.ts);
      const arr = byDay.get(d) ?? [];
      arr.push(m.ts);
      byDay.set(d, arr);
    })
  );
  if (byDay.size === 0) return sessionMinutes(log.t0, log.t1);
  let total = 0;
  byDay.forEach((arr) => {
    total += (Math.max(...arr) - Math.min(...arr)) / 60;
  });
  return Math.max(1, Math.round(total));
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
  if (t1 <= t0) return { ok: false, t0, t1, error: "終了は開始より後にしてください（翌朝は+24hの時刻で入力）" };
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
