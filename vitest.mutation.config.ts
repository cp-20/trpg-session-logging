import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(rootDir, "src"),
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "src/lib/**/*.test.ts",
      "src/api/**/*.test.ts",
      "src/app/api/import/external/route.integration.test.ts",
    ],
    exclude: ["**/*.emulator.test.ts", "**/node_modules/**"],
    css: false,
  },
});
