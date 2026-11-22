/**
 * Discord 連携のサーバーが、ボットの利用者（bot-account.ts）として Firestore に入る接続。
 * ブラウザ用の既定のアプリと混ざらない名前の Firebase アプリを作り、Firebase Auth の SDK でメールとパスワードでログインする。
 * ID トークンは SDK が覚え、期限の前に securetoken で取り直す（ログインは一度に 1 回だけ）。
 * Firestore は REST で話す firestore/lite（リスナーもキャッシュも持たない。トランザクションは使える）。
 */
import { deleteApp, getApps, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
  type Auth,
} from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore/lite";
import { BOT_UID, EMULATOR_BOT, emulatorAuthUrl, ensureEmulatorBotUser } from "./bot-account";
import { createFirestoreStore } from "./firestore-store";
import type { DiscordStore } from "./types";

const APP_NAME = "takufu-discord-bot";

export interface BotCredentials {
  email: string;
  password: string;
}

type Env = Record<string, string | undefined>;

/** ボットのログイン情報（TAKUFU_BOT_EMAIL / TAKUFU_BOT_PASSWORD）。エミュレーターでは決まった値を既定にする */
export function botCredentials(env: Env = process.env): BotCredentials | null {
  const email = env.TAKUFU_BOT_EMAIL?.trim() ?? "";
  const password = env.TAKUFU_BOT_PASSWORD ?? "";
  if (email && password) return { email, password };
  return env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" ? { ...EMULATOR_BOT } : null;
}

export interface BotConnection {
  auth: Auth;
  db: Firestore;
  /** ボットとしてログインしている状態にする */
  ready: () => Promise<void>;
  /** どの操作の前にも ready() を待つ DiscordStore */
  store: DiscordStore;
  close: () => Promise<void>;
}

export function connectBot(env: Env = process.env): BotConnection | null {
  const creds = botCredentials(env);
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  if (!creds || !apiKey || !projectId) return null;
  const emulator = env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
  // 開発中の再読み込みで前のアプリが残っていたら捨てる
  for (const stale of getApps().filter((a) => a.name.startsWith(APP_NAME)))
    void deleteApp(stale).catch(() => {});
  const app = initializeApp(
    { apiKey, projectId, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || undefined },
    `${APP_NAME}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  );
  // ログインはこのプロセスの記憶の中だけ（ファイルにもブラウザの保存先にも残さない）
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app, env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "takufu");
  if (emulator) {
    connectAuthEmulator(auth, emulatorAuthUrl(env), { disableWarnings: true });
    connectFirestoreEmulator(
      db,
      env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1",
      Number(env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080),
    );
  }

  let signingIn: Promise<void> | null = null;
  /** ログイン情報が違うときに、要求のたびに Firebase Auth を叩かない */
  let failed: { at: number; error: unknown } | null = null;

  async function signIn(): Promise<void> {
    if (emulator)
      // エミュレーターは起動のたびに空なので、ルールに書いた uid のボットをその場で作る
      await ensureEmulatorBotUser({ authUrl: emulatorAuthUrl(env), projectId, ...creds! });
    const { user } = await signInWithEmailAndPassword(auth, creds!.email, creds!.password);
    if (user.uid !== BOT_UID)
      // ルールの botUid() と違う利用者では、何も読み書きできない。設定の取り違えに早く気づけるようにする
      console.error(
        `discord: signed in as ${user.uid}, but firestore.rules expects the bot uid ${BOT_UID} (run node scripts/discord.ts setup-bot)`,
      );
  }

  function ready(): Promise<void> {
    if (auth.currentUser) return Promise.resolve();
    if (failed && Date.now() - failed.at < 30_000) return Promise.reject(failed.error);
    signingIn ??= signIn()
      .then(() => {
        failed = null;
      })
      .catch((error: unknown) => {
        failed = { at: Date.now(), error };
        throw error;
      })
      .finally(() => {
        signingIn = null;
      });
    return signingIn;
  }

  const raw = createFirestoreStore(db);
  const store = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(raw) as [string, (...args: unknown[]) => Promise<unknown>][])
    store[name] = async (...args: unknown[]) => {
      await ready();
      return fn(...args);
    };

  return {
    auth,
    db,
    ready,
    store: store as unknown as DiscordStore,
    close: () => deleteApp(app),
  };
}
