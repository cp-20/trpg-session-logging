/**
 * Discord の REST API（v10）を fetch で呼ぶ。常駐の接続（Gateway）は持たない。
 * ボットの操作は `Bot <token>`、Interaction への返信は Interaction のトークン付きの webhook で行う。
 */
import type { DiscordMessage } from "./messages";

export const DEFAULT_DISCORD_API = "https://discord.com/api/v10";

/** REST の基点。DISCORD_API_BASE で差し替える（e2e/support/fake-discord.ts の偽サーバー用） */
export function discordApiBase(env: Record<string, string | undefined> = process.env): string {
  return (env.DISCORD_API_BASE?.trim() || DEFAULT_DISCORD_API).replace(/\/+$/, "");
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class DiscordApiError extends Error {
  readonly status: number;
  readonly code: number | undefined;
  constructor(status: number, code: number | undefined, message: string) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
    this.code = code;
  }
}

/** Discord の JSON エラーコード（https://discord.com/developers/docs/topics/opcodes-and-status-codes） */
export const DISCORD_ERROR = {
  UNKNOWN_CHANNEL: 10003,
  UNKNOWN_MESSAGE: 10008,
  UNKNOWN_EVENT: 10070,
  MISSING_ACCESS: 50001,
  MISSING_PERMISSIONS: 50013,
} as const;

export interface ScheduledEventBody {
  name: string;
  description?: string;
  scheduled_start_time: string;
  scheduled_end_time?: string;
  privacy_level: 2;
  entity_type: 2 | 3;
  channel_id?: string | null;
  entity_metadata?: { location: string } | null;
}

export interface DiscordRest {
  createMessage(channelId: string, message: DiscordMessage): Promise<{ id: string }>;
  editMessage(channelId: string, messageId: string, message: DiscordMessage): Promise<void>;
  createScheduledEvent(guildId: string, body: ScheduledEventBody): Promise<{ id: string }>;
  editScheduledEvent(guildId: string, eventId: string, body: Partial<ScheduledEventBody>): Promise<void>;
  deleteScheduledEvent(guildId: string, eventId: string): Promise<void>;
  getGuildName(guildId: string): Promise<string | null>;
  /** Interaction への最初の返事（遅らせた返事）を書き換える */
  editOriginal(interactionToken: string, message: DiscordMessage): Promise<void>;
  /** コマンド一覧の登録（scripts/discord.ts） */
  putCommands(commands: unknown[], guildId?: string): Promise<unknown[]>;
  getApplication(): Promise<{
    id: string;
    name: string;
    interactions_endpoint_url?: string | null;
    redirect_uris?: string[];
  }>;
}

export function createDiscordRest(opts: {
  botToken: string;
  applicationId: string;
  fetchFn?: FetchFn;
  /** 429 のとき待つ（テストで置き換える） */
  sleep?: (ms: number) => Promise<void>;
}): DiscordRest {
  const fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  async function call<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(`${discordApiBase()}${path}`, {
        method,
        headers: {
          ...(auth ? { Authorization: `Bot ${opts.botToken}` } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          "User-Agent": "DiscordBot (https://takufu.app, 1)",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 && attempt < 2) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        await sleep(Math.min(5, Math.max(0.1, Number(data.retry_after) || 1)) * 1000);
        continue;
      }
      if (res.status === 204) return undefined as T;
      const text = await res.text();
      const data = text ? (JSON.parse(text) as T & { code?: number; message?: string }) : (undefined as T);
      if (!res.ok) {
        const err = data as { code?: number; message?: string } | undefined;
        throw new DiscordApiError(
          res.status,
          err?.code,
          `Discord ${method} ${path}: ${res.status} ${err?.message ?? ""}`,
        );
      }
      return data;
    }
  }

  const app = opts.applicationId;
  return {
    async createMessage(channelId, message) {
      return call<{ id: string }>("POST", `/channels/${channelId}/messages`, message);
    },
    async editMessage(channelId, messageId, message) {
      await call("PATCH", `/channels/${channelId}/messages/${messageId}`, message);
    },
    async createScheduledEvent(guildId, body) {
      return call<{ id: string }>("POST", `/guilds/${guildId}/scheduled-events`, body);
    },
    async editScheduledEvent(guildId, eventId, body) {
      await call("PATCH", `/guilds/${guildId}/scheduled-events/${eventId}`, body);
    },
    async deleteScheduledEvent(guildId, eventId) {
      await call("DELETE", `/guilds/${guildId}/scheduled-events/${eventId}`);
    },
    async getGuildName(guildId) {
      try {
        return (await call<{ name?: string }>("GET", `/guilds/${guildId}`)).name ?? null;
      } catch {
        return null;
      }
    },
    async editOriginal(interactionToken, message) {
      await call("PATCH", `/webhooks/${app}/${interactionToken}/messages/@original`, message, false);
    },
    async putCommands(commands, guildId) {
      return call<unknown[]>(
        "PUT",
        guildId ? `/applications/${app}/guilds/${guildId}/commands` : `/applications/${app}/commands`,
        commands,
      );
    },
    async getApplication() {
      return call("GET", `/applications/@me`);
    },
  };
}
