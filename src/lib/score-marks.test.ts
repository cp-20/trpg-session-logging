import { describe, expect, it } from "vitest";
import type { Channel, Msg } from "../types";
import { scoreMarks } from "./score-marks";

const roll = (ts: number, sp: string, result = "成功", secret = false): Msg => ({
  id: `m${ts}`,
  ts,
  sp,
  kind: "PC",
  type: "roll",
  text: null,
  roll: { cmd: "CC<=50", skill: "", dice: "10", result, secret },
});
const talk = (ts: number, sp: string): Msg => ({ id: `t${ts}`, ts, sp, kind: "PC", type: "text", text: "…" });
const ch = (msgs: Msg[], secret = false): Channel => ({ id: "c", name: "メイン", secret, msgs });

describe("scoreMarks", () => {
  it("ダイスを時間の順に 0〜1 へ並べ、発言者ごとに段を分け、クリティカル・ファンブルを見分ける", () => {
    const marks = scoreMarks([
      ch([roll(100, "A"), roll(150, "B", "クリティカル"), roll(200, "A", "ファンブル")]),
    ]);
    expect(marks).toEqual([
      { x: 0, lane: 0, tone: "plain" },
      { x: 0.5, lane: 1, tone: "crit" },
      { x: 1, lane: 0, tone: "fumble" },
    ]);
  });
  it("ダイスが 3 つ未満なら発言で代える。時刻のない発言は描かない", () => {
    const marks = scoreMarks([ch([talk(10, "A"), talk(20, "B"), talk(0, "C"), roll(30, "A")])]);
    expect(marks).toHaveLength(3);
    expect(marks.map((m) => m.lane)).toEqual([0, 1, 0]);
  });
  it("多いときは間引いても、端の点とクリティカルは残る", () => {
    const msgs = Array.from({ length: 200 }, (_, i) =>
      roll(i, `P${i % 4}`, i === 77 ? "クリティカル" : "成功"),
    );
    const marks = scoreMarks([ch(msgs)], 12);
    expect(marks.length).toBeLessThanOrEqual(12);
    expect(marks[0]!.x).toBe(0);
    expect(marks.at(-1)!.x).toBe(1);
    expect(marks.some((m) => m.tone === "crit")).toBe(true);
  });
  it("ログがなければ空", () => {
    expect(scoreMarks([])).toEqual([]);
  });
});
