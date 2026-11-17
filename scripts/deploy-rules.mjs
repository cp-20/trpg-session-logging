/**
 * Firestore セキュリティルールを名前付きデータベース takufu へ適用する。
 * 対象 DB と release 名を明示して、(default) DB や他プロジェクトへの
 * 誤適用を防ぐ。Firebase Rules REST API + gcloud トークンを使う。
 *   使い方: node scripts/deploy-rules.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PROJECT_ID = JSON.parse(readFileSync(".firebaserc", "utf8")).projects.default;
const DATABASE_ID = "takufu";
const RULES = readFileSync("firestore.rules", "utf8");

if (PROJECT_ID !== "takufu-app") throw new Error("Refusing to deploy to an unexpected project");
const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
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
    const error = new Error(`${method} ${url} -> ${short}`);
    error.status = res.status;
    throw error;
  }
  return JSON.parse(text);
}

async function main() {
  const name = `projects/${PROJECT_ID}/releases/cloud.firestore/${DATABASE_ID}`;
  if (process.argv.includes("--inspect")) {
    try {
      const release = await call("GET", `https://firebaserules.googleapis.com/v1/${name}`);
      const ruleset = await call("GET", `https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
      console.log(JSON.stringify({ release: release.name, ruleset: release.rulesetName, source: ruleset.source }, null, 2));
    } catch (error) {
      if (error.status !== 404) throw error;
      console.log(`No active release: ${name}`);
    }
    const collections = await call("POST", `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:listCollectionIds`, { pageSize: 100 });
    console.log(JSON.stringify({ database: DATABASE_ID, collectionIds: collections.collectionIds || [] }));
    return;
  }
  const projectNumber = execFileSync("gcloud", ["projects", "describe", PROJECT_ID, "--format=value(projectNumber)"], { encoding: "utf8" }).trim();
  const ruleset = await call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`, {
    source: { files: [{ name: "firestore.rules", content: RULES }] },
    attachment_point: `firestore.googleapis.com/projects/${projectNumber}/databases/${DATABASE_ID}`,
  });
  const release = { name, rulesetName: ruleset.name };
  // PATCH switches the active ruleset atomically; never delete an active release.
  try {
    await call("PATCH", `https://firebaserules.googleapis.com/v1/${name}`, { release, updateMask: "ruleset_name" });
  } catch (error) {
    if (error.status !== 404) throw error;
    await call("POST", `https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases`, release);
  }
  const deployed = await call("GET", `https://firebaserules.googleapis.com/v1/${name}`);
  if (deployed.rulesetName !== ruleset.name) throw new Error("Active release does not match the new ruleset");
  console.log(`deployed: ${DATABASE_ID} <- ${ruleset.name}`);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
