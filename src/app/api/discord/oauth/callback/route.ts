/** Discord の OAuth2 の戻り先（Discord の開発者画面の Redirects に設定する） */
import { oauthCallback } from "../../../../../lib/discord/handlers";
import { liveDeps } from "../../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return oauthCallback(req, liveDeps());
}
