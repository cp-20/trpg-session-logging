import { expect, it } from "vitest";
import { seedState } from "../data/seed";
import { parseSavedState, RestoredStateSchema } from "./state-schema";

it("保存したデモ利用者と既存サンプルを再読み込みしても失わない", () => {
  const state = seedState();
  state.entered = true;
  expect(RestoredStateSchema.safeParse(state).success).toBe(true);
  expect(parseSavedState(JSON.stringify(state))?.entered).toBe(true);
});

it("既知の旧形式だけを補い、将来の追加フィールドと元データを保持する", () => {
  const state = structuredClone(seedState()) as unknown as Record<string, any>;
  state.futureField = "keep";
  delete state.prefs;
  delete state.editRequests;
  for (const log of Object.values(state.logs) as any[]) delete log.slug;
  const raw = JSON.stringify(state);
  const restored = parseSavedState(raw);
  expect(restored).not.toBeNull();
  expect((restored as any).futureField).toBe("keep");
  expect(restored?.prefs.hideSelfOnShare).toBe(false);
  expect(restored?.logs.s03.slug).toBe("s03");
  expect(JSON.stringify(state)).toBe(raw);
});

it("不正な参照や未完のJSONをそのまま画面で使わず、保存済み原本を変更しない", () => {
  const state = structuredClone(seedState());
  state.logs.s03.ownerId = "missing";
  const raw = JSON.stringify(state);
  localStorage.setItem("takufu-state-v4", raw);
  expect(parseSavedState(raw)).toBeNull();
  expect(localStorage.getItem("takufu-state-v4")).toBe(raw);
  expect(parseSavedState('{"logs":')).toBeNull();
  expect(parseSavedState("null")).toBeNull();
});
