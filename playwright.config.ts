import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    // CI ではビルド成果物(preview)を検証する。ローカルは既存サーバを再利用
    baseURL: process.env.CI ? "http://127.0.0.1:4178" : "http://127.0.0.1:5173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.CI
    ? {
        command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4178 --strictPort",
        url: "http://127.0.0.1:4178",
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
