import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { describe, it } from "vitest";
import { ALICE, BOB, BOT_UID, anon, as, asOtherProvider, bot, seed, useRulesEnv } from "./env";

useRulesEnv();

const CHAR = "char1";

function character(overrides: Record<string, unknown> = {}) {
  return { ownerId: ALICE, enabled: true, revision: "r1", chunkCount: 1, ...overrides };
}
const chunkRef = (db: Firestore, revision = "r1") =>
  doc(db, "sharedCharacters", CHAR, "revisions", revision, "chunks", "0000");

async function seedCharacter(overrides: Record<string, unknown> = {}) {
  await seed(async (db) => {
    await setDoc(doc(db, "sharedCharacters", CHAR), character(overrides));
    await setDoc(chunkRef(db), { data: "sheet", ownerId: ALICE });
  });
}

describe("sharedCharacters/{characterId}", () => {
  it("ログインした人は自分のキャラクターを公開できる", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "sharedCharacters", CHAR), character()));
  });

  it("他人を持ち主にした公開や、決まっていない欄のある公開はできない", async () => {
    await assertFails(setDoc(doc(as(BOB), "sharedCharacters", CHAR), character()));
    await assertFails(setDoc(doc(as(ALICE), "sharedCharacters", CHAR), character({ name: "名前" })));
  });

  it("持ち主は公開をやめられる", async () => {
    await seedCharacter();

    await assertSucceeds(updateDoc(doc(as(ALICE), "sharedCharacters", CHAR), { enabled: false }));
  });

  it("他人のキャラクターの公開は横取りできない", async () => {
    await seedCharacter();

    await assertFails(setDoc(doc(as(BOB), "sharedCharacters", CHAR), character({ ownerId: BOB })));
  });

  it("公開の目印はだれでも 1 件ずつ読めるが、利用者は一覧できず、だれも消せない", async () => {
    await seedCharacter();

    await assertSucceeds(getDoc(doc(anon(), "sharedCharacters", CHAR)));
    await assertFails(getDocs(collection(as(ALICE), "sharedCharacters")));
    await assertFails(deleteDoc(doc(as(ALICE), "sharedCharacters", CHAR)));
  });

  it("ボットは公開中のキャラクターだけを問い合わせて一覧できる", async () => {
    await seedCharacter();
    const db = bot();

    await assertSucceeds(getDocs(query(collection(db, "sharedCharacters"), where("enabled", "==", true))));
    await assertFails(getDocs(collection(db, "sharedCharacters")));
  });
});

describe("sharedCharacters/{characterId}/revisions/{revision}/chunks", () => {
  it("公開中のキャラクターの今の切れ端は、ログインしていない人でも読める", async () => {
    await seedCharacter();

    await assertSucceeds(getDoc(chunkRef(anon())));
  });

  it("公開をやめたキャラクターの切れ端は、持ち主しか読めない", async () => {
    await seedCharacter({ enabled: false });

    await assertFails(getDoc(chunkRef(as(BOB))));
    await assertSucceeds(getDoc(chunkRef(as(ALICE))));
  });

  it("古い revision の切れ端は持ち主しか読めない", async () => {
    await seedCharacter({ revision: "r2" });

    await assertFails(getDoc(chunkRef(anon(), "r1")));
  });

  it("持ち主は切れ端を足せるが、他人のキャラクターには足せない", async () => {
    await seedCharacter();

    await assertSucceeds(setDoc(chunkRef(as(ALICE), "r2"), { data: "sheet2", ownerId: ALICE }));
    await assertFails(setDoc(chunkRef(as(BOB), "r3"), { data: "x", ownerId: BOB }));
  });

  it("切れ端は書き換えられず、持ち主だけが消せる", async () => {
    await seedCharacter();

    await assertFails(updateDoc(chunkRef(as(ALICE)), { data: "new" }));
    await assertFails(deleteDoc(chunkRef(as(BOB))));
    await assertSucceeds(deleteDoc(chunkRef(as(ALICE))));
  });
});

const BOT_ONLY = [
  "discordLinks",
  "discordOAuthStates",
  "discordLinkCodes",
  "tableDiscord",
  "discordEvents",
  "discordReminders",
] as const;

describe("Discord 連携の文書", () => {
  it.each(BOT_ONLY)("%s はボットだけが読み書きできる", async (name) => {
    const ref = doc(bot(), name, "k1");

    await assertSucceeds(setDoc(ref, { v: 1 }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(bot(), name)));
    await assertSucceeds(deleteDoc(ref));
  });

  it.each(BOT_ONLY)("%s はログインした人も、していない人も読み書きできない", async (name) => {
    await seed((db) => setDoc(doc(db, name, ALICE), { v: 1 }));

    for (const db of [as(ALICE), anon()]) {
      await assertFails(getDoc(doc(db, name, ALICE)));
      await assertFails(getDocs(collection(db, name)));
      await assertFails(setDoc(doc(db, name, ALICE), { v: 2 }));
      await assertFails(deleteDoc(doc(db, name, ALICE)));
    }
  });

  it.each(BOT_ONLY)("%s は、パスワード以外でログインしたボットの uid では読めない", async (name) => {
    await seed((db) => setDoc(doc(db, name, "k1"), { v: 1 }));

    await assertFails(getDoc(doc(asOtherProvider(BOT_UID), name, "k1")));
  });

  it("利用者は自分の Discord とのつながりを読み、消せるが、書けない", async () => {
    await seed((db) => setDoc(doc(db, "userDiscord", ALICE), { discordUserId: "d1" }));
    const ref = doc(as(ALICE), "userDiscord", ALICE);

    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(ref, { discordUserId: "d2" }));
    await assertSucceeds(deleteDoc(ref));
  });

  it("他人の Discord とのつながりは読めず、消せない", async () => {
    await seed((db) => setDoc(doc(db, "userDiscord", ALICE), { discordUserId: "d1" }));
    const ref = doc(as(BOB), "userDiscord", ALICE);

    await assertFails(getDoc(ref));
    await assertFails(deleteDoc(ref));
    await assertFails(getDocs(collection(as(BOB), "userDiscord")));
  });

  it("ボットは利用者の Discord とのつながりを書ける", async () => {
    await assertSucceeds(setDoc(doc(bot(), "userDiscord", ALICE), { discordUserId: "d1" }));
  });
});
