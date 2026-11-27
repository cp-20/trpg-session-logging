import { BodyTooLargeError, readJsonWithLimit } from "../../../lib/http-limit";
import { parseReportCard } from "../../../lib/report-card";
import { clientIp, createRateLimiter } from "../../../lib/rate-limit";
import { renderReportCard } from "../../../server/og-image";

/**
 * 卓報告カードの画像（POST で中身を受け取り、PNG を返す。中身は覚えない）。
 * 中身は記録した人のブラウザが src/lib/report-card.ts の reportCardFromSession で作る。
 */
export const dynamic = "force-dynamic";

// 1 つの送り元から 1 分に 20 枚まで
const allow = createRateLimiter(20, 60 * 1000);
/** 画像（data URL）を含めた本文の上限 */
const BODY_MAX = 3_000_000;

export async function POST(req: Request): Promise<Response> {
  if (!allow(clientIp(req))) {
    return Response.json(
      { ok: false, error: "続けて作られています。少し時間をおいてください。" },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await readJsonWithLimit(req, BODY_MAX);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return Response.json({ ok: false, error: "画像が大きすぎます。" }, { status: 413 });
    }
    return Response.json({ ok: false, error: "リクエスト形式が正しくありません。" }, { status: 400 });
  }
  const card = parseReportCard(body);
  if (!card) return Response.json({ ok: false, error: "卓報告カードの中身が足りません。" }, { status: 400 });
  return renderReportCard(card);
}
