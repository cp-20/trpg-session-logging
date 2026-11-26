import { expect, it } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getTakufuAuth } from "./auth";
import { seedState } from "../data/seed";
import {
  claimHandle,
  fetchHandleOwner,
  fetchOwnHandle,
  fetchTableInvite,
  fetchTableJoins,
  joinTableInvite,
  publishTableInvite,
  revokeTableInvite,
} from "./cloud-people";
import { applyJoinedTable, inviteExpiresAt, mergeTableJoins, newInviteToken } from "./people";

// エミュレーター（Auth 9099 / Firestore 8080）に対して動く。`pnpm run test:emulator` が立てて動かす。
// `pnpm test` では接続先が無く待ち続けるので飛ばす
it.skipIf(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")(
  "ユーザー ID は一度だけ・一意に決まり、卓へは招待リンクで加わる（実際の SDK とルール）",
  async () => {
    const auth = getTakufuAuth()!;
    const password = "test-password-123";
    const run = crypto
      .randomUUID()
      .slice(0, 6)
      .replace(/[^a-z0-9]/g, "a");
    const emailA = `people-a-${run}@test.local`;
    const emailB = `people-b-${run}@test.local`;
    const a = (await createUserWithEmailAndPassword(auth, emailA, password)).user;
    const handleA = `owner${run}`;
    expect(await fetchHandleOwner(handleA)).toBeNull();
    expect(await claimHandle(a.uid, handleA)).toEqual({ ok: true, handle: handleA });
    // 同じ ID をもう一度選んでも成功扱い、別の ID には変えられない
    expect(await claimHandle(a.uid, handleA)).toEqual({ ok: true, handle: handleA });
    expect(await claimHandle(a.uid, `other${run}`)).toEqual({ ok: false, reason: "fixed", handle: handleA });
    expect(await fetchOwnHandle(a.uid)).toBe(handleA);

    const state = seedState();
    state.me = a.uid;
    state.users[a.uid] = { id: a.uid, handle: handleA, name: "A", color: "#123456", accounts: [] };
    const table = { ...state.tables.t_shiosai!, id: `t_${run}`, ownerId: a.uid, memberIds: [a.uid] };
    state.tables[table.id] = table;
    const token = newInviteToken();
    await publishTableInvite(token, table, state.users, a.uid, inviteExpiresAt("7d"));

    const b = (await createUserWithEmailAndPassword(auth, emailB, password)).user;
    expect(await claimHandle(b.uid, handleA)).toEqual({ ok: false, reason: "taken" });
    const handleB = `guest${run}`;
    expect((await claimHandle(b.uid, handleB)).ok).toBe(true);
    const invite = await fetchTableInvite(token);
    expect(invite?.tableName).toBe(table.name);
    expect(invite?.members.map((m) => m.handle)).toEqual([handleA]);
    await joinTableInvite(token, { id: b.uid, handle: handleB, name: "B", color: "#654321", accounts: [] });
    const joinerState = seedState();
    joinerState.me = b.uid;
    applyJoinedTable(joinerState, invite!);
    expect(joinerState.tables[table.id]?.memberIds).toEqual([a.uid, b.uid]);
    await expect(fetchTableJoins(token)).rejects.toMatchObject({ code: "permission-denied" });

    await signInWithEmailAndPassword(auth, emailA, password);
    const joined = await fetchTableJoins(token);
    expect(joined.map((u) => u.handle)).toEqual([handleB]);
    expect(mergeTableJoins(state, table.id, joined)).toBe(true);
    expect(state.tables[table.id]?.memberIds).toContain(b.uid);
    await revokeTableInvite(token);

    await signInWithEmailAndPassword(auth, emailB, password);
    expect(await fetchTableInvite(token)).toBeNull();
  },
);
