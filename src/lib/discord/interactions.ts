/**
 * Discord の Interaction（スラッシュコマンド・ボタン）を振り分ける。
 * Discord は 3 秒以内の返事を求めるので、データを読むものはまず「遅らせる」返事をして、
 * 続き（work）を返事のあとで行い、最初の返事を書き換える。
 */
import { botInstallUrl, hasPermissions, MANAGE_CHANNELS, POST_PERMISSIONS } from "./config";
import { COMMAND_NAME, SHOW_OPTION, SUB, VOICE_OPTION } from "./commands";
import type { DiscordContext } from "./context";
import { channelLinkUrl, createChannelLinkCode } from "./links";
import {
  channelLinkNotice,
  charactersMessage,
  decodeAction,
  EPHEMERAL,
  installNotice,
  linkAccountNotice,
  notice,
  openPollsMessage,
  plain,
  pollAnswerMessage,
  type DiscordMessage,
} from "./messages";
import { canAnswerPoll, isOpenPoll } from "./polls";
import { refreshPollMessage } from "./sync";

export const InteractionType = { PING: 1, COMMAND: 2, COMPONENT: 3 } as const;
export const ResponseType = {
  PONG: 1,
  MESSAGE: 4,
  DEFERRED_MESSAGE: 5,
  DEFERRED_UPDATE: 6,
  UPDATE: 7,
} as const;

interface DiscordUser {
  id: string;
  username?: string;
}

interface CommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: CommandOption[];
}

export interface Interaction {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  channel?: { id: string; name?: string; type?: number };
  member?: { user: DiscordUser; permissions?: string };
  user?: DiscordUser;
  app_permissions?: string;
  message?: { id: string; flags?: number };
  data?: {
    name?: string;
    options?: CommandOption[];
    custom_id?: string;
    resolved?: { channels?: Record<string, { id: string; name?: string; type?: number }> };
  };
}

export interface InteractionOutcome {
  /** すぐ返す本文 */
  body: unknown;
  /** 返事のあとで行う続き */
  work?: () => Promise<void>;
}

function reply(message: DiscordMessage): InteractionOutcome {
  return { body: { type: ResponseType.MESSAGE, data: message } };
}

/** 自分だけに見える「考え中」を出して、続きで書き換える */
function deferEphemeral(
  ctx: DiscordContext,
  i: Interaction,
  run: () => Promise<DiscordMessage>,
): InteractionOutcome {
  return {
    body: { type: ResponseType.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } },
    work: () => finish(ctx, i, run),
  };
}

/** ボタンが付いたメッセージ（自分だけに見えるもの）を、続きで書き換える */
function deferUpdate(
  ctx: DiscordContext,
  i: Interaction,
  run: () => Promise<DiscordMessage>,
): InteractionOutcome {
  return { body: { type: ResponseType.DEFERRED_UPDATE }, work: () => finish(ctx, i, run) };
}

async function finish(
  ctx: DiscordContext,
  i: Interaction,
  run: () => Promise<DiscordMessage>,
): Promise<void> {
  let message: DiscordMessage;
  try {
    message = await run();
  } catch (error) {
    ctx.log?.("discord: interaction failed", error);
    message = notice("うまく処理できませんでした。少し待ってから、もう一度お試しください。");
  }
  const { flags: _flags, ...edit } = message;
  await ctx.rest.editOriginal(i.token, edit);
}

function subcommand(i: Interaction): { name: string; options: CommandOption[] } | null {
  const sub = i.data?.options?.find((o) => o.type === 1);
  return sub ? { name: sub.name, options: sub.options ?? [] } : null;
}

function caller(i: Interaction): DiscordUser | null {
  return i.member?.user ?? i.user ?? null;
}

export function handleInteraction(ctx: DiscordContext, i: Interaction): InteractionOutcome {
  if (i.type === InteractionType.PING) return { body: { type: ResponseType.PONG } };
  if (i.type === InteractionType.COMMAND && i.data?.name === COMMAND_NAME) return handleCommand(ctx, i);
  if (i.type === InteractionType.COMPONENT) return handleComponent(ctx, i);
  return reply(notice("このコマンドには対応していません。"));
}

function handleCommand(ctx: DiscordContext, i: Interaction): InteractionOutcome {
  const sub = subcommand(i);
  const user = caller(i);
  if (!sub || !user) return reply(notice("このコマンドには対応していません。"));
  if (!i.guild_id || !i.channel_id) return reply(notice("サーバーのチャンネルで使ってください。"));
  const guildId = i.guild_id;
  const channelId = i.channel_id;

  switch (sub.name) {
    case SUB.LINK: {
      if (!hasPermissions(i.member?.permissions, MANAGE_CHANNELS))
        return reply(notice("チャンネルの管理の権限がある人だけが、卓とつなげます。"));
      if (!hasPermissions(i.app_permissions, POST_PERMISSIONS))
        return reply(installNotice(botInstallUrl(ctx.config.applicationId)));
      const voiceId = sub.options.find((o) => o.name === VOICE_OPTION)?.value;
      const voice = typeof voiceId === "string" ? i.data?.resolved?.channels?.[voiceId] : undefined;
      return deferEphemeral(ctx, i, async () => {
        const guildName = await ctx.rest.getGuildName(guildId);
        const code = await createChannelLinkCode(ctx, {
          guildId,
          channelId,
          channelName: i.channel?.name ?? "",
          ...(guildName ? { guildName } : {}),
          ...(voice ? { voiceChannelId: voice.id, voiceChannelName: voice.name ?? "" } : {}),
          requestedBy: user.id,
        });
        return channelLinkNotice(channelLinkUrl(ctx.config.publicUrl, code));
      });
    }
    case SUB.UNLINK: {
      if (!hasPermissions(i.member?.permissions, MANAGE_CHANNELS))
        return reply(notice("チャンネルの管理の権限がある人だけが、つながりを外せます。"));
      return deferEphemeral(ctx, i, async () => {
        const link = await ctx.store.findTableLinkByChannel(channelId);
        if (!link) return notice("このチャンネルは卓とつながっていません。");
        await ctx.store.deleteTableLink(link.tableId);
        return notice(`このチャンネルと「${plain(link.tableName)}」のつながりを外しました。`);
      });
    }
    case SUB.POLLS:
      return deferEphemeral(ctx, i, async () => {
        const link = await ctx.store.findTableLinkByChannel(channelId);
        if (!link) return notice("このチャンネルは卓とつながっていません。");
        const polls = await ctx.store.listOpenPolls(link.tableId);
        return openPollsMessage(polls, link, ctx.config.publicUrl);
      });
    case SUB.CHARACTERS: {
      const show = sub.options.find((o) => o.name === SHOW_OPTION)?.value === true;
      const run = async () => {
        const uid = await ctx.store.getUidForDiscordUser(user.id);
        if (!uid) return linkAccountNotice(ctx.config.publicUrl);
        const chars = await ctx.store.listSharedCharacters(uid, 10);
        return charactersMessage(chars, ctx.config.publicUrl);
      };
      if (!show) return deferEphemeral(ctx, i, run);
      // チャンネルに出す（公開しているキャラクターだけ）
      return { body: { type: ResponseType.DEFERRED_MESSAGE }, work: () => finish(ctx, i, run) };
    }
    default:
      return reply(notice("このコマンドには対応していません。"));
  }
}

function handleComponent(ctx: DiscordContext, i: Interaction): InteractionOutcome {
  const action = decodeAction(i.data?.custom_id ?? "");
  const user = caller(i);
  if (!action || !user) return { body: { type: ResponseType.DEFERRED_UPDATE } };
  // チャンネルの日程調整から開くときは自分だけに見える新しいメッセージ、自分だけのメッセージの中ならそれを書き換える
  const inEphemeral = Boolean((i.message?.flags ?? 0) & EPHEMERAL);
  const defer = inEphemeral ? deferUpdate : deferEphemeral;

  return defer(ctx, i, async () => {
    const uid = await ctx.store.getUidForDiscordUser(user.id);
    if (!uid) return linkAccountNotice(ctx.config.publicUrl);
    const poll = await ctx.store.getPoll(action.eventId);
    if (!poll) return notice("この日程調整は見つかりません。");
    if (!canAnswerPoll(poll, uid)) return notice("この日程調整は、卓のメンバーだけが回答できます。");
    if (!isOpenPoll(poll)) return notice("この日程調整は締め切られました。");
    if (action.kind === "poll-open") return pollAnswerMessage(poll, uid, action.page);

    const updated = await ctx.store.answerPoll(poll.id, uid, action.candidateId, action.value);
    if (!updated) return notice("この候補には回答できません。");
    await refreshPollMessage(ctx, updated).catch((error) => ctx.log?.("discord: refresh poll failed", error));
    return pollAnswerMessage(updated, uid, action.page);
  });
}
