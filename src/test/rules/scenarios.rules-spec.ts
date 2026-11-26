import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
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
import { ALICE, BOB, CAROL, anon, as, bot, seed, useRulesEnv } from "./env";

useRulesEnv();

const ID = "sc_user_1";
const TALTO = "sc_talto_1";

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    title: "狂気山脈",
    author: "作者",
    systemId: "Cthulhu7th",
    source: "manual",
    tags: [],
    addedByUid: ALICE,
    rank: 1_000_000_000,
    sysRank: "Cthulhu7th:1000000000",
    t: {},
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

describe("scenarios/{scenarioId}", () => {
  it("共有シナリオ一覧は、ログインしていない人でも読め、一覧できる", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertSucceeds(getDoc(doc(anon(), "scenarios", ID)));
    await assertSucceeds(getDocs(collection(anon(), "scenarios")));
  });

  it("ログインした人は自分が足した人になったシナリオを足せる", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "scenarios", ID), scenario()));
  });

  it("ログインしていない人はシナリオを足せない", async () => {
    await assertFails(setDoc(doc(anon(), "scenarios", ID), scenario()));
  });

  it("他人を足した人にしたシナリオは足せない", async () => {
    await assertFails(setDoc(doc(as(BOB), "scenarios", ID), scenario()));
  });

  it("利用者は TALTO の作品の ID でシナリオを足せない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "scenarios", TALTO), scenario({ source: "talto" })));
  });

  it("並び順を TALTO の作品より前にしたシナリオは足せない", async () => {
    await assertFails(
      setDoc(doc(as(ALICE), "scenarios", ID), scenario({ rank: 1, sysRank: "Cthulhu7th:1" })),
    );
  });

  it("題名が空や 201 文字以上のシナリオは足せない", async () => {
    const alice = as(ALICE);

    await assertFails(setDoc(doc(alice, "scenarios", ID), scenario({ title: "" })));
    await assertFails(setDoc(doc(alice, "scenarios", ID), scenario({ title: "x".repeat(201) })));
  });

  it("出どころが決まった値でないシナリオは足せない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "scenarios", ID), scenario({ source: "amazon" })));
  });

  it("足した人は自分のシナリオを書き換えられる", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertSucceeds(
      updateDoc(doc(as(ALICE), "scenarios", ID), { title: "新題", updatedAt: serverTimestamp() }),
    );
  });

  it("足した人でない人はシナリオを書き換えられない", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertFails(setDoc(doc(as(BOB), "scenarios", ID), scenario({ addedByUid: BOB })));
  });

  it("利用者の足したシナリオは、足した人でも消せない", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertFails(deleteDoc(doc(as(ALICE), "scenarios", ID)));
  });

  it("ボットは TALTO の作品を書け、消せる", async () => {
    const ref = doc(bot(), "scenarios", TALTO);

    await assertSucceeds(setDoc(ref, { title: "TALTO の作品", source: "talto" }));
    await assertSucceeds(deleteDoc(ref));
  });

  it("ボットは利用者の足したシナリオを消せない", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertFails(deleteDoc(doc(bot(), "scenarios", ID)));
  });
});

const REQ = "req1";
function editRequest(overrides: Record<string, unknown> = {}) {
  return {
    scenarioId: ID,
    uid: BOB,
    requesterName: "ボブ",
    ownerUid: ALICE,
    changes: { title: "正しい題" },
    status: "pending",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}
async function seedRequest(overrides: Record<string, unknown> = {}) {
  await seed(async (db) => {
    await setDoc(doc(db, "scenarios", ID), scenario());
    await setDoc(doc(db, "scenarioEditRequests", REQ), editRequest(overrides));
  });
}

describe("scenarioEditRequests/{requestId}", () => {
  it("足した人でない人は修正の提案を送れる", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertSucceeds(setDoc(doc(as(BOB), "scenarioEditRequests", REQ), editRequest()));
  });

  it("足した人は自分のシナリオに提案を送れない", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertFails(
      setDoc(doc(as(ALICE), "scenarioEditRequests", REQ), editRequest({ uid: ALICE, ownerUid: ALICE })),
    );
  });

  it("提案の宛先は、シナリオを足した人でないといけない", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));

    await assertFails(setDoc(doc(as(BOB), "scenarioEditRequests", REQ), editRequest({ ownerUid: CAROL })));
  });

  it("はじめから反映済みの提案や、決まっていない欄を変える提案は送れない", async () => {
    await seed((db) => setDoc(doc(db, "scenarios", ID), scenario()));
    const ref = doc(as(BOB), "scenarioEditRequests", REQ);

    await assertFails(setDoc(ref, editRequest({ status: "accepted" })));
    await assertFails(setDoc(ref, editRequest({ changes: { addedByUid: BOB } })));
  });

  it("提案は送った人と足した人だけが読める", async () => {
    await seedRequest();

    await assertSucceeds(getDoc(doc(as(BOB), "scenarioEditRequests", REQ)));
    await assertSucceeds(getDoc(doc(as(ALICE), "scenarioEditRequests", REQ)));
    await assertFails(getDoc(doc(as(CAROL), "scenarioEditRequests", REQ)));
  });

  it("提案の一覧は uid か ownerUid で自分に絞ったときだけできる", async () => {
    await seedRequest();
    const alice = as(ALICE);

    await assertSucceeds(
      getDocs(query(collection(alice, "scenarioEditRequests"), where("ownerUid", "==", ALICE))),
    );
    await assertFails(getDocs(collection(alice, "scenarioEditRequests")));
  });

  it("足した人は提案を反映済みか却下にできる", async () => {
    await seedRequest();

    await assertSucceeds(updateDoc(doc(as(ALICE), "scenarioEditRequests", REQ), { status: "accepted" }));
  });

  it("送った人は自分の提案を反映済みにできない", async () => {
    await seedRequest();

    await assertFails(updateDoc(doc(as(BOB), "scenarioEditRequests", REQ), { status: "accepted" }));
  });

  it("足した人も、提案の中身は書き換えられない", async () => {
    await seedRequest();

    await assertFails(
      updateDoc(doc(as(ALICE), "scenarioEditRequests", REQ), {
        status: "accepted",
        changes: { title: "別" },
      }),
    );
  });

  it("決まったあとの提案は、もう一度決め直せない", async () => {
    await seedRequest({ status: "rejected" });

    await assertFails(updateDoc(doc(as(ALICE), "scenarioEditRequests", REQ), { status: "accepted" }));
  });

  it("送った人は待っている提案だけを取り下げられる", async () => {
    await seedRequest();

    await assertFails(deleteDoc(doc(as(ALICE), "scenarioEditRequests", REQ)));
    await assertSucceeds(deleteDoc(doc(as(BOB), "scenarioEditRequests", REQ)));
  });

  it("決まったあとの提案は、送った人も消せない", async () => {
    await seedRequest({ status: "accepted" });

    await assertFails(deleteDoc(doc(as(BOB), "scenarioEditRequests", REQ)));
  });
});
