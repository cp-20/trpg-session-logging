import { expect, it } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getTakufuAuth } from "./auth";
import { seedState } from "../data/seed";
import {
  fetchSharedLog,
  getSharedLogAccess,
  loadCloudState,
  publishSharedLog,
  saveCloudState,
  confirmPlayedLog,
  deleteSharedLog,
  createSharedInvite,
  getSharedInvite,
  acceptSharedInvite,
  updateSharedMembership,
  publishSharedCharacter,
  fetchSharedCharacter,
  deleteSharedCharacter,
} from "./cloud-state";

it.skipIf(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")(
  "persists a large workspace with conflict detection and enforces sharing through the actual SDK",
  async () => {
    const auth = getTakufuAuth()!;
    const password = "test-password-123";
    const email = `sdk-${crypto.randomUUID()}@test.local`;
    const first = (await createUserWithEmailAndPassword(auth, email, password)).user;
    const state = seedState();
    const profile = state.users[state.me];
    state.me = first.uid;
    state.users = { [first.uid]: { ...profile, id: first.uid } };
    state.users[first.uid].bio = "あ😀".repeat(400_000);
    state.logs = {};
    expect(await loadCloudState(first.uid)).toBeNull();
    const revision = await saveCloudState(first.uid, state, null);
    const loaded = await loadCloudState(first.uid);
    expect(loaded?.revision).toBe(revision);
    expect(loaded?.state.users[first.uid].bio).toBe(state.users[first.uid].bio);
    await expect(saveCloudState(first.uid, state, "outdated")).rejects.toThrow("別の端末");
    expect((await loadCloudState(first.uid))?.revision).toBe(revision);

    const secondEmail = `sdk-${crypto.randomUUID()}@test.local`;
    const second = (await createUserWithEmailAndPassword(auth, secondEmail, password)).user;
    await expect(loadCloudState(first.uid)).rejects.toMatchObject({ code: "permission-denied" });
    await signInWithEmailAndPassword(auth, email, password);
    const log = structuredClone(Object.values(seedState().logs)[0]);
    log.ownerId = first.uid;
    log.slug = `sdk-${crypto.randomUUID()}`;
    const scenario = Object.values(state.scenarios)[0];
    scenario.policy = "public";
    log.scenarioId = scenario.id;
    log.scope = "members";
    log.players = { [second.uid]: { linked: true, hidden: true, characterIds: [] } };
    state.users[second.uid] = { ...profile, id: second.uid };
    await publishSharedLog(log, state);
    await signOut(auth);
    expect((await getSharedLogAccess(log.slug))?.scope).toBe("members");
    await expect(fetchSharedLog(log.slug)).rejects.toMatchObject({ code: "permission-denied" });
    await signInWithEmailAndPassword(auth, secondEmail, password);
    expect((await fetchSharedLog(log.slug))?.log.id).toBe(log.id);
    await signInWithEmailAndPassword(auth, email, password);
    log.players = {};
    await publishSharedLog(log, state);
    const invite = await createSharedInvite(log, state);
    expect((await getSharedInvite(invite))?.slug).toBe(log.slug);
    await signInWithEmailAndPassword(auth, secondEmail, password);
    await expect(fetchSharedLog(log.slug)).rejects.toMatchObject({ code: "permission-denied" });
    expect((await acceptSharedInvite(invite)).log.id).toBe(log.id);
    expect((await fetchSharedLog(log.slug))?.users[second.uid]?.name).toBeTruthy();
    await updateSharedMembership(log.slug, { linked: true, hidden: true });
    expect((await fetchSharedLog(log.slug))?.log.players[second.uid]).toBeUndefined();
    await signInWithEmailAndPassword(auth, email, password);
    expect((await fetchSharedLog(log.slug))?.users[second.uid]).toBeUndefined();
    await signInWithEmailAndPassword(auth, secondEmail, password);
    await updateSharedMembership(log.slug, { linked: false, hidden: true });
    await expect(fetchSharedLog(log.slug)).rejects.toMatchObject({ code: "permission-denied" });
    await updateSharedMembership(log.slug, { linked: false, hidden: false });
    await signInWithEmailAndPassword(auth, email, password);
    log.scope = "passed";
    log.players = {};
    await publishSharedLog(log, state);
    await signInWithEmailAndPassword(auth, secondEmail, password);
    await expect(fetchSharedLog(log.slug)).rejects.toMatchObject({ code: "permission-denied" });
    await confirmPlayedLog(log.slug);
    expect((await fetchSharedLog(log.slug))?.log.id).toBe(log.id);
    await signInWithEmailAndPassword(auth, email, password);
    log.scope = "public";
    await publishSharedLog(log, state);
    await signOut(auth);
    expect((await fetchSharedLog(log.slug))?.log.id).toBe(log.id);
    await signInWithEmailAndPassword(auth, email, password);
    await deleteSharedLog(log.slug);
    const character = structuredClone(Object.values(seedState().characters)[0]);
    character.id = `char-${crypto.randomUUID()}`;
    character.ownerId = first.uid;
    character.share = {
      ...character.share,
      enabled: true,
      scope: "link",
      includeStats: false,
      includeProfile: false,
      includeGrowth: false,
      includeSessions: false,
    };
    await publishSharedCharacter(character, state);
    await signOut(auth);
    const publicCharacter = await fetchSharedCharacter(character.id);
    expect(publicCharacter?.character.name).toBe(character.name);
    expect(publicCharacter?.character.bio).toBe("");
    expect(publicCharacter?.character.stats).toEqual({});
    expect(publicCharacter?.character.growth).toEqual([]);
    await signInWithEmailAndPassword(auth, email, password);
    await deleteSharedCharacter(character.id);
    await signOut(auth);
    expect(await fetchSharedLog(log.slug)).toBeNull();
    expect(await fetchSharedCharacter(character.id)).toBeNull();
  },
  60_000,
);
