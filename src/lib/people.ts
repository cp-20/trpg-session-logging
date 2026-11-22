/**
 * 人と卓のつながりの純粋な処理（Firebase に依存しない）。保存は cloud-people.ts。
 * - プロフィールの URL は /users/<ユーザー ID>。ID がまだない人（古い記録）は uid の URL のまま
 * - 卓へは招待リンクで加わる。名前で人を探す処理はここにも置かない（P14）
 */
import type { State, Table, TableInvite, User } from "../types";

/** プロフィールの URL */
export function userHref(u: Pick<User, "id" | "handle">): string {
  return `/users/${u.handle ?? u.id}`;
}

/** URL の末尾（ID か、古い uid）から人を探す。ID を先に見る */
export function findUserByRef(state: Pick<State, "users">, ref: string): User | undefined {
  if (!ref) return undefined;
  const byHandle = Object.values(state.users).find((u) => u.handle === ref);
  return byHandle ?? state.users[ref];
}

/** この記録の中で、その ID がほかの人に使われているか（サンプル・ログインしていないときの確かめ方） */
export function handleTakenLocally(state: Pick<State, "users" | "me">, handle: string): boolean {
  return Object.values(state.users).some((u) => u.id !== state.me && u.handle === handle);
}

/** 招待を開いた人に見せる卓の顔ぶれ（名前・ID・画像だけ。連絡先などは載せない） */
export interface InviteMember {
  uid: string;
  name: string;
  handle: string;
  color: string;
  image: string;
}

export interface TableInviteView {
  token: string;
  ownerId: string;
  tableId: string;
  tableName: string;
  image: string;
  members: InviteMember[];
  expiresAt?: string;
}

export type InviteExpiry = "7d" | "30d" | "none";

export const INVITE_EXPIRY_OPTIONS: readonly { value: InviteExpiry; label: string }[] = [
  { value: "7d", label: "7日間" },
  { value: "30d", label: "30日間" },
  { value: "none", label: "無期限" },
];

export function inviteExpiresAt(option: InviteExpiry, now = Date.now()): string | undefined {
  if (option === "none") return undefined;
  const days = option === "7d" ? 7 : 30;
  return new Date(now + days * 86_400_000).toISOString();
}

export function isInviteOpen(invite: Pick<TableInvite, "expiresAt"> | undefined, now = Date.now()): boolean {
  if (!invite) return false;
  return !invite.expiresAt || Date.parse(invite.expiresAt) > now;
}

/** 推測できない招待のトークン（64 文字の 16 進） */
export function newInviteToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/join/${token}`;
}

/** この記録の中から、そのトークンの招待が付いた卓を探す（サンプル・同じ人が開いたとき） */
export function findLocalInvite(state: Pick<State, "tables">, token: string): Table | undefined {
  if (!token) return undefined;
  return Object.values(state.tables).find((t) => t.invite?.token === token && isInviteOpen(t.invite));
}

/** 招待から加わった人を卓に足す。すでに知っている人の名前・画像は、本人が招待に書いたものに合わせる */
export function mergeTableJoins(state: State, tableId: string, joined: readonly User[]): boolean {
  const table = state.tables[tableId];
  if (!table) return false;
  let changed = false;
  for (const person of joined) {
    if (person.id === state.me) continue;
    const known = state.users[person.id];
    if (!known) {
      state.users[person.id] = { ...person, accounts: [] };
      changed = true;
    } else if (
      known.name !== person.name ||
      known.handle !== (person.handle ?? known.handle) ||
      known.image !== (person.image ?? known.image)
    ) {
      known.name = person.name;
      if (person.handle) known.handle = person.handle;
      if (person.image !== undefined) known.image = person.image;
      changed = true;
    }
    if (!table.memberIds.includes(person.id)) {
      table.memberIds.push(person.id);
      changed = true;
    }
  }
  return changed;
}

/** 招待で加わった側の記録に、卓と顔ぶれを入れる */
export function applyJoinedTable(
  state: State,
  invite: Pick<TableInviteView, "ownerId" | "tableId" | "tableName" | "image" | "members">,
): string {
  for (const m of invite.members) {
    if (m.uid === state.me || state.users[m.uid]) continue;
    state.users[m.uid] = {
      id: m.uid,
      name: m.name,
      handle: m.handle || undefined,
      color: m.color,
      image: m.image || undefined,
      accounts: [],
    };
  }
  const existing = state.tables[invite.tableId];
  const memberIds = [
    ...new Set([...invite.members.map((m) => m.uid), ...(existing?.memberIds ?? []), state.me]),
  ];
  state.tables[invite.tableId] = {
    ...existing,
    id: invite.tableId,
    name: invite.tableName,
    ownerId: invite.ownerId,
    memberIds,
    ...(invite.image ? { image: invite.image } : {}),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  return invite.tableId;
}

/**
 * 参加者の候補。名前で人を探させず、自分の卓のメンバー（よく遊ぶ順）から選ぶ（P14）。
 * 卓が決まっていればその卓のメンバーを先に出す
 */
export function memberCandidates(state: Pick<State, "tables" | "logs" | "me">, tableId?: string): string[] {
  const score = new Map<string, number>();
  const bump = (id: string, n: number) => score.set(id, (score.get(id) ?? 0) + n);
  for (const t of Object.values(state.tables)) {
    if (!t.memberIds.includes(state.me) && t.ownerId !== state.me) continue;
    for (const m of t.memberIds) bump(m, t.id === tableId ? 1000 : 1);
  }
  for (const l of Object.values(state.logs)) {
    if (!l.tableId) continue;
    const t = state.tables[l.tableId];
    if (!t || (!t.memberIds.includes(state.me) && t.ownerId !== state.me)) continue;
    for (const m of t.memberIds) bump(m, 0.01);
  }
  score.delete(state.me);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
