import { describe, expect, it } from "vitest";
import { rollSpeech } from "./roll-text";

const roll = { cmd: "CC<=70 目星", skill: "目星", dice: "61", result: "成功" };

describe("ダイスの発言に添えられた言葉", () => {
  it("台詞は残す", () => {
    expect(rollSpeech({ text: "（目星）教室の黒板、まだ新しい。", roll })).toBe(
      "（目星）教室の黒板、まだ新しい。",
    );
  });
  it("コマンドや判定の文を書いただけなら出さない", () => {
    expect(rollSpeech({ text: "CC<=70 【目星】 (1D100<=70) ＞ 61 ＞ 成功", roll })).toBe("");
    expect(rollSpeech({ text: "CC<=70　目星", roll })).toBe("");
    expect(rollSpeech({ text: "目星", roll })).toBe("");
    expect(rollSpeech({ text: null, roll })).toBe("");
    expect(rollSpeech({ text: "こんにちは" })).toBe("");
  });
});
