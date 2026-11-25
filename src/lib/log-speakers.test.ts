import { describe, expect, it } from "vitest";
import type { Channel, MsgKind } from "../types";
import { logSpeakers, splitSpeakers } from "./log-speakers";

const channel = (rows: [string, MsgKind, number][]): Channel => ({
  id: "c",
  name: "メイン",
  secret: false,
  msgs: rows.flatMap(([sp, kind, n]) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${sp}${i}`,
      ts: 0,
      sp,
      kind,
      type: "text" as const,
      text: "x",
    })),
  ),
});
const names = (rows: [string, MsgKind, number][]) => {
  const { main, rest } = splitSpeakers(logSpeakers([channel(rows)]));
  return { main: main.map((s) => s.sp), rest: rest.map((s) => s.sp) };
};

describe("発言者で絞り込みに並べる人", () => {
  it("発言の少ない NPC・描写・システムはまとめ、よく喋る NPC は並べる", () => {
    expect(
      names([
        ["KP", "GM", 100],
        ["system", "SYSTEM", 200],
        ["店主", "NPC", 3],
        ["相棒", "NPC", 40],
        ["湊", "PC", 60],
        ["あらすじ", "NARRATION", 30],
      ]),
    ).toEqual({ main: ["KP", "湊", "相棒"], rest: ["system", "あらすじ", "店主"] });
  });

  it("PC は発言が少なくても並べる", () => {
    expect(
      names([
        ["KP", "KP", 100],
        ["新人", "PC", 1],
      ]).main,
    ).toEqual(["KP", "新人"]);
  });

  it("NPC を足しても 8 人まで", () => {
    const { main, rest } = names([
      ["KP", "GM", 50],
      ...Array.from({ length: 12 }, (_, i): [string, MsgKind, number] => [`N${i}`, "NPC", 30]),
    ]);
    expect(main).toHaveLength(8);
    expect(rest).toHaveLength(5);
  });

  it("注記だけの名前は数えない", () => {
    expect(
      logSpeakers([
        {
          id: "c",
          name: "",
          secret: false,
          msgs: [{ id: "n", ts: 0, sp: "n", kind: "GM", type: "note", text: "" }],
        },
      ]),
    ).toEqual([]);
  });
});
