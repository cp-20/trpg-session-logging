import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { describe, it } from "vitest";
import { ALICE, BOB, anon, as, seed, useRulesEnv } from "./env";

useRulesEnv();

const TOKEN = "c".repeat(32);

function feed(overrides: Record<string, unknown> = {}) {
  return { ownerId: ALICE, ics: "BEGIN:VCALENDAR", updatedAt: Timestamp.now(), ...overrides };
}

describe("calendarFeeds/{token}", () => {
  it("ログインした人は自分の購読を作れる", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "calendarFeeds", TOKEN), feed()));
  });

  it("推測できる短いトークンの購読は作れない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "calendarFeeds", "short"), feed()));
  });

  it("他人を持ち主にした購読は作れない", async () => {
    await assertFails(setDoc(doc(as(BOB), "calendarFeeds", TOKEN), feed()));
  });

  it("ログインしていない人は購読を作れない", async () => {
    await assertFails(setDoc(doc(anon(), "calendarFeeds", TOKEN), feed()));
  });

  it("900000 文字を超える ics は書けない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "calendarFeeds", TOKEN), feed({ ics: "x".repeat(900_001) })));
  });

  it("リンクを知る人はログインしていなくても購読を読めるが、一覧はできない", async () => {
    await seed((db) => setDoc(doc(db, "calendarFeeds", TOKEN), feed()));

    await assertSucceeds(getDoc(doc(anon(), "calendarFeeds", TOKEN)));
    await assertFails(getDocs(collection(anon(), "calendarFeeds")));
  });

  it("持ち主は購読を書き換え、消せる", async () => {
    await seed((db) => setDoc(doc(db, "calendarFeeds", TOKEN), feed()));
    const ref = doc(as(ALICE), "calendarFeeds", TOKEN);

    await assertSucceeds(setDoc(ref, feed({ ics: "BEGIN:VCALENDAR\nEND:VCALENDAR" })));
    await assertSucceeds(deleteDoc(ref));
  });

  it("他人の購読は書き換えも横取りも消しもできない", async () => {
    await seed((db) => setDoc(doc(db, "calendarFeeds", TOKEN), feed()));
    const ref = doc(as(BOB), "calendarFeeds", TOKEN);

    await assertFails(setDoc(ref, feed({ ownerId: BOB })));
    await assertFails(deleteDoc(ref));
  });

  it("持ち主でも購読の持ち主を他人に変えられない", async () => {
    await seed((db) => setDoc(doc(db, "calendarFeeds", TOKEN), feed()));

    await assertFails(setDoc(doc(as(ALICE), "calendarFeeds", TOKEN), feed({ ownerId: BOB })));
  });
});

/** handles と userHandles を同じ書き込みで作る（アプリと同じ） */
function claim(db: Firestore, uid: string, handle: string, handleUid = uid) {
  const batch = writeBatch(db);
  batch.set(doc(db, "handles", handle), { uid: handleUid, createdAt: Timestamp.now() });
  batch.set(doc(db, "userHandles", uid), { handle, createdAt: Timestamp.now() });
  return batch.commit();
}

describe("handles と userHandles", () => {
  it("ログインした人は空いているユーザー ID を、両方を同時に書いて取れる", async () => {
    await assertSucceeds(claim(as(ALICE), ALICE, "alice_01"));
  });

  it("handles だけを書いてユーザー ID を取ることはできない", async () => {
    await assertFails(
      setDoc(doc(as(ALICE), "handles", "alice_01"), { uid: ALICE, createdAt: Timestamp.now() }),
    );
  });

  it("userHandles だけを書いてユーザー ID を名乗ることはできない", async () => {
    await assertFails(
      setDoc(doc(as(ALICE), "userHandles", ALICE), { handle: "alice_01", createdAt: Timestamp.now() }),
    );
  });

  it("他人が取ったユーザー ID は取れない", async () => {
    await seed((db) => claim(db, BOB, "taken"));

    await assertFails(claim(as(ALICE), ALICE, "taken"));
  });

  it("ユーザー ID は一度取ったら取り直せない", async () => {
    await seed((db) => claim(db, ALICE, "first"));

    await assertFails(claim(as(ALICE), ALICE, "second"));
  });

  it("他人の uid でユーザー ID を取れない", async () => {
    await assertFails(claim(as(ALICE), BOB, "for_bob"));
    await assertFails(claim(as(ALICE), ALICE, "for_bob", BOB));
  });

  it("形の決まりに合わないユーザー ID は取れない", async () => {
    const alice = as(ALICE);

    for (const handle of ["ab", "Alice", "1abc", "a__b", "abc_", "a".repeat(21)]) {
      await assertFails(claim(alice, ALICE, handle));
    }
  });

  it("予約語のユーザー ID は取れない", async () => {
    const alice = as(ALICE);

    for (const handle of ["admin", "settings", "takufu"]) {
      await assertFails(claim(alice, ALICE, handle));
    }
  });

  it("ユーザー ID は変えも消しもできない", async () => {
    await seed((db) => claim(db, ALICE, "alice_01"));
    const alice = as(ALICE);

    await assertFails(updateDoc(doc(alice, "handles", "alice_01"), { createdAt: Timestamp.now() }));
    await assertFails(deleteDoc(doc(alice, "handles", "alice_01")));
    await assertFails(updateDoc(doc(alice, "userHandles", ALICE), { handle: "other" }));
    await assertFails(deleteDoc(doc(alice, "userHandles", ALICE)));
  });

  it("handles はだれでも 1 件ずつ読めるが、一覧はできない", async () => {
    await seed((db) => claim(db, ALICE, "alice_01"));

    await assertSucceeds(getDoc(doc(anon(), "handles", "alice_01")));
    await assertFails(getDocs(collection(anon(), "handles")));
  });

  it("userHandles は本人だけが読める", async () => {
    await seed((db) => claim(db, ALICE, "alice_01"));

    await assertSucceeds(getDoc(doc(as(ALICE), "userHandles", ALICE)));
    await assertFails(getDoc(doc(as(BOB), "userHandles", ALICE)));
    await assertFails(getDocs(collection(as(ALICE), "userHandles")));
  });
});
