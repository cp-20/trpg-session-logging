/**
 * シナリオの共有シナリオ一覧を探す: GET /api/scenarios
 * - ?q=言葉&system=システム&prefer=遊んでいるシステム（, 区切り）&offset=&limit= → { items, total }
 * - ?ids=ID（, 区切り。50 件まで） → { items }（見つかったものだけ）
 * 共有シナリオ一覧は Firestore の scenarios にあり、サーバーが問い合わせて並べ直す（src/server/scenario-directory.ts）。
 */
import { SYSTEMS } from "../../../data/systems";
import { DIRECTORY_MAX_LIMIT, searchScenarios } from "../../../lib/scenario-directory";
import { scenarioStore } from "../../../server/scenario-directory";

export const dynamic = "force-dynamic";

const list = (v: string | null) =>
  (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const int = (v: string | null, fallback: number) => {
  // 欄がない・空なら既定の値（Number(null) は 0 になるので先に除く）
  if (v === null || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

export async function GET(req: Request): Promise<Response> {
  const store = scenarioStore();
  if (!store) return Response.json({ error: "not configured" }, { status: 503 });
  const params = new URL(req.url).searchParams;
  const headers = { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" };
  try {
    const ids = list(params.get("ids")).slice(0, DIRECTORY_MAX_LIMIT);
    if (ids.length > 0) return Response.json({ items: await store.byIds(ids) }, { headers });
    const result = await searchScenarios(
      store,
      {
        q: (params.get("q") ?? "").slice(0, 100),
        systemId: params.get("system") || undefined,
        prefer: list(params.get("prefer")).slice(0, 10),
        // 深いページは読み飛ばした分も数えられるので、そこまでは読ませない
        offset: Math.min(int(params.get("offset"), 0), 1000),
        limit: int(params.get("limit"), 30),
      },
      SYSTEMS,
    );
    return Response.json(result, { headers });
  } catch (error) {
    console.error("[scenarios] search failed", error);
    return Response.json({ error: "unavailable" }, { status: 502 });
  }
}
