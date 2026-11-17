import {
  collection, doc, getDocFromServer, getDocs, query, where, runTransaction, writeBatch,
  Timestamp, type Firestore,
} from "firebase/firestore";
import { getTakufuFirestore } from "./firebase";
import type { Character, Log, Policy, Scenario, Scope, State, User } from "../types";

// Each UTF-16 chunk is at most 480KB of UTF-8, safely below Firestore's 1MiB document limit.
const CHUNK_LENGTH = 120_000;
const MAX_CHUNKS = 200;

function database(): Firestore {
  const db = getTakufuFirestore();
  if (!db) throw new Error("保存先に接続できません。");
  return db;
}

export function splitCloudData(value: unknown): string[] {
  const json = JSON.stringify(value);
  if (json.length > CHUNK_LENGTH * MAX_CHUNKS) throw new Error("データが保存できる大きさを超えています。JSONをエクスポートしてください。");
  const chunks: string[] = [];
  for (let start = 0; start < json.length;) {
    let end = Math.min(start + CHUNK_LENGTH, json.length);
    const last = json.charCodeAt(end - 1);
    if (end < json.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(json.slice(start, end));
    start = end;
  }
  if (chunks.length > MAX_CHUNKS) throw new Error("データが保存できる大きさを超えています。JSONをエクスポートしてください。");
  return chunks;
}

async function writeChunks(db: Firestore, path: string[], chunks: string[], ownerId?: string) {
  // Keep each commit below Firestore's 10MiB request limit, even for four-byte text.
  for (let offset = 0; offset < chunks.length; offset += 10) {
    const batch = writeBatch(db);
    chunks.slice(offset, offset + 10).forEach((data, i) => batch.set(doc(db, path.join("/"), String(offset + i).padStart(4, "0")), {
      data, ...(ownerId ? { ownerId } : {}),
    }));
    await batch.commit();
  }
}

async function readChunks(db: Firestore, path: string[], chunkCount: number): Promise<unknown> {
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS) throw new Error("保存データの構成を確認できません。");
  const rows = await getDocs(collection(db, path.join("/")));
  const pieces = new Map(rows.docs.map((row) => [row.id, row.data().data]));
  const chunks = Array.from({ length: chunkCount }, (_, i) => pieces.get(String(i).padStart(4, "0")));
  if (rows.size !== chunkCount || chunks.some((chunk) => typeof chunk !== "string")) throw new Error("保存データをすべて読み込めませんでした。もう一度お試しください。");
  return JSON.parse(chunks.join(""));
}

async function removeChunks(db: Firestore, path: string[]) {
  const rows = await getDocs(collection(db, path.join("/")));
  if (rows.empty) return;
  const batch = writeBatch(db);
  rows.forEach((row) => batch.delete(row.ref));
  await batch.commit();
}

async function readGeneration(db: Firestore, manifestPath: string[], parentPath: string[]) {
  const ref = doc(db, manifestPath.join("/"));
  for (let attempt = 0; attempt < 3; attempt++) {
    const manifest = await getDocFromServer(ref);
    if (!manifest.exists() || manifest.data().enabled === false || manifest.data().revision === "revoked") return null;
    const metadata = manifest.data();
    if (typeof metadata.revision !== "string") throw new Error("保存データの構成を確認できません。");
    try {
      const payload = await readChunks(db, [...parentPath, "revisions", metadata.revision, "chunks"], metadata.chunkCount);
      return { metadata, payload };
    } catch (error) {
      const latest = await getDocFromServer(ref);
      if (attempt === 2 || latest.data()?.revision === metadata.revision) throw error;
      // Another writer activated a new generation while the old one was being read.
    }
  }
  throw new Error("記録が更新されています。もう一度お試しください。");
}

export interface CloudWorkspace { state: State; revision: string }

export function cloudStateProjection(state: State): State {
  return {
    ...state,
    characters: Object.fromEntries(Object.entries(state.characters).map(([id, character]) => [id, {
      ...character, sessions: character.sessions.map((session) => ({ ...session, rolls: session.rolls.filter((roll) => !roll.secret) })),
    }])),
    logs: Object.fromEntries(Object.entries(state.logs).map(([id, log]) => [id, {
      ...log,
      channels: log.channels.filter((channel) => !channel.secret).map((channel) => ({
        ...channel, msgs: channel.msgs.filter((message) => message.type !== "note" && !message.roll?.secret),
      })),
    }])),
  };
}

export async function loadCloudState(uid: string): Promise<CloudWorkspace | null> {
  const db = database();
  const loaded = await readGeneration(db, ["users", uid, "workspace", "current"], ["users", uid]);
  if (!loaded) return null;
  const state = loaded.payload as State;
  if (state?.me !== uid || !state.users?.[uid]) throw new Error("このアカウントの保存データを確認できません。");
  return { state, revision: loaded.metadata.revision as string };
}

export async function saveCloudState(uid: string, state: State, expectedRevision: string | null): Promise<string> {
  if (state.me !== uid || !state.users[uid]) throw new Error("サインイン中のアカウントと保存データが一致しません。");
  const db = database();
  const chunks = splitCloudData(cloudStateProjection(state));
  const revision = crypto.randomUUID();
  const chunkPath = ["users", uid, "revisions", revision, "chunks"];
  try {
    await writeChunks(db, chunkPath, chunks);
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, "users", uid, "workspace", "current");
      const current = await transaction.get(ref);
      if ((current.data()?.revision ?? null) !== expectedRevision) {
        throw new Error("別の端末で記録が更新されています。この端末のデータをエクスポートしてから、再読み込みしてください。");
      }
      transaction.set(ref, { revision, chunkCount: chunks.length, updatedAt: new Date().toISOString() });
    });
  } catch (error) {
    await removeChunks(db, chunkPath).catch(() => {});
    throw error;
  }
  // The old generation remains readable until the manifest switches successfully.
  if (expectedRevision) void removeChunks(db, ["users", uid, "revisions", expectedRevision, "chunks"]).catch(() => {});
  return revision;
}

export interface SharedLogData {
  log: Log;
  users: Record<string, User>;
  scenario?: Scenario;
}

export function sharedLogProjection(log: Log, state: State): SharedLogData {
  const scenario = log.scenarioId ? state.scenarios[log.scenarioId] : undefined;
  // Identity lives in individually controlled member documents, never in a public body snapshot.
  const players = {};
  const users: Record<string, User> = { [log.ownerId]: { id: log.ownerId, name: "非表示", color: "#64748b", accounts: [] } };
  const sharedLog: Log = {
    ...log, players,
    channels: log.channels.filter((channel) => !channel.secret).map((channel) => ({
      ...channel, msgs: channel.msgs.filter((message) => message.type !== "note" && !message.roll?.secret),
    })),
  };
  // File names may contain personal information and do not belong on public pages.
  delete sharedLog.importedFrom;
  return {
    log: sharedLog, users,
    ...(scenario ? { scenario: { ...scenario, claimedBy: undefined, addedByUid: undefined } } : {}),
  };
}

export function publicLogProjection(log: Log, state: State): SharedLogData | null {
  const scenario = log.scenarioId ? state.scenarios[log.scenarioId] : undefined;
  if (log.scope !== "public" || scenario?.policy !== "public") return null;
  return sharedLogProjection(log, state);
}

export async function publishSharedLog(log: Log, state: State): Promise<void> {
  if (log.ownerId !== state.me) throw new Error("この記録の共有設定を変更できません。");
  const db = database();
  const projection = sharedLogProjection(log, state);
  const scenarioPolicy = log.scenarioId ? state.scenarios[log.scenarioId]?.policy ?? "unknown" : "unknown";
  const scope = scenarioPolicy === "public" ? log.scope : "members";
  const chunks = splitCloudData(projection);
  const revision = crypto.randomUUID();
  const ref = doc(db, "sharedLogs", log.slug);
  const old = await getDocFromServer(ref);
  const path = ["sharedLogs", log.slug, "revisions", revision, "chunks"];
  try {
    await writeChunks(db, path, chunks, state.me);
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(ref);
      if ((current.data()?.revision ?? null) !== (old.data()?.revision ?? null)) throw new Error("共有設定が別の端末で更新されています。再読み込みしてください。");
      transaction.set(ref, {
        ownerId: state.me, scope, scenarioPolicy, revision, chunkCount: chunks.length,
        memberIds: Object.entries(log.players).filter(([, player]) => player.linked).map(([id]) => id),
      });
    });
  } catch (error) {
    await removeChunks(db, path).catch(() => {});
    throw error;
  }
  const oldRevision = old.data()?.revision;
  if (oldRevision) void removeChunks(db, ["sharedLogs", log.slug, "revisions", oldRevision, "chunks"]).catch(() => {});
  const ownMemberRef = doc(db, "sharedLogs", log.slug, "members", state.me);
  const ownMember = await getDocFromServer(ownMemberRef);
  const ownProfile = state.users[state.me];
  const profileBatch = writeBatch(db);
  profileBatch.set(ownMemberRef, {
    inviteId: ownMember.data()?.inviteId || "",
    displayName: ownProfile.name, color: ownProfile.color, image: ownProfile.image || "",
    hidden: state.prefs.hideSelfOnShare || Boolean(log.players[state.me]?.hidden), linked: true,
  });
  await profileBatch.commit();
}

export async function deleteSharedLog(slug: string): Promise<void> {
  const db = database();
  const ref = doc(db, "sharedLogs", slug);
  const manifest = await getDocFromServer(ref);
  if (!manifest.exists()) return;
  // Keep a tombstone so an old share URL cannot be taken over by another account.
  const batch = writeBatch(db);
  batch.set(ref, { ownerId: manifest.data().ownerId, scope: "members", scenarioPolicy: "unknown", memberIds: [], revision: "revoked", chunkCount: 1 });
  await batch.commit();
  const { revision } = manifest.data();
  if (revision) void removeChunks(db, ["sharedLogs", slug, "revisions", revision, "chunks"]).catch(() => {});
}

export async function fetchSharedLog(slug: string): Promise<SharedLogData | null> {
  const db = database();
  const loaded = await readGeneration(db, ["sharedLogs", slug], ["sharedLogs", slug]);
  if (!loaded) return null;
  const payload = loaded.payload as SharedLogData;
  const visibleMembers = await getDocs(query(collection(db, "sharedLogs", slug, "members"), where("hidden", "==", false), where("linked", "==", true)));
  for (const member of visibleMembers.docs) {
    const { displayName, color, image } = member.data();
    payload.users[member.id] = { id: member.id, name: displayName, color, accounts: [], ...(image ? { image } : {}) };
    payload.log.players[member.id] = { linked: true, hidden: false, characterIds: [] };
  }
  return payload;
}

export async function getSharedLogAccess(slug: string): Promise<{ scope: Scope; scenarioPolicy: Policy } | null> {
  const manifest = await getDocFromServer(doc(database(), "sharedLogs", slug));
  if (!manifest.exists()) return null;
  const { scope, scenarioPolicy, revision } = manifest.data();
  if (revision === "revoked") return null;
  return { scope, scenarioPolicy };
}

/** This is a self-declaration, not a proof of play. Rules check scope and the declaring UID. */
export async function confirmPlayedLog(slug: string): Promise<void> {
  const { getTakufuAuth } = await import("./auth");
  const user = getTakufuAuth()?.currentUser;
  if (!user) throw new Error("Googleでサインインしてから、プレイ済みか確認してください。");
  const db = database();
  const batch = writeBatch(db);
  batch.set(doc(db, "sharedLogs", slug, "access", user.uid), { passed: true });
  await batch.commit();
}

export interface SharedCharacterData {
  character: Character;
  owner: User;
  publicLogs: Record<string, string>;
}

export function sharedCharacterProjection(character: Character, state: State): SharedCharacterData {
  const { share } = character;
  const source = state.users[character.ownerId];
  const projected: Character = {
    ...character,
    bio: share.includeProfile ? character.bio : "",
    archetype: share.includeProfile ? character.archetype : "",
    tags: share.includeProfile ? character.tags : [],
    stats: share.includeStats ? character.stats : {},
    growth: share.includeGrowth ? character.growth : [],
    sessions: share.includeSessions ? character.sessions.map((session) => ({
      ...session, delta: share.includeStats ? session.delta : {}, rolls: session.rolls.filter((roll) => !roll.secret), memo: "",
    })) : [],
  };
  delete projected.import;
  const hideOwner = state.prefs.hideSelfOnShare;
  return {
    character: projected,
    owner: { id: character.ownerId, name: hideOwner ? "非表示" : source?.name || "プレイヤー", color: source?.color || "#64748b", accounts: [] },
    publicLogs: Object.fromEntries(projected.sessions.flatMap((session) => {
      const log = state.logs[session.logId];
      return log && publicLogProjection(log, state) ? [[log.id, log.slug]] : [];
    })),
  };
}

export async function publishSharedCharacter(character: Character, state: State): Promise<void> {
  if (character.ownerId !== state.me) throw new Error("このキャラクターの共有設定を変更できません。");
  if (!character.share.enabled || character.share.scope === "private") { await deleteSharedCharacter(character.id); return; }
  const db = database();
  const chunks = splitCloudData(sharedCharacterProjection(character, state));
  const revision = crypto.randomUUID();
  const ref = doc(db, "sharedCharacters", character.id);
  const old = await getDocFromServer(ref);
  const path = ["sharedCharacters", character.id, "revisions", revision, "chunks"];
  try {
    await writeChunks(db, path, chunks, state.me);
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(ref);
      if ((current.data()?.revision ?? null) !== (old.data()?.revision ?? null)) throw new Error("共有設定が別の端末で更新されています。再読み込みしてください。");
      transaction.set(ref, { ownerId: state.me, enabled: true, revision, chunkCount: chunks.length });
    });
  } catch (error) {
    await removeChunks(db, path).catch(() => {});
    throw error;
  }
  if (old.data()?.revision && old.data()?.revision !== "revoked") void removeChunks(db, ["sharedCharacters", character.id, "revisions", old.data()!.revision, "chunks"]).catch(() => {});
}

export async function deleteSharedCharacter(id: string): Promise<void> {
  const db = database();
  const ref = doc(db, "sharedCharacters", id);
  const manifest = await getDocFromServer(ref);
  if (!manifest.exists()) return;
  const { ownerId, revision } = manifest.data();
  const batch = writeBatch(db);
  batch.set(ref, { ownerId, enabled: false, revision: "revoked", chunkCount: 1 });
  await batch.commit();
  if (revision !== "revoked") void removeChunks(db, ["sharedCharacters", id, "revisions", revision, "chunks"]).catch(() => {});
}

export async function fetchSharedCharacter(id: string): Promise<SharedCharacterData | null> {
  const db = database();
  const loaded = await readGeneration(db, ["sharedCharacters", id], ["sharedCharacters", id]);
  return loaded ? loaded.payload as SharedCharacterData : null;
}

export interface SharedInvite {
  slug: string;
  title: string;
  systemId: string;
  scenarioTitle?: string;
  expiresAt: string;
}

export async function createSharedInvite(log: Log, state: State): Promise<string> {
  if (log.ownerId !== state.me) throw new Error("この記録の招待リンクを作成できません。");
  const existing = await getDocFromServer(doc(database(), "sharedLogs", log.slug));
  if (!existing.exists() || existing.data().revision === "revoked") await publishSharedLog(log, state);
  const token = crypto.randomUUID();
  const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const batch = writeBatch(database());
  batch.set(doc(database(), "sharedInvites", token), {
    slug: log.slug, ownerId: state.me, title: log.title, systemId: log.systemId,
    scenarioTitle: log.scenarioId ? state.scenarios[log.scenarioId]?.title || "" : "", expiresAt,
  });
  await batch.commit();
  return token;
}

export async function getSharedInvite(token: string): Promise<SharedInvite | null> {
  const snapshot = await getDocFromServer(doc(database(), "sharedInvites", token)).catch((error) => {
    if (error?.code === "permission-denied") return null;
    throw error;
  });
  if (!snapshot) return null;
  if (!snapshot.exists()) return null;
  const { slug, title, systemId, scenarioTitle, expiresAt } = snapshot.data();
  if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) return null;
  return { slug, title, systemId, scenarioTitle: scenarioTitle || undefined, expiresAt: expiresAt.toDate().toISOString() };
}

export async function acceptSharedInvite(token: string): Promise<SharedLogData> {
  const { getTakufuAuth } = await import("./auth");
  const user = getTakufuAuth()?.currentUser;
  if (!user) throw new Error("Googleでサインインしてから、招待を受け取ってください。");
  const invite = await getSharedInvite(token);
  if (!invite) throw new Error("招待リンクの有効期限が切れているか、招待が取り消されています。");
  const db = database();
  const ref = doc(db, "sharedLogs", invite.slug, "members", user.uid);
  const profile = (await import("./auth")).firebaseUserProfile(user);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    const identity = { displayName: profile.name, color: profile.color, image: profile.image || "" };
    if (!existing.exists()) transaction.set(ref, { inviteId: token, hidden: false, linked: true, ...identity });
    else transaction.update(ref, { linked: true, ...identity });
  });
  const shared = await fetchSharedLog(invite.slug);
  if (!shared) throw new Error("この記録は共有を終了しています。");
  return shared;
}

export async function updateSharedMembership(slug: string, state: { linked: boolean; hidden: boolean }): Promise<void> {
  const { getTakufuAuth } = await import("./auth");
  const user = getTakufuAuth()?.currentUser;
  if (!user) throw new Error("Googleでサインインしてください。");
  const db = database();
  const ref = doc(db, "sharedLogs", slug, "members", user.uid);
  const current = await getDocFromServer(ref);
  const batch = writeBatch(db);
  if (current.exists()) batch.update(ref, state);
  else {
    const profile = (await import("./auth")).firebaseUserProfile(user);
    batch.set(ref, { inviteId: "", ...state, displayName: profile.name, color: profile.color, image: profile.image || "" });
  }
  await batch.commit();
}

export async function revokeSharedMember(slug: string, uid: string): Promise<void> {
  const db = database();
  const ref = doc(db, "sharedLogs", slug, "members", uid);
  const batch = writeBatch(db);
  batch.update(ref, { linked: false });
  await batch.commit();
}
