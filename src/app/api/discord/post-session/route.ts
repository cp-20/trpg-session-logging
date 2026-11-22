/** 記録したセッションを、その卓のチャンネルに投稿する（本人が選んだときだけ） */
import { postSessionRoute } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return postSessionRoute(req, liveDeps());
}
