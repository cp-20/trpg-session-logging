/**
 * pnpm run check: lint・型（Web とモバイル）・単体テスト・ビルドを同時に流す。
 * 順に流すと待ちが足し算になる（CI で約 70 秒）。互いの結果には依らないので並べる。
 * 出力は混ぜず、終わったものから見出しを付けてまとめて出す。どれかが落ちたら、最後に落ちたものを並べて 1 で終える。
 * ビルドは型の検査を省く（typecheck が同じものを見ている）。
 */
import { spawn } from "node:child_process";

interface Task {
  name: string;
  args: string[];
  env?: Record<string, string>;
}

const TASKS: Task[] = [
  { name: "lint", args: ["run", "-s", "lint"] },
  { name: "typecheck", args: ["run", "-s", "typecheck"] },
  { name: "mobile:typecheck", args: ["run", "-s", "mobile:typecheck"] },
  { name: "test", args: ["run", "-s", "test"] },
  { name: "build", args: ["run", "-s", "build"], env: { NEXT_SKIP_TYPECHECK: "1" } },
];

function run(task: Task): Promise<{ task: Task; code: number; output: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("pnpm", task.args, {
      env: { ...process.env, ...task.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => chunks.push(c));
    const done = (code: number) => {
      const result = { task, code, output: Buffer.concat(chunks).toString(), ms: Date.now() - started };
      const mark = code === 0 ? "ok" : "FAILED";
      process.stdout.write(
        `\n=== ${task.name} (${mark}, ${(result.ms / 1000).toFixed(1)}s) ===\n${result.output}`,
      );
      resolve(result);
    };
    child.on("error", (error) => {
      chunks.push(Buffer.from(String(error)));
      done(1);
    });
    child.on("close", (code) => done(code ?? 1));
  });
}

const started = Date.now();
const results = await Promise.all(TASKS.map(run));
const failed = results.filter((r) => r.code !== 0).map((r) => r.task.name);
const total = ((Date.now() - started) / 1000).toFixed(1);
if (failed.length) {
  process.stdout.write(`\ncheck failed (${total}s): ${failed.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`\ncheck passed (${total}s): ${TASKS.map((t) => t.name).join(", ")}\n`);
