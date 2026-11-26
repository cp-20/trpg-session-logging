import { handleExternalImport } from "../../../../lib/external-import-server";

import { clientIp, createRateLimiter } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// 1 つの送り元から 1 分に 20 件まで（1 回の取り込みで外部へは数回までしか出ない）
const allow = createRateLimiter(20, 60 * 1000);

export async function POST(req: Request): Promise<Response> {
  if (!allow(clientIp(req))) {
    return Response.json(
      { ok: false, error: "続けて読み込まれています。少し時間をおいてからもう一度お試しください。" },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "リクエスト形式が正しくありません。" }, { status: 400 });
  }

  const result = await handleExternalImport(body);
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status });
  }
  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
