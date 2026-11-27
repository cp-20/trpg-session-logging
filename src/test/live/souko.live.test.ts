/**
 * TRPGキャラクターシート倉庫（character-sheets.appspot.com/{システム}/）を本物で通す。見本はシステムごとの新着一覧から拾う。
 * 入口は画面の取り込みと同じ handleExternalImport。
 */
import { describe, expect, it } from "vitest";
import type { ImportedCharacter } from "./live-kit";
import { discover, expectSomeCharacter, isNumeric, labelsOf, sectionOf } from "./live-kit";

const SHEET_LINK = /href="(edit\.html\?key=[A-Za-z0-9_-]+)"/;
const listOf = (sys: string) => `https://character-sheets.appspot.com/${sys}/`;

/** 特技表から習得した特技を読み、分野（列）を group に持つ */
function expectLearned(r: ImportedCharacter, id: string, fields: string[]) {
  const learned = sectionOf(r, id).entries;
  expect(learned.length).toBeGreaterThan(0);
  for (const e of learned) {
    expect(e.value).toBe("習得");
    expect(fields).toContain(e.group);
  }
}

const CASES: { sys: string; title: string; systemId: string; check: (r: ImportedCharacter) => void }[] = [
  {
    sys: "dx3",
    title: "ダブルクロス3rd は肉体・感覚・精神・社会を読む",
    systemId: "DoubleCross",
    check: (r) => {
      expect(labelsOf(sectionOf(r, "abilities"))).toEqual(["肉体", "感覚", "精神", "社会"]);
      for (const e of sectionOf(r, "abilities").entries) expect(isNumeric(e.value)).toBe(true);
    },
  },
  {
    sys: "shinobigami",
    title: "シノビガミは特技表から習得した特技を分野ごとに読む",
    systemId: "ShinobiGami",
    check: (r) => expectLearned(r, "skills", ["器術", "体術", "忍術", "謀術", "戦術", "妖術"]),
  },
  {
    sys: "insane",
    title: "インセインは特技表から習得した特技を分野ごとに読む",
    systemId: "Insane",
    check: (r) => expectLearned(r, "skills", ["暴力", "情動", "知覚", "技術", "知識", "怪異"]),
  },
  {
    sys: "mglg",
    title: "マギカロギアは特技表の中から習得した特技と、攻撃力・防御力・根源力を読む",
    systemId: "MagicaLogia",
    check: (r) => {
      expectLearned(r, "skills", ["星", "獣", "力", "歌", "夢", "闇"]);
      expect(labelsOf(sectionOf(r, "abilities"))).toEqual(["攻撃力", "防御力", "根源力"]);
    },
  },
  {
    sys: "helltv",
    title: "キルデスビジネスは特技表から習得した特技を読む",
    systemId: "KillDeathBusiness",
    check: (r) => expect(sectionOf(r, "skills").entries.length).toBeGreaterThan(0),
  },
  {
    sys: "stellar",
    title: "銀剣のステラナイツは耐久力・防御力を読む",
    systemId: "StellarKnights",
    check: (r) =>
      expect(labelsOf(sectionOf(r, "resources"))).toEqual(expect.arrayContaining(["耐久力", "防御力"])),
  },
  {
    sys: "satasupe",
    title: "サタスペは能力値（犯罪・生活・恋愛・教養・戦闘）を読む",
    systemId: "Satasupe",
    check: (r) => {
      expect(labelsOf(sectionOf(r, "abilities"))).toEqual(["犯罪", "生活", "恋愛", "教養", "戦闘"]);
      for (const e of sectionOf(r, "abilities").entries) expect(isNumeric(e.value)).toBe(true);
    },
  },
  {
    sys: "2s",
    title: "フタリソウサは習得した技能を読む",
    systemId: "FutariSousa",
    check: (r) => {
      const skills = sectionOf(r, "skills").entries;
      expect(skills.length).toBeGreaterThan(0);
      for (const e of skills) expect(e.value).toBe("習得");
    },
  },
];

describe("キャラクターシート倉庫（本物）", () => {
  it.each(CASES)("$title", async ({ sys, systemId, check }) => {
    const urls = await discover(listOf(sys), SHEET_LINK, 3);

    const r = await expectSomeCharacter(urls, (x) => {
      expect(x.character.systemId).toBe(systemId);
      expect(x.character.name.trim()).not.toBe("");
      check(x);
    });

    expect(r.provider).toBe("souko");
  });
});
