/** テスト用の、記憶上の DiscordStore（Firestore の代わり） */
import { applyPollAnswer, isOpenPoll } from "./polls";
import type {
  ChannelLinkCode,
  DiscordAccount,
  DiscordStore,
  EventPost,
  PollDoc,
  SharedCharacterInfo,
  SharedLogInfo,
  TableLink,
} from "./types";

export interface MemoryStoreData {
  links: Map<string, string>;
  accounts: Map<string, DiscordAccount>;
  states: Map<string, { uid: string; expiresAt: number }>;
  codes: Map<string, ChannelLinkCode>;
  tables: Map<string, TableLink>;
  tableOwners: Map<string, string>;
  polls: Map<string, PollDoc>;
  posts: Map<string, EventPost>;
  reminders: Map<string, "sending" | "sent">;
  sharedLogs: Map<string, SharedLogInfo>;
  characters: Map<string, SharedCharacterInfo[]>;
}

export function createMemoryStore(): DiscordStore & { data: MemoryStoreData } {
  const data: MemoryStoreData = {
    links: new Map(),
    accounts: new Map(),
    states: new Map(),
    codes: new Map(),
    tables: new Map(),
    tableOwners: new Map(),
    polls: new Map(),
    posts: new Map(),
    reminders: new Map(),
    sharedLogs: new Map(),
    characters: new Map(),
  };
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    data,
    async getUidForDiscordUser(id) {
      const uid = data.links.get(id);
      // 利用者が自分の userDiscord を消したら、もうその人として扱わない（firestore-store.ts と同じ）
      return uid && data.accounts.get(uid)?.discordUserId === id ? uid : null;
    },
    async getAccount(uid) {
      return data.accounts.get(uid) ?? null;
    },
    async linkAccount(uid, account) {
      const old = data.accounts.get(uid);
      if (old) data.links.delete(old.discordUserId);
      const prevUid = data.links.get(account.discordUserId);
      if (prevUid) data.accounts.delete(prevUid);
      data.links.set(account.discordUserId, uid);
      data.accounts.set(uid, account);
    },
    async unlinkAccount(uid) {
      const old = data.accounts.get(uid);
      if (old) data.links.delete(old.discordUserId);
      data.accounts.delete(uid);
    },
    async createOAuthState(state, uid, expiresAt) {
      data.states.set(state, { uid, expiresAt });
    },
    async consumeOAuthState(state) {
      const v = data.states.get(state) ?? null;
      data.states.delete(state);
      return v;
    },
    async createLinkCode(code, v) {
      data.codes.set(code, clone(v));
    },
    async getLinkCode(code) {
      return clone(data.codes.get(code) ?? null);
    },
    async consumeLinkCode(code) {
      const v = data.codes.get(code) ?? null;
      data.codes.delete(code);
      return v;
    },
    async getTableOwner(tableId) {
      return data.tableOwners.get(tableId) ?? null;
    },
    async getTableLink(tableId) {
      return clone(data.tables.get(tableId) ?? null);
    },
    async findTableLinkByChannel(channelId) {
      return clone([...data.tables.values()].find((l) => l.channelId === channelId) ?? null);
    },
    async setTableLink(link) {
      data.tables.set(link.tableId, clone(link));
    },
    async updateTableLink(tableId, patch) {
      const v = data.tables.get(tableId);
      if (v) data.tables.set(tableId, { ...v, ...patch });
    },
    async deleteTableLink(tableId) {
      data.tables.delete(tableId);
    },
    async getPoll(eventId) {
      return clone(data.polls.get(eventId) ?? null);
    },
    async setPollDiscord(eventId, discord) {
      const poll = data.polls.get(eventId);
      if (poll) data.polls.set(eventId, { ...poll, discord });
    },
    async listOpenPolls(tableId) {
      return [...data.polls.values()].filter((p) => p.tableId === tableId && isOpenPoll(p)).map(clone);
    },
    async answerPoll(eventId, uid, candidateId, value) {
      const poll = data.polls.get(eventId);
      if (!poll) return null;
      const next = applyPollAnswer(poll, uid, candidateId, value);
      if (next) data.polls.set(eventId, next);
      return clone(next);
    },
    async getEventPost(eventId) {
      return clone(data.posts.get(eventId) ?? null);
    },
    async setEventPost(eventId, post) {
      data.posts.set(eventId, clone(post));
    },
    async deleteEventPost(eventId) {
      data.posts.delete(eventId);
    },
    async listEventPostsStartingBetween(from, to) {
      return [...data.posts.values()].filter(
        (p) => p.startMs !== undefined && p.startMs > from && p.startMs <= to,
      );
    },
    async claimReminder(key) {
      if (data.reminders.has(key)) return false;
      data.reminders.set(key, "sending");
      return true;
    },
    async markReminderSent(key) {
      data.reminders.set(key, "sent");
    },
    async releaseReminder(key) {
      data.reminders.delete(key);
    },
    async getSharedLog(slug) {
      return clone(data.sharedLogs.get(slug) ?? null);
    },
    async listSharedCharacters(uid, limit) {
      return (data.characters.get(uid) ?? []).slice(0, limit);
    },
  };
}
