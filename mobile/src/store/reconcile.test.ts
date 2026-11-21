import { describe, expect, it } from "vitest";
import type { Character, Log, State, TableEvent } from "@shared/types";
import { reconcileWorkspaceStates } from "./reconcile";

function makeBaseState(): State {
  const baseChar: Character = {
    id: "ch1",
    ownerId: "u1",
    name: "遠沢澄花",
    systemId: "coc7",
    color: "#b85d27",
    archetype: "記者",
    bio: "旧メモ",
    tags: ["記者"],
    stats: { san: 55, hp: 11 },
    sessions: [],
    growth: [],
    share: {
      enabled: false,
      scope: "private",
      includeProfile: true,
      includeStats: true,
      includeGrowth: true,
      includeSessions: true,
    },
  };

  const baseLog: Log = {
    id: "log1",
    title: "廃校の十三時間目",
    systemId: "coc7",
    ownerId: "u1",
    scope: "members",
    hasLog: false,
    channels: [],
    players: {
      u1: { linked: true, hidden: false, characterIds: [] },
    },
    createdAt: "2026-11-01",
    dates: ["2026-11-10"],
    t0: 1794300000,
    t1: 1794310800,
    slug: "廃校の十三時間目",
    impressions: [],
  };

  const baseEvent: TableEvent = {
    id: "ev1",
    tableId: "t1",
    title: "第2夜 候補調整",
    status: "poll",
    date: "2026-11-20",
    startTime: "21:00",
    endTime: "24:00",
    responses: {},
    candidates: [
      {
        id: "cand1",
        date: "2026-11-20",
        startTime: "21:00",
        endTime: "24:00",
        responses: { u1: "ok" },
      },
      {
        id: "cand2",
        date: "2026-11-21",
        startTime: "21:00",
        endTime: "24:00",
        responses: { u1: "maybe" },
      },
    ],
    createdBy: "u1",
  };

  return {
    me: "u1",
    entered: true,
    prefs: { hideSelfOnShare: false, busyDates: ["2026-11-05"] },
    users: {
      u1: { id: "u1", name: "夜霜", color: "#b85d27", accounts: [] },
      u2: { id: "u2", name: "みかん", color: "#3b6e8c", accounts: [] },
    },
    tables: {
      t1: { id: "t1", name: "水曜卓", ownerId: "u1", memberIds: ["u1", "u2"], createdAt: "2026-10-01" },
    },
    characters: { ch1: baseChar },
    scenarios: {},
    logs: { log1: baseLog },
    events: { ev1: baseEvent },
    editRequests: [],
  };
}

describe("reconcileWorkspaceStates", () => {
  it("日程投票の別ユーザー回答と別候補回答を競合なしでマージする", () => {
    const base = makeBaseState();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    // ローカルでは u1 が cand1/cand2 に回答更新
    local.events.ev1!.candidates![0]!.responses.u1 = "ng";
    local.events.ev1!.candidates![1]!.responses.u1 = "ok";

    // リモートでは u2 がそれぞれ回答を追加
    remote.events.ev1!.candidates![0]!.responses.u2 = "ok";
    remote.events.ev1!.candidates![1]!.responses.u2 = "maybe";

    const res = reconcileWorkspaceStates(base, local, remote);
    expect(res.hadConflict).toBe(false);
    expect(res.merged.events.ev1?.candidates?.[0]?.responses).toEqual({
      u1: "ng",
      u2: "ok",
    });
    expect(res.merged.events.ev1?.candidates?.[1]?.responses).toEqual({
      u1: "ok",
      u2: "maybe",
    });
  });

  it("ローカルの新規セッション作成とリモートの探索者更新を両方保持する", () => {
    const base = makeBaseState();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.logs.log2 = {
      ...local.logs.log1!,
      id: "log2",
      title: "オフライン記録",
      slug: "オフライン記録",
    };
    remote.characters.ch1!.stats.san = 49;
    remote.characters.ch1!.bio = "PC側から追記";

    const res = reconcileWorkspaceStates(base, local, remote);
    expect(res.hadConflict).toBe(false);
    expect(res.merged.logs.log2?.title).toBe("オフライン記録");
    expect(res.merged.characters.ch1?.stats.san).toBe(49);
    expect(res.merged.characters.ch1?.bio).toBe("PC側から追記");
  });

  it("ローカルとリモートの別々の感想追加を配列結合して保持する", () => {
    const base = makeBaseState();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.logs.log1!.impressions = [
      { id: "imp_l", userId: "u1", text: "終盤の出目が熱かった", createdAt: "2026-11-11", spoiler: false },
    ];
    remote.logs.log1!.impressions = [
      {
        id: "imp_r",
        userId: "u2",
        text: "真実に気づいた瞬間が良かった",
        createdAt: "2026-11-11",
        spoiler: true,
      },
    ];

    const res = reconcileWorkspaceStates(base, local, remote);
    expect(res.hadConflict).toBe(false);
    expect(res.merged.logs.log1?.impressions?.map((i) => i.id).sort()).toEqual(["imp_l", "imp_r"]);
  });

  it("同一エンティティの同一スカラー項目が別値になった場合はリモート優先かつ競合報告する", () => {
    const base = makeBaseState();
    const local = structuredClone(base);
    const remote = structuredClone(base);

    local.logs.log1!.title = "ローカルで変更した卓名";
    remote.logs.log1!.title = "Web側で変更した卓名";

    const res = reconcileWorkspaceStates(base, local, remote);
    expect(res.hadConflict).toBe(true);
    expect(res.conflictedEntities).toContain("log:log1.title");
    expect(res.merged.logs.log1?.title).toBe("Web側で変更した卓名");
  });
});
