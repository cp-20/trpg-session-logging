import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const alias = {
  "@shared": path.resolve(rootDir, "src"),
  "@": path.resolve(rootDir, "src"),
};

/**
 * 純粋なロジック（*.test.ts）は node で、画面（*.test.tsx）は jsdom で動かす。
 * jsdom を作るのが全体の半分の時間を占めていたため。
 * DOM を使う *.test.ts は先頭に `// @vitest-environment jsdom` を書く（scripts/lint-tests.ts が確かめる）。
 * 各ファイルの分離（isolate）は保ったまま。
 */
export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // vi.stubEnv / vi.stubGlobal で変えたものを、テストごとに元へ戻す
    unstubEnvs: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "mobile/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx", "mobile/src/**/*.test.tsx"],
        },
      },
    ],
  },
});
