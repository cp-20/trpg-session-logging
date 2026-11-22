/**
 * 偽の Discord。Discord 連携の e2e（e2e/discord.spec.ts）用。
 * - REST（DISCORD_API_BASE の向け先）: メッセージ・予定・Interaction の返信・OAuth を受けて、呼ばれた内容を記録する。
 * - 署名つき Interaction の送り手: テスト用の Ed25519 鍵で署名して /api/discord/interactions に送る。
 * 本物の Discord・本物の鍵は使わない。
 */
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { createServer, type Server } from "node:http";

export const FAKE_DISCORD_PORT = 5182;
export const FAKE_DISCORD_BASE = `http://127.0.0.1:${FAKE_DISCORD_PORT}`;

/** テスト専用の固定の鍵（秘密ではない）。サーバーには公開鍵だけを DISCORD_PUBLIC_KEY で渡す */
const TEST_SEED = Buffer.alloc(32, 7);
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const privateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, TEST_SEED]),
  format: "der",
  type: "pkcs8",
});
export const TEST_PUBLIC_KEY_HEX = (
  createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer
)
  .subarray(-32)
  .toString("hex");

export const FAKE_DISCORD_USER = { id: "900000000000000001", username: "e2e_gm", global_name: "E2E GM" };
export const FAKE_GUILD_ID = "800000000000000001";
export const FAKE_CHANNEL_ID = "800000000000000002";
export const FAKE_APPLICATION_ID = "700000000000000001";

export interface RecordedCall {
  method: string;
  path: string;
  body: unknown;
}

export interface FakeDiscord {
  calls(): RecordedCall[];
  /** 条件に合う呼び出し（メソッドと、パスの正規表現） */
  find(method: string, path: RegExp): RecordedCall[];
  reset(): void;
  close(): Promise<void>;
}

export async function startFakeDiscord(): Promise<FakeDiscord> {
  let calls: RecordedCall[] = [];
  let seq = 1000;
  const nextId = () => `9${String(++seq).padStart(17, "0")}`;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", FAKE_DISCORD_BASE);
      const method = req.method ?? "GET";
      const raw = Buffer.concat(chunks).toString("utf8");
      const type = String(req.headers["content-type"] ?? "");
      const body: unknown = !raw
        ? undefined
        : type.includes("json")
          ? JSON.parse(raw)
          : Object.fromEntries(new URLSearchParams(raw));
      const json = (status: number, data?: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(data === undefined ? "" : JSON.stringify(data));
      };
      const path = url.pathname;
      if (path === "/__calls") {
        if (method === "DELETE") calls = [];
        return json(200, calls);
      }
      calls.push({ method, path, body });
      if (method === "POST" && path === "/oauth2/token")
        return json(200, { access_token: "fake-access-token", token_type: "Bearer", scope: "identify" });
      if (method === "POST" && path === "/oauth2/token/revoke") return json(200, {});
      if (method === "GET" && path === "/users/@me") return json(200, FAKE_DISCORD_USER);
      if (method === "GET" && /^\/guilds\/\d+$/.test(path)) return json(200, { name: "E2E サーバー" });
      if (method === "POST" && /^\/channels\/\d+\/messages$/.test(path)) return json(200, { id: nextId() });
      if (method === "POST" && /^\/guilds\/\d+\/scheduled-events$/.test(path))
        return json(200, { id: nextId() });
      if (method === "PATCH" || method === "DELETE") {
        // メッセージ・予定・Interaction の返事の書き換えと削除
        if (/^\/(channels|guilds|webhooks)\//.test(path)) return json(method === "DELETE" ? 204 : 200, {});
      }
      if (method === "POST" && path.startsWith("/webhooks/")) return json(200, { id: nextId() });
      return json(404, { code: 0, message: `fake discord: unhandled ${method} ${path}` });
    });
  });
  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(FAKE_DISCORD_PORT, "127.0.0.1", ok);
  });
  return {
    calls: () => calls,
    find: (method, path) => calls.filter((c) => c.method === method && path.test(c.path)),
    reset: () => {
      calls = [];
    },
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}

/** テスト用の鍵で署名した Interaction を送る */
export async function sendInteraction(
  baseUrl: string,
  interaction: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const body = JSON.stringify({
    id: nextInteractionId(),
    application_id: FAKE_APPLICATION_ID,
    token: `tok-${nextInteractionId()}`,
    ...interaction,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(timestamp + body), privateKey).toString("hex");
  const res = await fetch(`${baseUrl}/api/discord/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature-Ed25519": signature,
      "X-Signature-Timestamp": timestamp,
    },
    body,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

let interactionSeq = 0;
function nextInteractionId(): string {
  return `${Date.now()}${String(++interactionSeq).padStart(4, "0")}`;
}

/** チャンネルの管理（1<<4）+ 見る・送る・埋め込み（ボットの権限） */
const MEMBER_PERMISSIONS = String(1n << 4n);
const APP_PERMISSIONS = String((1n << 10n) | (1n << 11n) | (1n << 14n));

const GUILD_FIELDS = {
  guild_id: FAKE_GUILD_ID,
  channel_id: FAKE_CHANNEL_ID,
  channel: { id: FAKE_CHANNEL_ID, name: "e2e-channel", type: 0 },
  app_permissions: APP_PERMISSIONS,
};

export function slashCommand(sub: string, options: unknown[] = []): Record<string, unknown> {
  return {
    type: 2,
    ...GUILD_FIELDS,
    member: { user: FAKE_DISCORD_USER, permissions: MEMBER_PERMISSIONS },
    data: { name: "卓譜", options: [{ type: 1, name: sub, options }] },
  };
}

export function buttonPress(customId: string, ephemeral = false): Record<string, unknown> {
  return {
    type: 3,
    ...GUILD_FIELDS,
    member: { user: FAKE_DISCORD_USER, permissions: "0" },
    message: { id: "1", flags: ephemeral ? 64 : 0 },
    data: { custom_id: customId },
  };
}
