import { handleMediaPreview } from "../../../lib/media-preview-server";
import { clientIp, createRateLimiter } from "../../../lib/rate-limit";

/**
 * 関連するもの（YouTube・ニコニコ・ふせったー・X）の題名・書いた人・本文の頭を返す。決まりは src/lib/media-preview.ts。
 * 閲覧者の素性は相手のサービスに渡さない（このサーバーが固定の問い合わせ先にだけ出る）。
 */
export const dynamic = "force-dynamic";

// 1 つの送り元から 1 分に 60 件まで（1 つのセッションの一覧で数件ずつ引く）
const allow = createRateLimiter(60, 60 * 1000);

export async function GET(req: Request): Promise<Response> {
  if (!allow(clientIp(req))) {
    return Response.json(
      { ok: false, error: "続けて読み込まれています。少し時間をおいてください。" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  const url = new URL(req.url).searchParams.get("url");
  const result = await handleMediaPreview(url);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.error },
      // 見つからないものは少しだけ覚えてよい。相手の不調は覚えない
      {
        status: result.status,
        headers: { "Cache-Control": result.status === 404 ? "public, max-age=60" : "no-store" },
      },
    );
  }
  return Response.json(result.preview, {
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
  });
}
