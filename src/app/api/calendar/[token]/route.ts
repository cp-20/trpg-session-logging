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
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404 || res.status === 403) return new Response("Not found", { status: 404 });
  if (!res.ok) return new Response("Upstream error", { status: 502 });
  const doc = (await res.json()) as { fields?: { ics?: { stringValue?: string } } };
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
