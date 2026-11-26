import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { BOT_UID } from "../../lib/discord/bot-account";

/**
 * firestore.rules を Firestore エミュレーターに読み込み、利用者ごとの Firestore を返す（`pnpm run test:rules`）。
 *
 * 本番は名前付きのデータベース「takufu」だが、ルールは `match /databases/{database}/documents` で
 * データベースによらない。rules-unit-testing は (default) だけを扱う（firestore() も clearFirestore() も）ので、
 * (default) で確かめる。
 */
const rulesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../firestore.rules");

export const ALICE = "alice";
export const BOB = "bob";
export const CAROL = "carol";
export { BOT_UID };

let testEnv: RulesTestEnvironment;

/** 各ファイルの先頭で呼ぶ。テストごとにデータを空にする */
export function useRulesEnv(): void {
  beforeAll(async () => {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
    testEnv = await initializeTestEnvironment({
      projectId: "takufu-app",
      firestore: { rules: readFileSync(rulesPath, "utf8"), host, port: Number(port) },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
  });
  afterAll(async () => {
    await testEnv?.cleanup();
  });
}

const db = (context: RulesTestContext) => context.firestore() as unknown as Firestore;

/** メールとパスワードでログインした利用者 */
export function as(uid: string): Firestore {
  return db(testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: "password" } }));
}

/** パスワード以外（カスタムトークン）でログインした利用者 */
export function asOtherProvider(uid: string): Firestore {
  return db(testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: "custom" } }));
}

/** ログインしていない人 */
export function anon(): Firestore {
  return db(testEnv.unauthenticatedContext());
}

/** Discord 連携のサーバー（firestore.rules の isBot()） */
export function bot(): Firestore {
  return as(BOT_UID);
}

/** ルールを通さずに下準備のデータを書く */
export async function seed(write: (db: Firestore) => Promise<unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await write(db(context));
  });
}
