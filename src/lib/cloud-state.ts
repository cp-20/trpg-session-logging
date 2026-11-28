import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  query,
  where,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { getTakufuFirestore } from "./firestore";
import { validateSharedPayload, type AcceptedShare } from "./accept-share";
import { sanitizeEditChanges } from "./edit-request";
import { mediaForSharedPage } from "./session-media";
import { identiconDataUri } from "./identicon";
import type {
  Channel,
  Character,
  Log,
  Scenario,
  ScenarioEditChanges,
  ScenarioEditRequest,
  Scope,
  State,
  User,
} from "../types";
import { upgradeLogSchedule } from "./sittings";
import {
  sessionTitle,
  UNKNOWN_SCENARIO_TITLE,
  upgradeSharedScenario,
  userScenario,
} from "./session-scenario";
import { sharedPageScope } from "./share-scope";
import { docFields, sharedScenarioDoc } from "./scenario-directory";
import { contentTag, joinWorkspace, splitWorkspace, textTag } from "./workspace-parts";

export interface CloudAuthUserLike {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  providerData?: { providerId: string; email?: string | null; displayName?: string | null }[];
}

export interface CloudRuntime {
  getFirestore: () => Firestore | null;
  getCurrentUser?: () => CloudAuthUserLike | null;
  toUserProfile?: (user: CloudAuthUserLike) => User;
}

let cloudRuntime: CloudRuntime | null = null;

/** モバイル環境など Next.js 以外のランタイムから Firestore / Auth を注入する */
export function configureCloudRuntime(runtime: CloudRuntime | null): void {
  cloudRuntime = runtime;
}

export function getCloudFirestore(): Firestore | null {
  return cloudRuntime?.getFirestore() ?? getTakufuFirestore();
}

async function resolveCurrentUserAndProfile(): Promise<{
  user: CloudAuthUserLike | null;
  profile: User | null;
}> {
  if (cloudRuntime?.getCurrentUser) {
    const user = cloudRuntime.getCurrentUser();
    if (!user) return { user: null, profile: null };
    if (cloudRuntime.toUserProfile) {
      return { user, profile: cloudRuntime.toUserProfile(user) };
    }
    return {
      user,
      profile: {
        id: user.uid,
        name: user.displayName || user.email?.split("@")[0] || "プレイヤー",
        email: user.email || undefined,
        image: user.photoURL || undefined,
        color: "#0e7490",
        accounts: [],
      },
    };
  }
  const { getTakufuAuth, firebaseUserProfile } = await import("./auth");
  const current = getTakufuAuth()?.currentUser ?? null;
  return {
    user: current,
    profile: current ? firebaseUserProfile(current) : null,
  };
}

// Each UTF-16 chunk is at most 480KB of UTF-8, safely below Firestore's 1MiB document limit.
const CHUNK_LENGTH = 120_000;
const MAX_CHUNKS = 200;

function database(): Firestore {
  const db = getCloudFirestore();
  if (!db) throw new Error("保存先に接続できません。");
  return db;
}

export function splitCloudData(value: unknown): string[] {
  const json = JSON.stringify(value);
  if (json.length > CHUNK_LENGTH * MAX_CHUNKS)
    throw new Error("データが保存できる大きさを超えています。JSONをエクスポートしてください。");
  const chunks: string[] = [];
  for (let start = 0; start < json.length;) {
    let end = Math.min(start + CHUNK_LENGTH, json.length);
    const last = json.charCodeAt(end - 1);
    if (end < json.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(json.slice(start, end));
    start = end;
  }
  if (chunks.length > MAX_CHUNKS)
    throw new Error("データが保存できる大きさを超えています。JSONをエクスポートしてください。");
  return chunks;
}

async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const count = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await worker(items[idx]!);
      }
    }),
  );
}

function safeMemberImage(img?: string): string {
  if (!img) return "";
  return new TextEncoder().encode(img).length <= 4096 ? img : "";
}

interface ChunkDoc {
  path: string[];
  data: string;
}

function chunkDocs(path: string[], chunks: string[]): ChunkDoc[] {
  return chunks.map((data, i) => ({ path: [...path, String(i).padStart(4, "0")], data }));
}

async function writeChunks(db: Firestore, docs: ChunkDoc[], ownerId?: string) {
  // Keep each commit below Firestore's 10MiB request limit, even for four-byte text.
  const batches: ReturnType<typeof writeBatch>[] = [];
  for (let offset = 0; offset < docs.length; offset += 10) {
    const batch = writeBatch(db);
    for (const { path, data } of docs.slice(offset, offset + 10))
      batch.set(doc(db, path.join("/")), { data, ...(ownerId ? { ownerId } : {}) });
    batches.push(batch);
  }
  await runConcurrent(batches, 3, (batch) => batch.commit());
}

async function readChunks(db: Firestore, path: string[], chunkCount: number): Promise<string> {
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS)
    throw new Error("保存データの構成を確認できません。");
  const rows = await getDocs(collection(db, path.join("/")));
  const pieces = new Map(rows.docs.map((row) => [row.id, row.data().data]));
  const chunks = Array.from({ length: chunkCount }, (_, i) => pieces.get(String(i).padStart(4, "0")));
  if (rows.size !== chunkCount || chunks.some((chunk) => typeof chunk !== "string"))
    throw new Error("保存データをすべて読み込めませんでした。もう一度お試しください。");
  return chunks.join("");
}

async function removeChunks(db: Firestore, path: string[]) {
  const rows = await getDocs(collection(db, path.join("/")));
  if (rows.empty) return;
  const batches: ReturnType<typeof writeBatch>[] = [];
  for (let offset = 0; offset < rows.docs.length; offset += 200) {
    const batch = writeBatch(db);
    rows.docs.slice(offset, offset + 200).forEach((row) => batch.delete(row.ref));
    batches.push(batch);
  }
  await runConcurrent(batches, 3, (batch) => batch.commit());
}

/**
 * 切れ端を書いて見出しを切り替える。通信が切れると、切り替わっていても失敗として返ることがあるので、
 * 失敗したら見出しを読み直し、切り替わっていないと確かめられたときだけ書きかけを片付ける
 */
async function switchManifest(
  ref: DocumentReference,
  revision: string,
  write: () => Promise<void>,
  discard: () => Promise<unknown>,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    const active = await getDocFromServer(ref).then(
      (manifest) => (manifest.data()?.revision as string | undefined) ?? null,
      () => undefined,
    );
    if (active === revision) return;
    if (active !== undefined) await discard().catch(() => {});
    throw error;
  }
}

async function readGeneration(db: Firestore, manifestPath: string[], parentPath: string[]) {
  const ref = doc(db, manifestPath.join("/"));
  for (let attempt = 0; attempt < 3; attempt++) {
    const manifest = await getDocFromServer(ref);
    if (!manifest.exists() || manifest.data().enabled === false || manifest.data().revision === "revoked")
      return null;
    const metadata = manifest.data();
    if (typeof metadata.revision !== "string") throw new Error("保存データの構成を確認できません。");
    try {
      const text = await readChunks(
        db,
        [...parentPath, "revisions", metadata.revision, "chunks"],
        metadata.chunkCount,
      );
      return { metadata, payload: JSON.parse(text) as unknown };
    } catch (error) {
      const latest = await getDocFromServer(ref);
      if (attempt === 2 || latest.data()?.revision === metadata.revision) throw error;
      // Another writer activated a new generation while the old one was being read.
    }
  }
  throw new Error("記録が更新されています。もう一度お試しください。");
}

export interface CloudWorkspace {
  state: State;
  revision: string;
}

/** 保存した部品（src/lib/workspace-parts.ts）の在りか */
interface CloudPart {
  /** 切れ端の置き場所 users/{uid}/revisions/{revision}/chunks */
  revision: string;
  chunkCount: number;
  /** 中身の指紋。同じなら送受信しない */
  tag: string;
}

export interface CloudWorkspaceManifest {
  revision: string;
  parts: Map<string, CloudPart>;
}

/* 見出しは 1 文書（1MiB まで）なので、部品の数に上限を置く。firestore.rules と同じ */
const MAX_PARTS = 8000;

/* 部品の在りかは 1 つの文字列で書く（map を入れ子にすると、索引の項目が 1 文書の上限 4 万に近づく） */
const encodePart = (part: CloudPart) => `${part.revision}.${part.chunkCount}.${part.tag}`;

function decodePart(value: unknown): CloudPart {
  const [revision, chunkCount, tag] = typeof value === "string" ? value.split(".") : [];
  if (!revision || !chunkCount || !tag) throw new Error("保存データの構成を確認できません。");
  return { revision, chunkCount: Number(chunkCount), tag };
}

function workspaceManifest(data: DocumentData | undefined): CloudWorkspaceManifest | null {
  if (!data) return null;
  if (typeof data.revision !== "string" || !data.parts || typeof data.parts !== "object")
    throw new Error("保存データの構成を確認できません。");
  return {
    revision: data.revision,
    parts: new Map(Object.entries(data.parts).map(([key, value]) => [key, decodePart(value)])),
  };
}

const workspaceRef = (db: Firestore, uid: string) => doc(db, "users", uid, "workspace", "manifest");
const partPath = (uid: string, part: CloudPart) => ["users", uid, "revisions", part.revision, "chunks"];

/** 記録の見出しだけを読む。revision が手元と同じなら、部品を読まなくてよい */
export async function fetchCloudWorkspaceManifest(uid: string): Promise<CloudWorkspaceManifest | null> {
  return workspaceManifest((await getDocFromServer(workspaceRef(database(), uid))).data());
}

/**
 * 記録を読む。この端末に控え（cached）があれば、中身の同じ部品はそれを使い、違う部品だけを読む。
 * いま読んだ見出し（known manifest）を渡すと、1 回目はそれを使い、見出しを読み直す往復を省く
 */
export async function loadCloudState(
  uid: string,
  cached?: State | null,
  firstManifest?: CloudWorkspaceManifest | null,
): Promise<CloudWorkspace | null> {
  const db = database();
  const known = new Map<string, unknown>();
  if (cached?.me === uid)
    for (const [key, content] of splitWorkspace(cached)) known.set(`${key} ${contentTag(content)}`, content);
  for (let attempt = 0; attempt < 3; attempt++) {
    const manifest = attempt === 0 && firstManifest ? firstManifest : await fetchCloudWorkspaceManifest(uid);
    if (!manifest) return null;
    const contents = new Map<string, unknown>();
    try {
      await runConcurrent([...manifest.parts], 8, async ([key, part]) => {
        const id = `${key} ${part.tag}`;
        if (!known.has(id)) {
          const text = await readChunks(db, partPath(uid, part), part.chunkCount);
          if (textTag(text) !== part.tag) throw new Error("保存データの構成を確認できません。");
          known.set(id, JSON.parse(text));
        }
        contents.set(key, known.get(id));
      });
    } catch (error) {
      const latest = await fetchCloudWorkspaceManifest(uid);
      if (attempt === 2 || latest?.revision === manifest.revision) throw error;
      // Another writer replaced a part while it was being read. Parts already read are kept in `known`.
      continue;
    }
    const state = joinWorkspace(contents);
    if (state.me !== uid || !state.users?.[uid])
      throw new Error("このアカウントの保存データを確認できません。");
    return { state, revision: manifest.revision };
  }
  throw new Error("記録が更新されています。もう一度お試しください。");
}

const CONFLICT =
  "別の端末で記録が更新されています。この端末のデータをエクスポートしてから、再読み込みしてください。";

/** 記録を保存する。前の保存から中身の変わった部品だけを書き、見出しをまとめて切り替える */
export async function saveCloudState(
  uid: string,
  state: State,
  expectedRevision: string | null,
): Promise<string> {
  if (state.me !== uid || !state.users[uid])
    throw new Error("ログイン中のアカウントと保存データが一致しません。");
  const db = database();
  const ref = workspaceRef(db, uid);
  const current = await fetchCloudWorkspaceManifest(uid);
  if ((current?.revision ?? null) !== expectedRevision) throw new Error(CONFLICT);

  const parts = new Map<string, CloudPart>();
  const docs: ChunkDoc[] = [];
  const written: CloudPart[] = [];
  for (const [key, content] of splitWorkspace(state)) {
    const tag = contentTag(content);
    const saved = current?.parts.get(key);
    if (saved?.tag === tag) {
      parts.set(key, saved);
      continue;
    }
    const chunks = splitCloudData(content);
    const part: CloudPart = { revision: crypto.randomUUID(), chunkCount: chunks.length, tag };
    parts.set(key, part);
    written.push(part);
    docs.push(...chunkDocs(partPath(uid, part), chunks));
  }
  if (parts.size > MAX_PARTS)
    throw new Error("データが保存できる大きさを超えています。JSONをエクスポートしてください。");
  const replaced = [...(current?.parts ?? [])].flatMap(([key, part]) =>
    parts.get(key) === part ? [] : [part],
  );
  if (current && !written.length && !replaced.length) return current.revision;

  const remove = (list: CloudPart[]) =>
    runConcurrent(list, 3, (part) => removeChunks(db, partPath(uid, part)));
  const revision = crypto.randomUUID();
  await switchManifest(
    ref,
    revision,
    async () => {
      await writeChunks(db, docs);
      await runTransaction(db, async (transaction) => {
        const latest = await transaction.get(ref);
        if ((latest.data()?.revision ?? null) !== expectedRevision) throw new Error(CONFLICT);
        transaction.set(ref, {
          revision,
          parts: Object.fromEntries([...parts].map(([key, part]) => [key, encodePart(part)])),
          updatedAt: new Date().toISOString(),
        });
      });
    },
    () => remove(written),
  );
  // Replaced parts stay readable until the manifest switches.
  void remove(replaced).catch(() => {});
  return revision;
}

export interface SharedLogData {
  log: Log;
  users: Record<string, User>;
  /** 遊んだシナリオ（セッションの呼び名）。共有シナリオ一覧に出さないシナリオでも、共有ページを読める人には見せる */
  scenario: Scenario;
}

export { sharedPageScope };

/** 共有ページの見出しの文書に書く範囲。firestore.rules の validShare を必ず満たす（share-scope.test.ts） */
export function sharedManifestAccess(log: Pick<Log, "scope">): { scope: Scope } {
  return { scope: sharedPageScope(log) };
}

/**
 * 共有ページに載せるタブ。シークレットタブを「記録した人だけ」にしたセッションは、
 * シークレットタブとシークレットダイスを写しに入れない（読む側の画面で隠すのではなく、写しに無い）
 */
export function sharedChannels(log: Pick<Log, "channels" | "secretTabs">): Channel[] {
  if (log.secretTabs !== "private") return log.channels;
  return log.channels
    .filter((c) => !c.secret)
    .map((c) => ({ ...c, msgs: c.msgs.filter((m) => !m.roll?.secret) }));
}

export function sharedLogProjection(log: Log, state: State): SharedLogData {
  const scenario: Scenario = state.scenarios[log.scenarioId] ?? {
    ...userScenario({ id: log.scenarioId, title: UNKNOWN_SCENARIO_TITLE, systemId: log.systemId, uid: "" }),
    private: true,
  };
  // Identity lives in individually controlled member documents, never in a public body snapshot.
  const players = {};
  const users: Record<string, User> = {
    [log.ownerId]: { id: log.ownerId, name: "非表示", color: "#64748b", accounts: [] },
  };
  const sharedLog: Log = {
    ...log,
    players,
    channels: sharedChannels(log),
  };
  // File names may contain personal information and do not belong on public pages.
  delete sharedLog.importedFrom;
  // 関連するもの（録画など）は、共有ページを読める人に見せてよい範囲のものだけを載せる
  const media = mediaForSharedPage(log.media, sharedPageScope(log));
  if (media.length) sharedLog.media = media;
  else delete sharedLog.media;
  return {
    log: sharedLog,
    users,
    scenario: { ...scenario, claimedBy: undefined, addedByUid: undefined },
  };
}

export function publicLogProjection(log: Log, state: State): SharedLogData | null {
  if (log.scope !== "public") return null;
  return sharedLogProjection(log, state);
}

export async function publishSharedLog(log: Log, state: State): Promise<void> {
  if (log.ownerId !== state.me) throw new Error("この記録の共有設定を変更できません。");
  const db = database();
  const projection = sharedLogProjection(log, state);
  const { scope } = sharedManifestAccess(log);
  const chunks = splitCloudData(projection);
  const revision = crypto.randomUUID();
  const ref = doc(db, "sharedLogs", log.slug);
  const old = await getDocFromServer(ref);
  const path = ["sharedLogs", log.slug, "revisions", revision, "chunks"];
  await switchManifest(
    ref,
    revision,
    async () => {
      await writeChunks(db, chunkDocs(path, chunks), state.me);
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(ref);
        if ((current.data()?.revision ?? null) !== (old.data()?.revision ?? null))
          throw new Error("共有設定が別の端末で更新されています。再読み込みしてください。");
        transaction.set(ref, {
          ownerId: state.me,
          scope,
          revision,
          chunkCount: chunks.length,
          memberIds: Object.entries(log.players)
            .filter(([, player]) => player.linked)
            .map(([id]) => id),
          // 共有を止めたときの印はルールが消させない。持ち越す
          ...(current.data()?.invitesSince ? { invitesSince: current.data()!.invitesSince } : {}),
        });
      });
    },
    () => removeChunks(db, path),
  );
  const oldRevision = old.data()?.revision;
  if (oldRevision)
    void removeChunks(db, ["sharedLogs", log.slug, "revisions", oldRevision, "chunks"]).catch(() => {});
  const ownMemberRef = doc(db, "sharedLogs", log.slug, "members", state.me);
  const ownProfile = state.users[state.me];
  const profileBatch = writeBatch(db);
  profileBatch.set(ownMemberRef, {
    inviteId: "",
    displayName: ownProfile.name,
    color: ownProfile.color,
    image: safeMemberImage(ownProfile.image),
    hidden: state.prefs.hideSelfOnShare || Boolean(log.players[state.me]?.hidden),
    linked: true,
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
  batch.set(ref, {
    ownerId: manifest.data().ownerId,
    scope: "members",
    memberIds: [],
    revision: "revoked",
    chunkCount: 1,
    // 止める前に出した招待は、同じ記録をまた共有しても効かない（firestore.rules の validInvite）
    invitesSince: serverTimestamp(),
  });
  await batch.commit();
  const { revision } = manifest.data();
  if (revision) void removeChunks(db, ["sharedLogs", slug, "revisions", revision, "chunks"]).catch(() => {});
}

export async function fetchSharedLog(slug: string): Promise<SharedLogData | null> {
  const db = database();
  const loaded = await readGeneration(db, ["sharedLogs", slug], ["sharedLogs", slug]);
  if (!loaded) return null;
  const payload = loaded.payload as SharedLogData;
  // 以前に公開したページは遊んだ時間帯を dates + t0 + t1 で持ち、セッションに名前があった。読むときに今の形にする
  upgradeLogSchedule(payload.log as unknown as Record<string, unknown>);
  upgradeSharedScenario(payload);
  const visibleMembers = await getDocs(
    query(
      collection(db, "sharedLogs", slug, "members"),
      where("hidden", "==", false),
      where("linked", "==", true),
    ),
  );
  for (const member of visibleMembers.docs) {
    const { displayName, color, image } = member.data();
    payload.users[member.id] = {
      id: member.id,
      name: displayName,
      color,
      accounts: [],
      ...(image ? { image } : {}),
    };
    payload.log.players[member.id] = { linked: true, hidden: false, characterIds: [] };
  }
  return payload;
}

export async function getSharedLogAccess(slug: string): Promise<{ scope: Scope } | null> {
  const manifest = await getDocFromServer(doc(database(), "sharedLogs", slug));
  if (!manifest.exists()) return null;
  const { scope, revision } = manifest.data();
  if (revision === "revoked") return null;
  return { scope };
}

/** This is a self-declaration, not a proof of play. Rules check scope and the declaring UID. */
export async function confirmPlayedLog(slug: string): Promise<void> {
  const { user } = await resolveCurrentUserAndProfile();
  if (!user) throw new Error("Googleでログインしてから、通過済みか確認してください。");
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
    sessions: share.includeSessions
      ? character.sessions.map((session) => ({
          ...session,
          delta: share.includeStats ? session.delta : {},
          rolls: session.rolls.filter((roll) => !roll.secret),
          memo: "",
        }))
      : [],
  };
  delete projected.import;
  /* キャラシは能力値と同じ扱い。同期の設定（URL・エラー）は共有ページに載せない */
  delete projected.externalSync;
  if (!share.includeStats) delete projected.sheet;
  const hideOwner = state.prefs.hideSelfOnShare;
  return {
    character: projected,
    owner: {
      id: character.ownerId,
      name: hideOwner ? "非表示" : source?.name || "プレイヤー",
      color: source?.color || "#64748b",
      accounts: [],
    },
    publicLogs: Object.fromEntries(
      projected.sessions.flatMap((session) => {
        const log = state.logs[session.logId];
        return log && publicLogProjection(log, state) ? [[log.id, log.slug]] : [];
      }),
    ),
  };
}

export async function publishSharedCharacter(character: Character, state: State): Promise<void> {
  if (character.ownerId !== state.me) throw new Error("このキャラクターの共有設定を変更できません。");
  if (!character.share.enabled || character.share.scope === "private") {
    await deleteSharedCharacter(character.id);
    return;
  }
  const db = database();
  const chunks = splitCloudData(sharedCharacterProjection(character, state));
  const revision = crypto.randomUUID();
  const ref = doc(db, "sharedCharacters", character.id);
  const old = await getDocFromServer(ref);
  const path = ["sharedCharacters", character.id, "revisions", revision, "chunks"];
  await switchManifest(
    ref,
    revision,
    async () => {
      await writeChunks(db, chunkDocs(path, chunks), state.me);
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(ref);
        if ((current.data()?.revision ?? null) !== (old.data()?.revision ?? null))
          throw new Error("共有設定が別の端末で更新されています。再読み込みしてください。");
        transaction.set(ref, { ownerId: state.me, enabled: true, revision, chunkCount: chunks.length });
      });
    },
    () => removeChunks(db, path),
  );
  if (old.data()?.revision && old.data()?.revision !== "revoked")
    void removeChunks(db, [
      "sharedCharacters",
      character.id,
      "revisions",
      old.data()!.revision,
      "chunks",
    ]).catch(() => {});
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
  if (revision !== "revoked")
    void removeChunks(db, ["sharedCharacters", id, "revisions", revision, "chunks"]).catch(() => {});
}

export async function fetchSharedCharacter(id: string): Promise<SharedCharacterData | null> {
  const db = database();
  const loaded = await readGeneration(db, ["sharedCharacters", id], ["sharedCharacters", id]);
  return loaded ? (loaded.payload as SharedCharacterData) : null;
}

export interface SharedInvite {
  slug: string;
  /** 招待を出した人（= 共有の持ち主）。受け取った中身の持ち主と照らし合わせる */
  ownerId: string;
  /** セッションの呼び名（= シナリオの題名） */
  title: string;
  systemId: string;
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
    slug: log.slug,
    ownerId: state.me,
    title: sessionTitle(log, state.scenarios),
    systemId: log.systemId,
    // 以前は名前とシナリオを別に持っていた。ルールが欄を求めるので空で書く
    scenarioTitle: "",
    expiresAt,
    // 外された人が入り直せるのは、外したあとに出した招待だけ（firestore.rules の rejoinInvite）
    createdAt: serverTimestamp(),
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
  const { slug, ownerId, title, systemId, scenarioTitle, expiresAt } = snapshot.data();
  if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) return null;
  return {
    slug,
    ownerId,
    // 以前の招待はセッションの名前とシナリオの題名を別に持つ。呼び名はシナリオの題名
    title: scenarioTitle || title,
    systemId,
    expiresAt: expiresAt.toDate().toISOString(),
  };
}

/**
 * 招待を受け取る。me（記録の中の自分）を渡すと、はじめの設定で決めた表示名・アイコンを参加者として載せる
 * （画像がなければユーザー ID から作った印。Google の画像は本人が選んだときだけ）
 */
export async function acceptSharedInvite(
  token: string,
  me?: User,
): Promise<{ share: AcceptedShare; slug: string; ownerId: string }> {
  const resolved = await resolveCurrentUserAndProfile();
  const { user } = resolved;
  const profile =
    resolved.profile && me && me.id === resolved.profile.id
      ? {
          ...resolved.profile,
          name: me.name,
          color: me.color,
          image: me.image || identiconDataUri(me.handle ?? me.id, "user"),
        }
      : resolved.profile;
  if (!user || !profile) throw new Error("Googleでログインしてから、招待を受け取ってください。");
  const invite = await getSharedInvite(token);
  if (!invite) throw new Error("招待リンクの有効期限が切れているか、招待が取り消されています。");
  const db = database();
  const ref = doc(db, "sharedLogs", invite.slug, "members", user.uid);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    const identity = {
      displayName: profile.name,
      color: profile.color,
      image: safeMemberImage(profile.image),
    };
    if (!existing.exists())
      transaction.set(ref, { inviteId: token, hidden: false, linked: true, ...identity });
    else transaction.update(ref, { linked: true, inviteId: token, revoked: false, ...identity });
  });
  // メンバーの文書は共有ページを読める人にも見える。入れたら招待の番号は消す（拾った人が入れないように）
  await updateDoc(ref, { inviteId: "" });
  const shared = await fetchSharedLog(invite.slug);
  if (!shared) throw new Error("この記録は共有を終了しています。");
  // 中身は共有した人が書いたもの。形を確かめてから渡す（src/lib/accept-share.ts）
  const share = validateSharedPayload(shared, user.uid);
  if (!share) throw new Error("共有された記録を読み取れませんでした。招待した人に確かめてください。");
  return { share, slug: invite.slug, ownerId: invite.ownerId };
}

export async function updateSharedMembership(
  slug: string,
  state: { linked: boolean; hidden: boolean },
): Promise<void> {
  const { user, profile } = await resolveCurrentUserAndProfile();
  if (!user || !profile) throw new Error("Googleでログインしてください。");
  const db = database();
  const ref = doc(db, "sharedLogs", slug, "members", user.uid);
  const current = await getDocFromServer(ref);
  const batch = writeBatch(db);
  if (current.exists()) batch.update(ref, state);
  else {
    batch.set(ref, {
      inviteId: "",
      ...state,
      displayName: profile.name,
      color: profile.color,
      image: safeMemberImage(profile.image),
    });
  }
  await batch.commit();
}

export async function revokeSharedMember(slug: string, uid: string): Promise<void> {
  const db = database();
  const ref = doc(db, "sharedLogs", slug, "members", uid);
  // 持ち主が足しただけで本人がまだ開いていない人は文書がない。読める根拠は memberIds だけなので、
  // 記録から外せば次の共有の更新（publishSharedLog）で memberIds から消える
  if (!(await getDocFromServer(ref)).exists()) return;
  const batch = writeBatch(db);
  // revoked: 本人が自分で linked を戻せないようにする印（戻れるのは新しい招待で入り直すときだけ。firestore.rules）
  batch.update(ref, { linked: false, revoked: true, revokedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * 自分が足したシナリオを、共有シナリオ一覧（scenarios/{id}）へ出す。サーバーの検索（/api/scenarios）がここを読む。
 * 消すことはしない（ほかの人の記録が結んでいるかもしれないため）
 */
export async function publishSharedScenario(scenario: Scenario, uid: string): Promise<void> {
  const db = database();
  await setDoc(doc(db, "scenarios", scenario.id), {
    ...docFields(sharedScenarioDoc(scenario, uid)),
    updatedAt: serverTimestamp(),
  });
}

/* ---------- シナリオの修正の提案（scenarioEditRequests/{id}。足した人だけが反映・却下する） ---------- */

const editRequestsOf = (db: Firestore) => collection(db, "scenarioEditRequests");

function toEditRequest(id: string, d: Record<string, unknown>): ScenarioEditRequest | null {
  // 中身は提案した人が書いたもの。形の違う提案は一覧に出さない（src/lib/edit-request.ts）
  const changes = sanitizeEditChanges(d.changes);
  if (!changes) return null;
  const at = d.createdAt instanceof Timestamp ? d.createdAt.toDate().toISOString() : new Date().toISOString();
  return {
    id,
    scenarioId: String(d.scenarioId ?? ""),
    uid: String(d.uid ?? ""),
    requesterName: typeof d.requesterName === "string" ? d.requesterName : undefined,
    at,
    changes,
    note: typeof d.note === "string" ? d.note : undefined,
    status: d.status === "accepted" || d.status === "rejected" ? d.status : "pending",
  };
}

/** 修正を提案する。送れるのは足した人ではない人で、足した人（ownerUid）にだけ届く */
export async function sendScenarioEditRequest(req: {
  scenarioId: string;
  ownerUid: string;
  uid: string;
  requesterName: string;
  changes: ScenarioEditChanges;
  note?: string;
}): Promise<void> {
  const db = database();
  await setDoc(doc(editRequestsOf(db)), {
    scenarioId: req.scenarioId,
    uid: req.uid,
    requesterName: req.requesterName.slice(0, 100),
    ownerUid: req.ownerUid,
    changes: Object.fromEntries(Object.entries(req.changes).filter(([, v]) => v !== undefined)),
    ...(req.note ? { note: req.note.slice(0, 1000) } : {}),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

/** そのシナリオで未決の提案: 足した人には届いているもの、ほかの人には自分が送ったもの */
export async function fetchPendingEditRequests(
  scenarioId: string,
  uid: string,
  role: "owner" | "requester",
): Promise<ScenarioEditRequest[]> {
  const db = database();
  const snap = await getDocs(
    query(
      editRequestsOf(db),
      where(role === "owner" ? "ownerUid" : "uid", "==", uid),
      where("scenarioId", "==", scenarioId),
      where("status", "==", "pending"),
      // 未決の提案を際限なく読まない（画面に出すのは新しい順ではなく届いた順の先頭）
      limit(50),
    ),
  );
  return snap.docs
    .map((d) => toEditRequest(d.id, d.data()))
    .filter((r): r is ScenarioEditRequest => r !== null)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** 足した人が、提案を反映した・却下したと記す */
export async function resolveEditRequest(id: string, status: "accepted" | "rejected"): Promise<void> {
  const db = database();
  await updateDoc(doc(editRequestsOf(db), id), { status });
}
