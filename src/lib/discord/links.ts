/**
 * つなぐ処理:
 * - 卓譜の利用者 ↔ Discord の利用者: Discord の OAuth2（scope は identify だけ）。合言葉（state）は一回きり・10 分で、
 *   始めたブラウザの Cookie と照らす。Discord のトークンは名前を読んだらすぐ取り消し、保存しない。
 * - 卓 ↔ チャンネル: `/connect` が出す一回きりのコード（10 分）を、卓を作った人が卓譜で開いて卓を選ぶ。
 * 人や卓を名前で探させない（P14）。
 */
import { botInstallUrl } from "./config";
import { isTableMember, TOKEN_RE, type DiscordContext } from "./context";
import { discordApiBase } from "./rest";
import type { ChannelLinkCode, DiscordAccount, TableLink } from "./types";

export const LINK_TTL_MS = 10 * 60 * 1000;
export const OAUTH_COOKIE = "takufu_discord_state";

export function oauthRedirectUri(publicUrl: string): string {
  return `${publicUrl}/api/discord/oauth/callback`;
}

/* ---------- 利用者 ---------- */

export async function startAccountLink(
  ctx: DiscordContext,
  uid: string,
): Promise<{ state: string; url: string }> {
  const state = ctx.randomToken();
  await ctx.store.createOAuthState(state, uid, ctx.now() + LINK_TTL_MS);
  const params = new URLSearchParams({
    client_id: ctx.config.applicationId,
    response_type: "code",
    redirect_uri: oauthRedirectUri(ctx.config.publicUrl),
    scope: "identify",
    state,
    prompt: "none",
  });
  return { state, url: `https://discord.com/oauth2/authorize?${params}` };
}

export type OAuthOutcome = "linked" | "denied" | "expired" | "failed";

/** OAuth の戻り。合言葉が一致し、期限内で、まだ使われていないときだけつなぐ */
export async function completeAccountLink(
  ctx: DiscordContext,
  input: { code: string | null; state: string | null; cookieState: string | null; error: string | null },
): Promise<OAuthOutcome> {
  const { code, state, cookieState } = input;
  if (!state || !TOKEN_RE.test(state) || !cookieState || cookieState !== state) return "expired";
  const saved = await ctx.store.consumeOAuthState(state);
  if (!saved || saved.expiresAt <= ctx.now()) return "expired";
  if (input.error || !code) return "denied";

  const basic = Buffer.from(`${ctx.config.applicationId}:${ctx.config.clientSecret}`).toString("base64");
  const tokenRes = await ctx.fetchFn(`${discordApiBase()}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthRedirectUri(ctx.config.publicUrl),
    }).toString(),
  });
  if (!tokenRes.ok) return "failed";
  const token = (await tokenRes.json()) as { access_token?: string; scope?: string };
  if (!token.access_token) return "failed";
  try {
    const meRes = await ctx.fetchFn(`${discordApiBase()}/users/@me`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meRes.ok) return "failed";
    const me = (await meRes.json()) as { id?: string; username?: string; global_name?: string | null };
    if (!me.id || !/^\d{5,25}$/.test(me.id)) return "failed";
    const account: DiscordAccount = {
      discordUserId: me.id,
      username: me.username ?? "",
      ...(me.global_name ? { globalName: me.global_name } : {}),
      linkedAt: new Date(ctx.now()).toISOString(),
    };
    await ctx.store.linkAccount(saved.uid, account);
    return "linked";
  } finally {
    // 名前を読んだらトークンは要らない。保存せずに取り消す
    await ctx
      .fetchFn(`${discordApiBase()}/oauth2/token/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
        body: new URLSearchParams({ token: token.access_token, token_type_hint: "access_token" }).toString(),
      })
      .catch(() => {});
  }
}

/* ---------- 卓とチャンネル ---------- */

export function channelLinkUrl(publicUrl: string, code: string): string {
  return `${publicUrl}/tables/discord?code=${encodeURIComponent(code)}`;
}

export async function createChannelLinkCode(
  ctx: DiscordContext,
  data: Omit<ChannelLinkCode, "expiresAt">,
): Promise<string> {
  const code = ctx.randomToken();
  await ctx.store.createLinkCode(code, { ...data, expiresAt: ctx.now() + LINK_TTL_MS });
  return code;
}

export interface LinkCodePreview {
  guildName?: string;
  channelName: string;
  voiceChannelName?: string;
  expiresAt: number;
}

export async function previewChannelLink(ctx: DiscordContext, code: string): Promise<LinkCodePreview | null> {
  if (!TOKEN_RE.test(code)) return null;
  const data = await ctx.store.getLinkCode(code);
  if (!data || data.expiresAt <= ctx.now()) return null;
  return {
    channelName: data.channelName,
    ...(data.guildName ? { guildName: data.guildName } : {}),
    ...(data.voiceChannelName ? { voiceChannelName: data.voiceChannelName } : {}),
    expiresAt: data.expiresAt,
  };
}

export type ChannelLinkResult = { ok: true; link: TableLink } | { ok: false; status: number; error: string };

/**
 * 卓を作った人が、コードの指すチャンネルと自分の卓をつなぐ。
 * 卓の名前とメンバーは、卓を作った人の画面が送る（卓譜の保存データは本人しか読めず、サーバーも読まない）。
 * 「自分が作った卓」は本人の申告なので、すでに別の人がつないだ卓は奪えない（外せるのもつないだ人だけ）
 */
export async function completeChannelLink(
  ctx: DiscordContext,
  uid: string,
  code: string,
  table: { tableId: string; tableName: string; memberIds: string[] },
): Promise<ChannelLinkResult> {
  if (!TOKEN_RE.test(code)) return { ok: false, status: 400, error: "リンクが正しくありません。" };
  const { tableId } = table;
  const existing = await ctx.store.getTableLink(tableId);
  if (existing && existing.ownerId !== uid)
    return { ok: false, status: 403, error: "自分が作った卓だけをつなげます。" };
  // 卓の中身は作った人の非公開の記録にあり、サーバーは読めない。卓 ID を知っているだけの人が
  // 他人の卓を自分のチャンネルにつながないよう、卓を作った人の印（tableOwners）で確かめる
  if ((await ctx.store.getTableOwner(tableId)) !== uid)
    return { ok: false, status: 403, error: "自分が作った卓だけをつなげます。" };
  const data = await ctx.store.consumeLinkCode(code);
  if (!data || data.expiresAt <= ctx.now())
    return {
      ok: false,
      status: 410,
      error: "リンクの期限が切れています。Discord でもう一度 /connect を送ってください。",
    };
  // 1 つのチャンネルには 1 つの卓だけ。前につないでいた卓は外す
  const previous = await ctx.store.findTableLinkByChannel(data.channelId);
  if (previous && previous.tableId !== tableId) await ctx.store.deleteTableLink(previous.tableId);
  const link: TableLink = {
    tableId,
    ownerId: uid,
    memberIds: [...new Set([uid, ...table.memberIds])].slice(0, 500),
    tableName: table.tableName.slice(0, 100),
    guildId: data.guildId,
    channelId: data.channelId,
    channelName: data.channelName,
    ...(data.guildName ? { guildName: data.guildName } : {}),
    ...(data.voiceChannelId ? { voiceChannelId: data.voiceChannelId } : {}),
    ...(data.voiceChannelName ? { voiceChannelName: data.voiceChannelName } : {}),
    linkedAt: new Date(ctx.now()).toISOString(),
  };
  await ctx.store.setTableLink(link);
  return { ok: true, link };
}

export interface TableDiscordStatus {
  linked: boolean;
  isOwner: boolean;
  channelName?: string;
  guildName?: string;
  voiceChannelName?: string;
  installUrl: string;
}

/** 卓の画面に出すつながり。卓のメンバーだけが読める。持ち主が開いたら、メンバーと卓名を今に合わせる */
export async function tableStatus(
  ctx: DiscordContext,
  uid: string,
  tableId: string,
  current?: { memberIds: string[]; tableName: string },
): Promise<TableDiscordStatus | null> {
  const link = await ctx.store.getTableLink(tableId);
  const installUrl = botInstallUrl(ctx.config.applicationId);
  if (!link) return { linked: false, isOwner: false, installUrl };
  if (!isTableMember(link, uid)) return null;
  const isOwner = link.ownerId === uid;
  if (
    isOwner &&
    current &&
    (current.tableName !== link.tableName || current.memberIds.join(",") !== link.memberIds.join(","))
  )
    await ctx.store.updateTableLink(tableId, {
      memberIds: current.memberIds.slice(0, 500),
      tableName: current.tableName.slice(0, 100),
    });
  return {
    linked: true,
    isOwner,
    channelName: link.channelName,
    ...(link.guildName ? { guildName: link.guildName } : {}),
    ...(link.voiceChannelName ? { voiceChannelName: link.voiceChannelName } : {}),
    installUrl,
  };
}

export async function unlinkTable(ctx: DiscordContext, uid: string, tableId: string): Promise<boolean> {
  const link = await ctx.store.getTableLink(tableId);
  if (!link || link.ownerId !== uid) return false;
  await ctx.store.deleteTableLink(tableId);
  return true;
}
