import { defineConfig } from "@playwright/test";

// 公開前の機能（src/lib/features.ts）も E2E では出して確かめる
const FEATURE_ENV = { NEXT_PUBLIC_FEATURE_GOOGLE_CALENDAR: "true" };

export default defineConfig({
  testDir: "./e2e",
  // Discord 連携は専用の設定（playwright.discord.config.ts、pnpm run test:e2e:discord）
  testIgnore: "**/discord.spec.ts",
  fullyParallel: true,
  // CI の小さな機械では並列の負荷で描画が間に合わないことがある。1 回だけやり直し、やり直して通ったものは flaky として報告に出す
  retries: process.env.CI ? 1 : 0,
  use: {
    // CI では本番ビルドを検証する。ローカルは起動中の開発サーバー（pnpm dev）を使う
    baseURL: process.env.CI ? "http://127.0.0.1:4178" : "http://127.0.0.1:5173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.CI
    ? {
        // standalone の写し（pnpm run build の後半）は next start では使わないので、next build だけ
        command: "pnpm exec next build && pnpm exec next start -H 127.0.0.1 -p 4178",
        url: "http://127.0.0.1:4178",
        reuseExistingServer: false,
        timeout: 120_000,
        env: FEATURE_ENV,
      }
    : {
        command: "pnpm run dev",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 30_000,
        env: FEATURE_ENV,
      },
});
