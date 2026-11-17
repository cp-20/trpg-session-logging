import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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

function resolveLolipopCli(): string {
  if (process.env.LOLIPOP_CLI) return process.env.LOLIPOP_CLI;
  const cached = join(homedir(), ".npm/_npx/284f00369d2805e9/node_modules/lolipop/dist/index.mjs");
  return existsSync(cached) ? cached : "lolipop";
}

function runCmd(command: string, args: string[], cwd = ROOT): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${String(result.status ?? result.signal)})`);
  }
}

async function cmdDeploy(args: string[]): Promise<void> {
  if (!args.includes("--prebuilt")) {
    runCmd("pnpm", ["run", "build"]);
  }
  if (!existsSync(join(ROOT, "dist/index.html"))) {
    throw new Error("Build dist/index.html before deploying.");
  }
  const cli = resolveLolipopCli();
  const staging = mkdtempSync(join(tmpdir(), "takufu-deploy-"));
  try {
    cpSync(join(ROOT, "dist"), staging, { recursive: true });
    runCmd(cli, ["deploy", "--project", LOLIPOP_PROJECT, "--json"], staging);
    console.log(
      `Check status: ${cli} project show --project ${LOLIPOP_PROJECT} --json\nSite: https://takufu.lolipop-now.app`,
    );
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
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
    await page.getByRole("button", { name: /サンプルデータをそのまま見る/ }).click();
    await page.waitForURL(/\/sessions/);
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
  default:
    throw new Error("Usage: node scripts/ops.ts <deploy|rules|firebase|review>");
}
