import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { describe, it } from "vitest";
import { ALICE, BOB, BOT_UID, CAROL, anon, as, asOtherProvider, bot, seed, useRulesEnv } from "./env";

useRulesEnv();

const TOKEN = "i".repeat(32);
const DAY = 24 * 60 * 60 * 1000;

function tableInvite(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: ALICE,
    tableId: "table1",
    tableName: "水曜卓",
    image: "",
    members: [],
    createdAt: Timestamp.now(),
    ...overrides,
  };
}
function join(overrides: Record<string, unknown> = {}) {
  return {
    handle: "bob_01",
    displayName: "ボブ",
    color: "#112233",
    image: "",
    joinedAt: Timestamp.now(),
    ...overrides,
  };
}
async function seedInvite(overrides: Record<string, unknown> = {}) {
  await seed(async (db) => {
    await setDoc(doc(db, "tableInvites", TOKEN), tableInvite(overrides));
    await setDoc(doc(db, "userHandles", BOB), { handle: "bob_01", createdAt: Timestamp.now() });
  });
}

describe("tableInvites/{token}", () => {
  it("ログインした人は自分の卓の招待を作れる", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "tableInvites", TOKEN), tableInvite()));
  });

  it("他人を持ち主にした招待や、短いトークンの招待は作れない", async () => {
    await assertFails(setDoc(doc(as(BOB), "tableInvites", TOKEN), tableInvite()));
    await assertFails(setDoc(doc(as(ALICE), "tableInvites", "short"), tableInvite()));
  });

  it("期限が 31 日より先の招待は作れない", async () => {
    const expiresAt = Timestamp.fromMillis(Date.now() + 32 * DAY);

    await assertFails(setDoc(doc(as(ALICE), "tableInvites", TOKEN), tableInvite({ expiresAt })));
  });

  it("メンバーが 51 人以上の招待は作れない", async () => {
    const members = Array.from({ length: 51 }, (_, i) => `m${i}`);

    await assertFails(setDoc(doc(as(ALICE), "tableInvites", TOKEN), tableInvite({ members })));
  });

  it("有効な招待は、リンクを知るログインした人だけが読める", async () => {
    await seedInvite();

    await assertSucceeds(getDoc(doc(as(BOB), "tableInvites", TOKEN)));
    await assertFails(getDoc(doc(anon(), "tableInvites", TOKEN)));
    await assertFails(getDocs(collection(as(BOB), "tableInvites")));
  });

  it("期限切れの招待は持ち主だけが読める", async () => {
    await seedInvite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) });

    await assertFails(getDoc(doc(as(BOB), "tableInvites", TOKEN)));
    await assertSucceeds(getDoc(doc(as(ALICE), "tableInvites", TOKEN)));
  });

  it("持ち主は卓の名前を変えられるが、卓そのもの（tableId）は変えられない", async () => {
    await seedInvite();
    const ref = doc(as(ALICE), "tableInvites", TOKEN);

    await assertSucceeds(updateDoc(ref, { tableName: "木曜卓" }));
    await assertFails(updateDoc(ref, { tableId: "table2" }));
  });

  it("持ち主でない人は招待を書き換えも消しもできない", async () => {
    await seedInvite();
    const ref = doc(as(BOB), "tableInvites", TOKEN);

    await assertFails(setDoc(ref, tableInvite({ ownerId: BOB })));
    await assertFails(deleteDoc(ref));
  });
});

describe("tableInvites/{token}/joins/{userId}", () => {
  it("招待を受けた人は、自分のユーザー ID で加わる印を書ける", async () => {
    await seedInvite();

    await assertSucceeds(setDoc(doc(as(BOB), "tableInvites", TOKEN, "joins", BOB), join()));
  });

  it("自分のものでないユーザー ID を名乗って加われない", async () => {
    await seedInvite();

    await assertFails(
      setDoc(doc(as(BOB), "tableInvites", TOKEN, "joins", BOB), join({ handle: "alice_01" })),
    );
  });

  it("他人の分の加わる印は書けない", async () => {
    await seedInvite();

    await assertFails(setDoc(doc(as(CAROL), "tableInvites", TOKEN, "joins", BOB), join()));
  });

  it("期限切れの招待には加われない", async () => {
    await seedInvite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) });

    await assertFails(setDoc(doc(as(BOB), "tableInvites", TOKEN, "joins", BOB), join()));
  });

  it("加わる印の色が #RRGGBB でないと書けない", async () => {
    await seedInvite();

    await assertFails(setDoc(doc(as(BOB), "tableInvites", TOKEN, "joins", BOB), join({ color: "blue" })));
  });

  it("加わる印は本人と卓の持ち主だけが読め、一覧は持ち主だけができる", async () => {
    await seedInvite();
    await seed((db) => setDoc(doc(db, "tableInvites", TOKEN, "joins", BOB), join()));

    await assertSucceeds(getDoc(doc(as(BOB), "tableInvites", TOKEN, "joins", BOB)));
    await assertSucceeds(getDoc(doc(as(ALICE), "tableInvites", TOKEN, "joins", BOB)));
    await assertFails(getDoc(doc(as(CAROL), "tableInvites", TOKEN, "joins", BOB)));
    await assertSucceeds(getDocs(collection(as(ALICE), "tableInvites", TOKEN, "joins")));
    await assertFails(getDocs(collection(as(BOB), "tableInvites", TOKEN, "joins")));
  });

  it("加わる印は本人も卓の持ち主も消せるが、ほかの人は消せない", async () => {
    await seedInvite();
    await seed(async (db) => {
      await setDoc(doc(db, "tableInvites", TOKEN, "joins", BOB), join());
      await setDoc(doc(db, "tableInvites", TOKEN, "joins", CAROL), join());
    });

    await assertFails(deleteDoc(doc(as(CAROL), "tableInvites", TOKEN, "joins", BOB)));
    await assertSucceeds(deleteDoc(doc(as(BOB), "tableInvites", TOKEN, "joins", BOB)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), "tableInvites", TOKEN, "joins", CAROL)));
  });
});

const POLL = "event1";
function poll(overrides: Record<string, unknown> = {}) {
  return {
    tableId: "table1",
    ownerId: ALICE,
    tableOwnerId: CAROL,
    memberIds: [ALICE, BOB],
    title: "次回",
    candidates: [{ id: "c1" }],
    responses: {},
    status: "poll",
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}
async function seedPoll(overrides: Record<string, unknown> = {}) {
  await seed((db) => setDoc(doc(db, "tablePolls", POLL), poll(overrides)));
}

describe("tablePolls/{eventId}", () => {
  it("ログインした人は自分をメンバーに含めた日程調整を作れる", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "tablePolls", POLL), poll()));
  });

  it("自分を含めない日程調整や、他人を作った人にした日程調整は作れない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "tablePolls", POLL), poll({ memberIds: [BOB] })));
    await assertFails(setDoc(doc(as(BOB), "tablePolls", POLL), poll()));
  });

  it("updatedAt がサーバーの時刻でない日程調整は作れない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "tablePolls", POLL), poll({ updatedAt: Timestamp.now() })));
  });

  it("候補が 0 件や 31 件以上の日程調整は作れない", async () => {
    const alice = as(ALICE);
    const many = Array.from({ length: 31 }, (_, i) => ({ id: `c${i}` }));

    await assertFails(setDoc(doc(alice, "tablePolls", POLL), poll({ candidates: [] })));
    await assertFails(setDoc(doc(alice, "tablePolls", POLL), poll({ candidates: many })));
  });

  it("日程調整はメンバーだけが読める", async () => {
    await seedPoll();

    await assertSucceeds(getDoc(doc(as(BOB), "tablePolls", POLL)));
    await assertFails(getDoc(doc(as(CAROL), "tablePolls", POLL)));
    await assertFails(getDoc(doc(anon(), "tablePolls", POLL)));
  });

  it("まだない日程調整は、ログインした人なら読める（はじめて書き出すときの確かめ）", async () => {
    await assertSucceeds(getDoc(doc(as(ALICE), "tablePolls", POLL)));
  });

  it("日程調整の一覧は自分を含む問い合わせだけができる", async () => {
    await seedPoll();
    const bob = as(BOB);

    await assertSucceeds(
      getDocs(query(collection(bob, "tablePolls"), where("memberIds", "array-contains", BOB))),
    );
    await assertFails(getDocs(collection(bob, "tablePolls")));
  });

  it("メンバーは調整中に自分の回答だけを書ける", async () => {
    await seedPoll();
    const ref = doc(as(BOB), "tablePolls", POLL);

    await assertSucceeds(
      updateDoc(ref, { [`responses.${BOB}`]: { c1: "ok" }, updatedAt: serverTimestamp() }),
    );
  });

  it("メンバーは他人の回答を書けない", async () => {
    await seedPoll();
    const ref = doc(as(BOB), "tablePolls", POLL);

    await assertFails(updateDoc(ref, { [`responses.${ALICE}`]: { c1: "ng" }, updatedAt: serverTimestamp() }));
  });

  it("回答は ok / maybe / ng のどれかでないと書けない", async () => {
    await seedPoll();
    const ref = doc(as(BOB), "tablePolls", POLL);

    await assertFails(updateDoc(ref, { [`responses.${BOB}`]: { c1: "yes" }, updatedAt: serverTimestamp() }));
  });

  it("メンバーは題名を書き換えられない", async () => {
    await seedPoll();

    await assertFails(
      updateDoc(doc(as(BOB), "tablePolls", POLL), { title: "勝手な題", updatedAt: serverTimestamp() }),
    );
  });

  it("確定したあとは、メンバーは回答を書けない", async () => {
    await seedPoll({ status: "confirmed", confirmedCandidateId: "c1" });

    await assertFails(
      updateDoc(doc(as(BOB), "tablePolls", POLL), {
        [`responses.${BOB}`]: { c1: "ok" },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("作った人は題名を書き換えられるが、卓（tableId）は変えられない", async () => {
    await seedPoll();
    const ref = doc(as(ALICE), "tablePolls", POLL);

    await assertSucceeds(updateDoc(ref, { title: "次々回", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { tableId: "table2", updatedAt: serverTimestamp() }));
  });

  it("卓の作成者は調整中の日程を確定できる", async () => {
    await seedPoll();

    await assertSucceeds(
      updateDoc(doc(as(CAROL), "tablePolls", POLL), {
        status: "confirmed",
        confirmedCandidateId: "c1",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("卓の作成者は確定以外の書き換えはできない", async () => {
    await seedPoll();

    await assertFails(
      updateDoc(doc(as(CAROL), "tablePolls", POLL), { title: "x", updatedAt: serverTimestamp() }),
    );
  });

  it("ボットはメンバー 1 人の回答を書ける", async () => {
    await seedPoll();

    await assertSucceeds(
      updateDoc(doc(bot(), "tablePolls", POLL), {
        [`responses.${BOB}`]: { c1: "maybe" },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("ボットはメンバーでない人の回答や、2 人分の回答を書けない", async () => {
    await seedPoll();
    const ref = doc(bot(), "tablePolls", POLL);

    await assertFails(updateDoc(ref, { [`responses.${CAROL}`]: { c1: "ok" }, updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(ref, {
        [`responses.${ALICE}`]: { c1: "ok" },
        [`responses.${BOB}`]: { c1: "ok" },
        updatedAt: serverTimestamp(),
      }),
    );
  });

  // BUG: ボットの回答の書き込みは validAnswers() を通さないので、ok / maybe / ng 以外の値や大きな値を書ける
  //（メンバー本人の書き込みには validAnswers がある）。firestore.rules の isBot() の回答の分岐に validAnswers を足すべき
  it.fails("ボットも ok / maybe / ng 以外の回答は書けない", async () => {
    await seedPoll();

    await assertFails(
      updateDoc(doc(bot(), "tablePolls", POLL), {
        [`responses.${BOB}`]: "anything",
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it("ボットは Discord のメッセージの在りかを書ける", async () => {
    await seedPoll();

    await assertSucceeds(
      updateDoc(doc(bot(), "tablePolls", POLL), {
        discord: { guildId: "g", channelId: "c", messageId: "m" },
      }),
    );
  });

  it("ボットは題名を書き換えられない", async () => {
    await seedPoll();

    await assertFails(
      updateDoc(doc(bot(), "tablePolls", POLL), { title: "x", updatedAt: serverTimestamp() }),
    );
  });

  it("ボットの uid でも、パスワード以外のログインではボットとして扱わない", async () => {
    await seedPoll();

    await assertSucceeds(getDoc(doc(bot(), "tablePolls", POLL)));
    await assertFails(getDoc(doc(asOtherProvider(BOT_UID), "tablePolls", POLL)));
  });

  it("作った人だけが日程調整を消せる", async () => {
    await seedPoll();

    await assertFails(deleteDoc(doc(as(BOB), "tablePolls", POLL)));
    await assertFails(deleteDoc(doc(bot(), "tablePolls", POLL)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), "tablePolls", POLL)));
  });
});
