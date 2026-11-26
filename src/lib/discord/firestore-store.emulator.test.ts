import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, type User } from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import * as lite from "firebase/firestore/lite";
import { getTakufuAuth } from "../auth";
import { getTakufuFirestore } from "../firebase";
import { BOT_UID } from "./bot-account";
import { connectBot, type BotConnection } from "./bot-connection";
import type { DiscordStore } from "./types";

/**
 * 実際の Firestore とルール（エミュレーター）に対して、ボットの利用者として DiscordStore を確かめる。
 * 日程調整・共有ページ・キャラクターは、ふつうの利用者がルールどおりに書いたものを読む
 */
// エミュレーター（Auth 9099 / Firestore 8080）に対して動く。`pnpm run test:emulator` が立てて動かす。
// `pnpm test` では接続先が無く待ち続けるので飛ばす
const enabled = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true";
const PASSWORD = "test-password-123";

describe.skipIf(!enabled)("createFirestoreStore（ボットの利用者・エミュレーター）", () => {
  const run = crypto.randomUUID().slice(0, 8);
  let bot: BotConnection;
  let store: DiscordStore;
  let a: User;
  let b: User;

  const as = async (who: "a" | "b") =>
    signInWithEmailAndPassword(getTakufuAuth()!, `store-${who}-${run}@test.local`, PASSWORD);
  const db = () => getTakufuFirestore()!;
  const denied = { code: "permission-denied" };

  beforeAll(async () => {
    const auth = getTakufuAuth()!;
    b = (await createUserWithEmailAndPassword(auth, `store-b-${run}@test.local`, PASSWORD)).user;
    a = (await createUserWithEmailAndPassword(auth, `store-a-${run}@test.local`, PASSWORD)).user;
    bot = connectBot()!;
    store = bot.store;
  }, 30_000);

  afterAll(async () => {
    await bot?.close();
  });

  it("ボットの利用者としてログインする（uid はルールの botUid()）", async () => {
    await bot.ready();
    expect(bot.auth.currentUser?.uid).toBe(BOT_UID);
    expect(bot.auth.currentUser?.providerData[0]?.providerId).toBe("password");
  });

  it("利用者のつながりは 1 対 1 で、外すと両方消える。本人が userDiscord を消したら、もうつながっていない", async () => {
    await store.linkAccount(`a${run}`, { discordUserId: `d${run}`, username: "a", linkedAt: "x" });
    await store.linkAccount(`b${run}`, { discordUserId: `d${run}`, username: "a", linkedAt: "x" });
    expect(await store.getAccount(`a${run}`)).toBeNull();
    expect(await store.getUidForDiscordUser(`d${run}`)).toBe(`b${run}`);
    await store.unlinkAccount(`b${run}`);
    expect(await store.getUidForDiscordUser(`d${run}`)).toBeNull();

    await store.linkAccount(a.uid, { discordUserId: `da${run}`, username: "a", linkedAt: "x" });
    await as("a");
    expect((await getDoc(doc(db(), "userDiscord", a.uid))).get("discordUserId")).toBe(`da${run}`);
    await expect(getDoc(doc(db(), "userDiscord", b.uid))).rejects.toMatchObject(denied);
    await expect(getDoc(doc(db(), "discordLinks", `da${run}`))).rejects.toMatchObject(denied);
    await expect(
      setDoc(doc(db(), "userDiscord", a.uid), { discordUserId: "spoof", username: "x", linkedAt: "x" }),
    ).rejects.toMatchObject(denied);
    await deleteDoc(doc(db(), "userDiscord", a.uid));
    expect(await store.getUidForDiscordUser(`da${run}`)).toBeNull();
  });

  it("合言葉とコードは一回きり", async () => {
    await store.createOAuthState(`s${run}`, "u", 123);
    expect(await store.consumeOAuthState(`s${run}`)).toEqual({ uid: "u", expiresAt: 123 });
    expect(await store.consumeOAuthState(`s${run}`)).toBeNull();
    await store.createLinkCode(`c${run}`, {
      guildId: "g",
      channelId: `ch${run}`,
      channelName: "卓",
      requestedBy: "d",
      expiresAt: 456,
    });
    expect(await store.getLinkCode(`c${run}`)).toMatchObject({ channelId: `ch${run}`, expiresAt: 456 });
    expect(await store.consumeLinkCode(`c${run}`)).toMatchObject({ guildId: "g" });
    expect(await store.consumeLinkCode(`c${run}`)).toBeNull();
  });

  it("卓のつながりをチャンネルから探せる", async () => {
    await store.setTableLink({
      tableId: `t${run}`,
      ownerId: "u",
      memberIds: ["u"],
      tableName: "卓",
      guildId: "g",
      channelId: `ch${run}`,
      channelName: "c",
      linkedAt: "x",
    });
    expect((await store.findTableLinkByChannel(`ch${run}`))?.tableId).toBe(`t${run}`);
    await store.updateTableLink(`t${run}`, { memberIds: ["u", "v"] });
    expect((await store.getTableLink(`t${run}`))?.memberIds).toEqual(["u", "v"]);
  });

  it("回答はメンバー 1 人の 1 か所だけを書き、ほかの人の回答を消さない。メンバーでない人・確定後は書かない", async () => {
    const id = `ev${run}`;
    await as("a");
    await setDoc(doc(db(), "tablePolls", id), {
      tableId: `tp${run}`,
      ownerId: a.uid,
      memberIds: [a.uid, b.uid],
      title: "第2話",
      candidates: [{ id: "c1", date: "2026-12-01", startTime: "20:00", endTime: "23:00" }],
      responses: { [a.uid]: { c1: "ok" } },
      status: "poll",
      updatedAt: serverTimestamp(),
    });
    const next = await store.answerPoll(id, b.uid, "c1", "ng");
    expect(next?.responses).toEqual({ [a.uid]: { c1: "ok" }, [b.uid]: { c1: "ng" } });
    expect((await getDoc(doc(db(), "tablePolls", id))).get("responses")).toEqual({
      [a.uid]: { c1: "ok" },
      [b.uid]: { c1: "ng" },
    });
    expect(await store.answerPoll(id, "x", "c1", "ok")).toBeNull();
    expect((await store.listOpenPolls(`tp${run}`)).map((p) => p.id)).toEqual([id]);
    await store.setPollDiscord(id, { guildId: "g", channelId: "c", messageId: "m" });
    expect((await store.getPoll(id))?.discord).toEqual({ guildId: "g", channelId: "c", messageId: "m" });

    // ルール: ボットでも、メンバーでない人の回答・2 人分の回答・ほかの項目は書けない
    const ref = lite.doc(bot.db, "tablePolls", id);
    const write = (data: Record<string, unknown>) =>
      lite.updateDoc(ref, { ...data, updatedAt: lite.serverTimestamp() });
    await expect(write({ "responses.outsider": { c1: "ok" } })).rejects.toMatchObject(denied);
    await expect(
      write({ [`responses.${a.uid}`]: { c1: "ng" }, [`responses.${b.uid}`]: { c1: "ok" } }),
    ).rejects.toMatchObject(denied);
    await expect(write({ title: "乗っ取り" })).rejects.toMatchObject(denied);
    await expect(lite.updateDoc(ref, { discord: { guildId: "g", evil: "x" } })).rejects.toMatchObject(denied);
    await expect(lite.deleteDoc(ref)).rejects.toMatchObject(denied);

    await as("a");
    await updateDoc(doc(db(), "tablePolls", id), {
      status: "confirmed",
      confirmedCandidateId: "c1",
      updatedAt: serverTimestamp(),
    });
    expect(await store.answerPoll(id, b.uid, "c1", "ok")).toBeNull();
    await expect(write({ [`responses.${b.uid}`]: { c1: "ok" } })).rejects.toMatchObject(denied);
    expect(await store.listOpenPolls(`tp${run}`)).toEqual([]);
  });

  it("前日のお知らせの印は一度だけ取れ、外すと取り直せる", async () => {
    const key = `r${run}`;
    expect(await store.claimReminder(key)).toBe(true);
    expect(await store.claimReminder(key)).toBe(false);
    await store.releaseReminder(key);
    expect(await store.claimReminder(key)).toBe(true);
    await store.markReminderSent(key);
    expect(await store.claimReminder(key)).toBe(false);
  });

  it("始まりの時刻で予定を探す", async () => {
    const base = 4_000_000_000_000 + Math.floor(Math.random() * 1e9);
    await store.setEventPost(`p${run}`, {
      eventId: `p${run}`,
      tableId: "t",
      guildId: "g",
      channelId: "c",
      startMs: base + 10,
    });
    expect((await store.listEventPostsStartingBetween(base, base + 100)).map((p) => p.eventId)).toEqual([
      `p${run}`,
    ]);
    expect(await store.listEventPostsStartingBetween(base + 10, base + 100)).toEqual([]);
  });

  it("共有ページは、匿名で読めるときだけ中身を読む。メンバー限定の中身と保存データは読めない", async () => {
    await as("a");
    // セッションは名前を持たずシナリオの題名で呼ぶ。以前に公開したものは名前（title）だけを持つことがある
    const current = {
      log: { scenarioId: "sc1", tableId: "t1", systemId: "coc7", sittings: [{ start: 1, end: 2 }] },
      scenario: { id: "sc1", title: "霧の港" },
    };
    const legacy = { log: { title: "旧い卓", tableId: "t1", systemId: "coc7", sittings: [] } };
    const put = async (slug: string, scope: string, payload: object = current) => {
      await setDoc(doc(db(), `sharedLogs/${slug}/revisions/r/chunks/0000`), {
        data: JSON.stringify(payload),
        ownerId: a.uid,
      });
      await setDoc(doc(db(), "sharedLogs", slug), {
        ownerId: a.uid,
        scope,
        revision: "r",
        chunkCount: 1,
        memberIds: [],
      });
    };
    await put(`pub${run}`, "public");
    await put(`mem${run}`, "members");
    await put(`old${run}`, "public", legacy);
    expect(await store.getSharedLog(`pub${run}`)).toMatchObject({
      ownerId: a.uid,
      title: "霧の港",
      tableId: "t1",
      revoked: false,
    });
    expect(await store.getSharedLog(`old${run}`)).toMatchObject({ title: "旧い卓" });
    const members = await store.getSharedLog(`mem${run}`);
    expect(members).toMatchObject({ ownerId: a.uid, scope: "members", revoked: false });
    expect(members?.title).toBeUndefined();
    expect(members?.tableId).toBeUndefined();
    expect(await store.getSharedLog(`none${run}`)).toBeNull();

    await bot.ready();
    await expect(
      lite.getDoc(lite.doc(bot.db, `sharedLogs/mem${run}/revisions/r/chunks/0000`)),
    ).rejects.toMatchObject(denied);
    await expect(lite.getDocs(lite.collection(bot.db, "sharedLogs"))).rejects.toMatchObject(denied);
    await setDoc(doc(db(), `users/${a.uid}/workspace/manifest`), {
      revision: "r1",
      parts: { core: "r1.1.t" },
      updatedAt: "x",
    });
    await expect(lite.getDoc(lite.doc(bot.db, `users/${a.uid}/workspace/manifest`))).rejects.toMatchObject(
      denied,
    );
    await expect(
      lite.setDoc(lite.doc(bot.db, "sharedLogs", `bot${run}`), { ownerId: BOT_UID }),
    ).rejects.toMatchObject(denied);
  });

  it("公開しているキャラクターだけを並べる", async () => {
    await as("b");
    for (const [id, on] of [
      [`on${run}`, true],
      [`off${run}`, false],
    ] as const) {
      await setDoc(doc(db(), `sharedCharacters/${id}/revisions/r/chunks/0000`), {
        data: JSON.stringify({ character: { name: id, systemId: "coc7" } }),
        ownerId: b.uid,
      });
      await setDoc(doc(db(), "sharedCharacters", id), {
        ownerId: b.uid,
        enabled: on,
        revision: "r",
        chunkCount: 1,
      });
    }
    expect(await store.listSharedCharacters(b.uid, 10)).toEqual([
      { id: `on${run}`, name: `on${run}`, systemId: "coc7" },
    ]);
    // 公開していないものまで含む一覧は、ボットにも許さない
    await expect(
      lite.getDocs(
        lite.query(lite.collection(bot.db, "sharedCharacters"), lite.where("ownerId", "==", b.uid)),
      ),
    ).rejects.toMatchObject(denied);
  });
});
