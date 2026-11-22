/** テスト用: 記憶上の store・呼び出しを記録する偽の Discord REST・固定の時刻で DiscordContext を作る */
import { discordConfig } from "./config";
import type { DiscordContext } from "./context";
import { createMemoryStore } from "./memory-store";
import type { DiscordMessage } from "./messages";
import type { DiscordRest, FetchFn, ScheduledEventBody } from "./rest";
import type { PollDoc } from "./types";

export interface RestCall {
  op: string;
  args: unknown[];
}

export function fakeRest(): DiscordRest & { calls: RestCall[]; fail: Partial<Record<string, Error>> } {
  const calls: RestCall[] = [];
  const fail: Partial<Record<string, Error>> = {};
  let seq = 0;
  const rec = async (op: string, ...args: unknown[]) => {
    calls.push({ op, args });
    if (fail[op]) throw fail[op];
  };
  return {
    calls,
    fail,
    async createMessage(channelId: string, message: DiscordMessage) {
      await rec("createMessage", channelId, message);
      return { id: `m${++seq}` };
    },
    async editMessage(channelId: string, messageId: string, message: DiscordMessage) {
      await rec("editMessage", channelId, messageId, message);
    },
    async createScheduledEvent(guildId: string, body: ScheduledEventBody) {
      await rec("createScheduledEvent", guildId, body);
      return { id: `se${++seq}` };
    },
    async editScheduledEvent(guildId: string, id: string, body: Partial<ScheduledEventBody>) {
      await rec("editScheduledEvent", guildId, id, body);
    },
    async deleteScheduledEvent(guildId: string, id: string) {
      await rec("deleteScheduledEvent", guildId, id);
    },
    async getGuildName(guildId: string) {
      await rec("getGuildName", guildId);
      return "テストサーバー";
    },
    async editOriginal(token: string, message: DiscordMessage) {
      await rec("editOriginal", token, message);
    },
    async putCommands(commands: unknown[], guildId?: string) {
      await rec("putCommands", commands, guildId);
      return commands;
    },
    async getApplication() {
      return { id: "app1", name: "卓譜" };
    },
  };
}

export const NOW = Date.parse("2026-11-20T12:00:00+09:00");

export function makeCtx(opts: { now?: number; fetchFn?: FetchFn } = {}) {
  const store = createMemoryStore();
  const rest = fakeRest();
  let tokens = 0;
  const clock = { now: opts.now ?? NOW };
  const ctx: DiscordContext = {
    store,
    rest,
    config: {
      ...discordConfig({}),
      applicationId: "app1",
      publicKey: "",
      botToken: "bot",
      clientSecret: "secret",
      publicUrl: "https://takufu.test",
    },
    now: () => clock.now,
    fetchFn: opts.fetchFn ?? (async () => new Response("{}", { status: 500 })),
    randomToken: () => `token${String(++tokens).padStart(40, "0")}`,
  };
  return { ctx, store, rest, clock };
}

export function samplePoll(over: Partial<PollDoc> = {}): PollDoc {
  return {
    id: "ev1",
    tableId: "t1",
    ownerId: "u_owner",
    memberIds: ["u_owner", "u_pl"],
    title: "第2話",
    candidates: [
      { id: "c1", date: "2026-11-28", startTime: "21:00", endTime: "01:00" },
      { id: "c2", date: "2026-11-29", startTime: "20:00", endTime: "23:00" },
    ],
    responses: { u_owner: { c1: "ok" } },
    status: "poll",
    ...over,
  };
}

export function linkTable(store: ReturnType<typeof createMemoryStore>, over: Record<string, unknown> = {}) {
  const tableId = typeof over.tableId === "string" ? over.tableId : "t1";
  store.data.tables.set(tableId, {
    tableId,
    ownerId: "u_owner",
    memberIds: ["u_owner", "u_pl"],
    tableName: "港町卓",
    guildId: "g1",
    channelId: "ch1",
    channelName: "卓",
    linkedAt: "2026-11-01T00:00:00.000Z",
    ...over,
  });
}
