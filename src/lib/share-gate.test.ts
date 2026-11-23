import { describe, expect, it } from "vitest";
import { evaluateShareGate, visibleShareMembers } from "./share-gate";
import type { Log } from "../types";

const baseLog: Pick<Log, "scope" | "ownerId" | "players"> = {
  scope: "members",
  ownerId: "kp",
  players: {
    kp: { linked: true, hidden: false, characterIds: [] },
    pl1: { linked: true, hidden: false, characterIds: [] },
    pl2: { linked: true, hidden: true, characterIds: [] }, // 非表示
    pl3: { linked: false, hidden: false, characterIds: [] }, // 未リンク
  },
};

describe("evaluateShareGate", () => {
  it("members スコープは参加者だけが見られる", () => {
    expect(evaluateShareGate(baseLog, "pl1").visible).toBe(true);
    const r = evaluateShareGate(baseLog, "outsider");
    expect(r.visible).toBe(false);
    expect(r.reason).toContain("メンバー限定");
  });
  it("passed スコープは自己申告で見られるようになる", () => {
    const log = { ...baseLog, scope: "passed" as const };
    const denied = evaluateShareGate(log, "outsider");
    expect(denied.visible).toBe(false);
    expect(denied.reason).toContain("このシナリオを通過した人");
    expect(evaluateShareGate(log, "outsider", { asPassed: true })).toEqual({ visible: true, reason: null });
    expect(evaluateShareGate(log, null)).toMatchObject({ visible: false });
    expect(evaluateShareGate(log, null, { asPassed: true })).toEqual({ visible: true, reason: null });
  });
  it("匿名 (viewerId=null) は members を読めず（'null' キーでも不可）、public は読める", () => {
    const sneaky = {
      ...baseLog,
      players: { ...baseLog.players, null: { linked: true, hidden: false, characterIds: [] } },
    };
    expect(evaluateShareGate(sneaky, null)).toEqual({
      visible: false,
      reason: "このログはメンバー限定です。卓のメンバーだけが読めます。",
    });
    expect(evaluateShareGate({ ...baseLog, scope: "public" }, null)).toEqual({
      visible: true,
      reason: null,
    });
  });
  it("public スコープは誰でも見られる", () => {
    const log = { ...baseLog, scope: "public" as const };
    expect(evaluateShareGate(log, "outsider")).toEqual({ visible: true, reason: null });
  });
  it("KP自身は常に見られる", () => {
    expect(evaluateShareGate(baseLog, "kp").visible).toBe(true);
  });
});

describe("visibleShareMembers", () => {
  it("未リンク・非表示の参加者を除外する", () => {
    expect(visibleShareMembers(baseLog, { viewerId: "kp" })).toEqual(["kp", "pl1"]);
  });
  it("「共有ビューで自分を非表示」が効くのは自分の行だけ", () => {
    expect(visibleShareMembers(baseLog, { hideSelfOnShare: true, viewerId: "kp" })).toEqual(["pl1"]);
  });
});
