/** JST (UTC+9) の日付・時刻・文字列フォーマット汎用ユーティリティ。ts は epoch 秒 */

export const JST_OFFSET = 9 * 3600;

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
  const dayOffset = Math.floor(jstDate(ts) === jstDate(baseTs) ? 0 : 1);
  const d = new Date((ts + JST_OFFSET) * 1000);
  const h = d.getUTCHours();
  return dayOffset > 0 && h < 6
    ? `${String(h + 24).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
    : `${String(h).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
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

export function download(name: string, text: string, mime = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
