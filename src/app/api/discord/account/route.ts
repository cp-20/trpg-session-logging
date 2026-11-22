/** 自分の Discord のつながり（読む・外す） */
import { accountDelete, accountGet } from "../../../../lib/discord/handlers";
import { liveDeps } from "../../../../lib/discord/server";

export const dynamic = "force-dynamic";

export function GET(req: Request): Promise<Response> {
  return accountGet(req, liveDeps());
}

export function DELETE(req: Request): Promise<Response> {
  return accountDelete(req, liveDeps());
}
