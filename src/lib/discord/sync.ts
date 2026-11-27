/**
 * 卓譜の日程調整・予定・記録を、卓とつないだ Discord のチャンネルに映す。
 * 卓譜（アプリ）からの呼び出しと、Discord 上の回答の両方から使う。何度呼んでも同じ結果になる（同じ内容なら何もしない）。
 */
import { eventDurationMinutes, slotRange } from "../schedule";
import { isTableMember, type DiscordContext } from "./context";
import {
  cancelledMessage,
  confirmedMessage,
  pollMessage,
  sessionMessage,
  type ConfirmedEvent,
  type DiscordMessage,
} from "./messages";
import { withEventLock } from "./event-lock";
import { candidateSitting, isOpenPoll } from "./polls";
import { DISCORD_ERROR, DiscordApiError, type ScheduledEventBody } from "./rest";
import type { EventPost, PollDoc, TableLink } from "./types";

export type SyncResult =
  | { ok: true; linked: false }
  | { ok: true; linked: true; changed: boolean }
  | { ok: false; status: number; error: string };

const NOT_MEMBER: SyncResult = { ok: false, status: 403, error: "この卓のメンバーではありません。" };
const NOT_EDITOR: SyncResult = {
  ok: false,
  status: 403,
  error: "予定を変えられるのは、予定を作った人と卓を作った人だけです。",
};

function isGone(error: unknown): boolean {
  return (
    error instanceof DiscordApiError &&
    (error.status === 404 ||
      error.code === DISCORD_ERROR.UNKNOWN_MESSAGE ||
      error.code === DISCORD_ERROR.UNKNOWN_EVENT)
  );
}

/** 前に出したメッセージを書き換える。消されていたら出し直す */
async function upsertMessage(
  ctx: DiscordContext,
  channelId: string,
  messageId: string | undefined,
  message: DiscordMessage,
): Promise<string> {
  if (messageId) {
    try {
      await ctx.rest.editMessage(channelId, messageId, message);
      return messageId;
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  }
  return (await ctx.rest.createMessage(channelId, message)).id;
}

function freshPost(eventId: string, link: TableLink, prev: EventPost | null): EventPost {
  // つなぐチャンネルを替えたら、前のチャンネルのメッセージは書き換えない
  if (prev && prev.channelId === link.channelId) return { ...prev };
  return { eventId, tableId: link.tableId, guildId: link.guildId, channelId: link.channelId };
}

/* ---------- 日程調整 ---------- */

/** 日程調整のメッセージを出す・書き換える。確定していれば予定として知らせる */
export function syncPoll(ctx: DiscordContext, poll: PollDoc): Promise<SyncResult> {
  return withEventLock(poll.id, () => syncPollLocked(ctx, poll));
}

async function syncPollLocked(ctx: DiscordContext, poll: PollDoc): Promise<SyncResult> {
  const link = await ctx.store.getTableLink(poll.tableId);
  if (!link) return { ok: true, linked: false };
  // 卓のメンバーでない人が作った日程調整は、卓のチャンネルに出さない
  if (!isTableMember(link, poll.ownerId)) return NOT_MEMBER;
  const prev = await ctx.store.getEventPost(poll.id);
  const post = freshPost(poll.id, link, prev);
  const open = isOpenPoll(poll);
  let changed = false;
  if (open || post.pollMessageId) {
    post.pollMessageId = await upsertMessage(
      ctx,
      post.channelId,
      post.pollMessageId,
      pollMessage(poll, link, ctx.config.publicUrl),
    );
    post.title = poll.title;
    changed = true;
  }
  const confirmed = poll.confirmedCandidateId
    ? poll.candidates.find((c) => c.id === poll.confirmedCandidateId)
    : undefined;
  const sitting = confirmed ? candidateSitting(confirmed) : null;
  if (changed) {
    await ctx.store.setEventPost(poll.id, post);
    if (post.pollMessageId && poll.discord?.messageId !== post.pollMessageId)
      await ctx.store
        .setPollDiscord(poll.id, {
          guildId: post.guildId,
          channelId: post.channelId,
          messageId: post.pollMessageId,
          ...(post.scheduledEventId ? { scheduledEventId: post.scheduledEventId } : {}),
        })
        .catch((error) => ctx.log?.("discord: poll link failed", error));
  }
  if (sitting && !open) {
    const r = await upsertConfirmed(ctx, link, {
      eventId: poll.id,
      tableId: poll.tableId,
      title: poll.title,
      start: sitting.start,
      end: sitting.end,
      createdBy: poll.ownerId,
    });
    return { ok: true, linked: true, changed: changed || r };
  }
  return { ok: true, linked: true, changed };
}

/** 卓譜から: 日程調整を作った・回答した・確定したあと */
export async function syncPollFromApp(
  ctx: DiscordContext,
  uid: string,
  eventId: string,
): Promise<SyncResult> {
  // 並んで待つあいだに回答や確定が進むので、文書は順番が来てから読む
  return withEventLock(eventId, async () => {
    const poll = await ctx.store.getPoll(eventId);
    if (!poll) return { ok: false, status: 404, error: "日程調整が見つかりません。" };
    if (poll.ownerId !== uid && !poll.memberIds.includes(uid)) return NOT_MEMBER;
    return syncPollLocked(ctx, poll);
  });
}

/** Discord で回答したあと、チャンネルの回答数を今に合わせる */
export function refreshPollMessage(ctx: DiscordContext, poll: PollDoc): Promise<void> {
  return withEventLock(poll.id, () => refreshPollMessageLocked(ctx, poll));
}

async function refreshPollMessageLocked(ctx: DiscordContext, poll: PollDoc): Promise<void> {
  const [link, post] = await Promise.all([
    ctx.store.getTableLink(poll.tableId),
    ctx.store.getEventPost(poll.id),
  ]);
  if (!link || !post?.pollMessageId || post.channelId !== link.channelId) return;
  await ctx.rest.editMessage(
    post.channelId,
    post.pollMessageId,
    pollMessage(poll, link, ctx.config.publicUrl),
  );
}

/* ---------- 確定した予定 ---------- */

function scheduledEventBody(ctx: DiscordContext, link: TableLink, ev: ConfirmedEvent): ScheduledEventBody {
  const base = {
    name: (ev.title || "予定").slice(0, 100),
    description: `${link.tableName}`.slice(0, 1000),
    scheduled_start_time: new Date(ev.start * 1000).toISOString(),
    scheduled_end_time: new Date(ev.end * 1000).toISOString(),
    privacy_level: 2 as const,
  };
  if (link.voiceChannelId)
    return { ...base, entity_type: 2, channel_id: link.voiceChannelId, entity_metadata: null };
  return {
    ...base,
    entity_type: 3,
    channel_id: null,
    entity_metadata: { location: `${ctx.config.publicUrl}/tables/${link.tableId}`.slice(0, 100) },
  };
}

/**
 * 予定が決まった・変わったとき: Discord のイベント（始まる前に興味ありの人へ Discord が知らせる）と、
 * チャンネルのメッセージを今に合わせる。時刻も題名も同じなら何もしない。戻り値は変えたか
 */
export async function upsertConfirmed(
  ctx: DiscordContext,
  link: TableLink,
  ev: ConfirmedEvent,
): Promise<boolean> {
  const prev = await ctx.store.getEventPost(ev.eventId);
  const post = freshPost(ev.eventId, link, prev);
  const startMs = ev.start * 1000;
  const endMs = ev.end * 1000;
  if (post.confirmMessageId && post.startMs === startMs && post.endMs === endMs && post.title === ev.title)
    return false;

  // Discord のイベントは始まる前のものだけ作れる。権限がなければイベントなしで知らせる
  if (startMs > ctx.now()) {
    const body = scheduledEventBody(ctx, link, ev);
    try {
      if (post.scheduledEventId) {
        try {
          await ctx.rest.editScheduledEvent(post.guildId, post.scheduledEventId, body);
        } catch (error) {
          if (!isGone(error)) throw error;
          post.scheduledEventId = (await ctx.rest.createScheduledEvent(post.guildId, body)).id;
        }
      } else {
        post.scheduledEventId = (await ctx.rest.createScheduledEvent(post.guildId, body)).id;
      }
    } catch (error) {
      ctx.log?.("discord: scheduled event failed", error);
    }
  }
  post.confirmMessageId = await upsertMessage(
    ctx,
    post.channelId,
    post.confirmMessageId,
    confirmedMessage(ev, link, ctx.config.publicUrl, post.scheduledEventId),
  );
  if (post.startMs !== startMs) post.confirmedAt = ctx.now();
  post.title = ev.title;
  post.startMs = startMs;
  post.endMs = endMs;
  if (!post.createdBy && ev.createdBy) post.createdBy = ev.createdBy;
  await ctx.store.setEventPost(ev.eventId, post);
  ctx.onEventsChanged?.();
  return true;
}

/** 予定を消した・日程調整を取り消したとき */
export async function cancelEvent(ctx: DiscordContext, link: TableLink, eventId: string): Promise<boolean> {
  const post = await ctx.store.getEventPost(eventId);
  if (!post || post.tableId !== link.tableId) return false;
  if (post.scheduledEventId)
    await ctx.rest.deleteScheduledEvent(post.guildId, post.scheduledEventId).catch((error) => {
      if (!isGone(error)) ctx.log?.("discord: delete event failed", error);
    });
  const msg = cancelledMessage(post.title ?? "", link);
  for (const id of [post.confirmMessageId, post.pollMessageId]) {
    if (id) await ctx.rest.editMessage(post.channelId, id, msg).catch(() => {});
  }
  await ctx.store.deleteEventPost(eventId);
  ctx.onEventsChanged?.();
  return true;
}

export interface AppEventInput {
  eventId: string;
  tableId: string;
  deleted?: boolean;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMin?: number;
}

/** 卓譜から: 確定した予定を作った・変えた・消したあと */
export async function syncEventFromApp(
  ctx: DiscordContext,
  uid: string,
  input: AppEventInput,
): Promise<SyncResult> {
  const link = await ctx.store.getTableLink(input.tableId);
  if (!link) return { ok: true, linked: false };
  if (!isTableMember(link, uid)) return NOT_MEMBER;
  // 画面と同じ条件（src/lib/schedule.ts の canConfirmPoll）: 予定を作った人と、卓を作った人だけが変えられる。
  // ほかの卓の予定の番号を持ち込んでも、その卓の知らせは書き換えさせない
  const prev = await ctx.store.getEventPost(input.eventId);
  if (prev) {
    if (prev.tableId !== input.tableId) return NOT_EDITOR;
    if (uid !== link.ownerId && prev.createdBy !== uid) return NOT_EDITOR;
  }
  if (input.deleted)
    return {
      ok: true,
      linked: true,
      changed: await withEventLock(input.eventId, () => cancelEvent(ctx, link, input.eventId)),
    };
  const minutes = eventDurationMinutes(input.startTime ?? "", input.endTime ?? "", input.durationMin);
  const range = slotRange(input.date ?? "", input.startTime ?? "", minutes);
  if (!range) return { ok: false, status: 400, error: "予定の日時を読み取れません。" };
  const changed = await withEventLock(input.eventId, () =>
    upsertConfirmed(ctx, link, {
      eventId: input.eventId,
      tableId: input.tableId,
      title: input.title ?? "",
      start: range.start / 1000,
      end: range.end / 1000,
      createdBy: uid,
    }),
  );
  return { ok: true, linked: true, changed };
}

/* ---------- 記録の投稿 ---------- */

export type PostSessionResult =
  | { ok: true }
  | { ok: false; status: number; error: string; code?: "not_ready" | "unlinked" };

/**
 * 記録したセッションを、その卓のチャンネルに投稿する（本人が選んだときだけ）。
 * 中身は共有ページの公開の範囲から作る（sessionMessage）。
 * 卓は、匿名で読める共有ページならその中身から、そうでなければ記録した人の画面が送る（サーバーは中身を読めない）。
 * どちらでも、投稿できるのはつないだ卓のメンバーのときだけ
 */
export async function postSession(
  ctx: DiscordContext,
  uid: string,
  slug: string,
  requestedTableId?: string,
): Promise<PostSessionResult> {
  const info = await ctx.store.getSharedLog(slug);
  if (!info || info.revoked)
    return {
      ok: false,
      status: 409,
      code: "not_ready",
      error: "共有ページを準備しています。少し待ってから、もう一度お試しください。",
    };
  if (info.ownerId !== uid) return { ok: false, status: 403, error: "記録した人だけが投稿できます。" };
  const tableId = info.tableId ?? requestedTableId;
  if (!tableId) return { ok: false, status: 400, code: "unlinked", error: "卓のないセッションです。" };
  const link = await ctx.store.getTableLink(tableId);
  if (!link)
    return { ok: false, status: 404, code: "unlinked", error: "この卓は Discord とつながっていません。" };
  if (!isTableMember(link, uid)) return { ok: false, status: 403, error: "この卓のメンバーではありません。" };
  await ctx.rest.createMessage(link.channelId, sessionMessage(slug, info, ctx.config.publicUrl));
  return { ok: true };
}
