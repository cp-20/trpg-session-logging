/**
 * BCDice が対応するゲームシステムの一覧（ID・名前・読み）を src/lib/bcdice-systems.ts に書き出す。
 * BCDice 本体は依存に入れない。npm の bcdice パッケージを一時ディレクトリに落として、
 * 同梱の lib/bcdice/game_system_list.json（game_system/*.rb の ID / NAME / SORT_KEY から作られたもの）を読む。
 *
 *   node scripts/gen-bcdice-systems.ts            # 既定の版を取得して生成
 *   node scripts/gen-bcdice-systems.ts 4.11.0     # 版を指定
 *   node scripts/gen-bcdice-systems.ts ./game_system_list.json  # 手元の一覧から生成
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_VERSION = "4.10.0";
const OUT_FILE = path.join(process.cwd(), "src/lib/bcdice-systems.ts");

interface RawSystem {
  id: string;
  name: string;
  sortKey: string;
  locale: string;
}

function loadList(arg: string | undefined): { version: string; systems: RawSystem[] } {
  if (arg && arg.endsWith(".json")) {
    const json = JSON.parse(readFileSync(arg, "utf8")) as { gameSystems: RawSystem[] };
    return { version: "local", systems: json.gameSystems };
  }
  const version = arg ?? DEFAULT_VERSION;
  const dir = mkdtempSync(path.join(tmpdir(), "bcdice-"));
  try {
    execFileSync("npm", ["pack", `bcdice@${version}`, "--silent", "--pack-destination", dir], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"));
    if (!tgz) throw new Error(`bcdice@${version} を取得できませんでした`);
    execFileSync("tar", ["xzf", path.join(dir, tgz), "-C", dir, "package/lib/bcdice/game_system_list.json"]);
    const json = JSON.parse(
      readFileSync(path.join(dir, "package/lib/bcdice/game_system_list.json"), "utf8"),
    ) as { gameSystems: RawSystem[] };
    return { version, systems: json.gameSystems };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const { version, systems } = loadList(process.argv[2]);
const rows = systems
  .map((s) => ({ id: s.id, name: s.name.trim(), sortKey: s.sortKey, locale: s.locale }))
  // BCDice の一覧と同じく読み（SORT_KEY）の順。国際化版は「国際化:」で始まるので日本語版のあとに並ぶ
  .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id < b.id ? -1 : 1));

const ids = new Set<string>();
for (const r of rows) {
  if (ids.has(r.id)) throw new Error(`重複した ID: ${r.id}`);
  ids.add(r.id);
}

const body = rows
  .map(
    (r) =>
      `  { id: ${JSON.stringify(r.id)}, name: ${JSON.stringify(r.name)}, sortKey: ${JSON.stringify(r.sortKey)}, locale: ${JSON.stringify(r.locale)} },`,
  )
  .join("\n");

writeFileSync(
  OUT_FILE,
  `/**
 * BCDice が対応するゲームシステムの一覧。scripts/gen-bcdice-systems.ts が生成する。手で直さない。
 * 出典: bcdice ${version}（lib/bcdice/game_system_list.json）
 */

export interface BcdiceSystem {
  /** BCDice のゲームシステム ID（例: Cthulhu7th） */
  id: string;
  /** BCDice の NAME（正式名） */
  name: string;
  /** BCDice の SORT_KEY（読み。国際化版は「国際化:言語:名前」） */
  sortKey: string;
  locale: string;
}

export const BCDICE_VERSION = ${JSON.stringify(version)};

export const BCDICE_SYSTEMS: readonly BcdiceSystem[] = [
${body}
];
`,
);
execFileSync("npx", ["oxfmt", OUT_FILE], { stdio: "inherit" });
console.log(`${rows.length} システムを ${path.relative(process.cwd(), OUT_FILE)} に書き出しました`);
