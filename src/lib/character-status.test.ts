import { describe, expect, it } from "vitest";
import type { Character } from "../types";
import { carriedValues } from "./character-growth";
import { statusSheet } from "./character-status";
import { buildSheet, section, sheetSection, splitSkills } from "./sheet";

type Input = Parameters<typeof statusSheet>[0];
function character(p: Partial<Input>): Input {
  return { systemId: "coc7", stats: {}, sessions: [], growth: [], ...p };
}
const SHEET = buildSheet("charaeno", {
  sections: [
    section("resources", "副能力値", "resources", [
      { label: "HP", value: 11 },
      { label: "SAN", value: 42, max: 99 },
    ]),
    section("skills", "技能", "skills", [{ label: "クトゥルフ神話", value: 3 }]),
  ],
})!;
const growth = (skill: string, date: string, to: number): Character["growth"][number] => ({
  id: `${skill}${date}`,
  logId: "s1",
  date,
  skill,
  from: to - 5,
  to,
});

describe("ステータス（閲覧専用）", () => {
  it("続く値だけ今の値に置き換え、SAN の上限は画面のほかの値と同じものになる", () => {
    const c = character({
      sheet: SHEET,
      stats: { san: 42 },
      sessions: [
        {
          logId: "s1",
          date: "2026-11-14",
          title: "",
          delta: { san: { before: 47, after: 40 } },
          rolls: [],
          memo: "",
        },
      ],
    });
    expect(sheetSection(statusSheet(c), "resources")?.entries).toEqual([
      { label: "HP", value: 11 },
      { label: "SAN", value: 40, max: 96 },
    ]);
    expect(carriedValues(c)).toEqual([{ key: "san", label: "SAN", value: 40, max: 96 }]);
    expect(SHEET.sections[0]!.entries[1]!.value).toBe(42);
  });

  it("キャラシに書かれていない続く値は足す", () => {
    const sheet = buildSheet("ytsheet", {
      sections: [section("levels", "技能", "levels", [{ label: "冒険者レベル", value: 2 }])],
    })!;
    const got = statusSheet(character({ systemId: "sw25", sheet, stats: { lv: 3, honor: 40 } }));
    expect(sheetSection(got, "levels")?.entries[0]?.value).toBe(3);
    expect(sheetSection(got, "resources")?.entries).toEqual([{ label: "名誉点", value: 40 }]);
  });

  it("能力値に書かれている続く値（サタスペの犯罪など）は、その場で今の値にして副能力値に重ねない", () => {
    const sheet = buildSheet("souko", {
      sections: [
        section("abilities", "能力値", "abilities", [
          { label: "犯罪", value: 3 },
          { label: "生活", value: 1 },
        ]),
        section("power", "戦闘力", "resources", [{ label: "反応力", value: 9 }]),
      ],
    })!;
    const got = statusSheet(character({ systemId: "Satasupe", sheet, stats: { crime: 4, life: 1 } }));
    expect(sheetSection(got, "abilities")?.entries).toEqual([
      { label: "犯罪", value: 4 },
      { label: "生活", value: 1 },
    ]);
    expect(sheetSection(got, "power")?.entries).toEqual([{ label: "反応力", value: 9 }]);
  });

  it("キャラシがなければ続く値と、成長した技能の今の値で作る。続かない値は出さない", () => {
    const got = statusSheet(
      character({
        stats: { san: 44, mp: 12, luck: 60 },
        growth: [growth("目星", "2026-11-14", 77), growth("目星", "2026-09-12", 65)],
      }),
    )!;
    expect(sheetSection(got, "resources")?.entries).toEqual([{ label: "SAN", value: 44 }]);
    expect(sheetSection(got, "skills")?.entries).toEqual([
      { label: "目星", value: 77, grown: true, group: "探索技能" },
    ]);
    expect(sheetSection(got, "abilities")).toBeUndefined();
  });

  it("何も持たないキャラクターでは作らない", () => {
    expect(statusSheet(character({}))).toBeUndefined();
    expect(statusSheet(character({ systemId: "madamis" }))).toBeUndefined();
    expect(statusSheet(character({ systemId: "general", stats: { hp: 10 } }))).toBeUndefined();
  });
});

describe("splitSkills", () => {
  it("伸ばした技能を高い順に、残りを別にする", () => {
    const { main, rest } = splitSkills([
      { label: "a", value: 40, base: 25 },
      { label: "b", value: 25, base: 25 },
      { label: "c", value: 70, base: 1 },
    ]);
    expect(main.map((e) => e.label)).toEqual(["c", "a"]);
    expect(rest.map((e) => e.label)).toEqual(["b"]);
  });

  it("段階のある技能は段階が先", () => {
    const { main } = splitSkills([
      { label: "a", value: 9, rank: { value: 1, max: 3 } },
      { label: "b", value: 5, rank: { value: 3, max: 3 } },
    ]);
    expect(main.map((e) => e.label)).toEqual(["b", "a"]);
  });

  it("伸ばした印がなければ高いほうから見せ、少なければ全部", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ label: `s${i}`, value: i }));
    expect(splitSkills(many).main.map((e) => e.value)[0]).toBe(29);
    expect(splitSkills(many).rest).toHaveLength(18);
    expect(splitSkills(many.slice(0, 10)).rest).toEqual([]);
  });
});
