import { describe, expect, it } from "vitest";
import { parseCharaenoJson, parseIacharaSheet } from "./sheet-sources";
import { buildSheet, section, sheetSection, type CharacterSheet } from "./sheet";
import {
  coc6AbilityRoll,
  coc7Levels,
  cthulhuMythos,
  isMythosSkill,
  knownMythos,
  sanMax,
  swBonusText,
  withSanMax,
} from "./system-rules";
import iachara6 from "./__fixtures__/iachara-6th.json";
import iachara7 from "./__fixtures__/iachara-7th.json";

function cocSheet(skills: [string, number][], max?: number): CharacterSheet {
  return buildSheet("charaeno", {
    sections: [
      section("abilities", "能力値", "abilities", [{ label: "INT", value: 13 }]),
      section("resources", "副能力値", "resources", [
        { label: "SAN", value: 60, ...(max != null ? { max } : {}) },
      ]),
      section(
        "skills",
        "技能",
        "skills",
        skills.map(([label, value]) => ({ label, value })),
      ),
    ],
  })!;
}

describe("SAN の上限（99 − クトゥルフ神話）", () => {
  it.each([
    "クトゥルフ神話",
    "クトゥルフ神話技能",
    "クトゥルフ神話 技能",
    "クトゥルフ神話（知識）",
    "ｸﾄｩﾙﾌ神話",
    "クトゥルー神話",
    "Cthulhu Mythos",
    "CTHULHU MYTHOS (00%)",
    "CthulhuMythos",
  ])("%s をクトゥルフ神話と読む", (label) => {
    expect(isMythosSkill(label)).toBe(true);
  });

  it.each(["神話", "オカルト", "クトゥルフ", "北欧神話", "クトゥルフ神話TRPG 7版"])(
    "%s はクトゥルフ神話と読まない",
    (label) => {
      expect(isMythosSkill(label)).toBe(false);
    },
  );

  it("6 版・7 版ともキャラシの技能から導き、キャラシに書かれた上限より優先する", () => {
    for (const systemId of ["coc6", "coc7"]) {
      const fixed = withSanMax(cocSheet([["クトゥルフ神話", 5]], 99), systemId);
      expect(sheetSection(fixed, "resources")?.entries[0]?.max).toBe(94);
    }
  });

  it("実データ（いあきゃら 6 版・7 版）でも技能と上限が合う", () => {
    for (const raw of [iachara6, iachara7]) {
      const parsed = parseIacharaSheet(raw)!;
      const mythos = cthulhuMythos(parsed.sheet)!;
      const san = sheetSection(withSanMax(parsed.sheet!, parsed.systemId!), "resources")?.entries.find(
        (e) => e.label === "SAN",
      );
      expect(san?.max).toBe(99 - mythos);
    }
  });

  it("キャラエノの 99 のままの上限も直す", () => {
    const parsed = parseCharaenoJson(
      {
        name: "a",
        characteristics: { str: 1 },
        attribute: { hp: 1, mp: 1, san: { value: 50, max: 99 } },
        skills: [{ name: "クトゥルフ神話", value: 12, edited: true }],
      },
      "https://charaeno.com/6th/x",
    );
    if (!parsed) throw new Error("読めない");
    expect(
      sheetSection(withSanMax(parsed.sheet!, "coc6"), "resources")?.entries.find((e) => e.label === "SAN")
        ?.max,
    ).toBe(87);
  });

  it("クトゥルフ神話が分からなければキャラシの上限、それもなければ言い切らない", () => {
    expect(cthulhuMythos(cocSheet([["目星", 60]]))).toBeUndefined();
    expect(sanMax(undefined, 99)).toBe(99);
    expect(sanMax(undefined)).toBeUndefined();
    expect(sanMax(0)).toBe(99);
    expect(sanMax(120)).toBe(0);
  });

  it("キャラシがなければ最後に記録した成長から分かる", () => {
    const growth = [
      { skill: "クトゥルフ神話", date: "2026-11-01", to: 8 },
      { skill: "クトゥルフ神話", date: "2026-09-01", to: 3 },
    ];
    expect(knownMythos({ growth })).toBe(8);
    expect(knownMythos({ growth, sheet: cocSheet([["クトゥルフ神話", 10]]) })).toBe(10);
    expect(knownMythos({})).toBeUndefined();
  });

  it("ほかのシステムの SAN には触らない", () => {
    const sheet = cocSheet([["クトゥルフ神話", 5]], 99);
    expect(withSanMax(sheet, "emoklore")).toBe(sheet);
  });
});

describe("能力値から決まる値", () => {
  it("7 版のハード・イクストリームは切り捨て", () => {
    expect(coc7Levels(65)).toEqual({ hard: 32, extreme: 13 });
  });

  it("6 版の ×5 は、同じ値の副能力値があれば出さない", () => {
    const sheet = cocSheet([]);
    expect(coc6AbilityRoll({ label: "INT", value: 13 }, sheet)).toBe(65);
    const idea = {
      ...sheet,
      sections: [section("resources", "", "resources", [{ label: "アイデア", value: 65 }])],
    };
    expect(coc6AbilityRoll({ label: "INT", value: 13 }, idea)).toBeUndefined();
    expect(coc6AbilityRoll({ label: "STR", value: 10 }, idea)).toBe(50);
  });

  it("ソード・ワールドの能力値ボーナスは 6 で割って切り捨て", () => {
    expect([5, 6, 11, 12, 20].map(swBonusText)).toEqual(["+0", "+1", "+1", "+2", "+3"]);
  });
});
