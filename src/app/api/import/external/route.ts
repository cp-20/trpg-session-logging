import { handleExternalImport } from "../../../../lib/external-import-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
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
