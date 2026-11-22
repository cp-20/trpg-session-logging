import { describe, expect, it } from "vitest";
import { mergeLogParts } from "./log-merge";
import type { Channel, Msg } from "../types";

const msg = (ts: number, sp: string, text: string, extra: Partial<Msg> = {}): Msg => ({
  id: "x",
  ts,
  sp,
  kind: "PC",
  type: "text",
  text,
  ...extra,
});
const ch = (name: string, msgs: Msg[], secret = false): Channel => ({ id: name, name, secret, msgs });

describe("mergeLogParts: 複数のログを 1 つのセッションにまとめる", () => {
  it("同じ名前のタブをまとめ、発言を時刻順に並べ、ID を振り直す", () => {
    const day2 = { channels: [ch("メイン", [msg(300, "A", "2日目")]), ch("情報", [msg(310, "GM", "資料")])] };
    const day1 = {
      channels: [ch("雑談", [msg(50, "B", "よろしく")]), ch("メイン", [msg(100, "A", "1日目")])],
    };
    const out = mergeLogParts([day2, day1]);
    expect(out.map((c) => c.name)).toEqual(["メイン", "情報", "雑談"]);
    expect(out[0]!.msgs.map((m) => m.text)).toEqual(["1日目", "2日目"]);
    expect(new Set(out.flatMap((c) => c.msgs.map((m) => m.id))).size).toBe(4);
  });
  it("書き出しが重なって同じ発言が 2 回あれば 1 つにする（ダイスも）", () => {
    const roll = { cmd: "CC<=50", skill: "目星", dice: "1D100", result: "成功" };
    const a = {
      channels: [ch("メイン", [msg(100, "A", "x"), msg(110, "A", "", { type: "roll", text: null, roll })])],
    };
    const b = {
      channels: [ch("メイン", [msg(110, "A", "", { type: "roll", text: null, roll }), msg(120, "A", "y")])],
    };
    expect(mergeLogParts([a, b])[0]!.msgs.map((m) => m.ts)).toEqual([100, 110, 120]);
  });
  it("同じ時刻でも発言者か本文が違えば残す", () => {
    const a = { channels: [ch("メイン", [msg(100, "A", "x")])] };
    const b = { channels: [ch("メイン", [msg(100, "B", "x"), msg(100, "A", "z")])] };
    expect(mergeLogParts([a, b])[0]!.msgs).toHaveLength(3);
  });
  it("時刻のないログは重複とみなさず、選んだ順につなぐ。時刻のあるファイルは開始順で前へ", () => {
    const html1 = { channels: [ch("メイン", [msg(0, "A", "前半"), msg(0, "A", "前半")])] };
    const html2 = { channels: [ch("メイン", [msg(0, "A", "後半")])] };
    const timed = { channels: [ch("メイン", [msg(500, "A", "時刻あり")])] };
    expect(mergeLogParts([html1, html2, timed])[0]!.msgs.map((m) => m.text)).toEqual([
      "時刻あり",
      "前半",
      "前半",
      "後半",
    ]);
  });
  it("どれかで公開のタブは公開、1 つだけならそのまま返す", () => {
    const a = { channels: [ch("秘話", [msg(1, "A", "x")], true)] };
    const b = { channels: [ch("秘話", [msg(2, "B", "y")], false)] };
    expect(mergeLogParts([a, b])[0]!.secret).toBe(false);
    expect(mergeLogParts([a, { channels: [ch("秘話", [msg(3, "A", "z")], true)] }])[0]!.secret).toBe(true);
    expect(mergeLogParts([a])).toBe(a.channels);
  });
});
