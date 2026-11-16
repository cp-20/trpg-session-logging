import { describe, expect, it } from "vitest";
import type { Channel, Msg } from "../types";
import { inferSystem } from "./system-guess";

const msg = (partial: Partial<Msg>): Msg => ({
  id: "m",
  ts: 0,
  sp: "x",
  kind: "PC",
  type: "text",
  text: null,
  ...partial,
});

const chans = (msgs: Msg[]): Channel[] => [{ id: "main", name: "メイン", secret: false, msgs }];

describe("inferSystem", () => {
  it("CC<= / SANチェック から CoC7 を推定する", () => {
    const r = inferSystem(chans([msg({ type: "roll", roll: { cmd: "CC<=70 目星", skill: "目星", dice: "61", result: "成功" } })]));
    expect(r?.id).toBe("coc7");
  });
  it("結合判定・自分:不可能 からエモクロアを推定する", () => {
    const r = inferSystem(
      chans([
        msg({ type: "roll", roll: { cmd: "2D6+3 結合", skill: "交渉", dice: "7,5", result: "成功" } }),
        msg({ text: "（自分:不可能 2点減）" }),
      ])
    );
    expect(r?.id).toBe("emoklore");
  });
  it("エモクロアの手がかりがなければ 2D6 から SW2.5 を推定する", () => {
    const r = inferSystem(chans([msg({ type: "roll", roll: { cmd: "2D6+5 射撃", skill: "射撃", dice: "9", result: "成功" } })]));
    expect(r?.id).toBe("sw25");
  });
  it("手がかりがなければ null", () => {
    expect(inferSystem(chans([msg({ text: "「こんにちは」" })]))).toBeNull();
  });
});
