/** 卓と Discord のチャンネル（つながりを読む・つなぐ・外す） */
import { table } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function POST(req: Request): Promise<Response> {
  return table(req, liveDeps());
}
