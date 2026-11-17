/** Run against the repository's named-database emulators; no production data is touched. */
import assert from "node:assert/strict";
import http from "node:http";

const RUN = Date.now().toString(36);
const PROJECT = "takufu-app";
const DATABASE = "takufu";
const AUTH_PORT = Number((process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099").split(":").at(-1));
const FIRESTORE_PORT = Number((process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":").at(-1));
let checks = 0;

interface HttpRes {
  status?: number;
  body: Record<string, unknown> | null;
}

function req(
  port: number,
  path: string,
  method = "GET",
  body?: unknown,
  token?: string | null,
): Promise<HttpRes> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers: Record<string, string | number> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const request = http.request({ host: "127.0.0.1", port, path, method, headers }, (response) => {
      let text = "";
      response.on("data", (chunk: Buffer) => {
        text += chunk.toString();
      });
      response.on("end", () =>
        resolve({
          status: response.statusCode,
          body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
        }),
      );
    });
    request.on("error", reject);
    if (data) request.write(data);
    request.end();
  });
}

function value(input: unknown): Record<string, unknown> {
  if (input instanceof Date) return { timestampValue: input.toISOString() };
  if (typeof input === "string") return { stringValue: input };
  if (typeof input === "boolean") return { booleanValue: input };
  if (typeof input === "number") return { integerValue: String(input) };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  const rec = input as Record<string, unknown>;
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(rec).map(([key, item]) => [key, value(item)])),
    },
  };
}

const fields = (input: Record<string, unknown>) => ({
  fields: (value(input).mapValue as { fields: Record<string, unknown> }).fields,
});

const fs = (method: string, path: string, token?: string | null, body?: Record<string, unknown>) =>
  req(
    FIRESTORE_PORT,
    `/v1/projects/${PROJECT}/databases/${DATABASE}/documents/${path}`,
    method,
    body ? fields(body) : undefined,
    token,
  );

async function check(name: string, response: HttpRes, status: number): Promise<void> {
  assert.equal(response.status, status, `${name}: ${JSON.stringify(response.body).slice(0, 300)}`);
  console.log(`PASS ${name}`);
  checks++;
}

async function signUp(label: string): Promise<{ uid: string; token: string }> {
  const response = await req(
    AUTH_PORT,
    "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    "POST",
    { email: `${label}-${RUN}@test.local`, password: "test-password-123" },
  );
  assert.equal(response.status, 200);
  return {
    uid: String(response.body?.localId),
    token: String(response.body?.idToken),
  };
}

const A = await signUp("a");
const B = await signUp("b");
const own = `users/${A.uid}`;
await check(
  "anonymous cannot write a workspace",
  await fs("PATCH", `${own}/workspace/current`, null, { revision: "r1", chunkCount: 1, updatedAt: "now" }),
  403,
);
await check(
  "owner can create private chunks",
  await fs("PATCH", `${own}/revisions/r1/chunks/0000`, A.token, { data: "private" }),
  200,
);
await check(
  "owner can commit a private manifest",
  await fs("PATCH", `${own}/workspace/current`, A.token, { revision: "r1", chunkCount: 1, updatedAt: "now" }),
  200,
);
await check(
  "another account cannot read private data",
  await fs("GET", `${own}/revisions/r1/chunks/0000`, B.token),
  403,
);
await check(
  "another account cannot list private chunks",
  await fs("GET", `${own}/revisions/r1/chunks`, B.token),
  403,
);
await check("owner can read private data", await fs("GET", `${own}/revisions/r1/chunks/0000`, A.token), 200);
await check(
  "another account cannot replace a private manifest",
  await fs("PATCH", `${own}/workspace/current`, B.token, { revision: "r2", chunkCount: 1, updatedAt: "now" }),
  403,
);
await check(
  "invalid private manifests are rejected",
  await fs("PATCH", `${own}/workspace/current`, A.token, {
    revision: "r2",
    chunkCount: 201,
    updatedAt: "now",
  }),
  403,
);
await check("unconfigured collections deny authenticated listing", await fs("GET", "sessions", B.token), 403);

const slug = `share-${RUN}`;
const root = `sharedLogs/${slug}`;
let manifest: Record<string, unknown> = {
  ownerId: A.uid,
  scope: "members",
  memberIds: [B.uid],
  scenarioPolicy: "public",
  revision: "r1",
  chunkCount: 1,
};
await check("owner can create a members-only share", await fs("PATCH", root, A.token, manifest), 200);
await check(
  "owner can store share chunks",
  await fs("PATCH", `${root}/revisions/r1/chunks/0000`, A.token, { data: "shared", ownerId: A.uid }),
  200,
);
await check("anonymous can get only access metadata", await fs("GET", root), 200);
await check("anonymous cannot list shares", await fs("GET", "sharedLogs"), 403);
await check(
  "anonymous cannot read members-only payload",
  await fs("GET", `${root}/revisions/r1/chunks/0000`),
  403,
);
await check(
  "member can read members-only payload",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, B.token),
  200,
);
await check(
  "member cannot change the owner or scope",
  await fs("PATCH", root, B.token, { ...manifest, ownerId: B.uid, scope: "public" }),
  403,
);
await check(
  "member cannot write private payload",
  await fs("PATCH", `${root}/revisions/r2/chunks/0000`, B.token, { data: "hack", ownerId: B.uid }),
  403,
);
await check(
  "member cannot self-declare into a members share",
  await fs("PATCH", `${root}/access/${B.uid}`, B.token, { passed: true }),
  403,
);
const C = await signUp("c");
const memberProfile = { displayName: "プレイヤーC", color: "#b84a27", image: "" };
const inviteToken = `invite-${RUN}`.padEnd(40, "x");
const invitePath = `sharedInvites/${inviteToken}`;
const invite = {
  slug,
  ownerId: A.uid,
  title: "invited session",
  systemId: "coc7",
  scenarioTitle: "scenario",
  expiresAt: new Date(Date.now() + 86400000),
};
await check("owner can issue an expiring invitation", await fs("PATCH", invitePath, A.token, invite), 200);
await check("invitation link can show a safe overview", await fs("GET", invitePath), 200);
await check(
  "outsider cannot read members payload before accepting",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, C.token),
  403,
);
await check(
  "fabricated invitation cannot grant membership",
  await fs("PATCH", `${root}/members/${C.uid}`, C.token, {
    inviteId: "fabricated-token",
    hidden: false,
    linked: true,
    ...memberProfile,
  }),
  403,
);
await check(
  "invitation cannot add somebody else",
  await fs("PATCH", `${root}/members/${C.uid}`, B.token, {
    inviteId: inviteToken,
    hidden: false,
    linked: true,
    ...memberProfile,
  }),
  403,
);
await check(
  "valid invitation grants only own membership",
  await fs("PATCH", `${root}/members/${C.uid}`, C.token, {
    inviteId: inviteToken,
    hidden: false,
    linked: true,
    ...memberProfile,
  }),
  200,
);
await check(
  "accepted invitation unlocks members payload",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, C.token),
  200,
);
await check(
  "another member cannot edit a profile",
  await fs("PATCH", `${root}/members/${C.uid}?updateMask.fieldPaths=displayName`, B.token, {
    displayName: "fake",
  }),
  403,
);
await check(
  "owner cannot rewrite another member's identity",
  await fs("PATCH", `${root}/members/${C.uid}?updateMask.fieldPaths=displayName`, A.token, {
    displayName: "fake",
  }),
  403,
);
await check(
  "member can unlink themselves",
  await fs("PATCH", `${root}/members/${C.uid}?updateMask.fieldPaths=linked`, C.token, { linked: false }),
  200,
);
await check(
  "unlinked member loses payload access",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, C.token),
  403,
);
await check(
  "member cannot replace invitation credentials",
  await fs("PATCH", `${root}/members/${C.uid}`, C.token, {
    inviteId: "other-token",
    hidden: false,
    linked: true,
    ...memberProfile,
  }),
  403,
);
await check(
  "preassigned member may explicitly unlink",
  await fs("PATCH", `${root}/members/${B.uid}`, B.token, {
    inviteId: "",
    linked: false,
    hidden: true,
    ...memberProfile,
  }),
  200,
);
await check(
  "manifest membership cannot bypass self unlink",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, B.token),
  403,
);
await check(
  "preassigned member may explicitly rejoin",
  await fs("PATCH", `${root}/members/${B.uid}?updateMask.fieldPaths=linked`, B.token, { linked: true }),
  200,
);
await check(
  "expired invitations cannot be issued",
  await fs("PATCH", `${invitePath}-expired`, A.token, { ...invite, expiresAt: new Date(Date.now() - 60000) }),
  403,
);
manifest = { ...manifest, scope: "public" };
await check("owner can make the share public", await fs("PATCH", root, A.token, manifest), 200);
await check(
  "public payload is readable anonymously",
  await fs("GET", `${root}/revisions/r1/chunks/0000`),
  200,
);
await check(
  "unknown policy cannot publish publicly",
  await fs("PATCH", root, A.token, { ...manifest, scenarioPolicy: "unknown" }),
  403,
);
await fs("PATCH", `${root}/members/${B.uid}?updateMask.fieldPaths=linked`, B.token, { linked: false });
manifest = { ...manifest, scope: "passed", memberIds: [] };
await check("owner can switch to played-only", await fs("PATCH", root, A.token, manifest), 200);
await check("played-only payload is not anonymous", await fs("GET", `${root}/revisions/r1/chunks/0000`), 403);
await check(
  "played-only payload requires a server-side declaration",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, B.token),
  403,
);
await check(
  "cannot declare on behalf of another user",
  await fs("PATCH", `${root}/access/${A.uid}`, B.token, { passed: true }),
  403,
);
await check(
  "signed-in user can declare their own play",
  await fs("PATCH", `${root}/access/${B.uid}`, B.token, { passed: true }),
  200,
);
await check(
  "declaration unlocks played-only payload",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, B.token),
  200,
);
manifest = { ...manifest, scope: "members" };
await check("owner can revoke access", await fs("PATCH", root, A.token, manifest), 200);
await check(
  "existing declaration cannot bypass scope revocation",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, B.token),
  403,
);
await fs("PATCH", `${root}/revisions/r2/chunks/0000`, A.token, { data: "new", ownerId: A.uid });
manifest = { ...manifest, scope: "public", revision: "r2" };
await check("owner can activate a new revision", await fs("PATCH", root, A.token, manifest), 200);
await check(
  "old public revisions stay inaccessible",
  await fs("GET", `${root}/revisions/r1/chunks/0000`),
  403,
);
await check(
  "current public revision remains readable",
  await fs("GET", `${root}/revisions/r2/chunks/0000`),
  200,
);
await check("another user cannot delete the share", await fs("DELETE", root, B.token), 403);
await check(
  "owner can revoke a share permanently at the same URL",
  await fs("PATCH", root, A.token, {
    ...manifest,
    scope: "members",
    scenarioPolicy: "unknown",
    memberIds: [],
    revision: "revoked",
  }),
  200,
);
await check("orphaned chunks are never public", await fs("GET", `${root}/revisions/r2/chunks/0000`), 403);
await check(
  "owner can clean up orphaned chunks",
  await fs("DELETE", `${root}/revisions/r2/chunks/0000`, A.token),
  200,
);
await check(
  "revoked share URL cannot be taken over",
  await fs("PATCH", root, B.token, { ...manifest, ownerId: B.uid }),
  403,
);
await check("revoked share invitations stop working", await fs("GET", invitePath), 403);
const characterPath = `sharedCharacters/character-${RUN}`;
const characterManifest = { ownerId: A.uid, enabled: true, revision: "r1", chunkCount: 1 };
await check(
  "owner can enable character sharing",
  await fs("PATCH", characterPath, A.token, characterManifest),
  200,
);
await check(
  "owner can write character payload",
  await fs("PATCH", `${characterPath}/revisions/r1/chunks/0000`, A.token, {
    data: "shared character",
    ownerId: A.uid,
  }),
  200,
);
await check(
  "enabled character is readable anonymously",
  await fs("GET", `${characterPath}/revisions/r1/chunks/0000`),
  200,
);
await check(
  "other users cannot modify character sharing",
  await fs("PATCH", characterPath, B.token, { ...characterManifest, ownerId: B.uid }),
  403,
);
await check(
  "owner can disable character sharing",
  await fs("PATCH", characterPath, A.token, { ...characterManifest, enabled: false, revision: "revoked" }),
  200,
);
await check(
  "disabled character payload is inaccessible",
  await fs("GET", `${characterPath}/revisions/r1/chunks/0000`),
  403,
);
console.log(`ALL PASS (${checks} authorization checks; named database ${DATABASE})`);
