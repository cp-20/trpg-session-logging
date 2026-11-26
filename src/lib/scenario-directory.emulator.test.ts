import { expect, it } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { doc as liteDoc, setDoc as liteSetDoc } from "firebase/firestore/lite";
import { getTakufuAuth } from "./auth";
import { getTakufuFirestore } from "./firebase";
import { SYSTEMS } from "../data/systems";
import {
  docFields,
  searchScenarios,
  sharedScenarioDoc,
  taltoToDirectory,
  toDirectoryDoc,
} from "./scenario-directory";
import {
  fetchPendingEditRequests,
  publishSharedScenario,
  resolveEditRequest,
  sendScenarioEditRequest,
} from "./cloud-state";
import { connectBot } from "./discord/bot-connection";
import { scenarioStore } from "../server/scenario-directory";
import type { Scenario } from "../types";

const denied = { code: "permission-denied" };

/**
 * 共有シナリオ一覧（scenarios）と修正の提案（scenarioEditRequests）を、実際のルールとサーバーの問い合わせで確かめる
 */
// エミュレーター（Auth 9099 / Firestore 8080）に対して動く。`pnpm run test:emulator` が立てて動かす。
// `pnpm test` では接続先が無く待ち続けるので飛ばす
it.skipIf(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")(
  "共有シナリオ一覧はボットと足した本人だけが書け、サーバーが切れ端で探せる。修正の提案は足した人にだけ届き、足した人だけが決める",
  async () => {
    const run = crypto.randomUUID().slice(0, 8);
    const word = `試${run}`;

    // ボットが TALTO の作品を書く
    const bot = connectBot(process.env)!;
    await bot.ready();
    const talto = toDirectoryDoc(
      taltoToDirectory(
        {
          id: `t${run}`,
          title: `${word}の灯台`,
          author: "しおかぜ堂",
          systemSlug: "call_of_cthulhu_6th",
          systemName: "クトゥルフ神話TRPG",
          playersMin: 2,
          playersMax: 3,
          hours: 4,
        },
        SYSTEMS,
      ),
      0,
      SYSTEMS,
    );
    await liteSetDoc(liteDoc(bot.db, "scenarios", talto.id), docFields(talto));
    await bot.close();

    // 足した人（owner）
    const auth = getTakufuAuth()!;
    const password = "test-password-123";
    const ownerEmail = `sc-owner-${run}@example.com`;
    const owner = (await createUserWithEmailAndPassword(auth, ownerEmail, password)).user;
    const db = getTakufuFirestore()!;
    const sc: Scenario = {
      id: `sc_${run}`,
      title: `${word}の港`,
      author: "試す人",
      systemId: "coc6",
      source: "manual",
      emoji: "",
      bg: "",
      tags: ["クローズド"],
      claimedBy: null,
      addedBy: "user",
      addedByUid: owner.uid,
    };
    await publishSharedScenario(sc, owner.uid);
    const body = { ...docFields(sharedScenarioDoc(sc, owner.uid)), updatedAt: serverTimestamp() };
    // 足した人を偽れない・並びを前にできない・決まった欄しか持てない・TALTO の作品は書けない・消せない
    await expect(
      setDoc(doc(db, "scenarios", `sc_x${run}`), { ...body, addedByUid: "someone" }),
    ).rejects.toMatchObject(denied);
    await expect(setDoc(doc(db, "scenarios", `sc_y${run}`), { ...body, rank: 0 })).rejects.toMatchObject(
      denied,
    );
    await expect(setDoc(doc(db, "scenarios", `sc_z${run}`), { ...body, secret: "x" })).rejects.toMatchObject(
      denied,
    );
    await expect(setDoc(doc(db, "scenarios", talto.id), body)).rejects.toMatchObject(denied);
    await expect(deleteDoc(doc(db, "scenarios", sc.id))).rejects.toMatchObject(denied);

    // サーバーの問い合わせ（公開 REST API）。言葉・システム・ID で
    const store = scenarioStore()!;
    const found = await searchScenarios(store, { q: word }, SYSTEMS);
    expect(found.items.map((s) => s.id)).toEqual([talto.id, sc.id]);
    expect(found.items[0]).toMatchObject({ playersMin: 2, hours: 4, source: "talto" });
    expect(
      (await searchScenarios(store, { q: `${word} クローズド` }, SYSTEMS)).items.map((s) => s.id),
    ).toEqual([sc.id]);
    const page = await searchScenarios(store, { systemId: "coc6", limit: 50 }, SYSTEMS);
    expect(page.items[0]!.id).toBe(talto.id);
    expect(page.total).toBeGreaterThanOrEqual(2);
    expect((await store.byIds([sc.id, "sc_missing"])).map((s) => s.id)).toEqual([sc.id]);
    await signOut(auth);

    // ほかの人が提案する。TALTO の作品（足した人がいない）や、足した人を偽った提案は送れない
    const other = (await createUserWithEmailAndPassword(auth, `sc-other-${run}@example.com`, password)).user;
    const request = {
      scenarioId: sc.id,
      ownerUid: owner.uid,
      uid: other.uid,
      requesterName: "ほかの人",
      changes: { title: `${word}の港（改）` },
      note: "題名の誤字",
    };
    await sendScenarioEditRequest(request);
    await expect(sendScenarioEditRequest({ ...request, scenarioId: talto.id })).rejects.toMatchObject(denied);
    await expect(sendScenarioEditRequest({ ...request, ownerUid: other.uid })).rejects.toMatchObject(denied);
    const mine = await fetchPendingEditRequests(sc.id, other.uid, "requester");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ requesterName: "ほかの人", changes: { title: `${word}の港（改）` } });
    // 送った人は決められない。ほかの人の提案は読めない
    await expect(
      updateDoc(doc(db, "scenarioEditRequests", mine[0]!.id), { status: "accepted" }),
    ).rejects.toMatchObject(denied);
    await expect(getDocs(collection(db, "scenarioEditRequests"))).rejects.toMatchObject(denied);
    await signOut(auth);

    // 足した人に届き、反映できる
    await signInWithEmailAndPassword(auth, ownerEmail, password);
    const incoming = await fetchPendingEditRequests(sc.id, owner.uid, "owner");
    expect(incoming.map((r) => r.id)).toEqual([mine[0]!.id]);
    await resolveEditRequest(incoming[0]!.id, "accepted");
    expect(await fetchPendingEditRequests(sc.id, owner.uid, "owner")).toEqual([]);
    await signOut(auth);
  },
  60_000,
);
