/**
 * 開発サーバー。Next.js（5173）と、画面上でコメントを残すレビュー用のブリッジ（4319）を一緒に起動する。
 * ブリッジは ~/.agents/skills/live-ui-review にあるときだけ起動し、無ければ Next.js だけ動かす。
 * レビューを使うときは http://127.0.0.1:5173/?review=1 を一度開く（以後はブラウザが覚える）。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

const next = spawn(
  "pnpm",
  ["exec", "next", "dev", "-p", "5173", "-H", "127.0.0.1", ...process.argv.slice(2)],
  {
    cwd: ROOT,
    stdio: "inherit",
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
