/** テストの規約（docs/testing.md）を全テストファイルに当てる。pnpm run lint から呼ぶ */
import fs from "node:fs";
import path from "node:path";
import { lintTestSource } from "../src/lib/test-lint.ts";

const ROOT = process.cwd();
const DIRS = ["src", "mobile/src", "e2e"];
const IGNORED = new Set(["node_modules", ".next", ".expo", "dist"]);
const TEST_FILE_RE = /\.(?:test|spec|rules-spec)\.tsx?$/;

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEST_FILE_RE.test(entry.name)) out.push(full);
  }
}

const files: string[] = [];
for (const d of DIRS) walk(path.join(ROOT, d), files);

let count = 0;
// 規約の検査そのもののテストは、違反の例を文字列として持つ
const SELF_TEST = "src/lib/test-lint.test.ts";

for (const full of files) {
  const rel = path.relative(ROOT, full).split(path.sep).join("/");
  if (rel === SELF_TEST) continue;
  for (const v of lintTestSource(rel, fs.readFileSync(full, "utf8"))) {
    console.error(`${rel}:${v.line}: [${v.rule}] ${v.message}`);
    count++;
  }
}
if (count > 0) process.exit(1);
console.log(`Test lint passed (${files.length} files).`);
