/**
 * 開発サーバー。Next.js（5173）と、画面上でコメントを残すレビュー用のブリッジ（4319）を一緒に起動する。
 * ブリッジは ~/.agents/skills/live-ui-review にあるときだけ起動し、無ければ Next.js だけ動かす。
 * レビューを使うときは http://127.0.0.1:5173/?review=1 を一度開く（以後はブラウザが覚える）。
 * Discord 連携の秘密（.env.discord.local。Next.js は読まない名前）も、環境変数にないものだけ Next.js に渡す。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REVIEW_SERVER = join(homedir(), ".agents/skills/live-ui-review/scripts/review-server.ts");
const children: ReturnType<typeof spawn>[] = [];

async function reviewServerRunning(): Promise<boolean> {
  try {
    const res = await fetch("http://127.0.0.1:4319/overlay.js", { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

if (existsSync(REVIEW_SERVER) && !(await reviewServerRunning())) {
  children.push(
    spawn(process.execPath, [REVIEW_SERVER, "--port", "4319", "--repo", ROOT], { stdio: "inherit" }),
  );
}

function discordEnv(): Record<string, string> {
  const path = join(ROOT, ".env.discord.local");
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return out;
}

const next = spawn(
  "pnpm",
  ["exec", "next", "dev", "-p", "5173", "-H", "127.0.0.1", ...process.argv.slice(2)],
  {
    cwd: ROOT,
    stdio: "inherit",
    // 開発では公開前の機能（src/lib/features.ts）も出す。切った姿を見るときは環境変数で false を渡す
    env: { NEXT_PUBLIC_FEATURE_GOOGLE_CALENDAR: "true", ...process.env, ...discordEnv() },
  },
);
children.push(next);

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
