import { describe, expect, it } from "vitest";
import {
  applyResponse,
  eventFromPoll,
  mergePollIntoEvent,
  mergePollSnapshot,
  parsePollDoc,
  pollFromEvent,
  pruneResponses,
  summarizePoll,
  type TablePoll,
} from "./table-polls";
import type { Table, TableEvent } from "../types";

const table: Table = {
  id: "t1",
  name: "潮騒卓",
  systemId: "coc7",
  ownerId: "gm",
  memberIds: ["gm", "pl1", "pl2"],
  createdAt: "2026-11-01T00:00:00.000Z",
};

function event(over: Partial<TableEvent> = {}): TableEvent {
  return {
    id: "ev1",
    tableId: "t1",
    title: "第2話",
    status: "poll",
    date: "2026-12-05",
    startTime: "20:00",
    endTime: "23:00",
    durationMin: 180,
    responses: {},
    candidates: [
      { id: "c1", date: "2026-12-05", startTime: "20:00", endTime: "23:00", responses: { gm: "ok" } },
      { id: "c2", date: "2026-12-06", startTime: "20:00", endTime: "23:00", responses: { gm: "maybe" } },
    ],
    createdBy: "gm",
    ...over,
  };
}

function poll(over: Partial<TablePoll> = {}): TablePoll {
  return { ...pollFromEvent(event(), table, "gm")!, ...over };
}

describe("pollFromEvent", () => {
  it("卓の調整中の予定から、回答を人ごとに並べ替えた文書を作る", () => {
    const p = pollFromEvent(event(), table, "gm");
    expect(p).toMatchObject({
      id: "ev1",
      tableId: "t1",
      ownerId: "gm",
      tableOwnerId: "gm",
      memberIds: ["gm", "pl1", "pl2"],
      systemId: "coc7",
      status: "poll",
      responses: { gm: { c1: "ok", c2: "maybe" } },
    });
    expect(p!.candidates[0]).toEqual({ id: "c1", date: "2026-12-05", startTime: "20:00", endTime: "23:00" });
  });
  it("卓のない予定・確定した予定・別の卓は共有しない", () => {
    expect(pollFromEvent(event({ tableId: undefined }), table, "gm")).toBeNull();
    expect(pollFromEvent(event({ status: "confirmed" }), table, "gm")).toBeNull();
    expect(pollFromEvent(event({ tableId: "t2" }), table, "gm")).toBeNull();
  });
  it("候補のない古い形式は候補 1 件として共有し、作った人がメンバーでなくても回答できる", () => {
    const p = pollFromEvent(
      event({ candidates: undefined, responses: { pl1: "ng" }, createdBy: "pl3" }),
      table,
      "pl3",
    )!;
    expect(p.candidates.map((c) => c.id)).toEqual(["default"]);
    expect(p.responses).toEqual({ pl1: { default: "ng" } });
    expect(p.memberIds).toContain("pl3");
  });
});

describe("applyResponse", () => {
  it("自分の回答だけを書き、元の文書は変えない", () => {
    const before = poll();
    const r = applyResponse(before, "pl1", "c2", "ok");
    expect(r.ok && r.poll.responses).toEqual({ gm: { c1: "ok", c2: "maybe" }, pl1: { c2: "ok" } });
    expect(before.responses.pl1).toBeUndefined();
    const cleared = applyResponse(before, "gm", "c1", null);
    expect(cleared.ok && cleared.poll.responses.gm).toEqual({ c2: "maybe" });
  });
  it("メンバーでない人・ない候補・確定後は受け付けない", () => {
    expect(applyResponse(poll(), "stranger", "c1", "ok")).toEqual({ ok: false, reason: "not-member" });
    expect(applyResponse(poll(), "pl1", "c9", "ok")).toEqual({ ok: false, reason: "no-candidate" });
    expect(applyResponse(poll({ status: "confirmed" }), "pl1", "c1", "ok")).toEqual({
      ok: false,
      reason: "closed",
    });
  });
});

describe("summarizePoll", () => {
  it("候補ごとにだれが ◯△× か・未回答かを数え、◯ がいちばん多い候補を選ぶ", () => {
    const s = summarizePoll(
      poll({
        responses: { gm: { c1: "ok", c2: "ok" }, pl1: { c1: "ng", c2: "ok" }, outsider: { c1: "ok" } },
      }),
    );
    expect(s.candidates[0]!.counts).toEqual({ ok: 1, maybe: 0, ng: 1, pending: 1 });
    expect(s.candidates[1]!.ok).toEqual(["gm", "pl1"]);
    expect(s.candidates[1]!.pending).toEqual(["pl2"]);
    expect(s.bestCandidateId).toBe("c2");
    expect(s.respondedIds).toEqual(["gm", "pl1"]);
  });
  it("◯ が同数なら △ が多いほう、だれも ◯△ でなければ選ばない", () => {
    const tie = summarizePoll(poll({ responses: { gm: { c1: "ok", c2: "ok" }, pl1: { c2: "maybe" } } }));
    expect(tie.bestCandidateId).toBe("c2");
    expect(summarizePoll(poll({ responses: { gm: { c1: "ng" } } })).bestCandidateId).toBeUndefined();
  });
});

describe("mergePollIntoEvent", () => {
  it("ほかの人の回答を作った人の予定に映す（回答は文書が正）", () => {
    const merged = mergePollIntoEvent(event(), poll({ responses: { gm: { c1: "ok" }, pl1: { c1: "ok" } } }));
    expect(merged.candidates![0]!.responses).toEqual({ gm: "ok", pl1: "ok" });
    expect(merged.candidates![1]!.responses).toEqual({});
  });
  it("書き出す前の自分の回答は残す", () => {
    const merged = mergePollIntoEvent(event(), poll({ responses: { pl1: { c1: "ng" } } }), "gm");
    expect(merged.candidates![0]!.responses).toEqual({ pl1: "ng", gm: "ok" });
  });
  it("日時を変えた候補には、文書の古い回答を入れない", () => {
    const ev = event();
    ev.candidates![0]!.date = "2026-12-12";
    const merged = mergePollIntoEvent(ev, poll({ responses: { pl1: { c1: "ok" } } }));
    expect(merged.candidates![0]!.responses).toEqual({ gm: "ok" });
  });
  it("文書で確定したら予定も確定し、変わらなければ同じ予定を返す", () => {
    const confirmed = mergePollIntoEvent(
      event(),
      poll({ status: "confirmed", confirmedCandidateId: "c2", responses: { pl1: { c2: "ok" } } }),
    );
    expect(confirmed).toMatchObject({ status: "confirmed", date: "2026-12-06", responses: { pl1: "ok" } });
    expect(confirmed.candidates).toBeUndefined();
    const ev = event();
    expect(mergePollIntoEvent(ev, poll())).toBe(ev);
  });
});

describe("eventFromPoll", () => {
  it("ほかの人が作った日程調整を写し、作った人の名前で持つ", () => {
    const ev = eventFromPoll(poll({ responses: { gm: { c1: "ok" }, pl1: { c2: "ng" } } }));
    expect(ev).toMatchObject({ id: "ev1", tableId: "t1", status: "poll", createdBy: "gm", durationMin: 180 });
    expect(ev.candidates!.map((c) => c.responses)).toEqual([{ gm: "ok" }, { pl1: "ng" }]);
  });
  it("確定していれば確定した予定として写す", () => {
    const ev = eventFromPoll(poll({ status: "confirmed", confirmedCandidateId: "c1" }));
    expect(ev).toMatchObject({ status: "confirmed", date: "2026-12-05", responses: { gm: "ok" } });
  });
  it("書き出す前の自分の回答は残し、変わらなければ同じ予定を返す", () => {
    const existing = eventFromPoll(poll());
    existing.candidates![1]!.responses.pl1 = "ok";
    const next = eventFromPoll(poll(), existing, "pl1");
    expect(next).toBe(existing);
  });
});

describe("mergePollSnapshot", () => {
  const state = { tables: { t1: table }, events: {} as Record<string, TableEvent> };
  it("メンバーの記録に写しを足し、一覧から消えた写しは消す", () => {
    const added = mergePollSnapshot(state, "pl1", [poll()], { complete: true })!;
    expect(added.ev1?.createdBy).toBe("gm");
    expect(mergePollSnapshot({ ...state, events: added }, "pl1", [poll()], { complete: true })).toBeNull();
    expect(mergePollSnapshot({ ...state, events: added }, "pl1", [], { complete: false })).toBeNull();
    expect(mergePollSnapshot({ ...state, events: added }, "pl1", [], { complete: true })).toEqual({});
  });
  it("自分の卓でない・作った人が卓にいない日程調整は写さない", () => {
    expect(mergePollSnapshot(state, "pl1", [poll({ tableId: "t9" })], { complete: true })).toBeNull();
    expect(mergePollSnapshot(state, "pl1", [poll({ ownerId: "stranger" })], { complete: true })).toBeNull();
  });
  it("作った人の記録では回答だけを映し、記録にない日程調整は戻さない", () => {
    const own = { ...state, events: { ev1: event() } };
    const next = mergePollSnapshot(own, "gm", [poll({ responses: { pl2: { c2: "ok" } } })], {
      complete: true,
      keepMine: new Set(["ev1"]),
    })!;
    expect(next.ev1!.candidates![1]!.responses).toEqual({ pl2: "ok", gm: "maybe" });
    expect(mergePollSnapshot(state, "gm", [poll()], { complete: true })).toBeNull();
  });
  it("確定を書き出す前の予定には触らない", () => {
    const events = { ev1: { ...eventFromPoll(poll()), status: "confirmed" as const } };
    expect(
      mergePollSnapshot({ ...state, events }, "gm", [poll()], { complete: true, hold: new Set(["ev1"]) }),
    ).toBeNull();
  });
});

describe("pruneResponses", () => {
  it("日時を変えた・消した候補への回答を落とす", () => {
    const before = poll().candidates;
    const after = [{ ...before[0]! }, { ...before[1]!, startTime: "21:00" }];
    expect(pruneResponses({ gm: { c1: "ok", c2: "ok" }, pl1: { c2: "ng" } }, before, after)).toEqual({
      gm: { c1: "ok" },
    });
  });
});

describe("parsePollDoc", () => {
  it("壊れた値を落として読む", () => {
    const p = parsePollDoc("ev1", {
      tableId: "t1",
      ownerId: "gm",
      memberIds: ["gm", 3],
      title: "x",
      candidates: [{ id: "c1", date: "2026-12-05", startTime: "20:00", endTime: "23:00" }, { id: 1 }],
      responses: { gm: { c1: "ok", c2: "yes" }, pl1: "bad" },
      status: "weird",
      discord: { guildId: "g" },
    })!;
    expect(p.memberIds).toEqual(["gm"]);
    expect(p.candidates).toHaveLength(1);
    expect(p.responses).toEqual({ gm: { c1: "ok" } });
    expect(p.status).toBe("poll");
    expect(p.discord).toBeUndefined();
    expect(parsePollDoc("x", { ownerId: "gm" })).toBeNull();
  });
});
