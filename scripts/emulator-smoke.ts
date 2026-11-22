/** Run against the repository's named-database emulators; no production data is touched. */
import assert from "node:assert/strict";
import http from "node:http";
import { BOT_UID, EMULATOR_BOT, ensureEmulatorBotUser } from "../src/lib/discord/bot-account.ts";

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
  "public scope is readable regardless of scenario (legacy unknown policy key is accepted)",
  await fs("PATCH", root, A.token, { ...manifest, scenarioPolicy: "unknown" }),
  200,
);
await check(
  "public payload stays readable anonymously with a legacy unknown policy",
  await fs("GET", `${root}/revisions/r1/chunks/0000`),
  200,
);
await check("owner restores the manifest without a policy", await fs("PATCH", root, A.token, manifest), 200);
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

// ===== ユーザー ID（handles / userHandles）: 一意・一度だけ・変えられない =====
const docName = (path: string) => `projects/${PROJECT}/databases/${DATABASE}/documents/${path}`;
const commit = (token: string | null, writes: { path: string; data: Record<string, unknown> }[]) =>
  req(
    FIRESTORE_PORT,
    `/v1/projects/${PROJECT}/databases/${DATABASE}/documents:commit`,
    "POST",
    {
      writes: writes.map((w) => ({
        update: { name: docName(w.path), ...fields(w.data) },
        currentDocument: { exists: false },
      })),
    },
    token,
  );
const claim = (who: { uid: string; token: string }, handle: string) =>
  commit(who.token, [
    { path: `handles/${handle}`, data: { uid: who.uid, createdAt: new Date() } },
    { path: `userHandles/${who.uid}`, data: { handle, createdAt: new Date() } },
  ]);
const handleA = `ha${RUN}`.slice(0, 20);
const handleB = `hb${RUN}`.slice(0, 20);
await check(
  "handle cannot be claimed alone without the reverse record",
  await fs("PATCH", `handles/${handleA}`, A.token, { uid: A.uid, createdAt: new Date() }),
  403,
);
await check(
  "reverse record cannot be written alone",
  await fs("PATCH", `userHandles/${A.uid}`, A.token, { handle: handleA, createdAt: new Date() }),
  403,
);
await check("reserved handles are rejected", await claim(A, "settings"), 403);
await check("malformed handles are rejected", await claim(A, "Bad-Handle"), 403);
await check("handles with double underscores are rejected", await claim(A, "ab__cd"), 403);
await check(
  "cannot claim a handle for somebody else",
  await commit(B.token, [
    { path: `handles/${handleA}`, data: { uid: A.uid, createdAt: new Date() } },
    { path: `userHandles/${A.uid}`, data: { handle: handleA, createdAt: new Date() } },
  ]),
  403,
);
await check("a user can claim one handle atomically", await claim(A, handleA), 200);
await check("anyone can check whether a handle is taken", await fs("GET", `handles/${handleA}`), 200);
await check("handles cannot be listed (no searching people)", await fs("GET", "handles", B.token), 403);
await check("reverse records cannot be listed", await fs("GET", "userHandles", B.token), 403);
await check(
  "another user cannot read the reverse record",
  await fs("GET", `userHandles/${A.uid}`, B.token),
  403,
);
await check("owner can read the reverse record", await fs("GET", `userHandles/${A.uid}`, A.token), 200);
await check("a taken handle cannot be claimed again", await claim(B, handleA), 403);
await check("a user cannot claim a second handle", await claim(A, `${handleA}x`.slice(0, 20)), 403);
await check(
  "handles cannot be renamed",
  await fs("PATCH", `userHandles/${A.uid}`, A.token, { handle: "renamed", createdAt: new Date() }),
  403,
);
await check(
  "handles cannot be reassigned",
  await fs("PATCH", `handles/${handleA}`, A.token, { uid: B.uid, createdAt: new Date() }),
  403,
);
await check("handles cannot be released", await fs("DELETE", `handles/${handleA}`, A.token), 403);
await check("reverse records cannot be deleted", await fs("DELETE", `userHandles/${A.uid}`, A.token), 403);
await check("the user listing endpoint stays closed", await fs("GET", "users", B.token), 403);

// ===== 卓の招待リンク（tableInvites/{token}/joins/{uid}） =====
const tableToken = `table-${RUN}`.padEnd(40, "t");
const tableInvitePath = `tableInvites/${tableToken}`;
const tableInviteDoc = {
  ownerId: A.uid,
  tableId: "t_smoke",
  tableName: "スモーク卓",
  image: "",
  members: [{ uid: A.uid, name: "A", handle: handleA, color: "#123456", image: "" }],
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 7 * 86400000),
};
const joinDoc = (handle: string) => ({
  handle,
  displayName: "B",
  color: "#654321",
  image: "",
  joinedAt: new Date(),
});
await check(
  "short invite tokens are rejected",
  await fs("PATCH", "tableInvites/short", A.token, tableInviteDoc),
  403,
);
await check(
  "cannot issue an invite for somebody else",
  await fs("PATCH", `${tableInvitePath}-x`, B.token, tableInviteDoc),
  403,
);
await check(
  "invites cannot outlive 31 days",
  await fs("PATCH", `${tableInvitePath}-long`, A.token, {
    ...tableInviteDoc,
    expiresAt: new Date(Date.now() + 40 * 86400000),
  }),
  403,
);
await check(
  "owner can issue a table invite",
  await fs("PATCH", tableInvitePath, A.token, tableInviteDoc),
  200,
);
const { expiresAt: _omit, ...openEnded } = tableInviteDoc;
await check(
  "owner can issue an invite without expiry",
  await fs("PATCH", `${tableInvitePath}-open`, A.token, openEnded),
  200,
);
await check("anonymous cannot open a table invite", await fs("GET", tableInvitePath), 403);
await check("a signed-in link holder can open the invite", await fs("GET", tableInvitePath, B.token), 200);
await check("table invites cannot be listed", await fs("GET", "tableInvites", B.token), 403);
await check(
  "joining requires an own handle",
  await fs("PATCH", `${tableInvitePath}/joins/${C.uid}`, C.token, joinDoc("")),
  403,
);
await check("B claims a handle", await claim(B, handleB), 200);
await check(
  "joining with another person's handle is rejected",
  await fs("PATCH", `${tableInvitePath}/joins/${B.uid}`, B.token, joinDoc(handleA)),
  403,
);
await check(
  "cannot join on behalf of somebody else",
  await fs("PATCH", `${tableInvitePath}/joins/${C.uid}`, B.token, joinDoc(handleB)),
  403,
);
await check(
  "link holder can join with their own handle",
  await fs("PATCH", `${tableInvitePath}/joins/${B.uid}`, B.token, joinDoc(handleB)),
  200,
);
await check(
  "joined members cannot list other joins",
  await fs("GET", `${tableInvitePath}/joins`, B.token),
  403,
);
await check("owner can list who joined", await fs("GET", `${tableInvitePath}/joins`, A.token), 200);
await check(
  "joined members cannot rewrite the invite",
  await fs("PATCH", tableInvitePath, B.token, { ...tableInviteDoc, ownerId: B.uid }),
  403,
);
await check(
  "owner cannot move an invite to another table",
  await fs("PATCH", tableInvitePath, A.token, { ...tableInviteDoc, tableId: "t_other" }),
  403,
);
await check("owner can revoke the invite", await fs("DELETE", tableInvitePath, A.token), 200);
await check("revoked invites cannot be opened", await fs("GET", tableInvitePath, B.token), 403);
await check(
  "revoked invites cannot be joined",
  await fs("PATCH", `${tableInvitePath}/joins/${B.uid}`, B.token, joinDoc(handleB)),
  403,
);

// ===== 卓の日程調整（tablePolls）: 定義は作った人、回答は各メンバーが自分の分だけ =====
const pollPath = `tablePolls/ev_`;
const D = await signUp("d-poll");
/** updatedAt はサーバーの時刻（規則で request.time と比べる）。mask を渡すとその項目だけ書き換える */
const pollWrite = (token: string | null, data: Record<string, unknown>, mask?: string[]) =>
  req(
    FIRESTORE_PORT,
    `/v1/projects/${PROJECT}/databases/${DATABASE}/documents:commit`,
    "POST",
    {
      writes: [
        {
          update: { name: docName(pollPath), ...fields(data) },
          ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
          updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
        },
      ],
    },
    token,
  );
const pollQuery = (token: string, uid: string) =>
  req(
    FIRESTORE_PORT,
    `/v1/projects/${PROJECT}/databases/${DATABASE}/documents:runQuery`,
    "POST",
    {
      structuredQuery: {
        from: [{ collectionId: "tablePolls" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "memberIds" },
            op: "ARRAY_CONTAINS",
            value: { stringValue: uid },
          },
        },
      },
    },
    token,
  );
const pollDoc = {
  tableId: "t_poll",
  ownerId: A.uid,
  tableOwnerId: C.uid,
  memberIds: [A.uid, B.uid, C.uid],
  title: "第2話",
  candidates: [
    { id: "c1", date: "2026-12-05", startTime: "20:00", endTime: "23:00" },
    { id: "c2", date: "2026-12-06", startTime: "20:00", endTime: "23:00" },
  ],
  responses: { [A.uid]: { c1: "ok" } },
  status: "poll",
};
const mine = (uid: string) => `responses.\`${uid}\``;
await check("only the creator can publish a poll as owner", await pollWrite(B.token, { ...pollDoc }), 403);
await check(
  "a poll must list its creator among the members",
  await pollWrite(A.token, { ...pollDoc, memberIds: [B.uid] }),
  403,
);
await check("creator can publish a poll", await pollWrite(A.token, pollDoc), 200);
await check("member can read the poll", await fs("GET", pollPath, B.token), 200);
await check("outsider cannot read the poll", await fs("GET", pollPath, D.token), 403);
await check("anonymous cannot read the poll", await fs("GET", pollPath), 403);
await check("member can list polls that include them", await pollQuery(B.token, B.uid), 200);
await check("polls cannot be listed for somebody else", await pollQuery(D.token, B.uid), 403);
await check("polls cannot be listed without a member filter", await fs("GET", "tablePolls", B.token), 403);
await check(
  "member can write their own answers",
  await pollWrite(B.token, { responses: { [B.uid]: { c1: "ok", c2: "maybe" } } }, [mine(B.uid)]),
  200,
);
await check(
  "member cannot write somebody else's answers",
  await pollWrite(B.token, { responses: { [A.uid]: { c1: "ng" } } }, [mine(A.uid)]),
  403,
);
await check(
  "answers must be ok / maybe / ng",
  await pollWrite(B.token, { responses: { [B.uid]: { c1: "yes" } } }, [mine(B.uid)]),
  403,
);
await check(
  "member cannot change the candidates",
  await pollWrite(B.token, { title: "hijack" }, ["title"]),
  403,
);
await check(
  "outsider cannot answer",
  await pollWrite(D.token, { responses: { [D.uid]: { c1: "ok" } } }, [mine(D.uid)]),
  403,
);
await check(
  "member cannot confirm",
  await pollWrite(B.token, { status: "confirmed", confirmedCandidateId: "c1" }, [
    "status",
    "confirmedCandidateId",
  ]),
  403,
);
await check("member cannot delete the poll", await fs("DELETE", pollPath, B.token), 403);

// ===== Discord 連携のボット（firestore.rules の isBot()）: 決まった uid の利用者だけ、決まったことだけ =====
await ensureEmulatorBotUser({ authUrl: `http://127.0.0.1:${AUTH_PORT}`, projectId: PROJECT });
const botLogin = await req(
  AUTH_PORT,
  "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
  "POST",
  { ...EMULATOR_BOT, returnSecureToken: true },
);
assert.equal(botLogin.body?.localId, BOT_UID);
const BOT = String(botLogin.body?.idToken);
const discordWrite = (token: string, data: Record<string, unknown>) =>
  req(
    FIRESTORE_PORT,
    `/v1/projects/${PROJECT}/databases/${DATABASE}/documents:commit`,
    "POST",
    {
      writes: [
        { update: { name: docName(pollPath), ...fields(data) }, updateMask: { fieldPaths: ["discord"] } },
      ],
    },
    token,
  );
await check("bot can read a poll", await fs("GET", pollPath, BOT), 200);
await check(
  "bot can answer for one member",
  await pollWrite(BOT, { responses: { [B.uid]: { c1: "maybe" } } }, [mine(B.uid)]),
  200,
);
await check(
  "bot cannot answer for an outsider",
  await pollWrite(BOT, { responses: { [D.uid]: { c1: "ok" } } }, [mine(D.uid)]),
  403,
);
await check(
  "bot cannot answer for two people at once",
  await pollWrite(BOT, { responses: { [A.uid]: { c1: "ng" }, [B.uid]: { c1: "ng" } } }, [
    mine(A.uid),
    mine(B.uid),
  ]),
  403,
);
await check("bot cannot edit the poll", await pollWrite(BOT, { title: "hijack" }, ["title"]), 403);
await check(
  "bot can note where the Discord message is",
  await discordWrite(BOT, { discord: { guildId: "g", channelId: "c", messageId: "m" } }),
  200,
);
await check(
  "members cannot write the Discord message link",
  await discordWrite(B.token, { discord: { guildId: "g", channelId: "c" } }),
  403,
);
await check("bot cannot delete the poll", await fs("DELETE", pollPath, BOT), 403);
await check("bot cannot read a private workspace", await fs("GET", `${own}/workspace/current`, BOT), 403);
await check(
  "bot cannot read a members-only share payload",
  await fs("GET", `${root}/revisions/r1/chunks/0000`, BOT),
  403,
);
await check(
  "bot can keep Discord links",
  await fs("PATCH", `discordLinks/d-${RUN}`, BOT, { uid: B.uid }),
  200,
);
await check("users cannot read Discord links", await fs("GET", `discordLinks/d-${RUN}`, B.token), 403);
await check(
  "bot can keep a user's Discord account",
  await fs("PATCH", `userDiscord/${B.uid}`, BOT, { discordUserId: `d-${RUN}`, username: "b" }),
  200,
);
await check(
  "users can read their own Discord account",
  await fs("GET", `userDiscord/${B.uid}`, B.token),
  200,
);
await check(
  "users cannot read others' Discord account",
  await fs("GET", `userDiscord/${B.uid}`, A.token),
  403,
);
await check(
  "users cannot write their Discord account",
  await fs("PATCH", `userDiscord/${B.uid}`, B.token, { discordUserId: "spoof", username: "b" }),
  403,
);
await check(
  "users can unlink their Discord account",
  await fs("DELETE", `userDiscord/${B.uid}`, B.token),
  200,
);
await check(
  "creator cannot move the poll to another table",
  await pollWrite(A.token, { ...pollDoc, tableId: "t_other" }),
  403,
);
await check(
  "table owner can only confirm, not edit",
  await pollWrite(C.token, { title: "renamed" }, ["title"]),
  403,
);
await check(
  "table owner can confirm a candidate",
  await pollWrite(C.token, { status: "confirmed", confirmedCandidateId: "c2" }, [
    "status",
    "confirmedCandidateId",
  ]),
  200,
);
await check(
  "answers close once confirmed",
  await pollWrite(B.token, { responses: { [B.uid]: { c1: "ng" } } }, [mine(B.uid)]),
  403,
);
await check("creator can delete the poll", await fs("DELETE", pollPath, A.token), 200);
console.log(`ALL PASS (${checks} authorization checks; named database ${DATABASE})`);
