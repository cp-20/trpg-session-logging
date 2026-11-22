/** 卓譜の利用者と Discord の利用者をつなぐ: 認可の URL を返す */
import { oauthStart } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return oauthStart(req, liveDeps());
}
