/**
 * Google カレンダーの空き時間（FreeBusy）連携。
 *
 * 読み取るもの:
 *   - カレンダーの一覧（ID と名前）。どのカレンダーを照らし合わせに使うかを本人が選ぶため
 *   - 選んだカレンダーの「予定が入っている時間帯」（FreeBusy API の busy）
 * 読み取らないもの: 予定のタイトル・説明・場所・参加者（FreeBusy API はそもそも返さない）
 * アクセストークンはこのモジュールの呼び出しの間だけ使い、保存しない。
 *
 * 呼び出し先の Google Calendar API（calendar-json.googleapis.com）は、Firebase の Google ログインと
 * 同じ Google Cloud プロジェクトで有効にしておく必要がある（docs/DEPLOYMENT.md）。
 * 許可のポップアップで出る「Cross-Origin-Opener-Policy policy would block the window.closed call」は
 * Firebase が閉じたかを確かめるときの警告で、トークンの受け取りには影響しない。
 */
import { GoogleAuthProvider, reauthenticateWithPopup } from "firebase/auth";
import { getTakufuAuth } from "./auth";
import type { BusyRange } from "../types";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

/** 取り込む期間（今日から） */
export const GOOGLE_BUSY_DAYS = 90;
/** FreeBusy は 1 回で問い合わせられる期間に上限があるので、この日数ずつに分ける */
const FREEBUSY_CHUNK_DAYS = 30;

export interface GoogleCalendarInfo {
  id: string;
  name: string;
  primary: boolean;
}

/** Google の許可画面を開き、カレンダーを読むためのアクセストークンを受け取る */
export async function requestGoogleCalendarAccess(): Promise<string> {
  const auth = getTakufuAuth();
  if (!auth?.currentUser) {
    throw new Error("ログインしてからお試しください。");
  }
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_CALENDAR_SCOPES) provider.addScope(scope);
  provider.setCustomParameters({ prompt: "consent" });
  try {
    const result = await reauthenticateWithPopup(auth.currentUser, provider);
    const token = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if (!token) throw new Error("no token");
    return token;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
      throw new Error("Google の画面を閉じました。もう一度お試しください。");
    }
    if (code === "auth/popup-blocked") {
      throw new Error("ブラウザでポップアップを許可してから、もう一度お試しください。");
    }
    if (code === "auth/user-mismatch") {
      throw new Error("卓譜にログインしている Google アカウントを選んでください。");
    }
    throw new Error("Google カレンダーの許可を確認できませんでした。もう一度お試しください。");
  }
}

/** カレンダーの一覧（予定の有無を見られるものだけ。ID と名前以外は受け取らない） */
export async function listGoogleCalendars(token: string): Promise<GoogleCalendarInfo[]> {
  const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
  url.searchParams.set("minAccessRole", "freeBusyReader");
  url.searchParams.set("fields", "items(id,summary,summaryOverride,primary)");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(googleApiErrorMessage(res.status, await res.json().catch(() => null)));
  const json = (await res.json()) as {
    items?: { id?: string; summary?: string; summaryOverride?: string; primary?: boolean }[];
  };
  return parseCalendarList(json.items ?? []);
}

/**
 * Google API のエラー応答を、利用者がそのあと何をすればよいかの分かる文にする。
 * - API が無効（SERVICE_DISABLED / accessNotConfigured）: 卓譜側の設定の問題。利用者には直せない
 * - 権限が足りない: 許可画面でカレンダーの項目を外した（Google は項目ごとに外せる）
 * - 401: 許可が切れた
 */
export function googleApiErrorMessage(status: number, body: unknown): string {
  const err = (body as { error?: GoogleApiError } | null)?.error;
  const reasons = new Set<string>([
    ...(err?.errors ?? []).map((e) => e.reason ?? ""),
    ...(err?.details ?? []).map((d) => d.reason ?? ""),
    err?.status ?? "",
  ]);
  console.warn("[google-calendar]", status, [...reasons].filter(Boolean).join(","), err?.message ?? "");
  if (reasons.has("SERVICE_DISABLED") || reasons.has("accessNotConfigured")) {
    return "卓譜側の設定の問題で Google カレンダーを読めませんでした。お手数ですが、お問い合わせからお知らせください。";
  }
  if (
    reasons.has("ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
    reasons.has("insufficientPermissions") ||
    (status === 403 && reasons.has("PERMISSION_DENIED"))
  ) {
    return "Google の許可画面で、カレンダーの項目にチェックを入れてから、もう一度お試しください。";
  }
  if (status === 401) return "Google の許可が切れました。もう一度お試しください。";
  if (status === 429 || status >= 500) {
    return "Google カレンダーが混み合っています。しばらくしてから、もう一度お試しください。";
  }
  return "Google カレンダーを読めませんでした。しばらくしてから、もう一度お試しください。";
}

interface GoogleApiError {
  status?: string;
  message?: string;
  errors?: { reason?: string }[];
  details?: { reason?: string }[];
}

export function parseCalendarList(
  items: readonly { id?: string; summary?: string; summaryOverride?: string; primary?: boolean }[],
): GoogleCalendarInfo[] {
  return items
    .filter((c): c is typeof c & { id: string } => Boolean(c.id))
    .map((c) => ({
      id: c.id,
      name: c.summaryOverride || c.summary || c.id,
      primary: c.primary === true,
    }))
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}

/** FreeBusy の応答から時間帯を取り出す。読み取れなかったカレンダーは飛ばす */
export function parseFreeBusy(
  json: { calendars?: Record<string, { busy?: { start?: string; end?: string }[]; errors?: unknown[] }> },
  calendarIds: readonly string[],
): BusyRange[] {
  const out: BusyRange[] = [];
  for (const id of calendarIds) {
    const cal = json.calendars?.[id];
    if (!cal || (cal.errors && cal.errors.length > 0)) continue;
    for (const b of cal.busy ?? []) {
      if (!b.start || !b.end) continue;
      const start = Date.parse(b.start);
      const end = Date.parse(b.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      out.push({ calendarId: id, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
  }
  return out;
}

/** 選んだカレンダーの、今日から GOOGLE_BUSY_DAYS 日ぶんの「予定が入っている時間帯」 */
export async function fetchGoogleBusyRanges(
  token: string,
  calendarIds: readonly string[],
  nowMs: number = Date.now(),
): Promise<BusyRange[]> {
  if (calendarIds.length === 0) return [];
  const out: BusyRange[] = [];
  for (let offset = 0; offset < GOOGLE_BUSY_DAYS; offset += FREEBUSY_CHUNK_DAYS) {
    const timeMin = new Date(nowMs + offset * 86_400_000).toISOString();
    const days = Math.min(FREEBUSY_CHUNK_DAYS, GOOGLE_BUSY_DAYS - offset);
    const timeMax = new Date(nowMs + (offset + days) * 86_400_000).toISOString();
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: "Asia/Tokyo",
        items: calendarIds.map((id) => ({ id })),
      }),
    });
    if (!res.ok) throw new Error(googleApiErrorMessage(res.status, await res.json().catch(() => null)));
    out.push(...parseFreeBusy(await res.json(), calendarIds));
  }
  return out;
}
