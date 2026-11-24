import { describe, expect, it } from "vitest";
import { parseBcdiceRoll, parseCcfoliaLogHtml } from "./ccfolia-parser";
import { scoreMarks } from "./score-marks";

/* 実際の CCFOLIA 生ログ（[main].html）に出てくる BCDice の結果文の形 */
describe("parseBcdiceRoll: 本文に書かれたダイスの結果", () => {
  it.each([
    [
      "CoC 6 版",
      "CCB<=45 【芸術（勘）】 (1D100<=45) ＞ 27 ＞ 成功",
      { cmd: "CCB<=45 【芸術（勘）】", skill: "芸術（勘）", dice: "27", result: "成功" },
    ],
    [
      "CoC 6 版の決定的成功",
      "CCB<=70 【目星】 (1D100<=70) ＞ 1 ＞ 決定的成功/スペシャル",
      { skill: "目星", dice: "1", result: "決定的成功/スペシャル" },
    ],
    [
      "CoC 7 版（式の後ろにボーナス・ペナルティが続く）",
      "CC<=85 【知識】 (1D100<=85) ボーナス・ペナルティダイス[0] ＞ 47 ＞ 47 ＞ レギュラー成功",
      { cmd: "CC<=85 【知識】", skill: "知識", dice: "47", result: "レギュラー成功" },
    ],
    [
      "CoC 7 版（目標値が式）",
      "CC<=(60-10) 【幸運】 (1D100<=50) ボーナス・ペナルティダイス[0] ＞ 12 ＞ 12 ＞ ハード成功",
      { skill: "幸運", dice: "12", result: "ハード成功" },
    ],
    [
      "エモクロア（〈〉の技能・DM）",
      "2DM<=6 〈心理〉 (2DM<=6) ＞ [3, 9] ＞ 1 ＞ 成功!",
      { skill: "心理", dice: "3,9", result: "成功!" },
    ],
    ["判定なしの合計", "1D50 (1D50) ＞ 3", { cmd: "1D50", dice: "3", result: "3" }],
    ["出目つきの合計", "2D6+5 (2D6+5) ＞ 9[4,5]+5 ＞ 14", { cmd: "2D6+5", dice: "4,5", result: "14" }],
    [
      "表（結果の文に ＞ を含む）",
      "bmr 狂気の発作（リアルタイム）(6) ＞ 失神：1D10ラウンド後に回復する。(1D10＞4ラウンド)",
      {
        cmd: "bmr 狂気の発作（リアルタイム）",
        dice: "6",
        result: "失神：1D10ラウンド後に回復する。(1D10 ＞ 4ラウンド)",
      },
    ],
    [
      "表（出目つき）",
      "ctrs88 金銭財宝表(445[3,2]) ＞ 88以上の出目は未定義です",
      { dice: "445[3,2]", result: "88以上の出目は未定義です" },
    ],
  ])("%s", (_, text, roll) => {
    expect(parseBcdiceRoll(text)).toMatchObject(roll);
  });

  it.each([
    ["会話の ＞", "入口に暗号なんか配置していったい何がしたかったんです＞"],
    ["引用の ＞", "「それも、相手を破滅させる魔性を持った、ね」\n＞アリア"],
    ["括弧の補足", "そうだね (笑) ＞ たしかに"],
    ["シークレットダイス", "シークレットダイス ???"],
  ])("%s はダイスにしない", (_, text) => {
    expect(parseBcdiceRoll(text)).toBeUndefined();
  });
});

describe("parseBcdiceRoll: 繰り返しロール", () => {
  it("各回の結果に分け、結果は段階のよい順に回数をまとめる", () => {
    const text = [
      "x3 CC<=70 【目星】 #1",
      "(1D100<=70) ＞ 89 ＞ 失敗",
      "",
      "#2",
      "(1D100<=70) ＞ 5 ＞ スペシャル",
      "",
      "#3",
      "(1D100<=70) ＞ 57 ＞ 失敗",
    ].join("\n");
    expect(parseBcdiceRoll(text)).toEqual({
      cmd: "x3 CC<=70 【目星】",
      skill: "目星",
      dice: "89,5,57",
      result: "スペシャル 1・失敗 2",
      repeats: [
        { dice: "89", result: "失敗" },
        { dice: "5", result: "スペシャル" },
        { dice: "57", result: "失敗" },
      ],
    });
  });

  it("CoC 7 版・判定の無い合計も分ける", () => {
    const coc7 =
      "x2 CC<=50 【聞き耳】 #1\n(1D100<=50) ボーナス・ペナルティダイス[0] ＞ 12 ＞ 12 ＞ ハード成功\n\n#2\n(1D100<=50) ボーナス・ペナルティダイス[0] ＞ 99 ＞ 99 ＞ ファンブル";
    expect(parseBcdiceRoll(coc7)?.repeats).toEqual([
      { dice: "12", result: "ハード成功" },
      { dice: "99", result: "ファンブル" },
    ]);
    const sum = parseBcdiceRoll("x2 1d6 #1\n(1D6) ＞ 3\n\n#2\n(1D6) ＞ 5");
    expect(sum).toMatchObject({ cmd: "x2 1d6", result: "3, 5" });
  });
});

describe("CCFOLIA 生ログの取り込み", () => {
  const row = (tab: string, sp: string, text: string) =>
    `<p style="color:#888888;">\n  <span> [${tab}]</span>\n  <span>${sp}</span> :\n  <span>\n    ${text}\n  </span>\n</p>`;
  const html = `<!DOCTYPE html><html><body>
${row("main", "キーパー", "点呼します。")}
${row("メイン", "探索者A", "CCB&lt;=45 【目星】 (1D100&lt;=45) ＞ 27 ＞ 成功")}
${row("main", "", "狂気表 1d10 狂気表(3) ＞ 感情の噴出")}
${row("メイン", "探索者B", "CCB&lt;=50 【聞き耳】 (1D100&lt;=50) ＞ 100 ＞ 致命的失敗")}
${row("main", "探索者A", "よろしくお願いします")}
</body></html>`;

  it("本文のダイスを type: roll にし、main と メイン は文書順のまま 1 つのタブにまとめる", () => {
    const log = parseCcfoliaLogHtml(html)!;
    expect(log.channels).toHaveLength(1);
    const msgs = log.channels[0]!.msgs;
    expect(msgs.map((m) => m.type)).toEqual(["text", "roll", "roll", "roll", "text"]);
    expect(msgs[1]!.roll).toMatchObject({ skill: "目星", result: "成功" });
    expect(msgs[2]).toMatchObject({ sp: "不明な発言者", roll: { result: "感情の噴出" } });
    expect(log.kinds["キーパー"]).toBe("KP");
  });

  it("時刻の無いログでも譜の点を発言の順に置く", () => {
    const marks = scoreMarks(parseCcfoliaLogHtml(html)!.channels);
    expect(marks).toHaveLength(3);
    expect(marks.map((m) => m.tone)).toEqual(["plain", "plain", "fumble"]);
    expect(marks[0]!.x).toBe(0);
    expect(marks.at(-1)!.x).toBe(1);
  });
});
