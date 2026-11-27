import { describe, expect, it } from "vitest";
import { DETAILED_SYSTEM_IDS, SYSTEMS } from "../data/systems";
import { RIGHTS_NOTICES, RIGHTS_ORDER, SYSTEM_RIGHTS, rightsNoticesFor } from "./rights";

describe("権利表記", () => {
  it("能力値・技能まで持つシステムには権利表記の要否が決まっている", () => {
    for (const id of DETAILED_SYSTEM_IDS) expect(SYSTEM_RIGHTS, id).toHaveProperty([id]);
  });

  it("権利者を書いたシステムはすべて実在する", () => {
    for (const id of Object.keys(SYSTEM_RIGHTS)) expect(SYSTEMS, id).toHaveProperty([id]);
  });

  it("BCDice の一覧から作ったシステムも、表記が分からないものは何も出さずに通る", () => {
    expect(rightsNoticesFor(Object.keys(SYSTEMS)).map((n) => n.id)).toEqual([...RIGHTS_ORDER]);
    expect(rightsNoticesFor(["Insane", "Cthulhu:Korean"])).toEqual([]);
    expect(rightsNoticesFor(["DoubleCross"])[0]?.lines).toEqual([
      "本作は、「著：矢野俊策／F.E.A.R.、KADOKAWA」が権利を有する『ダブルクロス The 3rd Edition』の二次創作作品です。",
    ]);
    expect(rightsNoticesFor(["PulpCthulhu", "SwordWorld2.0"]).map((n) => n.id)).toEqual([
      "cthulhu",
      "sword-world",
    ]);
  });

  it("引数なしならすべての権利表記を表示順で返す", () => {
    expect(rightsNoticesFor().map((n) => n.id)).toEqual([...RIGHTS_ORDER]);
  });

  it("システムに合う表記だけを重複なく返す", () => {
    expect(rightsNoticesFor(["coc6", "coc7", "general", undefined]).map((n) => n.id)).toEqual(["cthulhu"]);
    expect(rightsNoticesFor(["emoklore", "sw25"]).map((n) => n.id)).toEqual(["sword-world", "emoklore"]);
    expect(rightsNoticesFor(["madamis", "unknown"])).toEqual([]);
  });

  it("権利者の表示例どおりの文言を保つ", () => {
    expect(RIGHTS_NOTICES.cthulhu.lines[0]).toBe(
      "本作は、「株式会社アークライト」及び「株式会社KADOKAWA」が権利を有する『クトゥルフ神話TRPG』シリーズの二次創作物です。",
    );
    expect(RIGHTS_NOTICES["sword-world"].lines).toEqual([
      "本作は、「グループＳＮＥ」及び「株式会社ＫＡＤＯＫＡＷＡ」が権利を有する『ソード・ワールド2.0/2.5』の、二次創作です。",
      "(C)GroupSNE",
      "(C)KADOKAWA",
    ]);
  });
});
