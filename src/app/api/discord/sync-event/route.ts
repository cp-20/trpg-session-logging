/** 卓譜で確定した予定を作った・変えた・消したあと、Discord のイベントとメッセージを今に合わせる */
import { syncEventRoute } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return syncEventRoute(req, liveDeps());
}
