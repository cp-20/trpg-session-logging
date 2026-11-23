import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { emptyState } from "../store";
import { DEMO_USER_IDS, hasDemoData, stripDemoData } from "./demo-cleanup";

const uid = "real-uid-123";

describe("体験版の見本を取り除く", () => {
  it("見本の人の一覧は見本と一致する", () => {
    expect([...DEMO_USER_IDS].sort()).toEqual(Object.keys(seedState().users).sort());
  });

  it("見本の記録・卓・キャラクター・シナリオ・人を除き、本人のものと、それが結ぶものは残す", () => {
    const seed = seedState();
    const mine = emptyState({ id: uid, name: "本人", color: "#000", accounts: [] });
    // 前の版で見本が混ざった記録
    const mixed = structuredClone(mine);
    Object.assign(mixed.users, seed.users);
    Object.assign(mixed.logs, seed.logs);
    Object.assign(mixed.tables, seed.tables);
    Object.assign(mixed.characters, seed.characters);
    Object.assign(mixed.scenarios, seed.scenarios);
    // 本人が見本のシナリオで記録したセッション（見本の人も遊んだ）
    const [anyLogId, anyLog] = Object.entries(seed.logs).find(([, l]) => l.scenarioId)!;
    mixed.logs.real1 = { ...structuredClone(anyLog), id: "real1", slug: "real1", ownerId: uid };
    const sharedPlayer = Object.keys(anyLog.players).find((p) => p !== anyLog.ownerId) ?? anyLog.ownerId;
    mixed.logs.real1.players = {
      [uid]: anyLog.players[anyLog.ownerId]!,
      [sharedPlayer]: anyLog.players[sharedPlayer]!,
    };
    mixed.scenarios.sc_real = { ...Object.values(seed.scenarios)[0]!, id: "sc_real", addedByUid: uid };

    expect(hasDemoData(mixed, uid)).toBe(true);
    const { state, removed } = stripDemoData(mixed, seed, uid);
    expect(removed).toBeGreaterThan(50);
    expect(Object.keys(state.logs)).toEqual(["real1"]);
    expect(state.logs[anyLogId]).toBeUndefined();
    expect(Object.keys(state.tables)).toEqual([]);
    expect(Object.keys(state.characters)).toEqual([]);
    expect(Object.keys(state.scenarios).sort()).toEqual([anyLog.scenarioId!, "sc_real"].sort());
    expect(Object.keys(state.users).sort()).toEqual([uid, sharedPlayer].sort());
    expect(state.me).toBe(uid);
    expect(hasDemoData(stripDemoData(state, seed, uid).state, uid)).toBe(sharedPlayer !== uid);
  });

  it("見本がなければ何も変えない", () => {
    const mine = emptyState({ id: uid, name: "本人", color: "#000", accounts: [] });
    expect(hasDemoData(mine, uid)).toBe(false);
    expect(stripDemoData(mine, seedState(), uid)).toEqual({ state: mine, removed: 0 });
  });
});
