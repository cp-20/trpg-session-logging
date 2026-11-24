import { describe, expect, it } from "vitest";
import { rollTone } from "./roll-tone";

describe("rollTone", () => {
  it.each([
    ["決定的成功/スペシャル", "crit"],
    ["クリティカル", "crit"],
    ["ミラクル!", "crit"],
    ["スペシャル", "special"],
    ["イクストリーム成功", "special"],
    ["ダブル!", "special"],
    ["トリプル!", "special"],
    ["成功", "success"],
    ["ハード成功", "success"],
    ["レギュラー成功", "success"],
    ["成功!", "success"],
    ["失敗", "fail"],
    ["失敗!", "fail"],
    ["致命的失敗", "fumble"],
    ["ファンブル", "fumble"],
    ["ファンブル!", "fumble"],
    ["14", undefined],
    ["健忘症", undefined],
  ])("%s → %s", (result, tone) => {
    expect(rollTone(result)).toBe(tone);
  });
});
