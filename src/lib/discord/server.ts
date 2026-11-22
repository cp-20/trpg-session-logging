/**
 * サーバー側の Discord 連携の入口。route handler と instrumentation だけから読み込む。
 *
 * サーバーは利用者の認証情報（OAuth トークンなど）を持たない。持つのはボットのトークンと、Firestore を読み書きする
 * 「ボットの利用者」（Firebase Auth のメールとパスワード。TAKUFU_BOT_EMAIL / TAKUFU_BOT_PASSWORD）で、どちらも環境変数だけに置く。
 * ボットの利用者ができることは firestore.rules の isBot() が決める（bot-account.ts、docs/DEPLOYMENT.md「Discord」）。
 * Discord の利用者は卓譜の利用者ではないので、サーバーが確かめてから、ボットとして読み書きする。
 */
import { after } from "next/server";
import { BOT_UID } from "./bot-account";
import { botCredentials, connectBot, type BotConnection } from "./bot-connection";
import { discordConfig, type DiscordConfig } from "./config";
import { randomToken, type DiscordContext } from "./context";
import type { HandlerDeps } from "./handlers";
import { createIdTokenVerifier } from "./id-token";
import { createDiscordRest } from "./rest";
import { ensureReminderScheduler } from "./scheduler";

function useEmulators(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
}

function firebaseProjectId(): string {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
}

/**
 * NEXT_PUBLIC_* はビルドのときに埋め込まれ、実行時の環境変数にはないことがある。
 * 埋め込まれるのは `process.env.NAME` と書いたところだけなので、1 つずつ書いて渡す
 */
function serverEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_DATABASE_ID: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID,
    NEXT_PUBLIC_FIREBASE_USE_EMULATORS: process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST,
    NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    TAKUFU_BOT_EMAIL: process.env.TAKUFU_BOT_EMAIL,
    TAKUFU_BOT_PASSWORD: process.env.TAKUFU_BOT_PASSWORD,
  };
}

let cachedBot: BotConnection | null | undefined;

function bot(): BotConnection | null {
  if (cachedBot === undefined) cachedBot = connectBot(serverEnv());
  return cachedBot;
}

/** 欠けている設定の名前（scripts/discord.ts setup-check と 503 の判断に使う。値は出さない） */
export function missingServerConfig(config: DiscordConfig = discordConfig()): string[] {
  const missing: string[] = [];
  if (!config.applicationId) missing.push("DISCORD_APPLICATION_ID");
  if (!config.publicKey) missing.push("DISCORD_PUBLIC_KEY");
  if (!config.botToken) missing.push("DISCORD_BOT_TOKEN");
  if (!config.clientSecret) missing.push("DISCORD_CLIENT_SECRET");
  if (!botCredentials(serverEnv())) missing.push("TAKUFU_BOT_EMAIL", "TAKUFU_BOT_PASSWORD");
  return missing;
}

let cachedCtx: DiscordContext | null = null;

export function serverContext(): DiscordContext | null {
  if (cachedCtx) return cachedCtx;
  const config = discordConfig();
  if (!config.applicationId || !config.botToken) return null;
  const connection = bot();
  if (!connection) return null;
  cachedCtx = {
    store: connection.store,
    rest: createDiscordRest({ botToken: config.botToken, applicationId: config.applicationId }),
    config,
    now: () => Date.now(),
    fetchFn: (input, init) => fetch(input, init),
    randomToken,
    log: (message, error) =>
      error === undefined
        ? console.info(message)
        : console.error(message, error instanceof Error ? error.message : error),
    onEventsChanged: () => void ensureReminderScheduler(serverContext).reschedule(),
  };
  return cachedCtx;
}

let verifier: ReturnType<typeof createIdTokenVerifier> | null = null;

/** 卓譜から呼ぶ API: Authorization: Bearer <Firebase の ID トークン> を確かめて uid を返す */
export async function verifyAppUser(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) return null;
  verifier ??= createIdTokenVerifier({ projectId: firebaseProjectId(), emulator: useEmulators() });
  const verified = await verifier(token);
  // ボットの利用者として卓譜の API を呼ばせない（ボットは Discord の利用者の代わりに書くだけ）
  return verified && verified.uid !== BOT_UID ? verified.uid : null;
}

/** route handler に渡す本物の依存 */
export function liveDeps(): HandlerDeps {
  return {
    ctx: serverContext,
    verifyUser: verifyAppUser,
    after: (work) => after(work),
    wake: () => void ensureReminderScheduler(serverContext).wake(),
  };
}
