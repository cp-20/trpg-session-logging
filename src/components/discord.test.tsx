import { describe, expect, it } from "vitest";
import type { TableEvent } from "../types";
import { discordSyncPlan, discordSyncSignature } from "./discord";

const state = {
  me: "u_me",
  tables: { t1: { id: "t1", name: "卓", ownerId: "u_owner", memberIds: ["u_owner", "u_me"], createdAt: "" } },
};

function poll(over: Partial<TableEvent> = {}): TableEvent {
  return {
    id: "ev1",
    tableId: "t1",
    title: "第2話",
    status: "poll",
    date: "2026-11-28",
    startTime: "21:00",
    endTime: "24:00",
    responses: {},
    candidates: [{ id: "c1", date: "2026-11-28", startTime: "21:00", endTime: "24:00", responses: {} }],
    createdBy: "u_owner",
    ...over,
  };
}

function snapshot(events: TableEvent[]) {
  return new Map(
    events.map((ev) => [
      ev.id,
      { sig: discordSyncSignature(ev, state)!, ev, manages: ev.createdBy === state.me },
    ]),
  );
}

describe("discordSyncPlan", () => {
  it("自分の回答が変わったら日程調整を映す。ほかの人の回答の取り込みでは映さない", () => {
    const before = snapshot([poll()]);
    const mine = poll({ candidates: [{ ...poll().candidates![0]!, responses: { u_me: "ok" } }] });
    expect(discordSyncPlan(before, { ev1: mine }, state).polls).toEqual(["ev1"]);
    const theirs = poll({ candidates: [{ ...poll().candidates![0]!, responses: { u_owner: "ok" } }] });
    expect(discordSyncPlan(before, { ev1: theirs }, state).polls).toEqual([]);
  });

  it("新しい予定は自分が作ったものだけ。卓のない予定は映さない", () => {
    const empty = snapshot([]);
    expect(discordSyncPlan(empty, { ev1: poll() }, state).polls).toEqual([]);
    expect(discordSyncPlan(empty, { ev1: poll({ createdBy: "u_me" }) }, state).polls).toEqual(["ev1"]);
    expect(
      discordSyncPlan(empty, { ev1: poll({ createdBy: "u_me", tableId: undefined }) }, state).polls,
    ).toEqual([]);
  });

  it("確定したら日程調整を締めて予定として映し、自分が作った予定を消したら取り消す", () => {
    const own = poll({ createdBy: "u_me" });
    const before = snapshot([own]);
    const confirmed = { ...own, status: "confirmed" as const, candidates: undefined };
    expect(discordSyncPlan(before, { ev1: confirmed }, state)).toMatchObject({
      polls: ["ev1"],
      events: [confirmed],
    });
    expect(discordSyncPlan(before, {}, state).deleted).toEqual([own]);
    expect(discordSyncPlan(snapshot([poll()]), {}, state).deleted).toEqual([]);
  });
});
