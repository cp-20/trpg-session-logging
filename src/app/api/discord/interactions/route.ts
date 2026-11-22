/** Discord の Interactions Endpoint（Discord の開発者画面の Interactions Endpoint URL に設定する） */
import { interactions } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return interactions(req, liveDeps());
}
