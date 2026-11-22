import { defineConfig } from "@playwright/test";
import { FAKE_APPLICATION_ID, FAKE_DISCORD_BASE, TEST_PUBLIC_KEY_HEX } from "./e2e/support/fake-discord";

/**
 * Discord 連携の e2e（pnpm run test:e2e:discord）。本物の Discord には繋がない:
 * 偽の Discord（e2e/support/fake-discord.ts）を DISCORD_API_BASE に、テスト用の公開鍵を DISCORD_PUBLIC_KEY にして、
 * 専用の開発サーバー（5181・出力先も別）を起動する。Firebase は起動済みのエミュレータ（auth 9099 / firestore 8080）を使う。
 */
const PORT = 5181;
process.env.DISCORD_E2E = "1"; // e2e/discord.spec.ts はこの設定のときだけ動かす

export default defineConfig({
  testDir: "./e2e",
  testMatch: "discord.spec.ts",
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: Boolean(process.env.DISCORD_E2E_REUSE),
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e-discord",
      NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true",
      NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "takufu-app",
      NEXT_PUBLIC_FIREBASE_DATABASE_ID: "takufu",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
      NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
      NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: "8080",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      DISCORD_API_BASE: FAKE_DISCORD_BASE,
      DISCORD_PUBLIC_KEY: TEST_PUBLIC_KEY_HEX,
      DISCORD_APPLICATION_ID: FAKE_APPLICATION_ID,
      DISCORD_BOT_TOKEN: "fake-bot-token",
      DISCORD_CLIENT_SECRET: "fake-client-secret",
      TAKUFU_PUBLIC_URL: `http://127.0.0.1:${PORT}`,
      DISCORD_E2E: "1",
    },
  },
});
