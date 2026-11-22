/**
 * Discord 連携の準備（docs/DEPLOYMENT.md「Discord」）。値は .env.local・.env.discord.local か環境変数から読み、秘密は表示しない。
 *
 *   node scripts/discord.ts register [--guild <サーバー ID>]   スラッシュコマンドを登録（--guild は開発用。すぐ反映される）
 *   node scripts/discord.ts setup-check [--url <公開 URL>]     設定の有無・Discord 側の設定・公開中の口・ボットのログインを確かめる
 *   node scripts/discord.ts install-url                         ボットをサーバーに入れる URL を出す
 *   node scripts/discord.ts setup-bot --project <プロジェクト ID> [--email <メール>] [--force]
 *                                                               Firestore に入るボットの利用者を作り、ログイン情報を .env.discord.local に、
 *                                                               uid を firestore.rules と src/lib/discord/bot-account.ts に書く
 *   node scripts/discord.ts setup-bot --emulator                エミュレーターにボットの利用者を作る（開発用。何も書き換えない）
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOT_UID,
  DEFAULT_BOT_EMAIL,
  emulatorAuthUrl,
  ensureEmulatorBotUser,
  patchRulesBotUid,
  patchSourceBotUid,
  rulesBotUid,
} from "../src/lib/discord/bot-account.ts";
import { COMMANDS } from "../src/lib/discord/commands.ts";
import { botInstallUrl, DEFAULT_PUBLIC_URL } from "../src/lib/discord/config.ts";
import { createDiscordRest } from "../src/lib/discord/rest.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SECRETS_FILE = join(ROOT, ".env.discord.local");
const RULES_FILE = join(ROOT, "firestore.rules");
const BOT_SOURCE = join(ROOT, "src/lib/discord/bot-account.ts");
// setup-bot が BOT_UID を書き換えた後も比較が型エラーにならないよう string に広げる
const UNSET_BOT_UID: string = "takufu-discord-bot-unset";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (existsSync(path))
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m) out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    }
  return out;
}

function env(): Record<string, string> {
  const out: Record<string, string> = {
    ...readEnvFile(join(ROOT, ".env.local")),
    ...readEnvFile(SECRETS_FILE),
  };
  for (const [k, v] of Object.entries(process.env))
    if (v !== undefined && /^(DISCORD_|TAKUFU_|NEXT_PUBLIC_FIREBASE_)/.test(k)) out[k] = v;
  return out;
}

/** .env.discord.local の値を書き換える（ほかの行は残す。持ち主だけが読める） */
function writeSecrets(values: Record<string, string>): void {
  const lines = existsSync(SECRETS_FILE) ? readFileSync(SECRETS_FILE, "utf8").split(/\r?\n/) : [];
  const rest = lines.filter((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line.trim())?.[1];
    return !(key && key in values);
  });
  while (rest.length && rest.at(-1) === "") rest.pop();
  for (const [k, v] of Object.entries(values)) rest.push(`${k}=${v}`);
  writeFileSync(SECRETS_FILE, `${rest.join("\n")}\n`, { mode: 0o600 });
  chmodSync(SECRETS_FILE, 0o600);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function rest(e: Record<string, string>) {
  if (!e.DISCORD_APPLICATION_ID || !e.DISCORD_BOT_TOKEN)
    throw new Error("DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required (.env.local or environment).");
  return createDiscordRest({ applicationId: e.DISCORD_APPLICATION_ID, botToken: e.DISCORD_BOT_TOKEN });
}

async function register(args: string[]): Promise<void> {
  const e = env();
  const guild = flag(args, "--guild");
  const result = (await rest(e).putCommands([...COMMANDS], guild)) as { name: string; id: string }[];
  console.log(
    `Registered ${result.map((c) => `/${c.name}`).join(", ")} ${guild ? `in guild ${guild}` : "globally (may take up to an hour to appear)"}.`,
  );
}

/** ボットの利用者としてログインできるか（Firebase Auth の REST。トークンは表示しない） */
async function botSignIn(e: Record<string, string>): Promise<string> {
  if (!e.NEXT_PUBLIC_FIREBASE_API_KEY || !e.TAKUFU_BOT_EMAIL || !e.TAKUFU_BOT_PASSWORD) return "skipped";
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(e.NEXT_PUBLIC_FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: e.TAKUFU_BOT_EMAIL,
        password: e.TAKUFU_BOT_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as { localId?: string; error?: { message?: string } };
  if (!res.ok) return `error: ${body.error?.message ?? res.status}`;
  return body.localId === BOT_UID
    ? "ok"
    : `uid mismatch (signed in as ${body.localId}, rules expect ${BOT_UID})`;
}

async function setupCheck(args: string[]): Promise<void> {
  const e = env();
  const base = (flag(args, "--url") || e.TAKUFU_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/, "");
  const report: Record<string, string | boolean> = {};
  for (const k of [
    "DISCORD_APPLICATION_ID",
    "DISCORD_PUBLIC_KEY",
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_SECRET",
  ])
    report[k] = Boolean(e[k]);
  report.TAKUFU_BOT_EMAIL = Boolean(e.TAKUFU_BOT_EMAIL);
  report.TAKUFU_BOT_PASSWORD = Boolean(e.TAKUFU_BOT_PASSWORD);
  report.rulesBotUidSet =
    BOT_UID !== UNSET_BOT_UID && rulesBotUid(readFileSync(RULES_FILE, "utf8")) === BOT_UID;
  try {
    report.botSignIn = await botSignIn(e);
  } catch (error) {
    report.botSignIn = `error: ${(error as Error).message}`;
  }

  if (e.DISCORD_APPLICATION_ID && e.DISCORD_BOT_TOKEN) {
    try {
      const app = await rest(e).getApplication();
      report.applicationIdMatches = app.id === e.DISCORD_APPLICATION_ID;
      report.interactionsEndpoint = app.interactions_endpoint_url === `${base}/api/discord/interactions`;
      report.oauthRedirect = Boolean(app.redirect_uris?.includes(`${base}/api/discord/oauth/callback`));
    } catch (error) {
      report.application = `error: ${(error as Error).message}`;
    }
  }
  // 公開中の口: 署名のない要求は 401（設定がなければ 503）
  const probe = async (path: string, init: RequestInit) => {
    try {
      return String((await fetch(`${base}${path}`, init)).status);
    } catch (error) {
      return `error: ${(error as Error).message}`;
    }
  };
  report.interactionsUnsigned = await probe("/api/discord/interactions", { method: "POST", body: "{}" });
  console.log(JSON.stringify(report, null, 2));
  if (e.DISCORD_APPLICATION_ID) console.log(`Bot install URL: ${botInstallUrl(e.DISCORD_APPLICATION_ID)}`);
}

async function setupBot(args: string[]): Promise<void> {
  const e = env();
  if (args.includes("--emulator")) {
    const projectId = e.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "takufu-app";
    const r = await ensureEmulatorBotUser({ authUrl: emulatorAuthUrl(e), projectId });
    console.log(`${r.created ? "Created" : "Found"} the emulator bot user ${r.uid} in project ${projectId}.`);
    return;
  }
  const force = args.includes("--force");
  if ((BOT_UID !== UNSET_BOT_UID || e.TAKUFU_BOT_EMAIL) && !force)
    throw new Error(
      `A bot user already seems set up (uid ${BOT_UID}${e.TAKUFU_BOT_EMAIL ? ", TAKUFU_BOT_EMAIL present" : ""}). Re-run with --force to create another one.`,
    );
  const apiKey = e.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is required (.env.local or environment).");
  // 本番の Firebase に利用者を作るので、どのプロジェクトかを口で言ってもらう
  const project = e.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!project || flag(args, "--project") !== project)
    throw new Error(
      `This creates a real user in Firebase project "${project ?? "?"}". Re-run with --project ${project ?? "<id>"} to confirm (or --emulator for the emulator).`,
    );
  const email = flag(args, "--email") || DEFAULT_BOT_EMAIL;
  const password = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as { localId?: string; error?: { message?: string } };
  if (!res.ok || !body.localId)
    throw new Error(
      `Sign-up failed: ${body.error?.message ?? res.status}. Enable the Email/Password provider in Firebase Authentication, or pick another --email.`,
    );
  const uid = body.localId;
  // パスワードはここでしか分からないので、先に保存する
  writeSecrets({ TAKUFU_BOT_EMAIL: email, TAKUFU_BOT_PASSWORD: password });
  writeFileSync(RULES_FILE, patchRulesBotUid(readFileSync(RULES_FILE, "utf8"), uid));
  writeFileSync(BOT_SOURCE, patchSourceBotUid(readFileSync(BOT_SOURCE, "utf8"), uid));
  console.log(`Created the bot user ${uid} (${email}).`);
  console.log("Wrote TAKUFU_BOT_EMAIL / TAKUFU_BOT_PASSWORD to .env.discord.local (mode 600).");
  console.log("Wrote the uid to firestore.rules (botUid) and src/lib/discord/bot-account.ts (BOT_UID).");
  console.log("Next: node scripts/ops.ts rules, then set both variables on Deploy Now and redeploy.");
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "register":
    await register(args);
    break;
  case "setup-check":
    await setupCheck(args);
    break;
  case "setup-bot":
    await setupBot(args);
    break;
  case "install-url": {
    const id = env().DISCORD_APPLICATION_ID;
    if (!id) throw new Error("DISCORD_APPLICATION_ID is required.");
    console.log(botInstallUrl(id));
    break;
  }
  default:
    throw new Error(
      "Usage: node scripts/discord.ts <register [--guild <id>]|setup-check [--url <url>]|install-url|setup-bot --project <id> [--email <email>] [--force] | setup-bot --emulator>",
    );
}
