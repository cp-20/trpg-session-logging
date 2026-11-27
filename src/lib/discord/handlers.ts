/**
 * Discord 連携の route handler の中身。route.ts は依存（本物の Firestore・Discord）を渡して呼ぶだけ。
 * テストでは記憶上の store と偽の fetch を渡す。
 */
import { z } from "zod";
import { TOKEN_RE, type DiscordContext } from "./context";
import { handleInteraction, type Interaction } from "./interactions";
import {
  completeAccountLink,
  completeChannelLink,
  LINK_TTL_MS,
  OAUTH_COOKIE,
  previewChannelLink,
  startAccountLink,
  tableStatus,
  unlinkTable,
} from "./links";
import { postSession, syncEventFromApp, syncPollFromApp } from "./sync";
import { verifyDiscordSignature } from "./verify";
import { readBodyWithLimit, readJsonWithLimit } from "../http-limit";

export interface HandlerDeps {
  ctx: () => DiscordContext | null;
  verifyUser: (req: Request) => Promise<string | null>;
  /** 返事のあとで続きを行う（next/server の after） */
  after: (work: () => Promise<void>) => void;
  /** Discord 連携の要求が来たとき: 眠っていた間に送る時刻を過ぎたお知らせを送る（scheduler.ts） */
  wake?: () => void;
}

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

function fail(status: number, error: string): Response {
  return json({ ok: false, error }, status);
}

const UNCONFIGURED = () => fail(503, "Discord 連携を準備しています。");
const SIGNED_OUT = () => fail(401, "ログインし直してください。");

/** 卓譜の画面からの要求は小さい（卓のメンバーは 500 人まで）。それより大きいものは読まない */
const APP_BODY_LIMIT = 64 * 1024;
/** Discord からの interaction は数 KB。余裕を見て 256KB まで */
const INTERACTION_BODY_LIMIT = 256 * 1024;

async function readJson(req: Request): Promise<unknown> {
  try {
    return await readJsonWithLimit(req, APP_BODY_LIMIT);
  } catch {
    return undefined;
  }
}

/** ログインした利用者の要求だけを通す */
async function withUser(
  req: Request,
  deps: HandlerDeps,
  run: (ctx: DiscordContext, uid: string) => Promise<Response>,
): Promise<Response> {
  const ctx = deps.ctx();
  if (!ctx) return UNCONFIGURED();
  const uid = await deps.verifyUser(req);
  if (!uid) return SIGNED_OUT();
  deps.wake?.();
  try {
    return await run(ctx, uid);
  } catch (error) {
    ctx.log?.("discord: request failed", error);
    return fail(502, "Discord とうまくやり取りできませんでした。少し待ってから、もう一度お試しください。");
  }
}

/* ---------- POST /api/discord/interactions ---------- */

export async function interactions(req: Request, deps: HandlerDeps): Promise<Response> {
  const ctx = deps.ctx();
  if (!ctx || !ctx.config.publicKey) return new Response("Not configured", { status: 503 });
  let body: string;
  try {
    body = await readBodyWithLimit(req, INTERACTION_BODY_LIMIT);
  } catch {
    return new Response("Payload too large", { status: 413 });
  }
  const ok = await verifyDiscordSignature({
    publicKey: ctx.config.publicKey,
    signature: req.headers.get("x-signature-ed25519"),
    timestamp: req.headers.get("x-signature-timestamp"),
    body,
    nowSeconds: Math.floor(ctx.now() / 1000),
  });
  if (!ok) return new Response("Bad signature", { status: 401 });
  deps.wake?.();
  let interaction: Interaction;
  try {
    interaction = JSON.parse(body) as Interaction;
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const outcome = handleInteraction(ctx, interaction);
  if (outcome.work) {
    const work = outcome.work;
    deps.after(() => work().catch((error) => ctx.log?.("discord: follow-up failed", error)));
  }
  return Response.json(outcome.body);
}

/* ---------- 利用者をつなぐ ---------- */

/** POST /api/discord/oauth: 認可の URL を返し、合言葉を Cookie に置く */
export function oauthStart(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    if (!ctx.config.clientSecret) return UNCONFIGURED();
    const { state, url } = await startAccountLink(ctx, uid);
    const secure = ctx.config.publicUrl.startsWith("https:") ? "; Secure" : "";
    return json({ ok: true, url }, 200, {
      "Set-Cookie": `${OAUTH_COOKIE}=${state}; Path=/api/discord/oauth; Max-Age=${LINK_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure}`,
    });
  });
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** GET /api/discord/oauth/callback: Discord から戻ってきたら、設定に戻す（結果は ?discord=…） */
export async function oauthCallback(req: Request, deps: HandlerDeps): Promise<Response> {
  const ctx = deps.ctx();
  const url = new URL(req.url);
  const base = ctx?.config.publicUrl ?? url.origin;
  let outcome = "failed";
  if (ctx) {
    try {
      outcome = await completeAccountLink(ctx, {
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        cookieState: readCookie(req, OAUTH_COOKIE),
        error: url.searchParams.get("error"),
      });
    } catch (error) {
      ctx.log?.("discord: oauth failed", error);
    }
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${base}/settings?discord=${outcome}`,
      "Set-Cookie": `${OAUTH_COOKIE}=; Path=/api/discord/oauth; Max-Age=0; HttpOnly; SameSite=Lax`,
      ...NO_STORE,
    },
  });
}

/** GET /api/discord/account: 自分のつながり */
export function accountGet(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    const account = await ctx.store.getAccount(uid);
    return json({
      ok: true,
      account: account ? { username: account.username, globalName: account.globalName ?? null } : null,
    });
  });
}

/** DELETE /api/discord/account: つながりを外す */
export function accountDelete(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    await ctx.store.unlinkAccount(uid);
    return json({ ok: true });
  });
}

/* ---------- 卓とチャンネル ---------- */

const idSchema = z.string().min(1).max(100);
const tableBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    tableId: idSchema,
    memberIds: z.array(idSchema).max(500).optional(),
    tableName: z.string().max(100).optional(),
  }),
  z.object({ action: z.literal("preview"), code: z.string().regex(TOKEN_RE) }),
  z.object({
    action: z.literal("link"),
    code: z.string().regex(TOKEN_RE),
    tableId: idSchema,
    memberIds: z.array(idSchema).max(500),
    tableName: z.string().max(100),
  }),
  z.object({ action: z.literal("unlink"), tableId: idSchema }),
]);

/** POST /api/discord/table */
export function table(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    const parsed = tableBody.safeParse(await readJson(req));
    if (!parsed.success) return fail(400, "リクエスト形式が正しくありません。");
    const body = parsed.data;
    switch (body.action) {
      case "status": {
        const current =
          body.memberIds && body.tableName !== undefined
            ? { memberIds: body.memberIds, tableName: body.tableName }
            : undefined;
        const status = await tableStatus(ctx, uid, body.tableId, current);
        if (!status) return fail(403, "この卓のメンバーではありません。");
        return json({ ok: true, ...status });
      }
      case "preview": {
        const preview = await previewChannelLink(ctx, body.code);
        if (!preview)
          return fail(410, "リンクの期限が切れています。Discord でもう一度 /卓譜 つなぐ を送ってください。");
        return json({ ok: true, ...preview });
      }
      case "link": {
        const r = await completeChannelLink(ctx, uid, body.code, {
          tableId: body.tableId,
          tableName: body.tableName,
          memberIds: body.memberIds,
        });
        if (!r.ok) return fail(r.status, r.error);
        return json({ ok: true, channelName: r.link.channelName, guildName: r.link.guildName ?? null });
      }
      case "unlink": {
        if (!(await unlinkTable(ctx, uid, body.tableId))) return fail(403, "卓を作った人だけが外せます。");
        return json({ ok: true });
      }
    }
  });
}

/* ---------- 日程調整・予定・記録 ---------- */

const pollBody = z.object({ eventId: idSchema });

/** POST /api/discord/sync-poll */
export function syncPollRoute(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    const parsed = pollBody.safeParse(await readJson(req));
    if (!parsed.success) return fail(400, "リクエスト形式が正しくありません。");
    const r = await syncPollFromApp(ctx, uid, parsed.data.eventId);
    return r.ok ? json(r) : fail(r.status, r.error);
  });
}

const timeRe = /^\d{1,2}:\d{2}$/;
const eventBody = z.object({
  eventId: idSchema,
  tableId: idSchema,
  deleted: z.boolean().optional(),
  title: z.string().max(200).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  startTime: z.string().regex(timeRe).optional(),
  endTime: z.string().regex(timeRe).optional(),
  durationMin: z
    .number()
    .int()
    .positive()
    .max(7 * 24 * 60)
    .optional(),
});

/** POST /api/discord/sync-event */
export function syncEventRoute(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    const parsed = eventBody.safeParse(await readJson(req));
    if (!parsed.success) return fail(400, "リクエスト形式が正しくありません。");
    const r = await syncEventFromApp(ctx, uid, parsed.data);
    return r.ok ? json(r) : fail(r.status, r.error);
  });
}

const sessionBody = z.object({ slug: z.string().regex(/^[\w-]{1,100}$/), tableId: idSchema.optional() });

/** POST /api/discord/post-session */
export function postSessionRoute(req: Request, deps: HandlerDeps): Promise<Response> {
  return withUser(req, deps, async (ctx, uid) => {
    const parsed = sessionBody.safeParse(await readJson(req));
    if (!parsed.success) return fail(400, "リクエスト形式が正しくありません。");
    const r = await postSession(ctx, uid, parsed.data.slug, parsed.data.tableId);
    return r.ok ? json({ ok: true }) : json({ ok: false, error: r.error, code: r.code }, r.status);
  });
}
