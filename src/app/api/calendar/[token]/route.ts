/**
 * カレンダー購読の配信口: GET /api/calendar/{token}.ics
 * ブラウザが書き出した calendarFeeds/{token} を Firestore の公開 REST API で読み、
 * カレンダー形式で返す。サーバーは利用者の認証情報を持たない（src/lib/calendar-feed.ts）。
 */
import { FEED_TOKEN_RE, buildFeedIcs } from "../../../../lib/calendar-feed";
import { todayStr } from "../../../../lib/format";

export const dynamic = "force-dynamic";

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const DATABASE = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "takufu";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const token = (await ctx.params).token.replace(/\.ics$/, "");
  if (token === "demo") {
    const { seedState } = await import("../../../../data/seed");
    const ics = buildFeedIcs(seedState(), todayStr());
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="takufu.ics"',
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
      },
    });
  }
  if (!FEED_TOKEN_RE.test(token) || !PROJECT) return new Response("Not found", { status: 404 });
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}` +
    `/documents/calendarFeeds/${token}${API_KEY ? `?key=${API_KEY}` : ""}`;
  const upstreamError = () => new Response("Upstream error", { status: 502 });
  // つながらない・本文が読めないときも、応答が失敗したときと同じく 502（Firestore 側の不調）で答える
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res) return upstreamError();
  if (res.status === 404 || res.status === 403) return new Response("Not found", { status: 404 });
  if (!res.ok) return upstreamError();
  const doc = (await res.json().catch(() => null)) as { fields?: { ics?: { stringValue?: string } } } | null;
  if (!doc) return upstreamError();
  const ics = doc.fields?.ics?.stringValue;
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="takufu.ics"',
      // カレンダーアプリは数時間おきに取りに来る。数分は使い回してよい
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
