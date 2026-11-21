import { describe, expect, it } from "vitest";
import { SYSTEMS } from "../data/systems";
import { RIGHTS_NOTICES, RIGHTS_ORDER, SYSTEM_RIGHTS, rightsNoticesFor } from "./rights";

describe("権利表記", () => {
  it("すべてのシステムに権利表記の要否が決まっている", () => {
    expect(Object.keys(SYSTEM_RIGHTS).sort()).toEqual(Object.keys(SYSTEMS).sort());
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
