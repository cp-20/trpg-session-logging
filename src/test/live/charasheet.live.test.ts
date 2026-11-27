/**
 * キャラクター保管所（charasheet.vampire-blood.net）を本物で通す。見本はシステムごとの公開一覧（list_{game}.html）の新しいものから拾う。
 * 入口は画面の取り込みと同じ handleExternalImport（parseExternalUrl → fetchUrls → parseExternalResponse）。
 */
import { describe, expect, it } from "vitest";
import type { ImportedCharacter } from "./live-kit";
import { discover, expectSomeCharacter, isNumeric, labelsOf, sectionOf, sheetOf } from "./live-kit";

const SHEET_LINK = /href="(https:\/\/charasheet\.vampire-blood\.net\/\d+)"/;
const listOf = (game: string) => `https://charasheet.vampire-blood.net/list_${game}.html`;

function expectNamed(r: ImportedCharacter) {
  expect(r.character.name.trim()).not.toBe("");
}

function expectAbilities(r: ImportedCharacter, labels: string[]) {
  const abilities = sectionOf(r, "abilities");
  expect(labelsOf(abilities)).toEqual(expect.arrayContaining(labels));
  for (const e of abilities.entries) expect(isNumeric(e.value)).toBe(true);
}

const SW_ABILITIES = ["器用度", "敏捷度", "筋力", "生命力", "知力", "精神力"];

const CASES: { game: string; title: string; systemId: string; check: (r: ImportedCharacter) => void }[] = [
  {
    game: "coc",
    title: "クトゥルフ神話TRPG（6 版）は能力値 8 つと分類つきの技能を読む",
    systemId: "coc6",
    check: (r) => {
      expectAbilities(r, ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"]);
      expect(labelsOf(sectionOf(r, "resources"))).toEqual(expect.arrayContaining(["HP", "MP", "SAN"]));
      const groups = new Set(sectionOf(r, "skills").entries.map((e) => e.group));
      expect([...groups]).toEqual(expect.arrayContaining(["戦闘技能", "探索技能", "知識技能"]));
    },
  },
  {
    game: "coc7",
    title: "新クトゥルフ神話TRPG（7 版）は能力値・幸運と、初期値つきの技能を読む",
    systemId: "coc7",
    check: (r) => {
      expectAbilities(r, ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"]);
      expect(labelsOf(sectionOf(r, "resources"))).toEqual(
        expect.arrayContaining(["HP", "MP", "SAN", "幸運"]),
      );
      const skills = sectionOf(r, "skills").entries;
      expect(skills.map((e) => e.label)).toEqual(expect.arrayContaining(["回避", "目星", "聞き耳"]));
      for (const e of skills) expect(typeof e.base).toBe("number");
    },
  },
  {
    game: "swordworld2",
    title: "ソード・ワールド2.0 は 2.0 として、能力値 6 つと冒険者レベルを読む",
    systemId: "SwordWorld2.0",
    check: (r) => {
      expectAbilities(r, SW_ABILITIES);
      expect(labelsOf(sectionOf(r, "levels"))).toContain("冒険者レベル");
      expect(sheetOf(r).systemLabel).toBe("ソード・ワールド2.0");
      expect(typeof r.character.stats.lv).toBe("number");
    },
  },
  {
    game: "swordworld",
    title: "ソード・ワールド（無印）は無印として、能力値 6 つを読む",
    systemId: "SwordWorld",
    check: (r) => {
      expectAbilities(r, SW_ABILITIES);
      expect(typeof r.character.stats.lv).toBe("number");
    },
  },
  {
    game: "dx3",
    title: "ダブルクロス3rd は肉体・感覚・精神・社会と、能力値ごとの技能・エフェクトを読む",
    systemId: "DoubleCross",
    check: (r) => {
      expectAbilities(r, ["肉体", "感覚", "精神", "社会"]);
      const groups = sectionOf(r, "skills").entries.map((e) => e.group);
      for (const g of groups) expect(["肉体", "感覚", "精神", "社会"]).toContain(g);
      expect(sectionOf(r, "arts").entries.length).toBeGreaterThan(0);
    },
  },
  {
    game: "ara2",
    title: "アリアンロッド2E は能力値とスキルを読む",
    systemId: "Arianrhod",
    check: (r) => {
      expectAbilities(r, ["筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"]);
      expect(sectionOf(r, "skills").entries.length).toBeGreaterThan(0);
    },
  },
  {
    game: "gobusla",
    title: "ゴブリンスレイヤーTRPG は能力値と職業レベルを読む",
    systemId: "GoblinSlayer",
    check: (r) => {
      expectAbilities(r, ["体力", "魂魄", "技量", "知力"]);
      expect(sectionOf(r, "levels").entries.length).toBeGreaterThan(0);
    },
  },
  {
    game: "kmgkr",
    title: "神我狩は能力値を読む",
    systemId: "Kamigakari",
    check: (r) => {
      expect(sectionOf(r, "abilities").entries.length).toBeGreaterThan(0);
      for (const e of sectionOf(r, "abilities").entries) expect(isNumeric(e.value)).toBe(true);
    },
  },
  {
    game: "nechro",
    title: "ネクロニカはパーツを部位（頭・腕・胴・脚）ごとに読む",
    systemId: "Nechronica",
    check: (r) => {
      const parts = sectionOf(r, "parts").entries;
      expect(parts.length).toBeGreaterThan(0);
      for (const p of parts) expect(["頭", "腕", "胴", "脚"]).toContain(p.group);
    },
  },
  {
    game: "nw3",
    title: "ナイトウィザード3rd は能力値とキャラクターレベルを読む",
    systemId: "NightWizard3rd",
    check: (r) => {
      expectAbilities(r, ["筋力", "器用", "感覚", "理知"]);
      expect(labelsOf(sectionOf(r, "levels"))).toContain("CL");
    },
  },
];

describe("キャラクター保管所（本物）", () => {
  it.each(CASES)("$title", async ({ game, systemId, check }) => {
    const urls = await discover(listOf(game), SHEET_LINK, 3);

    const r = await expectSomeCharacter(urls, (x) => {
      expect(x.character.systemId).toBe(systemId);
      expectNamed(x);
      check(x);
    });

    expect(r.provider).toBe("charasheet");
  });

  it("一覧の共有用 URL（/m＋32 桁）でも同じ形で取り込める", async () => {
    const urls = await discover(
      listOf("dx3"),
      /href="(https:\/\/charasheet\.vampire-blood\.net\/m[0-9a-f]{32})"/,
      3,
    );

    const r = await expectSomeCharacter(urls, (x) => {
      expect(x.character.systemId).toBe("DoubleCross");
      expectNamed(x);
    });

    expect(r.url).toMatch(/^https:\/\/charasheet\.vampire-blood\.net\/m[0-9a-f]{32}$/);
  });
});
