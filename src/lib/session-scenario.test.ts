import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import type { Scenario } from "../types";
import { validateSavedState } from "./state-schema";
import {
  sessionTitle,
  UNKNOWN_SCENARIO_TITLE,
  upgradeLogScenario,
  upgradeSharedScenario,
} from "./session-scenario";

describe("セッションは名前を持たず、シナリオの題名で呼ぶ", () => {
  it("呼び名はシナリオの題名。見つからなければ「シナリオ不明」", () => {
    expect(sessionTitle({ scenarioId: "a" }, { a: { title: "廃校の十三時間目" } })).toBe("廃校の十三時間目");
    expect(sessionTitle({ scenarioId: "x" }, {})).toBe(UNKNOWN_SCENARIO_TITLE);
  });

  it("シナリオのある旧データは名前（2 陣・第二夜）を捨てる", () => {
    const scenarios: Record<string, unknown> = { sc1: { id: "sc1", title: "廃校の十三時間目" } };
    const log: Record<string, unknown> = { id: "l1", scenarioId: "sc1", title: "廃校の十三時間目（2陣）" };
    expect(upgradeLogScenario(log, scenarios)).toBe(true);
    expect(log).toEqual({ id: "l1", scenarioId: "sc1" });
    expect(Object.keys(scenarios)).toEqual(["sc1"]);
    // 2 回目は何もしない
    expect(upgradeLogScenario(log, scenarios)).toBe(false);
  });

  it("シナリオのない旧データ（事前相談など）は、その名前で共有シナリオ一覧に載せないシナリオを作って結ぶ", () => {
    const scenarios: Record<string, unknown> = {};
    const log: Record<string, unknown> = {
      id: "l2",
      title: "キャラクター作成・事前相談",
      systemId: "coc7",
      ownerId: "u1",
    };
    upgradeLogScenario(log, scenarios);
    expect(log).toEqual({ id: "l2", systemId: "coc7", ownerId: "u1", scenarioId: "sc_l2" });
    expect(scenarios.sc_l2).toMatchObject({
      title: "キャラクター作成・事前相談",
      systemId: "coc7",
      addedByUid: "u1",
      private: true,
    });
  });

  it("保存された旧データを読むと、名前のないセッションとシナリオになる", () => {
    const old = structuredClone(seedState()) as unknown as {
      logs: Record<string, Record<string, unknown>>;
      scenarios: Record<string, Scenario>;
    };
    const withScenario = Object.values(old.logs)[0]!;
    withScenario.title = "旧い名前";
    const without = Object.values(old.logs)[1]!;
    without.title = "自作の卓";
    delete without.scenarioId;
    const restored = validateSavedState(old)!;
    expect(Object.values(restored.logs).every((l) => !("title" in l) && Boolean(l.scenarioId))).toBe(true);
    const ownScenario = restored.scenarios[restored.logs[without.id as string]!.scenarioId]!;
    expect(ownScenario).toMatchObject({ title: "自作の卓", private: true });
  });

  it("以前に公開した共有ページの中身は、名前からシナリオを補う", () => {
    const payload: { log: unknown; scenario?: Scenario } = {
      log: { id: "l3", title: "旧い卓", systemId: "coc7", ownerId: "u1" },
    };
    upgradeSharedScenario(payload);
    expect(payload.scenario).toMatchObject({ title: "旧い卓", private: true });
    expect(payload.log).not.toHaveProperty("title");

    const withScenario: { log: unknown; scenario?: Scenario } = {
      log: { id: "l4", title: "旧い名前", scenarioId: "sc9" },
      scenario: { id: "sc9", title: "深淵の呼び声" } as Scenario,
    };
    upgradeSharedScenario(withScenario);
    expect(withScenario.scenario?.title).toBe("深淵の呼び声");
    expect(withScenario.log).toEqual({ id: "l4", scenarioId: "sc9" });
  });
});
