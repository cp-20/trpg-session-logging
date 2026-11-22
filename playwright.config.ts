import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Discord 連携は専用の設定（playwright.discord.config.ts、pnpm run test:e2e:discord）
  testIgnore: "**/discord.spec.ts",
  fullyParallel: true,
  use: {
    // CI では本番ビルドを検証する。ローカルは起動中の開発サーバー（pnpm dev）を使う
    baseURL: process.env.CI ? "http://127.0.0.1:4178" : "http://127.0.0.1:5173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.CI
    ? {
        command: "pnpm run build && pnpm exec next start -H 127.0.0.1 -p 4178",
        url: "http://127.0.0.1:4178",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: "pnpm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
