import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { validateSavedState } from "./state-schema";
import { contentTag, joinWorkspace, splitWorkspace, textTag } from "./workspace-parts";

describe("記録の分け方", () => {
  it("分けて戻すと、並び順まで元どおり", () => {
    const state = seedState();
    // 部品の順は保たれない（Firestore の map）
    const parts = new Map([...splitWorkspace(state)].reverse());
    expect(JSON.stringify(joinWorkspace(parts).logs)).toBe(JSON.stringify(state.logs));
    expect(Object.keys(joinWorkspace(parts).characters)).toEqual(Object.keys(state.characters));
    expect(joinWorkspace(parts)).toEqual(state);
  });

  it("State に足した欄は、どれかの部品に必ず入る", () => {
    const state = { ...seedState(), addedLater: { a: 1 } };
    expect(joinWorkspace(splitWorkspace(state))).toEqual(state);
  });

  it("ログとキャラクターは基本の部品に入らず、1 件変えても変わるのはその部品だけ", () => {
    const state = seedState();
    const next = structuredClone(state);
    const id = Object.keys(next.logs)[0]!;
    next.logs[id]!.importedFrom = "別の名前";
    const before = splitWorkspace(state);
    const changed = [...splitWorkspace(next)]
      .filter(([key, content]) => contentTag(content) !== contentTag(before.get(key)!))
      .map(([key]) => key);
    expect(changed).toEqual([`log:${id}`]);
  });

  it("部品が欠けていれば、欠けたまま開かない", () => {
    const parts = splitWorkspace(seedState());
    parts.delete([...parts.keys()].find((key) => key.startsWith("log:"))!);
    expect(() => joinWorkspace(parts)).toThrow("すべて読み込めませんでした");
  });

  it("読み直しても指紋が変わらない（開くたびに書き直さない）", () => {
    const once = validateSavedState(JSON.parse(JSON.stringify(seedState())))!;
    const twice = validateSavedState(JSON.parse(JSON.stringify(once)))!;
    const tags = (parts: Map<string, object>) => [...parts].map(([key, c]) => [key, contentTag(c)]);
    expect(tags(splitWorkspace(twice))).toEqual(tags(splitWorkspace(once)));
  });

  it("指紋は 1 文字の違い・入れ替えを見分ける", () => {
    const texts = ["", "あ", "い", "あい", "いあ", "a", "b", `${"x".repeat(9999)}a`, `${"x".repeat(9999)}b`];
    expect(new Set(texts.map(textTag)).size).toBe(texts.length);
  });
});
