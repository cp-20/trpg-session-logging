/**
 * ゆとシートⅡ（yutorize.work/ytsheet/{システム}/）を本物で通す。見本はシステムごとの一覧（?mode=list）の新しいものから拾う。
 * 入口は画面の取り込みと同じ handleExternalImport。
 */
import { describe, expect, it } from "vitest";
import type { ImportedCharacter } from "./live-kit";
import { discover, expectSomeCharacter, isNumeric, labelsOf, sectionOf, sheetOf } from "./live-kit";

const SHEET_LINK = /href="(\.\/\?id=[A-Za-z0-9_-]+)"/;
const listOf = (path: string) => `https://yutorize.work/ytsheet/${path}/?mode=list`;

function expectAbilities(r: ImportedCharacter, labels: string[], id = "abilities") {
  const abilities = sectionOf(r, id);
  expect(labelsOf(abilities)).toEqual(expect.arrayContaining(labels));
  for (const e of abilities.entries) expect(isNumeric(e.value)).toBe(true);
}

const SW_ABILITIES = ["器用度", "敏捷度", "筋力", "生命力", "知力", "精神力"];

const CASES: {
  path: string;
  title: string;
  systemId: string;
  label?: string;
  check: (r: ImportedCharacter) => void;
}[] = [
  {
    path: "sw2.5",
    title: "ソード・ワールド2.5 は能力値 6 つと冒険者レベル・経験点を読む",
    systemId: "sw25",
    check: (r) => {
      expectAbilities(r, SW_ABILITIES);
      expect(labelsOf(sectionOf(r, "levels"))).toContain("冒険者レベル");
      expect(typeof r.character.stats.lv).toBe("number");
    },
  },
  {
    path: "sw2.0",
    title: "ソード・ワールド2.0 は 2.0 として能力値 6 つを読む",
    systemId: "SwordWorld2.0",
    label: "ソード・ワールド2.0",
    check: (r) => {
      expectAbilities(r, SW_ABILITIES);
      expect(labelsOf(sectionOf(r, "levels"))).toContain("冒険者レベル");
    },
  },
  {
    path: "dx3rd",
    title: "ダブルクロス3rd は肉体・感覚・精神・社会と、能力値ごとの技能を読む",
    systemId: "DoubleCross",
    check: (r) => {
      expectAbilities(r, ["肉体", "感覚", "精神", "社会"]);
      for (const e of sectionOf(r, "skills").entries)
        expect(["肉体", "感覚", "精神", "社会"]).toContain(e.group);
    },
  },
  {
    path: "ar2e",
    title: "アリアンロッド2E は能力値とクラスを読む",
    systemId: "Arianrhod",
    check: (r) => {
      expectAbilities(r, ["筋力", "器用", "敏捷", "知力"]);
      expect(labelsOf(sectionOf(r, "levels"))).toEqual(expect.arrayContaining(["メインクラス"]));
    },
  },
  {
    path: "gs",
    title: "ゴブリンスレイヤーTRPG は第一能力値と職業を読む",
    systemId: "GoblinSlayer",
    check: (r) => {
      expectAbilities(r, ["体力点", "魂魄点", "技量点", "知力点"]);
      expect(labelsOf(sectionOf(r, "levels"))).toContain("冒険者レベル");
    },
  },
  {
    path: "blp",
    title: "ブラッドパスは技・情と耐久値を読む",
    systemId: "general",
    label: "ブラッドパス",
    check: (r) => {
      expectAbilities(r, ["技", "情"]);
      expect(labelsOf(sectionOf(r, "resources"))).toContain("耐久値");
    },
  },
  {
    path: "kiz",
    title: "キズナバレットは耐久値・作戦力を読む",
    systemId: "KizunaBullet",
    check: (r) => {
      expect(labelsOf(sectionOf(r, "resources"))).toEqual(expect.arrayContaining(["耐久値", "作戦力"]));
    },
  },
  {
    path: "vc",
    title: "ヴィジランテ・コードは能力値 4 つと HP を読む",
    systemId: "general",
    label: "ヴィジランテ・コード",
    check: (r) => {
      expectAbilities(r, ["バイタリティ", "テクニック", "クレバー", "カリスマ"]);
      expect(labelsOf(sectionOf(r, "resources"))).toContain("HP");
    },
  },
  {
    path: "ms",
    title: "マモノスクランブルは身体・異質・社会と耐久値を読む",
    systemId: "MamonoScramble",
    check: (r) => {
      expectAbilities(r, ["身体", "異質", "社会"]);
      expect(labelsOf(sectionOf(r, "resources"))).toContain("耐久値");
    },
  },
  {
    path: "gc",
    title: "グランクレストRPG は能力値と、能力値ごとの技能を読む",
    systemId: "GranCrest",
    check: (r) => {
      expectAbilities(r, ["筋力", "反射", "感覚", "知力"]);
      expect(sectionOf(r, "skills").entries.every((e) => typeof e.group === "string")).toBe(true);
    },
  },
];

describe("ゆとシートⅡ（本物）", () => {
  it.each(CASES)("$title", async ({ path, systemId, label, check }) => {
    const urls = await discover(listOf(path), SHEET_LINK, 3);

    const r = await expectSomeCharacter(urls, (x) => {
      expect(x.character.systemId).toBe(systemId);
      expect(x.character.name.trim()).not.toBe("");
      if (label) expect(sheetOf(x).systemLabel).toBe(label);
      check(x);
    });

    expect(r.provider).toBe("ytsheet");
  });
});
