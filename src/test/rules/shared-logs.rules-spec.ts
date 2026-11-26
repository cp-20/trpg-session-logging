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
  type Firestore,
} from "firebase/firestore";
import { describe, it } from "vitest";
import { ALICE, BOB, CAROL, anon, as, seed, useRulesEnv } from "./env";

useRulesEnv();

const SLUG = "slug1";
const TOKEN = "t".repeat(32);
const TOKEN2 = "n".repeat(32);
const DAY = 24 * 60 * 60 * 1000;

function share(overrides: Record<string, unknown> = {}) {
  return { ownerId: ALICE, scope: "members", memberIds: [BOB], revision: "r1", chunkCount: 1, ...overrides };
}
function member(overrides: Record<string, unknown> = {}) {
  return {
    inviteId: TOKEN,
    hidden: false,
    linked: true,
    displayName: "ボブ",
    color: "#336699",
    image: "",
    ...overrides,
  };
}
function invite(overrides: Record<string, unknown> = {}) {
  return {
    slug: SLUG,
    ownerId: ALICE,
    title: "卓",
    systemId: "Cthulhu7th",
    scenarioTitle: "シナリオ",
    expiresAt: Timestamp.fromMillis(Date.now() + DAY),
    ...overrides,
  };
}
const chunkRef = (db: Firestore, revision = "r1") =>
  doc(db, "sharedLogs", SLUG, "revisions", revision, "chunks", "0");

async function seedShare(overrides: Record<string, unknown> = {}) {
  await seed(async (db) => {
    await setDoc(doc(db, "sharedLogs", SLUG), share(overrides));
    await setDoc(chunkRef(db), { data: "log", ownerId: ALICE });
  });
}

describe("sharedLogs/{slug}", () => {
  it("共有の目印は、ログインしていない人でも 1 件ずつ読める", async () => {
    await seedShare();

    await assertSucceeds(getDoc(doc(anon(), "sharedLogs", SLUG)));
  });

  it("共有の目印は一覧できない", async () => {
    await seedShare();

    await assertFails(getDocs(collection(as(ALICE), "sharedLogs")));
  });

  it("ログインした人は自分を持ち主にして共有を作れる", async () => {
    await assertSucceeds(setDoc(doc(as(ALICE), "sharedLogs", SLUG), share()));
  });

  it("ログインしていない人は共有を作れない", async () => {
    await assertFails(setDoc(doc(anon(), "sharedLogs", SLUG), share()));
  });

  it("他人を持ち主にした共有は作れない", async () => {
    await assertFails(setDoc(doc(as(BOB), "sharedLogs", SLUG), share()));
  });

  it("共有の範囲が決まった値でないと作れない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "sharedLogs", SLUG), share({ scope: "everyone" })));
  });

  it("切れ端の数が 0 や 201 以上だと作れない", async () => {
    const alice = as(ALICE);

    await assertFails(setDoc(doc(alice, "sharedLogs", SLUG), share({ chunkCount: 0 })));
    await assertFails(setDoc(doc(alice, "sharedLogs", SLUG), share({ chunkCount: 201 })));
  });

  it("共有に題名など決まっていない欄を足せない", async () => {
    await assertFails(setDoc(doc(as(ALICE), "sharedLogs", SLUG), share({ title: "秘密の卓" })));
  });

  it("持ち主は共有の範囲を変えられる", async () => {
    await seedShare();

    await assertSucceeds(setDoc(doc(as(ALICE), "sharedLogs", SLUG), share({ scope: "public" })));
  });

  it("持ち主でない人は共有を書き換えられない", async () => {
    await seedShare();

    await assertFails(setDoc(doc(as(BOB), "sharedLogs", SLUG), share({ ownerId: BOB, scope: "public" })));
  });

  it("持ち主でも共有は消せない（取り消しは revision を revoked にする）", async () => {
    await seedShare();

    await assertFails(deleteDoc(doc(as(ALICE), "sharedLogs", SLUG)));
  });
});

describe("sharedLogs/{slug}/revisions/{revision}/chunks", () => {
  it("持ち主は自分の共有の切れ端を作れる", async () => {
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG), share()));

    await assertSucceeds(setDoc(chunkRef(as(ALICE), "r2"), { data: "log", ownerId: ALICE }));
  });

  it("共有を作る前でも、自分を持ち主にした切れ端は作れる", async () => {
    await assertSucceeds(setDoc(chunkRef(as(ALICE)), { data: "log", ownerId: ALICE }));
  });

  it("他人の共有に切れ端を足せない", async () => {
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG), share()));

    await assertFails(setDoc(chunkRef(as(BOB), "r2"), { data: "x", ownerId: BOB }));
  });

  it("切れ端は書き換えられない", async () => {
    await seedShare();

    await assertFails(updateDoc(chunkRef(as(ALICE)), { data: "new" }));
  });

  it("メンバーは今の revision の切れ端を読める", async () => {
    await seedShare();

    await assertSucceeds(getDoc(chunkRef(as(BOB))));
  });

  it("メンバーでない人はメンバー限定の切れ端を読めない", async () => {
    await seedShare();

    await assertFails(getDoc(chunkRef(as(CAROL))));
    await assertFails(getDoc(chunkRef(anon())));
  });

  it("公開の共有の切れ端は、ログインしていない人でも読める", async () => {
    await seedShare({ scope: "public" });

    await assertSucceeds(getDoc(chunkRef(anon())));
  });

  it("取り消した共有の切れ端は、メンバーも読めない", async () => {
    await seedShare({ revision: "revoked" });
    await seed((db) => setDoc(chunkRef(db, "revoked"), { data: "log", ownerId: ALICE }));

    await assertFails(getDoc(chunkRef(as(BOB), "revoked")));
  });

  it("古い revision の切れ端はメンバーには読めない", async () => {
    await seedShare({ revision: "r2" });

    await assertFails(getDoc(chunkRef(as(BOB), "r1")));
  });

  it("「受け取った人」限定の切れ端は、access を持つ人だけが読める", async () => {
    await seedShare({ scope: "passed", memberIds: [] });
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "access", CAROL), { passed: true }));

    await assertSucceeds(getDoc(chunkRef(as(CAROL))));
    await assertFails(getDoc(chunkRef(as(BOB))));
  });

  it("メンバーの印で linked を外した人は、memberIds にいても読めない", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member({ linked: false })));

    await assertFails(getDoc(chunkRef(as(BOB))));
  });

  it("持ち主だけが切れ端を消せる", async () => {
    await seedShare();

    await assertFails(deleteDoc(chunkRef(as(BOB))));
    await assertSucceeds(deleteDoc(chunkRef(as(ALICE))));
  });
});

describe("sharedLogs/{slug}/access/{userId}", () => {
  it("「受け取った人」限定の共有なら、自分の受け取りの印を書ける", async () => {
    await seedShare({ scope: "passed" });

    await assertSucceeds(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "access", CAROL), { passed: true }));
  });

  it("メンバー限定の共有には受け取りの印を書けない", async () => {
    await seedShare({ scope: "members" });

    await assertFails(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "access", CAROL), { passed: true }));
  });

  it("他人の受け取りの印は書けず、読めない", async () => {
    await seedShare({ scope: "passed" });
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "access", CAROL), { passed: true }));

    await assertFails(setDoc(doc(as(BOB), "sharedLogs", SLUG, "access", CAROL), { passed: true }));
    await assertFails(getDoc(doc(as(BOB), "sharedLogs", SLUG, "access", CAROL)));
  });

  it("受け取りの印は passed: true 以外を書けない", async () => {
    await seedShare({ scope: "passed" });
    const ref = doc(as(CAROL), "sharedLogs", SLUG, "access", CAROL);

    await assertFails(setDoc(ref, { passed: false }));
    await assertFails(setDoc(ref, { passed: true, extra: 1 }));
  });
});

describe("sharedLogs/{slug}/members/{userId}", () => {
  it("memberIds にいる人は自分のメンバーの印を作れる", async () => {
    await seedShare();

    await assertSucceeds(setDoc(doc(as(BOB), "sharedLogs", SLUG, "members", BOB), member()));
  });

  it("有効な招待を持つ人は、表示して加わる印を作れる", async () => {
    await seedShare({ memberIds: [] });
    await seed((db) => setDoc(doc(db, "sharedInvites", TOKEN), invite()));

    await assertSucceeds(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", CAROL), member()));
  });

  it("期限切れの招待ではメンバーの印を作れない", async () => {
    await seedShare({ memberIds: [] });
    await seed((db) =>
      setDoc(doc(db, "sharedInvites", TOKEN), invite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) })),
    );

    await assertFails(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", CAROL), member()));
  });

  it("別の共有の招待ではメンバーの印を作れない", async () => {
    await seedShare({ memberIds: [] });
    await seed((db) => setDoc(doc(db, "sharedInvites", TOKEN), invite({ slug: "other" })));

    await assertFails(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", CAROL), member()));
  });

  it("招待も memberIds もない人はメンバーの印を作れない", async () => {
    await seedShare({ memberIds: [] });

    await assertFails(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", CAROL), member()));
  });

  it("他人のメンバーの印は作れない", async () => {
    await seedShare();

    await assertFails(setDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", BOB), member()));
  });

  it("色が #RRGGBB でない、名前が空のメンバーの印は作れない", async () => {
    await seedShare();
    const ref = doc(as(BOB), "sharedLogs", SLUG, "members", BOB);

    await assertFails(setDoc(ref, member({ color: "red" })));
    await assertFails(setDoc(ref, member({ displayName: "" })));
  });

  it("本人は表示名を変えられるが、inviteId は変えられない", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member()));
    const ref = doc(as(BOB), "sharedLogs", SLUG, "members", BOB);

    await assertSucceeds(updateDoc(ref, { displayName: "ボブ2" }));
    await assertFails(updateDoc(ref, { inviteId: "u".repeat(32) }));
  });

  it("持ち主はメンバーを外せる（linked を外し revoked を付ける）が、表示名は変えられない", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member()));
    const ref = doc(as(ALICE), "sharedLogs", SLUG, "members", BOB);

    await assertFails(updateDoc(ref, { linked: false }));
    await assertSucceeds(updateDoc(ref, { linked: false, revoked: true }));
    await assertFails(updateDoc(ref, { displayName: "勝手な名前" }));
  });

  it("持ち主はメンバーの linked を戻せない", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member({ linked: false })));

    await assertFails(updateDoc(doc(as(ALICE), "sharedLogs", SLUG, "members", BOB), { linked: true }));
  });

  describe("持ち主に外されたメンバー", () => {
    const revoked = () =>
      seed((db) =>
        setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member({ linked: false, revoked: true })),
      );
    const bobRef = () => doc(as(BOB), "sharedLogs", SLUG, "members", BOB);

    it("自分で linked を戻せず、読めないまま", async () => {
      await seedShare();
      await revoked();

      await assertFails(updateDoc(bobRef(), { linked: true }));
      await assertFails(updateDoc(bobRef(), { linked: true, revoked: false }));
      await assertFails(getDoc(chunkRef(as(BOB))));
    });

    it("期限の切れた招待では入り直せない", async () => {
      await seedShare();
      await revoked();
      await seed((db) =>
        setDoc(
          doc(db, "sharedInvites", TOKEN2),
          invite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) }),
        ),
      );

      await assertFails(updateDoc(bobRef(), { linked: true, revoked: false, inviteId: TOKEN2 }));
    });

    it("持ち主が新しく出した期限内の招待でなら入り直せる", async () => {
      await seedShare();
      await revoked();
      await seed((db) => setDoc(doc(db, "sharedInvites", TOKEN2), invite()));

      await assertSucceeds(updateDoc(bobRef(), { linked: true, revoked: false, inviteId: TOKEN2 }));
      await assertSucceeds(getDoc(chunkRef(as(BOB))));
    });
  });

  it("隠したメンバーの印は、読める人にも見えない", async () => {
    await seedShare({ memberIds: [BOB, CAROL] });
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member({ hidden: true })));

    await assertFails(getDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", BOB)));
    await assertSucceeds(getDoc(doc(as(ALICE), "sharedLogs", SLUG, "members", BOB)));
  });

  it("表示しているメンバーの印は、切れ端を読める人に見える", async () => {
    await seedShare({ memberIds: [BOB, CAROL] });
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member()));

    await assertSucceeds(getDoc(doc(as(CAROL), "sharedLogs", SLUG, "members", BOB)));
  });

  it("メンバーの印は消せない", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedLogs", SLUG, "members", BOB), member()));

    await assertFails(deleteDoc(doc(as(BOB), "sharedLogs", SLUG, "members", BOB)));
    await assertFails(deleteDoc(doc(as(ALICE), "sharedLogs", SLUG, "members", BOB)));
  });
});

describe("sharedInvites/{token}", () => {
  it("持ち主は自分の共有の招待を作れる", async () => {
    await seedShare();

    await assertSucceeds(setDoc(doc(as(ALICE), "sharedInvites", TOKEN), invite()));
  });

  it("他人の共有の招待は作れない", async () => {
    await seedShare();

    await assertFails(setDoc(doc(as(BOB), "sharedInvites", TOKEN), invite({ ownerId: BOB })));
  });

  it("推測できる短いトークンの招待は作れない", async () => {
    await seedShare();

    await assertFails(setDoc(doc(as(ALICE), "sharedInvites", "short"), invite()));
  });

  it("期限が 31 日より先、または過去の招待は作れない", async () => {
    await seedShare();
    const ref = doc(as(ALICE), "sharedInvites", TOKEN);

    await assertFails(setDoc(ref, invite({ expiresAt: Timestamp.fromMillis(Date.now() + 32 * DAY) })));
    await assertFails(setDoc(ref, invite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) })));
  });

  it("有効な招待は、ログインしていない人でも 1 件ずつ読める", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedInvites", TOKEN), invite()));

    await assertSucceeds(getDoc(doc(anon(), "sharedInvites", TOKEN)));
  });

  it("期限切れや取り消し済みの共有の招待は読めない", async () => {
    await seedShare({ revision: "revoked" });
    await seed(async (db) => {
      await setDoc(doc(db, "sharedInvites", TOKEN), invite());
      await setDoc(
        doc(db, "sharedInvites", "e".repeat(32)),
        invite({ expiresAt: Timestamp.fromMillis(Date.now() - DAY) }),
      );
    });

    await assertFails(getDoc(doc(anon(), "sharedInvites", TOKEN)));
    await assertFails(getDoc(doc(anon(), "sharedInvites", "e".repeat(32))));
  });

  it("招待は一覧できない", async () => {
    await assertFails(getDocs(collection(as(ALICE), "sharedInvites")));
  });

  it("招待は書き換えられず、持ち主だけが消せる", async () => {
    await seedShare();
    await seed((db) => setDoc(doc(db, "sharedInvites", TOKEN), invite()));

    await assertFails(updateDoc(doc(as(ALICE), "sharedInvites", TOKEN), { title: "x" }));
    await assertFails(deleteDoc(doc(as(BOB), "sharedInvites", TOKEN)));
    await assertSucceeds(deleteDoc(doc(as(ALICE), "sharedInvites", TOKEN)));
  });
});
