import { describe, expect, it } from "vitest";
import type { MsgKind } from "../types";
import { sceneHeadingIndexes } from "./scene-headings";

const run = (rows: [MsgKind, string, string?][]) =>
  [
    ...sceneHeadingIndexes(
      rows.map(([kind, text, sp]) => ({ kind, text, sp: sp ?? kind, type: "text" as const })),
    ),
  ]
    .sort((a, b) => a - b)
    .map((i) => rows[i]![1]);

describe("場面の見出し", () => {
  it("記号を決め打ちせず、飾りと場面の言葉で見分ける", () => {
    const headings = [
      "～昼2～",
      "~夜3~",
      "◆ シーン1 終了",
      "◆ シーン終了。廊下へ移動。",
      "■第2章■",
      "【エンディング】",
      "★ 3日目",
      "# 導入",
      "シーン1",
      "――――",
    ];
    expect(run(headings.map((t): [MsgKind, string] => ["KP", t]))).toEqual(headings);
  });

  it("会話・技能・資料・補足・沈黙は見出しにしない", () => {
    expect(
      run([
        ["KP", "【連続失踪、三人目】"],
        ["KP", "〈目星〉を振りますか？"],
        ["KP", "『手記』山田太郎"],
        ["KP", "（本当は1d6です）"],
        ["KP", "……"],
        ["KP", "^^"],
        ["PC", "まだシーンは続きますか？"],
        ["PC", "★やったー"],
        ["PC", "♪～"],
        ["PC", "あーーーーー"],
        ["KP", "21:15～ 再開！"],
        ["KP", "◆ 個別情報：鍵を持っています。"],
        ["KP", "【目星】"],
        ["KP", "【聞き耳】"],
        ["KP", "◆ シーン1 終了\nここから先は次回です"],
      ]),
    ).toEqual([]);
  });

  it("GM が同じ飾りで違う題を重ねていれば、その卓の見出しとみなす", () => {
    expect(
      run([
        ["GM", "■旧校舎■"],
        ["GM", "話を聞く"],
        ["GM", "■屋上■"],
        ["PC", "☆えい☆"],
        ["PC", "☆やあ☆"],
        ["GM", "＊一度だけ＊"],
      ]),
    ).toEqual(["■旧校舎■", "■屋上■"]);
  });

  it("時間を飛ばす一言は GM のときだけ", () => {
    expect(
      run([
        ["KP", "翌日……"],
        ["PC", "翌日……"],
      ]),
    ).toEqual(["翌日……"]);
    expect([...sceneHeadingIndexes([{ kind: "KP", text: "翌日……", sp: "KP", type: "text" }])]).toEqual([0]);
  });
});
