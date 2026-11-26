import { defineConfig } from "vitest/config";

/**
 * firestore.rules の検査（`pnpm run test:rules`）。Firestore エミュレーターが要るので `pnpm test` には入れない。
 * どのファイルも同じエミュレーターの同じデータベースを毎回空にして使うので、ファイルは 1 つずつ順に動かす。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/rules/**/*.rules-spec.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
