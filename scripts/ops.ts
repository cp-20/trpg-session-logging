import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LOLIPOP_PROJECT = "01M7JCJVR7GCWGXR5MD32MZ22G";
const FIREBASE_PROJECT = "takufu-app";
const FIRESTORE_DB = "takufu";

interface HttpStatusError extends Error {
  status?: number;
}

function assertProjectId(): string {
  const rc = JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8")) as {
    projects?: { default?: string };
  };
  const project = rc.projects?.default;
  if (project !== FIREBASE_PROJECT) {
    throw new Error(`Refusing to operate on unexpected Firebase project: ${String(project)}`);
  }
  return project;
}

function gcloudHeaders(project: string): Record<string, string> {
  const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  return {
    Authorization: `Bearer ${token}`,
    "X-Goog-User-Project": project,
    "Content-Type": "application/json",
  };
}

async function apiJson<T>(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const short = text.includes("<") ? `HTTP ${res.status}` : text.slice(0, 200);
    const err: HttpStatusError = new Error(`${method} ${url} -> ${short}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text) as T;
}

/** LOLIPOP! Deploy Now の CLI。npx のキャッシュ位置には依存せず、版を固定して npx で起動する */
const LOLIPOP_CLI_VERSION = "2.0.8";
function resolveLolipopCli(): [command: string, ...prefix: string[]] {
  if (process.env.LOLIPOP_CLI) return [process.execPath, process.env.LOLIPOP_CLI];
  return ["npx", "--yes", `lolipop@${LOLIPOP_CLI_VERSION}`];
}

function runCmd(command: string, args: string[], cwd = ROOT): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${String(result.status ?? result.signal)})`);
  }
}

/** LOLIPOP! Deploy Now のビルド設定。Next.js の standalone 出力をサーバーとして動かす */
const DEPLOY_BUILD = {
  framework: "next",
  install: "npm ci --ignore-scripts",
  build: "npm run build",
  output: ".next/standalone",
};

/**
 * Deploy Now の Next.js ビルドは npm（package-lock.json）しか受け付けない。
 * リポジトリは pnpm のまま、送る複製だけを npm 用にする: 直接の依存は pnpm が解決した
 * 版に固定し、package-lock.json を作り、pnpm 専用の設定を外す。
 */
function prepareNpmSource(staging: string): void {
  const resolved = JSON.parse(
    execFileSync("pnpm", ["list", "--json", "--depth", "0"], { cwd: ROOT, encoding: "utf8" }),
  ) as {
    name?: string;
    dependencies?: Record<string, { version: string }>;
    devDependencies?: Record<string, { version: string }>;
  }[];
  const rootPkg = resolved.find((r) => r.name === "takufu") ?? resolved[0];
  const versions: Record<string, string> = {};
  for (const group of [rootPkg?.dependencies ?? {}, rootPkg?.devDependencies ?? {}]) {
    for (const [name, info] of Object.entries(group)) versions[name] = info.version;
  }
  const pkgPath = join(staging, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown> & {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const field of ["dependencies", "devDependencies"] as const) {
    for (const name of Object.keys(pkg[field] ?? {})) {
      if (versions[name]) pkg[field]![name] = versions[name]!;
    }
  }
  delete pkg.packageManager;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  for (const f of ["pnpm-lock.yaml", "pnpm-workspace.yaml"]) rmSync(join(staging, f), { force: true });
  runCmd("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], staging);
}
/** ビルド時に埋め込む公開設定（Firebase のブラウザ用設定は秘密ではない）。値は .env.local から読む */
const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_DATABASE_ID",
];
/** まだ公開しない機能の出し入れ（src/lib/features.ts）。.env.local にない鍵は "false" で送り、前に入れた値を残さない */
const FEATURE_ENV_KEYS = ["NEXT_PUBLIC_FEATURE_GOOGLE_CALENDAR"];
/** あれば送る公開設定（Sentry の DSN は秘密ではない） */
const OPTIONAL_PUBLIC_ENV_KEYS = ["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT"];

function readEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/**
 * ソース一式（Git 管理下のファイルだけ。.env* と node_modules は送らない）を Deploy Now に送り、
 * クラウドでインストールとビルドをさせる。`--setup` でビルド設定と公開環境変数も揃える。
 */
async function cmdDeploy(args: string[]): Promise<void> {
  const [cliCmd, ...cliPrefix] = resolveLolipopCli();
  const lolipop = (cmdArgs: string[], cwd = ROOT) => runCmd(cliCmd, [...cliPrefix, ...cmdArgs], cwd);
  if (args.includes("--setup")) {
    lolipop([
      "build-config",
      "update",
      "--project",
      LOLIPOP_PROJECT,
      "--framework",
      DEPLOY_BUILD.framework,
      "--install",
      DEPLOY_BUILD.install,
      "--build",
      DEPLOY_BUILD.build,
      "--output",
      DEPLOY_BUILD.output,
    ]);
    const env = readEnvLocal();
    const existing = execFileSync(
      cliCmd,
      [...cliPrefix, "env", "list", "--project", LOLIPOP_PROJECT, "--json"],
      {
        encoding: "utf8",
      },
    );
    const optional = OPTIONAL_PUBLIC_ENV_KEYS.filter((key) => env[key]);
    for (const key of [...PUBLIC_ENV_KEYS, ...FEATURE_ENV_KEYS, ...optional]) {
      const value = FEATURE_ENV_KEYS.includes(key) ? (env[key] === "true" ? "true" : "false") : env[key];
      if (!value) throw new Error(`${key} is missing in .env.local`);
      // create は値を位置引数で、update は --value で受け取る
      if (existing.includes(`"${key}"`)) {
        lolipop(["env", "update", key, "--value", value, "--project", LOLIPOP_PROJECT]);
      } else {
        lolipop(["env", "create", key, value, "--project", LOLIPOP_PROJECT]);
      }
    }
  }
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f && !f.startsWith(".env") && !f.startsWith("mobile/") && existsSync(join(ROOT, f)));
  const staging = mkdtempSync(join(tmpdir(), "takufu-deploy-"));
  try {
    for (const f of files) cpSync(join(ROOT, f), join(staging, f), { recursive: true });
    prepareNpmSource(staging);
    // Sentry の release。デプロイするコミット（未コミットの変更も送るので、あれば -dirty）をビルドに埋め込む
    const git = (gitArgs: string[]) => execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8" }).trim();
    const release = `takufu@${git(["rev-parse", "--short=12", "HEAD"])}${git(["status", "--porcelain"]) ? "-dirty" : ""}`;
    writeFileSync(join(staging, ".env.production"), `NEXT_PUBLIC_SENTRY_RELEASE=${release}\n`);
    if (args.includes("--local-build")) {
      // クラウドと同じ手順を手元で試す（アップロードしない）
      const env = { ...process.env, ...readEnvLocal() };
      for (const [cmd, ...rest] of [DEPLOY_BUILD.install.split(" "), DEPLOY_BUILD.build.split(" ")]) {
        const r = spawnSync(cmd!, rest, { cwd: staging, stdio: "inherit", env });
        if (r.status !== 0) throw new Error(`${cmd} ${rest.join(" ")} failed`);
      }
      if (!existsSync(join(staging, ".next/standalone/server.js")))
        throw new Error("standalone server.js missing");
      if (!existsSync(join(staging, ".next/standalone/.next/static")))
        throw new Error("static assets missing");
      console.log("Local build OK (nothing uploaded).");
      return;
    }
    lolipop(["deploy", "--project", LOLIPOP_PROJECT, "--json"], staging);
    console.log(
      `Check status: ${[cliCmd, ...cliPrefix].join(" ")} project show --project ${LOLIPOP_PROJECT} --json\nSite: https://takufu.app`,
    );
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** next build の後に、standalone 出力へ静的ファイル（public / .next/static）を入れる */
function cmdStandalone(): void {
  const out = join(ROOT, ".next/standalone");
  if (!existsSync(out)) throw new Error("Run next build with output: standalone first.");
  cpSync(join(ROOT, "public"), join(out, "public"), { recursive: true });
  cpSync(join(ROOT, ".next/static"), join(out, ".next/static"), { recursive: true });
}

async function cmdRules(args: string[]): Promise<void> {
  const project = assertProjectId();
  const headers = gcloudHeaders(project);
  const rules = readFileSync(join(ROOT, "firestore.rules"), "utf8");
  const name = `projects/${project}/releases/cloud.firestore/${FIRESTORE_DB}`;

  if (args.includes("--inspect")) {
    try {
      const release = await apiJson<{ name: string; rulesetName: string }>(
        "GET",
        `https://firebaserules.googleapis.com/v1/${name}`,
        headers,
      );
      const ruleset = await apiJson<{ source: unknown }>(
        "GET",
        `https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
        headers,
      );
      console.log(
        JSON.stringify(
          { release: release.name, ruleset: release.rulesetName, source: ruleset.source },
          null,
          2,
        ),
      );
    } catch (error) {
      if ((error as HttpStatusError).status !== 404) throw error;
      console.log(`No active release: ${name}`);
    }
    return;
  }

  const projectNumber = execFileSync(
    "gcloud",
    ["projects", "describe", project, "--format=value(projectNumber)"],
    { encoding: "utf8" },
  ).trim();
  const ruleset = await apiJson<{ name: string }>(
    "POST",
    `https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,
    headers,
    {
      source: { files: [{ name: "firestore.rules", content: rules }] },
      attachment_point: `firestore.googleapis.com/projects/${projectNumber}/databases/${FIRESTORE_DB}`,
    },
  );
  const release = { name, rulesetName: ruleset.name };
  try {
    await apiJson("PATCH", `https://firebaserules.googleapis.com/v1/${name}`, headers, {
      release,
      updateMask: "ruleset_name",
    });
  } catch (error) {
    if ((error as HttpStatusError).status !== 404) throw error;
    await apiJson(
      "POST",
      `https://firebaserules.googleapis.com/v1/projects/${project}/releases`,
      headers,
      release,
    );
  }
  const deployed = await apiJson<{ rulesetName: string }>(
    "GET",
    `https://firebaserules.googleapis.com/v1/${name}`,
    headers,
  );
  if (deployed.rulesetName !== ruleset.name) {
    throw new Error("Active release does not match the new ruleset");
  }
  console.log(`deployed: ${FIRESTORE_DB} <- ${ruleset.name}`);
}

const CALENDAR_API = "calendar-json.googleapis.com";

async function cmdFirebase(args: string[]): Promise<void> {
  const project = assertProjectId();
  const headers = gcloudHeaders(project);
  const baseUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}`;

  const domainIdx = args.indexOf("--authorize-domain");
  if (domainIdx !== -1) {
    const domain = args[domainIdx + 1];
    if (!domain || !/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) {
      throw new Error("Expected a valid hostname");
    }
    const cur = await apiJson<{ authorizedDomains?: string[] }>("GET", `${baseUrl}/config`, headers);
    const authorizedDomains = [...new Set([...(cur.authorizedDomains ?? []), domain])];
    await apiJson("PATCH", `${baseUrl}/config?updateMask=authorizedDomains`, headers, { authorizedDomains });
  }

  // Google カレンダーの空き時間（src/lib/google-calendar.ts）は、ログインと同じプロジェクトの
  // Calendar API を呼ぶ。無効だと一覧の取得が 403 (SERVICE_DISABLED) になる（2026-11-22 の不具合）
  const calendarApi = `https://serviceusage.googleapis.com/v1/projects/${project}/services/${CALENDAR_API}`;
  if (args.includes("--enable-calendar-api")) {
    await apiJson("POST", `${calendarApi}:enable`, headers, {});
  }
  const calendarState = await apiJson<{ state?: string }>("GET", calendarApi, headers);
  if (calendarState.state !== "ENABLED") {
    console.warn(`${CALENDAR_API} is disabled; run: node scripts/ops.ts firebase --enable-calendar-api`);
  }

  const config = await apiJson<{ authorizedDomains?: string[] }>("GET", `${baseUrl}/config`, headers);
  const providers = await apiJson<{
    defaultSupportedIdpConfigs?: {
      name: string;
      enabled: boolean;
      clientId?: string;
      clientSecret?: string;
    }[];
  }>("GET", `${baseUrl}/defaultSupportedIdpConfigs`, headers);

  console.log(
    JSON.stringify(
      {
        project,
        authorizedDomains: config.authorizedDomains ?? [],
        calendarApiEnabled: calendarState.state === "ENABLED",
        providers: (providers.defaultSupportedIdpConfigs ?? []).map((p) => ({
          provider: p.name.split("/").at(-1),
          enabled: p.enabled,
          hasClientId: Boolean(p.clientId),
          hasClientSecret: Boolean(p.clientSecret),
        })),
      },
      null,
      2,
    ),
  );
}

/**
 * 全画面をデスクトップ・モバイル・ダークで撮影し、e2e/design-audit.ts の検査結果と一緒に
 * .impeccable/review/ へ書き出す。目視レビュー（docs/design-feedback.md の「目視」項目）用。
 * 使い方: node scripts/ops.ts review [http://127.0.0.1:5173] [--only=/calendar,/tables]
 */
async function cmdReview(args: string[]): Promise<void> {
  const { chromium } = await import("playwright");
  const { AUDIT_ROUTES, auditPage } = await import("../e2e/design-audit.ts");
  const baseUrl = args.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:5173";
  const only = args
    .find((a) => a.startsWith("--only="))
    ?.slice("--only=".length)
    .split(",");
  const outDir = process.env.SHOT_DIR ?? join(ROOT, ".impeccable/review");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const modes = [
    { name: "desktop", viewport: { width: 1440, height: 900 }, dark: false },
    { name: "mobile", viewport: { width: 390, height: 844 }, dark: false },
    { name: "dark", viewport: { width: 1440, height: 900 }, dark: true },
  ];
  const browser = await chromium.launch();
  const lines: string[] = ["# 画面レビュー", "", `撮影: ${new Date().toISOString()}`, ""];
  let issues = 0;
  for (const mode of modes) {
    const ctx = await browser.newContext({
      viewport: mode.viewport,
      colorScheme: mode.dark ? "dark" : "light",
      baseURL: baseUrl,
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.goto("/");
    await page.screenshot({ path: join(outDir, `${mode.name}-signin.png`), fullPage: true });
    await page.goto("/demo");
    await page.getByRole("navigation", { name: "メイン" }).first().waitFor();
    lines.push(`## ${mode.name}`, "");
    for (const route of AUDIT_ROUTES) {
      if (only && !only.some((o) => route.startsWith(o))) continue;
      errors.length = 0;
      await page.goto(route);
      await page.waitForTimeout(400);
      const slug = route.replace(/[/?=]+/g, "-").replace(/^-|-$/g, "") || "root";
      await page.screenshot({ path: join(outDir, `${mode.name}-${slug}.png`), fullPage: true });
      const found = [
        ...(await auditPage(page, { dark: mode.dark })),
        ...errors.map((e) => ({ rule: "page-error", detail: e })),
      ];
      issues += found.length;
      lines.push(`- ${found.length ? "NG" : "OK"} \`${route}\` → ${mode.name}-${slug}.png`);
      for (const f of found) lines.push(`  - [${f.rule}] ${f.detail}`);
    }
    lines.push("");
    await ctx.close();
  }
  await browser.close();
  lines.push(
    "## 目視で確かめること",
    "",
    "docs/design-feedback.md の「検査」列が `目視` の項目を、上のスクリーンショットで確かめる。",
  );
  writeFileSync(join(outDir, "report.md"), lines.join("\n"));
  console.log(lines.join("\n"));
  console.log(`\n${issues === 0 ? "ALL PASS" : `${issues} ISSUES`} → ${outDir}`);
  process.exit(issues === 0 ? 0 : 1);
}

const [subcmd, ...rest] = process.argv.slice(2);
switch (subcmd) {
  case "deploy":
    await cmdDeploy(rest);
    break;
  case "rules":
    await cmdRules(rest);
    break;
  case "firebase":
    await cmdFirebase(rest);
    break;
  case "review":
    await cmdReview(rest);
    break;
  case "standalone":
    cmdStandalone();
    break;
  default:
    throw new Error("Usage: node scripts/ops.ts <deploy [--setup]|rules|firebase|review|standalone>");
}
