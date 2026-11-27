import { describe, expect, it } from "vitest";
import { choose, cryptoRandomInt, DiceError, rollCommand, splitChoices, type RandomInt } from "./dice";

/** 出目を順に返す（面の数に関係なく、値 - 1 を返す） */
function faces(...values: number[]): RandomInt {
  const queue = [...values];
  return (max) => {
    const v = queue.shift();
    if (v === undefined) throw new Error("出目が足りません");
    if (v < 1 || v > max) throw new Error(`出目 ${v} は 1〜${max} にありません`);
    return v - 1;
  };
}

/** choose 用: 候補の位置を順に返す */
function picks(...indexes: number[]): RandomInt {
  const queue = [...indexes];
  return () => queue.shift()!;
}

const text = (input: string, rnd: RandomInt) => rollCommand(input, rnd).lines.map((l) => l.text);

describe("rollCommand: 式", () => {
  it.each([
    ["2d6+3", [3, 5], "(2D6+3) ＞ 8[3,5]+3 ＞ 11"],
    ["1D100", [42], "(1D100) ＞ 42"],
    ["D6", [4], "(1D6) ＞ 4"],
    ["(1d6+1)*2", [3], "((1D6+1)*2) ＞ (3+1)*2 ＞ 8"],
    ["10/3", [], "(10/3) ＞ 3"],
    ["-1d4+10", [3], "(-1D4+10) ＞ -3+10 ＞ 7"],
    ["d66", [3, 5], "(D66) ＞ 35[3,5] ＞ 35"],
    ["２ｄ６＋１", [1, 2], "(2D6+1) ＞ 3[1,2]+1 ＞ 4"],
  ])("%s を振る", (input, rolls, expected) => {
    expect(text(input, faces(...rolls))).toEqual([expected]);
  });

  it("割り算は切り捨てる（負の数は小さいほうへ）", () => {
    expect(rollCommand("-7/2", faces()).lines[0]!.total).toBe(-4);
  });
});

describe("rollCommand: 判定", () => {
  it.each([
    ["1d100<=60", [42], "(1D100<=60) ＞ 42 ＞ 成功", true],
    ["1d100<=60", [61], "(1D100<=60) ＞ 61 ＞ 失敗", false],
    ["2d6>=7", [3, 4], "(2D6>=7) ＞ 7[3,4] ＞ 7 ＞ 成功", true],
    ["1d6<>3", [3], "(1D6<>3) ＞ 3 ＞ 失敗", false],
    ["1d6=3", [3], "(1D6=3) ＞ 3 ＞ 成功", true],
    ["1d6<4", [4], "(1D6<4) ＞ 4 ＞ 失敗", false],
    ["1d6>3", [4], "(1D6>3) ＞ 4 ＞ 成功", true],
  ])("%s（出目 %j）", (input, rolls, expected, success) => {
    const line = rollCommand(input, faces(...rolls)).lines[0]!;
    expect(line).toMatchObject({ text: expected, success });
  });

  it.each([
    ["1D100＜＝60", "<="],
    ["1D100≦60", "<="],
    ["1D100=<60", "<="],
    ["1D100≧60", ">="],
    ["1D100!=60", "<>"],
  ])("%s を %s として読む", (input, op) => {
    expect(text(input, faces(50))[0]).toContain(`(1D100${op}60)`);
  });

  it("目標値にダイスがあれば、その出目も見せる", () => {
    expect(text("1d20>=1d6+10", faces(15, 2))).toEqual(["(1D20>=1D6+10) ＞ 15 ＞ 15>=2+10 ＞ 成功"]);
  });
});

describe("rollCommand: 残す・繰り返す・言葉", () => {
  it("4D6KH3 は大きいほうから 3 つ残し、捨てた目を示す", () => {
    expect(text("4d6kh3", faces(2, 6, 1, 5))).toEqual(["(4D6KH3) ＞ 13[2,6,(1),5] ＞ 13"]);
  });

  it("2D20KL1 は小さいほうを残す。同じ目は前を残す", () => {
    expect(text("3d20kl1", faces(7, 3, 3))).toEqual(["(3D20KL1) ＞ 3[(7),3,(3)] ＞ 3"]);
  });

  it("x3 で 3 回振り、行に番号を付ける", () => {
    expect(text("x3 1d6", faces(1, 2, 3))).toEqual(["#1 (1D6) ＞ 1", "#2 (1D6) ＞ 2", "#3 (1D6) ＞ 3"]);
  });

  it("式のあとの言葉を添える（空白は 1 つにまとめる）", () => {
    expect(rollCommand("1d100<=60 目星　黒板を見る", faces(10)).comment).toBe("目星 黒板を見る");
  });

  it("太字・打ち消しは描き方で差し替えられる", () => {
    const r = {
      expr: (s: string) => s,
      text: (s: string) => s,
      strike: (s: string) => `~~${s}~~`,
      bold: (s: string) => `**${s}**`,
    };
    expect(rollCommand("2d6kh1>=4", faces(1, 5), r).lines[0]!.text).toBe(
      "(2D6KH1>=4) ＞ 5[~~1~~,5] ＞ 5 ＞ **成功**",
    );
  });
});

describe("rollCommand: 読めない・大きすぎる式", () => {
  it.each([
    [""],
    ["abc"],
    ["2d"],
    ["2d6+"],
    ["(1d6"],
    ["1d6<="],
    ["101d6"],
    ["1d10001"],
    ["1d0"],
    ["2d6kh3"],
    ["1/0"],
    ["x21 1d6"],
    ["x4 100d6"],
    ["9999999999*9999999999"],
    ["1".repeat(201)],
  ])("%j は DiceError", (input) => {
    expect(() => rollCommand(input, () => 0)).toThrow(DiceError);
  });
});

describe("チョイス", () => {
  it.each([
    ["choice[東,西,南]", "(CHOICE[東,西,南]) ＞ 西"],
    ["choice(東,西,南)", "(CHOICE[東,西,南]) ＞ 西"],
    ["choice 東 西 南", "(CHOICE[東,西,南]) ＞ 西"],
    ["CHOICE[東、西、南]", "(CHOICE[東,西,南]) ＞ 西"],
    ["choice[赤い 扉, 青い 扉, 南]", "(CHOICE[赤い 扉,青い 扉,南]) ＞ 青い 扉"],
  ])("%s", (input, expected) => {
    expect(text(input, picks(1))).toEqual([expected]);
  });

  it("choice2[…] は重ならないよう 2 つ選ぶ", () => {
    expect(text("choice2[A,B,C]", picks(2, 0))).toEqual(["(CHOICE2[A,B,C]) ＞ C, A"]);
  });

  it("括弧のあとの言葉を添える", () => {
    expect(rollCommand("choice[A,B] 先攻", picks(0)).comment).toBe("先攻");
  });

  it("「,」があれば空白では区切らない", () => {
    expect(splitChoices(" 赤い 扉 , 青い扉,,")).toEqual(["赤い 扉", "青い扉"]);
  });

  it.each([
    [[], 1],
    [["A"], 2],
    [["A", "B"], 0],
  ])("候補 %j から %i 個は選べない", (items, n) => {
    expect(() => choose(items, n, () => 0)).toThrow(DiceError);
  });
});

describe("cryptoRandomInt", () => {
  it("0 以上 max 未満の整数を返す", () => {
    const values = Array.from({ length: 200 }, () => cryptoRandomInt(6));
    expect(values.every((v) => Number.isInteger(v) && v >= 0 && v < 6)).toBe(true);
    expect(new Set(values).size).toBe(6);
  });
});
