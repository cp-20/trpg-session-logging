/**
 * カレンダー購読の配信。
 *
 * 予定は利用者ごとの保存領域にあり、サーバーは利用者の認証情報を持たない。そこで、
 * ログイン中のブラウザが「確定した予定」を推測できないトークン名の文書
 * （Firestore: calendarFeeds/{token}）に書き出し、/api/calendar/{token}.ics がそれを
 * カレンダー形式で返す。文書はトークンを知る人だけが 1 件ずつ読め、一覧はできない
 * （firestore.rules）。リンクを作り直すと古いトークンの文書は消える。
 */
import { buildIcsCalendar } from "./ics";
import type { State } from "../types";

/** 推測できない 32 バイトのトークン（URL に使える文字だけ） */
export function newFeedToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function feedUrl(origin: string, token: string): string {
  return `${origin}/api/calendar/${token}.ics`;
}

/** 書き出す予定: 確定した予定のうち、60 日前以降のもの */
export function buildFeedIcs(state: State, today: string): string {
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 60);
  const from = since.toISOString().slice(0, 10);
  const events = Object.values(state.events ?? {})
    .filter((ev) => ev.status !== "poll" && ev.date >= from)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return buildIcsCalendar(
    events.map((ev) => {
      const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
      return {
        uid: `${ev.id}@takufu`,
        title: tb ? `[${tb.name}] ${ev.title}` : ev.title,
        date: ev.date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        description: ev.note,
      };
    }),
    "卓譜",
  );
}

async function feedDoc(token: string) {
  const [{ doc }, { getCloudFirestore }] = await Promise.all([
    import("firebase/firestore"),
    import("./cloud-state"),
  ]);
  const db = getCloudFirestore();
  if (!db) throw new Error("Firebase is not configured");
  return doc(db, "calendarFeeds", token);
}

export async function publishFeed(token: string, ownerId: string, ics: string): Promise<void> {
  const { setDoc, serverTimestamp } = await import("firebase/firestore");
  await setDoc(await feedDoc(token), { ownerId, ics, updatedAt: serverTimestamp() });
}

export async function revokeFeed(token: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(await feedDoc(token));
}
