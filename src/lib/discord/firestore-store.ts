/**
 * DiscordStore の Firestore 実装（Web SDK の firestore/lite。サーバーだけで、ボットの利用者として使う。server.ts）。
 * できることは firestore.rules の isBot() で絞る: Discord 連携の文書の読み書き、日程調整の読み取りと
 * 「メンバーの回答」「Discord のメッセージの在りか」だけの書き込み、公開中のキャラクターの一覧。
 * 卓譜の保存データ（users/{uid}）と、共有ページの中身（匿名で読めるもの以外）は読めない。
 */
import {
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore/lite";
import { upgradeLogSchedule } from "../sittings";
import { isOpenPoll, isPollAnswer, applyPollAnswer } from "./polls";
import type {
  ChannelLinkCode,
  DiscordAccount,
  DiscordStore,
  EventPost,
  PollAnswer,
  PollDoc,
  SharedCharacterInfo,
  SharedLogInfo,
  TableLink,
} from "./types";

const MAX_CHUNKS = 200;
/** 送る途中で止まったとき、この時間が過ぎた「送っている」印は取り直してよい */
const STALE_CLAIM_MS = 30 * 60_000;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function millis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v) || 0;
  return 0;
}

/** `tablePolls/{id}` を読む（壊れた値は落とす。table-polls.ts の parsePollDoc と同じ形。あちらはブラウザ用の SDK に依存する） */
export function parsePollDoc(id: string, d: Record<string, unknown>): PollDoc | null {
  const tableId = str(d.tableId);
  const ownerId = str(d.ownerId);
  if (!tableId || !ownerId || !Array.isArray(d.candidates)) return null;
  const responses: PollDoc["responses"] = {};
  const raw = d.responses && typeof d.responses === "object" ? (d.responses as Record<string, unknown>) : {};
  for (const [uid, answers] of Object.entries(raw)) {
    if (!answers || typeof answers !== "object") continue;
    const ok = Object.entries(answers as Record<string, unknown>).filter(([, v]) => isPollAnswer(v));
    if (ok.length) responses[uid] = Object.fromEntries(ok) as Record<string, PollAnswer>;
  }
  const candidates = d.candidates
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c) => ({ id: str(c.id), date: str(c.date), startTime: str(c.startTime), endTime: str(c.endTime) }))
    .filter((c) => c.id && c.date && c.startTime);
  const discord = d.discord as Record<string, unknown> | undefined;
  return {
    id,
    tableId,
    ownerId,
    ...(str(d.tableOwnerId) ? { tableOwnerId: str(d.tableOwnerId) } : {}),
    memberIds: strList(d.memberIds),
    title: str(d.title),
    candidates,
    responses,
    status: d.status === "confirmed" ? "confirmed" : "poll",
    ...(str(d.confirmedCandidateId) ? { confirmedCandidateId: str(d.confirmedCandidateId) } : {}),
    ...(discord && str(discord.guildId) && str(discord.channelId)
      ? {
          discord: {
            guildId: str(discord.guildId),
            channelId: str(discord.channelId),
            ...(str(discord.messageId) ? { messageId: str(discord.messageId) } : {}),
            ...(str(discord.scheduledEventId) ? { scheduledEventId: str(discord.scheduledEventId) } : {}),
          },
        }
      : {}),
  };
}

async function readChunks(db: Firestore, path: string, chunkCount: unknown): Promise<unknown> {
  if (
    typeof chunkCount !== "number" ||
    !Number.isInteger(chunkCount) ||
    chunkCount < 1 ||
    chunkCount > MAX_CHUNKS
  )
    return null;
  const rows = await getDocs(collection(db, path));
  const pieces = new Map(rows.docs.map((row) => [row.id, row.get("data") as unknown]));
  const chunks = Array.from({ length: chunkCount }, (_, i) => pieces.get(String(i).padStart(4, "0")));
  if (chunks.some((c) => typeof c !== "string")) return null;
  return JSON.parse(chunks.join(""));
}

export function createFirestoreStore(db: Firestore): DiscordStore {
  const ref = {
    links: (id: string) => doc(db, "discordLinks", id),
    accounts: (id: string) => doc(db, "userDiscord", id),
    states: (id: string) => doc(db, "discordOAuthStates", id),
    codes: (id: string) => doc(db, "discordLinkCodes", id),
    tables: (id: string) => doc(db, "tableDiscord", id),
    polls: (id: string) => doc(db, "tablePolls", id),
    posts: (id: string) => doc(db, "discordEvents", id),
    reminders: (id: string) => doc(db, "discordReminders", id),
  };

  function toLink(tableId: string, d: Record<string, unknown>): TableLink {
    return {
      tableId,
      ownerId: str(d.ownerId),
      memberIds: strList(d.memberIds),
      tableName: str(d.tableName),
      guildId: str(d.guildId),
      channelId: str(d.channelId),
      channelName: str(d.channelName),
      ...(d.guildName ? { guildName: str(d.guildName) } : {}),
      ...(d.voiceChannelId ? { voiceChannelId: str(d.voiceChannelId) } : {}),
      ...(d.voiceChannelName ? { voiceChannelName: str(d.voiceChannelName) } : {}),
      linkedAt: str(d.linkedAt),
    };
  }

  function toCode(d: Record<string, unknown>): ChannelLinkCode {
    return {
      guildId: str(d.guildId),
      channelId: str(d.channelId),
      channelName: str(d.channelName),
      ...(d.guildName ? { guildName: str(d.guildName) } : {}),
      ...(d.voiceChannelId ? { voiceChannelId: str(d.voiceChannelId) } : {}),
      ...(d.voiceChannelName ? { voiceChannelName: str(d.voiceChannelName) } : {}),
      requestedBy: str(d.requestedBy),
      expiresAt: millis(d.expiresAt),
    };
  }

  function toPost(eventId: string, d: Record<string, unknown>): EventPost {
    const post: EventPost = {
      eventId,
      tableId: str(d.tableId),
      guildId: str(d.guildId),
      channelId: str(d.channelId),
    };
    for (const k of ["title", "pollMessageId", "confirmMessageId", "scheduledEventId"] as const)
      if (typeof d[k] === "string") post[k] = d[k] as string;
    for (const k of ["startMs", "endMs", "confirmedAt"] as const)
      if (typeof d[k] === "number") post[k] = d[k] as number;
    return post;
  }

  return {
    async getUidForDiscordUser(discordUserId) {
      const snap = await getDoc(ref.links(discordUserId));
      const uid = snap.exists() ? str(snap.get("uid")) : "";
      if (!uid) return null;
      // 利用者は自分の userDiscord を消せる（ルール）。消したら、Discord からの回答はもうその人として扱わない
      const back = await getDoc(ref.accounts(uid));
      return back.exists() && back.get("discordUserId") === discordUserId ? uid : null;
    },
    async getAccount(uid) {
      const snap = await getDoc(ref.accounts(uid));
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        discordUserId: str(d.discordUserId),
        username: str(d.username),
        ...(d.globalName ? { globalName: str(d.globalName) } : {}),
        linkedAt: str(d.linkedAt),
      };
    },
    async linkAccount(uid, account: DiscordAccount) {
      await runTransaction(db, async (tx) => {
        const [mine, theirs] = await Promise.all([
          tx.get(ref.accounts(uid)),
          tx.get(ref.links(account.discordUserId)),
        ]);
        const oldDiscord = mine.exists() ? str(mine.get("discordUserId")) : "";
        if (oldDiscord && oldDiscord !== account.discordUserId) tx.delete(ref.links(oldDiscord));
        const otherUid = theirs.exists() ? str(theirs.get("uid")) : "";
        if (otherUid && otherUid !== uid) tx.delete(ref.accounts(otherUid));
        tx.set(ref.links(account.discordUserId), { uid, linkedAt: account.linkedAt });
        tx.set(ref.accounts(uid), account);
      });
    },
    async unlinkAccount(uid) {
      await runTransaction(db, async (tx) => {
        const mine = await tx.get(ref.accounts(uid));
        if (!mine.exists()) return;
        const discordUserId = str(mine.get("discordUserId"));
        if (discordUserId) {
          const link = await tx.get(ref.links(discordUserId));
          if (link.exists() && link.get("uid") === uid) tx.delete(link.ref);
        }
        tx.delete(mine.ref);
      });
    },
    async createOAuthState(state, uid, expiresAt) {
      // 合言葉は 32 バイトの乱数なので、すでにある文書と重ならない
      await setDoc(ref.states(state), { uid, expiresAt: Timestamp.fromMillis(expiresAt) });
    },
    async consumeOAuthState(state) {
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref.states(state));
        if (!snap.exists()) return null;
        tx.delete(snap.ref);
        return { uid: str(snap.get("uid")), expiresAt: millis(snap.get("expiresAt")) };
      });
    },
    async createLinkCode(code, data) {
      await setDoc(ref.codes(code), { ...data, expiresAt: Timestamp.fromMillis(data.expiresAt) });
    },
    async getLinkCode(code) {
      const snap = await getDoc(ref.codes(code));
      return snap.exists() ? toCode(snap.data()) : null;
    },
    async consumeLinkCode(code) {
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref.codes(code));
        if (!snap.exists()) return null;
        tx.delete(snap.ref);
        return toCode(snap.data());
      });
    },
    async getTableLink(tableId) {
      const snap = await getDoc(ref.tables(tableId));
      return snap.exists() ? toLink(tableId, snap.data()) : null;
    },
    async findTableLinkByChannel(channelId) {
      const rows = await getDocs(
        query(collection(db, "tableDiscord"), where("channelId", "==", channelId), limit(1)),
      );
      const row = rows.docs[0];
      return row ? toLink(row.id, row.data()) : null;
    },
    async setTableLink(link) {
      const { tableId, ...rest } = link;
      await setDoc(ref.tables(tableId), rest);
    },
    async updateTableLink(tableId, patch) {
      await updateDoc(ref.tables(tableId), patch);
    },
    async deleteTableLink(tableId) {
      await deleteDoc(ref.tables(tableId));
    },
    async getPoll(eventId) {
      const snap = await getDoc(ref.polls(eventId));
      return snap.exists() ? parsePollDoc(eventId, snap.data()) : null;
    },
    async setPollDiscord(eventId, discord) {
      await updateDoc(ref.polls(eventId), { discord });
    },
    async listOpenPolls(tableId) {
      const rows = await getDocs(
        query(collection(db, "tablePolls"), where("tableId", "==", tableId), limit(30)),
      );
      return rows.docs
        .map((r) => parsePollDoc(r.id, r.data()))
        .filter((p): p is PollDoc => Boolean(p && isOpenPoll(p)));
    },
    async answerPoll(eventId, uid, candidateId, value) {
      return runTransaction(db, async (tx) => {
        const pollRef = ref.polls(eventId);
        const snap = await tx.get(pollRef);
        if (!snap.exists()) return null;
        const poll = parsePollDoc(eventId, snap.data());
        const next = poll && applyPollAnswer(poll, uid, candidateId, value);
        if (!next) return null;
        // 他の人の回答と同時に書いても消し合わないよう、その人の 1 か所だけを書く（ルールもそれしか許さない）
        tx.update(
          pollRef,
          new FieldPath("responses", uid, candidateId),
          value,
          "updatedAt",
          serverTimestamp(),
        );
        return next;
      });
    },
    async getEventPost(eventId) {
      const snap = await getDoc(ref.posts(eventId));
      return snap.exists() ? toPost(eventId, snap.data()) : null;
    },
    async setEventPost(eventId, post) {
      const { eventId: _id, ...rest } = post;
      await setDoc(ref.posts(eventId), rest);
    },
    async deleteEventPost(eventId) {
      await deleteDoc(ref.posts(eventId));
    },
    async listEventPostsStartingBetween(fromMs, toMs) {
      const rows = await getDocs(
        query(
          collection(db, "discordEvents"),
          where("startMs", ">", fromMs),
          where("startMs", "<=", toMs),
          limit(200),
        ),
      );
      return rows.docs.map((r) => toPost(r.id, r.data()));
    },
    async claimReminder(key) {
      return runTransaction(db, async (tx) => {
        const markRef = ref.reminders(key);
        const snap = await tx.get(markRef);
        if (
          snap.exists() &&
          (snap.get("status") === "sent" || Date.now() - millis(snap.get("claimedAt")) < STALE_CLAIM_MS)
        )
          return false;
        tx.set(markRef, { status: "sending", claimedAt: Timestamp.now() });
        return true;
      });
    },
    async markReminderSent(key) {
      await setDoc(ref.reminders(key), { status: "sent", claimedAt: Timestamp.now() });
    },
    async releaseReminder(key) {
      await deleteDoc(ref.reminders(key));
    },
    async getSharedLog(slug) {
      // 目録（持ち主・公開の範囲）は誰でも 1 件ずつ読める。中身は、匿名で読める公開のときだけ読む（ルールもそれだけを許す）
      const manifest = await getDoc(doc(db, "sharedLogs", slug));
      if (!manifest.exists()) return null;
      const meta = manifest.data();
      const scope = meta.scope === "public" || meta.scope === "passed" ? meta.scope : "members";
      const info: SharedLogInfo = {
        ownerId: str(meta.ownerId),
        scope,
        revoked: meta.revision === "revoked" || typeof meta.revision !== "string",
      };
      if (info.revoked || scope !== "public") return info;
      const data = (await readChunks(
        db,
        `sharedLogs/${slug}/revisions/${meta.revision as string}/chunks`,
        meta.chunkCount,
      )) as { log?: Record<string, unknown>; scenario?: { title?: string } } | null;
      const log = data?.log;
      if (!log) return { ...info, revoked: true };
      if (typeof log.tableId === "string") info.tableId = log.tableId;
      upgradeLogSchedule(log);
      info.title = str(log.title);
      info.systemId = str(log.systemId);
      if (Array.isArray(log.sittings)) info.sittings = log.sittings as SharedLogInfo["sittings"];
      if (data?.scenario?.title) info.scenarioTitle = data.scenario.title;
      return info;
    },
    async listSharedCharacters(uid, max) {
      const rows = await getDocs(
        query(
          collection(db, "sharedCharacters"),
          where("ownerId", "==", uid),
          where("enabled", "==", true),
          limit(max),
        ),
      );
      const out: SharedCharacterInfo[] = [];
      for (const row of rows.docs) {
        const payload = (await readChunks(
          db,
          `sharedCharacters/${row.id}/revisions/${str(row.get("revision"))}/chunks`,
          row.get("chunkCount"),
        ).catch(() => null)) as { character?: { name?: string; systemId?: string } } | null;
        if (!payload?.character?.name) continue;
        out.push({ id: row.id, name: payload.character.name, systemId: str(payload.character.systemId) });
      }
      return out;
    },
  };
}
