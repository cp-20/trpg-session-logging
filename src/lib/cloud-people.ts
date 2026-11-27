/**
 * 人のつながり（ユーザー ID と卓の招待リンク）の保存。記録の本体（cloud-state.ts）とは別の文書に置く。
 *
 * - `handles/{handle}` と `userHandles/{uid}` は同じ書き込みで一度だけ作り、どちらも変更・削除できない（P14）
 * - 人を名前で探す口は作らない。卓へは招待リンク（`tableInvites/{token}`）を受け取った人だけが加わる
 * 規則は firestore.rules、検査は scripts/emulator-smoke.ts。
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { getCloudFirestore } from "./cloud-state";
import { isValidHandle } from "./handle";
import type { Table, User } from "../types";
import type { InviteMember, TableInviteView } from "./people";
export type { InviteMember, TableInviteView } from "./people";

function database(): Firestore {
  const db = getCloudFirestore();
  if (!db) throw new Error("保存先に接続できません。");
  return db;
}

/* ================= ユーザー ID ================= */

/** その ID を使っている人の uid（だれも使っていなければ null） */
export async function fetchHandleOwner(handle: string): Promise<string | null> {
  if (!isValidHandle(handle)) return null;
  const snap = await getDocFromServer(doc(database(), "handles", handle));
  const uid = snap.exists() ? snap.data().uid : null;
  return typeof uid === "string" ? uid : null;
}

/** 自分がすでに決めた ID（別の端末で決めて、記録の保存が追いついていないときのため） */
export async function fetchOwnHandle(uid: string): Promise<string | null> {
  const snap = await getDocFromServer(doc(database(), "userHandles", uid));
  const handle = snap.exists() ? snap.data().handle : null;
  return typeof handle === "string" ? handle : null;
}

export type ClaimResult =
  | { ok: true; handle: string }
  | { ok: false; reason: "taken" | "fixed"; handle?: string };

/**
 * ID を自分のものにする。`handles/{handle}` と `userHandles/{uid}` を 1 つのトランザクションで作る。
 * もう使われていれば taken、自分がすでに別の ID を持っていれば fixed（そのときは決まっている ID を返す）
 */
export async function claimHandle(uid: string, handle: string): Promise<ClaimResult> {
  if (!isValidHandle(handle)) return { ok: false, reason: "taken" };
  const db = database();
  return runTransaction(db, async (tx) => {
    const handleRef = doc(db, "handles", handle);
    const mineRef = doc(db, "userHandles", uid);
    const [taken, mine] = await Promise.all([tx.get(handleRef), tx.get(mineRef)]);
    const current = mine.exists() ? (mine.data().handle as string) : null;
    if (current)
      return current === handle ? { ok: true, handle } : { ok: false, reason: "fixed", handle: current };
    if (taken.exists()) return { ok: false, reason: "taken" };
    tx.set(handleRef, { uid, createdAt: serverTimestamp() });
    tx.set(mineRef, { handle, createdAt: serverTimestamp() });
    return { ok: true, handle };
  });
}

/* ================= 卓の招待リンク ================= */

const IMAGE_LIMIT = 4096;
const MEMBER_LIMIT = 50;

function safeImage(image?: string): string {
  if (!image) return "";
  return new TextEncoder().encode(image).length <= IMAGE_LIMIT ? image : "";
}

export function inviteMembers(table: Table, users: Record<string, User>): InviteMember[] {
  return table.memberIds
    .map((id) => users[id])
    .filter((u): u is User => Boolean(u))
    .slice(0, MEMBER_LIMIT)
    .map((u) => ({
      uid: u.id,
      name: u.name.slice(0, 100),
      handle: u.handle ?? "",
      color: u.color,
      image: safeImage(u.image),
    }));
}

/** 招待リンクを作る（または顔ぶれを書き直す）。期限は日数。null なら無効にするまで使える */
export async function publishTableInvite(
  token: string,
  table: Table,
  users: Record<string, User>,
  ownerId: string,
  expiresAt?: string,
): Promise<void> {
  await claimTableOwnership(table.id, ownerId).catch(() => {});
  await setDoc(doc(database(), "tableInvites", token), {
    ownerId,
    tableId: table.id,
    tableName: table.name.slice(0, 100),
    image: safeImage(table.image),
    members: inviteMembers(table, users),
    createdAt: serverTimestamp(),
    ...(expiresAt ? { expiresAt: Timestamp.fromDate(new Date(expiresAt)) } : {}),
  });
}

/**
 * 招待を取り消す。参加の記録（名前・ハンドル・画像）を消してから、招待は失効の印だけにする。
 * 文書ごと消さないのは、古いトークンで別の人が招待を作り直せないようにするため（firestore.rules）
 */
export async function revokeTableInvite(token: string): Promise<void> {
  const db = database();
  const ref = doc(db, "tableInvites", token);
  const current = await getDocFromServer(ref);
  if (!current.exists() || "revokedAt" in current.data()) return;
  const joins = await getDocs(collection(db, "tableInvites", token, "joins"));
  await Promise.all(joins.docs.map((j) => deleteDoc(j.ref)));
  const { ownerId, tableId } = current.data();
  await setDoc(ref, { ownerId, tableId, revokedAt: serverTimestamp() });
}

/**
 * 卓を作った人の印（tableOwners/{tableId}）を、まだなければ書く。Discord 連携のサーバーはこれで持ち主を確かめる。
 * 最初の 1 回だけ書けて、だれも書き換えられない
 */
export async function claimTableOwnership(tableId: string, ownerId: string): Promise<void> {
  const ref = doc(database(), "tableOwners", tableId);
  if ((await getDocFromServer(ref)).exists()) return;
  await setDoc(ref, { ownerId, createdAt: serverTimestamp() });
}

/** 招待の中身。期限切れ・無効にされたもの・読めないものは null */
export async function fetchTableInvite(token: string): Promise<TableInviteView | null> {
  const snap = await getDocFromServer(doc(database(), "tableInvites", token)).catch((error) => {
    if (error?.code === "permission-denied") return null;
    throw error;
  });
  if (!snap?.exists()) return null;
  const data = snap.data();
  if ("revokedAt" in data) return null;
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : undefined;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;
  return {
    token,
    ownerId: String(data.ownerId),
    tableId: String(data.tableId),
    tableName: String(data.tableName),
    image: typeof data.image === "string" ? data.image : "",
    members: Array.isArray(data.members) ? (data.members as InviteMember[]) : [],
    expiresAt,
  };
}

/** 招待で卓に加わる。自分の名前・ID・画像を招待の下に置き、卓を作った人があとで取り込む */
export async function joinTableInvite(token: string, me: User): Promise<void> {
  await setDoc(doc(database(), "tableInvites", token, "joins", me.id), {
    handle: me.handle ?? "",
    displayName: me.name.slice(0, 100),
    color: me.color,
    image: safeImage(me.image),
    joinedAt: serverTimestamp(),
  });
}

/** 招待から加わった人（卓を作った人だけが読める） */
export async function fetchTableJoins(token: string): Promise<User[]> {
  const rows = await getDocs(collection(database(), "tableInvites", token, "joins"));
  return rows.docs.map((row) => {
    const d = row.data();
    return {
      id: row.id,
      handle: typeof d.handle === "string" && d.handle ? d.handle : undefined,
      name: String(d.displayName || "プレイヤー"),
      color: typeof d.color === "string" ? d.color : "#0e7490",
      image: typeof d.image === "string" && d.image ? d.image : undefined,
      accounts: [],
    };
  });
}

/** 加わった人を取り込んだあと、招待に載せる顔ぶれを今の卓に合わせる */
export async function refreshTableInviteMembers(
  token: string,
  table: Table,
  users: Record<string, User>,
): Promise<void> {
  await updateDoc(doc(database(), "tableInvites", token), {
    tableName: table.name.slice(0, 100),
    image: safeImage(table.image),
    members: inviteMembers(table, users),
  });
}
