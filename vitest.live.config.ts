import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * 本物の外部サービスに繋ぐ確認（*.live.test.ts）。`pnpm run test:live` で手元から動かす。
 * `pnpm test`・`pnpm run check`・CI には入れない（相手の都合で落ちる・相手に問い合わせが行くため）。
 * 相手に迷惑をかけないよう、ファイルも 1 つずつ動かす。
 */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src"),
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    name: "live",
    environment: "node",
    globals: true,
    include: ["src/**/*.live.test.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
    // 相手の一時的な不調で落ちたときは、続けて叩かずにそのまま落とす
    retry: 0,
  },
});
