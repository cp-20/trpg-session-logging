import type { RandomInt } from "../dice";
import type { DiscordConfig } from "./config";
import type { DiscordRest, FetchFn } from "./rest";
import type { DiscordStore } from "./types";

/** Discord 連携の処理に渡す依存（テストでは記憶上の store と偽の REST に差し替える） */
export interface DiscordContext {
  store: DiscordStore;
  rest: DiscordRest;
  config: DiscordConfig;
  now: () => number;
  /** OAuth のトークン交換など、ボット以外の Discord への要求 */
  fetchFn: FetchFn;
  /** 推測できない文字列（OAuth の合言葉・チャンネルを結ぶコード） */
  randomToken: () => string;
  /** ダイスの乱数（既定は crypto。テストでは出目を決める） */
  randomInt?: RandomInt;
  log?: (message: string, error?: unknown) => void;
  /** 確定した予定を書いた・消したあと（前日のお知らせの時計を合わせ直す。scheduler.ts） */
  onEventsChanged?: () => void;
}

/** 32 バイトの乱数を URL に使える文字（43 文字）で */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** 卓のメンバーか（つないだ人を含む） */
export function isTableMember(link: { ownerId: string; memberIds: string[] }, uid: string): boolean {
  return link.ownerId === uid || link.memberIds.includes(uid);
}
