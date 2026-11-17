import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const project = "01M7JCJVR7GCWGXR5MD32MZ22G";
const cli = process.env.LOLIPOP_CLI || "lolipop";

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}

if (!process.argv.includes("--prebuilt")) run("npm", ["run", "build"]);
if (!existsSync(join(root, "dist/index.html"))) throw new Error("Build dist/index.html before deploying.");

// The CLI excludes Git-ignored files; stage only the static build outside the repository.
const staging = mkdtempSync(join(tmpdir(), "takufu-deploy-"));
try {
  cpSync(join(root, "dist"), staging, { recursive: true });
  run(cli, ["deploy", "--project", project, "--json"], staging);
  console.log("Deployment submitted. Check readiness with:");
  console.log(`${cli} project show --project ${project} --json`);
  console.log("Site: https://takufu.lolipop-now.app");
} finally {
  rmSync(staging, { recursive: true, force: true });
}
