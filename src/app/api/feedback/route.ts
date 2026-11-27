import { handleFeedback } from "../../../lib/feedback";
import { clientIp, createRateLimiter } from "../../../lib/rate-limit";
import { BodyTooLargeError, readJsonWithLimit } from "../../../lib/http-limit";

export const dynamic = "force-dynamic";

// 1 つの送り元から 10 分に 5 件まで
const allow = createRateLimiter(5, 10 * 60 * 1000);

export async function POST(req: Request): Promise<Response> {
  if (!allow(clientIp(req))) {
    return Response.json(
      { ok: false, error: "続けて送られています。少し時間をおいてから送ってください。" },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    // ご意見の本文は数千字まで（src/lib/feedback-kinds.ts）。それを大きく超える本文は読まない
    body = await readJsonWithLimit(req, 64 * 1024);
  } catch (error) {
    if (error instanceof BodyTooLargeError)
      return Response.json({ ok: false, error: "送る内容が長すぎます。" }, { status: 413 });
    return Response.json({ ok: false, error: "リクエスト形式が正しくありません。" }, { status: 400 });
  }
  const result = await handleFeedback(body, { webhookUrl: process.env.DISCORD_FEEDBACK_WEBHOOK_URL });
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
