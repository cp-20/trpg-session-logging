/**
 * Discord 連携でサーバー（ボットの利用者。bot-account.ts）だけが読み書きする文書の形。
 * Firestore のルールでボットだけに許す（ブラウザからは、自分の userDiscord を読む・消す以外できない）。
 *
 * - `discordLinks/{discordUserId}`: Discord の利用者 → 卓譜の uid
 * - `userDiscord/{uid}`: 卓譜の uid → Discord の利用者（設定に出す名前）
 * - `discordOAuthStates/{state}`: Discord とつなぐ途中の一回きりの合言葉（10 分）
 * - `discordLinkCodes/{code}`: `/卓譜 つなぐ` が出す、チャンネルと卓を結ぶ一回きりのコード（10 分）
 * - `tableDiscord/{tableId}`: 卓とつないだチャンネル
 * - `discordEvents/{eventId}`: 予定・日程調整ごとに Discord へ出したメッセージとイベント
 * - `discordReminders/{key}`: 前日のお知らせを送ったかの印（何度調べても・サーバーが複数でも 1 回だけ。src/lib/discord/scheduler.ts）
 */
import type { Sitting } from "../sittings";
import type { Availability } from "../../types";
import type { PollDiscordLink, TablePoll as PollDoc } from "../table-polls-core";

export type PollAnswer = Availability;

export interface DiscordAccount {
  discordUserId: string;
  username: string;
  globalName?: string;
  linkedAt: string;
}

export interface ChannelLinkCode {
  guildId: string;
  channelId: string;
  channelName: string;
  guildName?: string;
  /** ボイスの予定にするときのボイスチャンネル */
  voiceChannelId?: string;
  voiceChannelName?: string;
  /** コマンドを送った Discord の利用者 */
  requestedBy: string;
  expiresAt: number;
}

export interface TableLink {
  tableId: string;
  /** 卓を作った人（つないだ人）。卓のメンバーと名前はこの人の卓譜から写す */
  ownerId: string;
  memberIds: string[];
  tableName: string;
  guildId: string;
  guildName?: string;
  channelId: string;
  channelName: string;
  voiceChannelId?: string;
  voiceChannelName?: string;
  linkedAt: string;
}

/** 予定・日程調整ごとに Discord に出したもの */
export interface EventPost {
  eventId: string;
  tableId: string;
  guildId: string;
  channelId: string;
  title?: string;
  /** 日程調整のメッセージ */
  pollMessageId?: string;
  /** 「予定が決まりました」のメッセージ */
  confirmMessageId?: string;
  /** Discord のイベント */
  scheduledEventId?: string;
  /** 確定した予定の時間帯（ミリ秒）。前日のお知らせに使う */
  startMs?: number;
  endMs?: number;
  /** 確定を知らせた時刻（ミリ秒） */
  confirmedAt?: number;
}

/**
 * 日程調整の共有文書 `tablePolls/{eventId}`。形は src/lib/table-polls-core.ts の TablePoll（id は予定の id）。
 * 卓のメンバーが卓譜でも Discord でも同じ文書に回答する
 */
export type { TablePoll as PollDoc, PollCandidate, PollDiscordLink } from "../table-polls-core";

/** 共有ページ（/share/l/{slug}）の文書。匿名で読めるとき（公開）だけ中身（卓・題名など）を載せる */
export interface SharedLogInfo {
  ownerId: string;
  scope: "members" | "passed" | "public";
  revoked: boolean;
  tableId?: string;
  title?: string;
  systemId?: string;
  sittings?: Sitting[];
  scenarioTitle?: string;
}

export interface SharedCharacterInfo {
  id: string;
  name: string;
  systemId: string;
}

export interface DiscordStore {
  getUidForDiscordUser(discordUserId: string): Promise<string | null>;
  getAccount(uid: string): Promise<DiscordAccount | null>;
  /** つなぎ直し: その uid・その Discord の利用者の古いつながりは外す */
  linkAccount(uid: string, account: DiscordAccount): Promise<void>;
  unlinkAccount(uid: string): Promise<void>;

  createOAuthState(state: string, uid: string, expiresAt: number): Promise<void>;
  /** 一回きり。読んだら消す */
  consumeOAuthState(state: string): Promise<{ uid: string; expiresAt: number } | null>;

  createLinkCode(code: string, data: ChannelLinkCode): Promise<void>;
  getLinkCode(code: string): Promise<ChannelLinkCode | null>;
  consumeLinkCode(code: string): Promise<ChannelLinkCode | null>;

  getTableLink(tableId: string): Promise<TableLink | null>;
  findTableLinkByChannel(channelId: string): Promise<TableLink | null>;
  setTableLink(link: TableLink): Promise<void>;
  updateTableLink(tableId: string, patch: Partial<Pick<TableLink, "memberIds" | "tableName">>): Promise<void>;
  deleteTableLink(tableId: string): Promise<void>;

  getPoll(eventId: string): Promise<PollDoc | null>;
  listOpenPolls(tableId: string): Promise<PollDoc[]>;
  /** 回答を書く。メンバーでない・候補がない・締め切った日程調整なら null */
  answerPoll(eventId: string, uid: string, candidateId: string, value: PollAnswer): Promise<PollDoc | null>;
  /** Discord に出したメッセージの在りかを日程調整の文書に書く（卓譜の画面から Discord のメッセージを開くため） */
  setPollDiscord(eventId: string, discord: PollDiscordLink): Promise<void>;

  getEventPost(eventId: string): Promise<EventPost | null>;
  setEventPost(eventId: string, post: EventPost): Promise<void>;
  deleteEventPost(eventId: string): Promise<void>;
  listEventPostsStartingBetween(fromMs: number, toMs: number): Promise<EventPost[]>;

  /** 送る権利を取る。すでに取られていれば false（再起動や複数のサーバーでの二重送信を防ぐ） */
  claimReminder(key: string): Promise<boolean>;
  markReminderSent(key: string): Promise<void>;
  releaseReminder(key: string): Promise<void>;

  /** 共有ページの目録。中身（題名・卓など）は、匿名で読める公開のときだけ */
  getSharedLog(slug: string): Promise<SharedLogInfo | null>;
  listSharedCharacters(uid: string, limit: number): Promise<SharedCharacterInfo[]>;
}
