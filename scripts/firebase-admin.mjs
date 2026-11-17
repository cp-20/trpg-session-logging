/** Configure only the project declared by this repository. Never print credentials. */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const project = JSON.parse(readFileSync(".firebaserc", "utf8")).projects.default;
if (project !== "takufu-app") throw new Error("Refusing to configure an unexpected project");
const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
const headers = { Authorization: `Bearer ${token}`, "X-Goog-User-Project": project, "Content-Type": "application/json" };
async function call(path, method = "GET", body) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(`Identity Platform ${response.status}: ${result.error?.message || "request failed"}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

const args = process.argv.slice(2);
if (args.includes("--initialize")) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v2/projects/${project}/identityPlatform:initializeAuth`, { method: "POST", headers });
  const result = await response.json();
  if (!response.ok) throw new Error(`Initialize Auth ${response.status}: ${result.error?.message || "request failed"}`);
  console.log("Firebase Auth initialized");
}
if (args.includes("--enable-google")) {
  try {
    await call("defaultSupportedIdpConfigs/google.com?updateMask=enabled", "PATCH", { enabled: true });
  } catch (error) {
    if (error.status !== 404) throw error;
    await call("defaultSupportedIdpConfigs?idpId=google.com", "POST", { enabled: true });
  }
  console.log("Google provider enabled");
}
const domainIndex = args.indexOf("--authorize-domain");
if (domainIndex !== -1) {
  const domain = args[domainIndex + 1];
  if (!domain || !/^[a-z0-9.-]+$/.test(domain) || domain.includes("..")) throw new Error("Expected a hostname");
  const config = await call("config");
  const authorizedDomains = [...new Set([...(config.authorizedDomains || []), domain])];
  await call("config?updateMask=authorizedDomains", "PATCH", { authorizedDomains });
  console.log(`Authorized domain: ${domain}`);
}
const config = await call("config");
const providers = await call("defaultSupportedIdpConfigs");
console.log(JSON.stringify({
  project,
  authorizedDomains: config.authorizedDomains,
  providers: (providers.defaultSupportedIdpConfigs || []).map(({ name, enabled, clientId, clientSecret }) => ({
    provider: name.split("/").at(-1), enabled, hasClientId: Boolean(clientId), hasClientSecret: Boolean(clientSecret),
  })),
}, null, 2));
