import { expect, it } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getTakufuAuth } from "./auth";
import { seedState } from "../data/seed";
import {
  deleteSharedCharacter,
  deleteSharedLog,
  publishSharedCharacter,
  publishSharedLog,
} from "./cloud-state";
import { characterCard, sessionCard } from "./og-card";
import { sharedCharacterPage, sharedLogPage } from "../server/shared-pages";

/**
 * 共有ページの OG 画像・題名は、サーバーが誰でもない立場で公開 REST API を読んで作る。
 * 実際のルールで、誰にでも見せてよい分だけが読め、参加者だけの記録は題名も読めないことを確かめる
 */
it.skipIf(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")(
  "OG 画像は公開の記録・共有中のキャラクターだけ中身を読み、参加者だけの記録は中身に触れない",
  async () => {
    const auth = getTakufuAuth()!;
    const password = "test-password-123";
    const email = `og-${crypto.randomUUID()}@test.local`;
    const owner = (await createUserWithEmailAndPassword(auth, email, password)).user;
    const state = seedState();
    const profile = state.users[state.me];
    state.me = owner.uid;
    state.users = { [owner.uid]: { ...profile, id: owner.uid, name: "持ち主" } };
    state.prefs.hideSelfOnShare = false;

    const log = structuredClone(Object.values(seedState().logs)[0]);
    log.ownerId = owner.uid;
    log.slug = `og-${crypto.randomUUID()}`;
    // セッションは名前を持たず、シナリオの題名で呼ぶ（共有シナリオ一覧に載せないシナリオでも共有ページには載る）
    log.scenarioId = "sc_og_private";
    state.scenarios.sc_og_private = {
      ...Object.values(state.scenarios)[0]!,
      id: "sc_og_private",
      title: "OG 確認の卓",
      private: true,
    };
    log.players = { [owner.uid]: { linked: true, hidden: false, characterIds: [] } };

    log.scope = "members";
    await publishSharedLog(log, state);
    await signOut(auth);
    expect(await sharedLogPage(log.slug)).toEqual({ status: "limited" });

    await signInWithEmailAndPassword(auth, email, password);
    log.scope = "public";
    await publishSharedLog(log, state);
    await signOut(auth);
    const page = await sharedLogPage(log.slug);
    expect(page.status).toBe("public");
    if (page.status !== "public") throw new Error();
    const card = sessionCard(page.data);
    expect(card).toMatchObject({ kind: "session", title: "OG 確認の卓" });
    // 名前を出してよい参加者（持ち主は GM）は members から読む
    expect(card.kind === "session" && card.people.map((p) => p.name)).toEqual(["持ち主"]);

    expect(await sharedLogPage(`og-missing-${crypto.randomUUID()}`)).toEqual({ status: "missing" });

    const character = structuredClone(Object.values(seedState().characters)[0]);
    character.id = `og-char-${crypto.randomUUID()}`;
    character.ownerId = owner.uid;
    character.share = { ...character.share, enabled: true, scope: "link", includeProfile: false };
    await signInWithEmailAndPassword(auth, email, password);
    await publishSharedCharacter(character, state);
    await signOut(auth);
    const charPage = await sharedCharacterPage(character.id);
    expect(charPage.status).toBe("public");
    if (charPage.status !== "public") throw new Error();
    // 共有で伏せた肩書きは載らない
    expect(characterCard(charPage.data)).toMatchObject({ name: character.name });
    expect(characterCard(charPage.data)).not.toHaveProperty("archetype");

    await signInWithEmailAndPassword(auth, email, password);
    await deleteSharedLog(log.slug);
    await deleteSharedCharacter(character.id);
    await signOut(auth);
    expect(await sharedLogPage(log.slug)).toEqual({ status: "missing" });
    expect(await sharedCharacterPage(character.id)).toEqual({ status: "missing" });
  },
  60_000,
);
