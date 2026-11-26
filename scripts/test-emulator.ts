/**
 * Firebase エミュレータ（Auth 9099 / Firestore 8080）を立てて、ルールと保存の検査を通す（pnpm run test:emulator）。
 * 本番のデータには触れない。firebase コマンド（firebase-tools）と Java が要る。
 * - scripts/emulator-smoke.ts: ルールの通し確認
 * - src/**\/*.emulator.test.ts: エミュレータに対する単体テスト（ふだんの pnpm test では飛ばす）
 * - --discord を付けると Discord 連携の E2E（pnpm run test:e2e:discord）も同じエミュレータで流す
 */
import { spawnSync } from "node:child_process";

const steps = [
  "node scripts/emulator-smoke.ts",
  "pnpm exec vitest run src/lib/*.emulator.test.ts src/lib/discord/*.emulator.test.ts",
];
if (process.argv.includes("--discord")) steps.push("pnpm run test:e2e:discord");

const result = spawnSync(
  "firebase",
  ["emulators:exec", "--only", "auth,firestore", "--project", "takufu-app", steps.join(" && ")],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true",
      NEXT_PUBLIC_FIREBASE_API_KEY: "demo-key",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "takufu-app",
    },
  },
);
if (result.error) {
  console.error(`firebase を起動できませんでした（firebase-tools と Java が要ります）: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
