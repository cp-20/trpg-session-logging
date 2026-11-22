/**
 * 日付の文字入力。画面では YYYY/MM/DD で見せ、値は YYYY-MM-DD で持つ。
 * ブラウザの <input type="date"> は表示の形が端末の言語設定で変わる（英語環境だと MM/DD/YYYY）ので使わない。
 */

const toHalfWidth = (s: string) =>
  s.replace(/[０-９／－．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\s+/g, "");

function valid(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026/10/17"・"2026-10-17"・"2026.10.17"・"2026年10月17日"・"20261017" → "2026-10-17"。読めなければ null */
export function parseDateText(raw: string): string | null {
  const s = toHalfWidth(raw.trim());
  if (!s) return null;
  const sep = /^(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})日?$/.exec(s);
  if (sep) return valid(Number(sep[1]), Number(sep[2]), Number(sep[3]));
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compact) return valid(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  return null;
}

/** "2026-10-17" → "2026/10/17"（読めない値はそのまま） */
export function fmtDateText(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replaceAll("-", "/") : iso;
}
