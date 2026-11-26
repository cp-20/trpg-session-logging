import { expect, it } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getTakufuAuth } from "./auth";
import { applyCandidateRsvp, applyConfirmCandidate } from "./schedule";
import { answerPoll, loadPoll, TablePollSync } from "./table-polls";
import type { State, Table, TableEvent } from "../types";

type Slice = Pick<State, "tables" | "events" | "me">;

async function until(cond: () => boolean, label: string): Promise<void> {
  const end = Date.now() + 8000;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timeout: ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** 1 人ぶんの記録と同期。ストアと同じく、onRemote で受け取った変更を記録へ当てる */
async function connect(slice: Slice): Promise<{ sync: TablePollSync; stop: () => void }> {
  let ready = false;
  const sync = new TablePollSync(
    slice.me,
    (merge) => {
      const events = merge(slice);
      if (events) slice.events = events;
    },
    { onReady: () => (ready = true), onError: (e) => console.error("poll sync", e) },
  );
  const stop = sync.start();
  await until(() => ready, "first snapshot");
  return { sync, stop };
}

// エミュレーター（Auth 9099 / Firestore 8080）に対して動く。`pnpm run test:emulator` が立てて動かす。
// `pnpm test` では接続先が無く待ち続けるので飛ばす
it.skipIf(process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS !== "true")(
  "卓の日程調整を共有し、メンバーが自分のアカウントから回答し、確定が全員に届く（実際の SDK とルール）",
  async () => {
    const auth = getTakufuAuth()!;
    const password = "test-password-123";
    const run = crypto.randomUUID().slice(0, 8);
    const emailA = `poll-a-${run}@test.local`;
    const emailB = `poll-b-${run}@test.local`;
    const b = (await createUserWithEmailAndPassword(auth, emailB, password)).user;
    const a = (await createUserWithEmailAndPassword(auth, emailA, password)).user;

    const table: Table = {
      id: `t_${run}`,
      name: "潮騒卓",
      ownerId: a.uid,
      memberIds: [a.uid, b.uid],
      createdAt: new Date().toISOString(),
    };
    const poll: TableEvent = {
      id: `ev_${run}`,
      tableId: table.id,
      title: "第2話",
      status: "poll",
      date: "2026-12-05",
      startTime: "20:00",
      endTime: "23:00",
      durationMin: 180,
      responses: {},
      candidates: [
        { id: "c1", date: "2026-12-05", startTime: "20:00", endTime: "23:00", responses: { [a.uid]: "ok" } },
        { id: "c2", date: "2026-12-06", startTime: "20:00", endTime: "23:00", responses: { [a.uid]: "ok" } },
      ],
      createdBy: a.uid,
    };
    const stateA: Slice = { me: a.uid, tables: { [table.id]: table }, events: { [poll.id]: poll } };
    const stateB: Slice = { me: b.uid, tables: { [table.id]: table }, events: {} };

    // 作った人: 記録にある日程調整を、読み終えたら書き出す
    let link = await connect(stateA);
    await link.sync.push(stateA);
    link.stop();
    expect((await loadPoll(poll.id))?.responses).toEqual({ [a.uid]: { c1: "ok", c2: "ok" } });

    // メンバー: 写しが記録に入り、自分のアカウントから回答する
    await signInWithEmailAndPassword(auth, emailB, password);
    link = await connect(stateB);
    await until(() => Boolean(stateB.events?.[poll.id]), "mirror");
    expect(stateB.events![poll.id]!.createdBy).toBe(a.uid);
    applyCandidateRsvp(stateB, poll.id, "c1", "ng");
    applyCandidateRsvp(stateB, poll.id, "c2", "ok");
    await link.sync.push(stateB);
    // ほかの人の回答は書けない（規則）
    await expect(answerPoll(a.uid, poll.id, { c1: "ng" })).rejects.toMatchObject({
      code: "permission-denied",
    });
    link.stop();

    // 作った人の記録に、メンバーの回答が届く
    await signInWithEmailAndPassword(auth, emailA, password);
    link = await connect(stateA);
    await until(() => stateA.events![poll.id]!.candidates?.[1]?.responses[b.uid] === "ok", "answers");
    expect(stateA.events![poll.id]!.candidates![0]!.responses).toEqual({ [a.uid]: "ok", [b.uid]: "ng" });
    // 確定は文書にも書き出す
    applyConfirmCandidate(stateA, poll.id, stateA.events![poll.id]!.candidates![1]!);
    await link.sync.push(stateA);
    link.stop();
    expect(await loadPoll(poll.id)).toMatchObject({ status: "confirmed", confirmedCandidateId: "c2" });

    // メンバーの写しも確定する
    await signInWithEmailAndPassword(auth, emailB, password);
    link = await connect(stateB);
    await until(() => stateB.events![poll.id]!.status === "confirmed", "confirmed mirror");
    expect(stateB.events![poll.id]).toMatchObject({
      date: "2026-12-06",
      responses: { [a.uid]: "ok", [b.uid]: "ok" },
    });
    link.stop();

    // 作った人が消すと、文書もメンバーの写しも消える
    await signInWithEmailAndPassword(auth, emailA, password);
    link = await connect(stateA);
    await link.sync.push(stateA);
    const { [poll.id]: _gone, ...rest } = stateA.events!;
    stateA.events = rest;
    await link.sync.push(stateA);
    link.stop();
    expect(await loadPoll(poll.id)).toBeNull();
    await signInWithEmailAndPassword(auth, emailB, password);
    link = await connect(stateB);
    await until(() => !stateB.events?.[poll.id], "mirror removed");
    link.stop();
  },
  60_000,
);
