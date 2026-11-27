import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { describe, it } from "vitest";
import { ALICE, BOB, anon, as, seed, useRulesEnv } from "./env";

useRulesEnv();

const manifest = { revision: "r1", parts: { base: "r1" }, updatedAt: 1 };

describe("users/{userId}", () => {
  it("自分の利用者文書は読み書きできる", async () => {
    const alice = as(ALICE);

    await assertSucceeds(setDoc(doc(alice, "users", ALICE), { name: "a" }));
    await assertSucceeds(getDoc(doc(alice, "users", ALICE)));
  });

  it("他人の利用者文書は読めず、書けない", async () => {
    await seed((db) => setDoc(doc(db, "users", ALICE), { name: "a" }));
    const bob = as(BOB);

    await assertFails(getDoc(doc(bob, "users", ALICE)));
    await assertFails(setDoc(doc(bob, "users", ALICE), { name: "b" }));
  });

  it("ログインしていない人は利用者文書を読めない", async () => {
    await seed((db) => setDoc(doc(db, "users", ALICE), { name: "a" }));

    await assertFails(getDoc(doc(anon(), "users", ALICE)));
  });
});

describe("users/{userId}/workspace/manifest", () => {
  it("自分の見出しは決まった形なら作れ、読め、消せる", async () => {
    const alice = as(ALICE);
    const ref = doc(alice, "users", ALICE, "workspace", "manifest");

    await assertSucceeds(setDoc(ref, manifest));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it("他人の見出しは読めず、書けない", async () => {
    await seed((db) => setDoc(doc(db, "users", ALICE, "workspace", "manifest"), manifest));
    const ref = doc(as(BOB), "users", ALICE, "workspace", "manifest");

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, manifest));
    await assertFails(deleteDoc(ref));
  });

  it("見出しに決まっていない欄があると書けない", async () => {
    const ref = doc(as(ALICE), "users", ALICE, "workspace", "manifest");

    await assertFails(setDoc(ref, { ...manifest, extra: true }));
  });

  it("見出しの parts が空だと書けない", async () => {
    const ref = doc(as(ALICE), "users", ALICE, "workspace", "manifest");

    await assertFails(setDoc(ref, { ...manifest, parts: {} }));
  });

  it("見出しの revision が文字列でないと書けない", async () => {
    const ref = doc(as(ALICE), "users", ALICE, "workspace", "manifest");

    await assertFails(setDoc(ref, { ...manifest, revision: 1 }));
  });
});

describe("users/{userId}/revisions/{revision}/chunks/{chunkId}", () => {
  it("自分の切れ端は data だけなら作れ、読め、消せる", async () => {
    const ref = doc(as(ALICE), "users", ALICE, "revisions", "r1", "chunks", "0000");

    await assertSucceeds(setDoc(ref, { data: "xxx" }));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(deleteDoc(ref));
  });

  it("切れ端は書いたあと書き換えられない", async () => {
    await seed((db) => setDoc(doc(db, "users", ALICE, "revisions", "r1", "chunks", "0000"), { data: "old" }));
    const ref = doc(as(ALICE), "users", ALICE, "revisions", "r1", "chunks", "0000");

    await assertFails(updateDoc(ref, { data: "new" }));
  });

  it("切れ端に data 以外の欄があると作れない", async () => {
    const ref = doc(as(ALICE), "users", ALICE, "revisions", "r1", "chunks", "0000");

    await assertFails(setDoc(ref, { data: "x", ownerId: ALICE }));
  });

  it("他人の切れ端は読めず、作れない", async () => {
    await seed((db) => setDoc(doc(db, "users", ALICE, "revisions", "r1", "chunks", "0000"), { data: "x" }));
    const bob = as(BOB);

    await assertFails(getDoc(doc(bob, "users", ALICE, "revisions", "r1", "chunks", "0000")));
    await assertFails(setDoc(doc(bob, "users", ALICE, "revisions", "r1", "chunks", "0001"), { data: "x" }));
  });
});
