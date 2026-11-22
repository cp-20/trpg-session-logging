/** 卓譜で日程調整を作った・回答した・確定したあと、つないだチャンネルのメッセージを今に合わせる */
import { syncPollRoute } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return syncPollRoute(req, liveDeps());
}
