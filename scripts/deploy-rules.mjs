/**
 * Firestore セキュリティルールを名前付きデータベース takufu へ適用する。
 * firebase-tools の CLI は (default) を要求して課金エラーになるため、
 * Firebase Rules REST API + gcloud トークンで直接適用する。
 *   使い方: node scripts/deploy-rules.mjs
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PROJECT_ID = JSON.parse(readFileSync(".firebaserc", "utf8")).projects.default;
const DATABASE_ID = "takufu";
const RULES = readFileSync("firestore.rules", "utf8");

const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  "X-Goog-User-Project": PROJECT_ID,
  "Content-Type": "application/json",
};

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const short = text.includes("<") ? `HTTP ${res.status}` : text.slice(0, 200);
    throw new Error(`${method} ${url} -> ${short}`);
  }
  return JSON.parse(text);
}

async function main() {
  const ruleset = await call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`, {
    source: { files: [{ name: "firestore.rules", content: RULES }] },
  });
  const name = `projects/${PROJECT_ID}/releases/${DATABASE_ID}`;
  // 既存リリースは DELETE→POST で差し替え(PATCH のマスク挙動が安定しないため)
  try {
    await call("DELETE", `https://firebaserules.googleapis.com/v1/${name}`);
  } catch {
    /* なければ無視 */
  }
  await call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases`, {
    name,
    rulesetName: ruleset.name,
  });
  console.log(`deployed: ${DATABASE_ID} <- ${ruleset.name}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
