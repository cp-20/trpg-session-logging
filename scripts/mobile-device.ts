import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

type TransportMode = "tunnel" | "tailscale" | "lan";
/** 端末で開くアプリ。go は Expo Go、dev-client は expo-dev-client を入れた開発ビルド（Google ログインはこちらでしか試せない） */
type DeviceClient = "go" | "dev-client";

interface DeviceSessionInfo {
  mode: TransportMode;
  client: DeviceClient;
  port: number;
  proxyUrl: string;
  expoGoUrl: string;
  devClientUrl: string;
  loadingUrl: string;
  tailscaleUrl: string | null;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const MOBILE_DIR = path.join(ROOT_DIR, "mobile");
const SESSION_FILE = path.join(MOBILE_DIR, ".expo", "device-session.json");
const TRY_CLOUDFLARE_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

function detectTailscaleIp(): string | null {
  try {
    const raw = execFileSync("tailscale", ["ip", "-4"], {
      timeout: 2000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const first = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

function parseArgs(
  argv: string[],
  tailscaleIp: string | null,
): { port: number; mode: TransportMode; client: DeviceClient } {
  let port = 8081;
  let client: DeviceClient = "go";
  let explicitMode: TransportMode | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--dev-client") {
      client = "dev-client";
    } else if (arg === "--lan") {
      explicitMode = "lan";
    } else if (arg === "--tailscale") {
      explicitMode = "tailscale";
    } else if (arg === "--tunnel") {
      explicitMode = "tunnel";
    } else if (arg === "--port") {
      const next = argv[++i];
      const parsed = Number(next);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid --port value: ${next ?? "(missing)"}`);
      }
      port = parsed;
    } else if (arg.startsWith("--port=")) {
      const val = arg.slice("--port=".length);
      const parsed = Number(val);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        throw new Error(`Invalid --port value: ${val}`);
      }
      port = parsed;
    }
  }

  const mode: TransportMode =
    explicitMode ?? (commandExists("cloudflared") ? "tunnel" : tailscaleIp ? "tailscale" : "lan");
  return { port, mode, client };
}

function startCloudflareTunnel(port: number): Promise<{ child: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let logs = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for cloudflared tunnel URL.\n${logs.slice(-600)}`));
    }, 25_000);

    const onChunk = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      logs = `${logs}${text}`.slice(-4000);
      const match = TRY_CLOUDFLARE_RE.exec(text);
      if (!settled && match?.[0]) {
        settled = true;
        clearTimeout(timer);
        resolve({ child, url: match[0] });
      }
    };

    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `cloudflared exited before producing a tunnel URL (code=${code}, signal=${signal}).\n${logs.slice(-600)}`,
        ),
      );
    });
  });
}

function fetchStatus(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/status`, { timeout: 1500 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", reject);
  });
}

async function waitForPackager(port: number, expoChild: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  let exited = false;
  expoChild.once("exit", () => {
    exited = true;
  });

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error("Expo packager exited before becoming ready.");
    }
    try {
      const body = await fetchStatus(port);
      if (body.includes("packager-status:running")) {
        return;
      }
    } catch {
      // Wait for Metro HTTP server to finish binding.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for Metro packager on port ${port}.`);
}

async function main(): Promise<void> {
  const tailscaleIp = detectTailscaleIp();
  const { port, mode, client } = parseArgs(process.argv.slice(2), tailscaleIp);

  let tunnelChild: ChildProcess | null = null;
  let tunnelUrl: string | null = null;
  let expoChild: ChildProcess | null = null;

  const cleanup = () => {
    if (expoChild && !expoChild.killed) {
      expoChild.kill("SIGTERM");
    }
    if (tunnelChild && !tunnelChild.killed) {
      tunnelChild.kill("SIGTERM");
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  if (mode === "tunnel") {
    console.log(`[mobile:device] Starting Cloudflare quick tunnel for 127.0.0.1:${port}...`);
    const started = await startCloudflareTunnel(port);
    tunnelChild = started.child;
    tunnelUrl = started.url;
    tunnelChild.on("exit", (code) => {
      console.warn(`[mobile:device] cloudflared exited (code=${code ?? "null"}).`);
    });
    console.log(`[mobile:device] Tunnel ready: ${tunnelUrl}`);
  }

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    EXPO_NO_DEV_MENU: "0",
  };
  if (mode === "tunnel" && tunnelUrl) {
    childEnv.EXPO_PACKAGER_PROXY_URL = tunnelUrl;
  } else if (mode === "tailscale" && tailscaleIp) {
    childEnv.REACT_NATIVE_PACKAGER_HOSTNAME = tailscaleIp;
  }

  expoChild = spawn(
    "pnpm",
    ["--dir", MOBILE_DIR, "exec", "expo", "start", `--${client}`, "--port", String(port)],
    {
      stdio: "inherit",
      env: childEnv,
    },
  );

  const exitPromise = new Promise<number>((resolve) => {
    expoChild!.on("exit", (code) => {
      if (tunnelChild && !tunnelChild.killed) {
        tunnelChild.kill("SIGTERM");
      }
      resolve(code ?? 0);
    });
  });

  await waitForPackager(port, expoChild);

  const fallbackHost = mode === "tailscale" && tailscaleIp ? tailscaleIp : "127.0.0.1";
  const baseHttpUrl = tunnelUrl ?? `http://${fallbackHost}:${port}`;
  const expoGoUrl = tunnelUrl ? `exps://${new URL(tunnelUrl).hostname}:443` : `exp://${fallbackHost}:${port}`;

  /* 開発ビルドはアプリの URL スキーム経由で Metro の URL を受け取る */
  const devClientUrl = `takufu://expo-development-client/?url=${encodeURIComponent(baseHttpUrl)}`;

  const session: DeviceSessionInfo = {
    mode,
    client,
    port,
    proxyUrl: baseHttpUrl,
    expoGoUrl,
    devClientUrl,
    loadingUrl: `${baseHttpUrl}/_expo/loading`,
    tailscaleUrl: tailscaleIp ? `exp://${tailscaleIp}:${port}` : null,
  };

  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(session, null, 2)}\n`, "utf8");

  console.log("\n[mobile:device] Real-device server is ready:");
  console.log(`  Mode          : ${session.mode}`);
  if (client === "go") {
    console.log(`  Expo Go URL   : ${session.expoGoUrl}`);
  } else {
    console.log(`  Dev client URL: ${session.devClientUrl}`);
    console.log(`  (or enter in dev client): ${session.proxyUrl}`);
  }
  console.log(`  Proxy / HTTPS : ${session.proxyUrl}`);
  if (session.tailscaleUrl) {
    console.log(`  Tailscale URL : ${session.tailscaleUrl}`);
  }
  console.log(`  Session file  : ${path.relative(ROOT_DIR, SESSION_FILE)}\n`);

  const code = await exitPromise;
  process.exit(code);
}

main().catch((err) => {
  console.error("[mobile:device] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
