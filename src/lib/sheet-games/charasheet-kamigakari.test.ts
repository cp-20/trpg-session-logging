import { describe, expect, it } from "vitest";
import { sheetSection } from "../sheet";
import { kamigakariFromCharasheet } from "./charasheet-kamigakari";

const fixture = {
  game: "kmgkr",
  pc_name: "試験 太郎",
  manual_shuzoku: "人間",
  main_class: "ソードマスター",
  support_class: "ガーディアン",
  shuzoku: "試験組織",
  age: "20",
  sex: "男性",
  pc_shubetu: "人型",
  NB1: "5",
  NB2: "3",
  NB3: "2",
  NB4: "4",
  NB5: "1",
  NP1: "12",
  NP2: "3",
  NP3: "4",
  NP4: "5",
  NP5: "6",
  NP6: "7",
  NP7: "8",
  NP8: "10",
  NP9: "40",
  kaihi: "4",
  act: "13",
  ido: "5",
  zenryoku_ido: "15",
  def: "2",
  mdef: "",
  Level: "4",
  Start_Level: "3",
  exp_his_sum: "700",
  money: "1200",
  skill_name: ["斬撃", "", "常時効果"],
  skill_timing: ["攻撃", "", "常時"],
  skill_range: ["近接", "", "使用者"],
  skill_taisho: ["1体", "", "使用者"],
  skill_cost: ["偶", "", "なし"],
  skill_limit: ["", "", ""],
  skill_memo: ["物理攻撃", "", "ダメージ+1"],
  skill_shozoku: ["基本", "", "共通"],
  arms_name: ["試験剣", ""],
  arms_range: ["近接", ""],
  arms_target: ["1体", ""],
  arms_hit: ["12", ""],
  arms_damage: ["9", ""],
  arms_memo: ["素材:体力", ""],
  armor_name: "試験鎧",
  armor_def: "2",
  armor_act: "-1",
  acce1_name: "",
  item_name: ["━━━常備━━━", "回復薬", ""],
  item_num: ["1", "3", "1"],
  item_memo: ["", "体力20", ""],
  shutuji_name: "試験の出自",
  kyougu_name: "",
  shape_name: "炎",
  unmei_name: "目的の例",
  unmei_memo: "解説",
  cone_name: ["仲間", ""],
  cone_kankei: ["友人", ""],
  pc_making_memo: "メモ本文",
};

describe("保管所の神我狩のシートを読む", () => {
  const { profile, sections, stats, systemLabel } = kamigakariFromCharasheet(fixture);
  const sheet = { sections: sections.filter((s) => s !== null) } as Parameters<typeof sheetSection>[0];

  it("種族・称号・組織などをプロフィールに出す", () => {
    expect(systemLabel).toBe("神我狩");
    const labels = profile.flatMap((p) => (p ? [`${p.label}:${p.value}`] : []));
    expect(labels).toContain("種族:人間");
    expect(labels).toContain("メイン称号:ソードマスター");
    expect(labels).toContain("サブ称号:ガーディアン");
    expect(labels).toContain("組織:試験組織");
  });

  it("判定値と戦闘能力値を分け、回避と行動値は装備込みの合計を使う", () => {
    expect(sheetSection(sheet, "abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["体力", 5],
      ["敏捷", 3],
      ["知性", 2],
      ["精神", 4],
      ["幸運", 1],
    ]);
    const combat = sheetSection(sheet, "combat")?.entries ?? [];
    expect(combat.map((e) => e.label)).toEqual(["命中", "回避", "発動", "抵抗", "看破", "物D", "魔D"]);
    expect(combat.find((e) => e.label === "回避")?.value).toBe(4);
    const res = sheetSection(sheet, "resources")?.entries ?? [];
    expect(res.find((e) => e.label === "生命力")?.value).toBe(40);
    expect(res.find((e) => e.label === "行動値")?.value).toBe(13);
    expect(res.find((e) => e.label === "装甲")?.value).toBe(2);
  });

  it("空の結界や空の行は出さない", () => {
    const res = sheetSection(sheet, "resources")?.entries ?? [];
    expect(res.some((e) => e.label === "結界")).toBe(false);
    expect(sheetSection(sheet, "talents")?.entries.map((e) => e.label)).toEqual(["斬撃", "常時効果"]);
    expect(sheetSection(sheet, "lifepath")?.entries.map((e) => e.label)).toEqual([
      "経緯",
      "霊紋の形",
      "目的",
    ]);
    expect(sheetSection(sheet, "connections")?.entries).toHaveLength(1);
  });

  it("タレントをタイミングと、距離・対象・コスト・効果の補足で出す", () => {
    const t = sheetSection(sheet, "talents")?.entries[0];
    expect(t?.value).toBe("攻撃");
    expect(t?.note).toBe("距離 近接 / 対象 1体 / コスト 偶 / 物理攻撃");
    expect(t?.group).toBe("基本");
  });

  it("武器・防具と所持品を読み、区切り行は所持品にしない", () => {
    const eq = sheetSection(sheet, "equipment")?.entries ?? [];
    expect(eq.map((e) => e.label)).toEqual(["試験剣", "試験鎧"]);
    expect(eq[0]?.note).toContain("命中 12");
    expect(eq[1]?.note).toContain("装甲 2");
    expect(sheetSection(sheet, "items")?.entries).toEqual([{ label: "回復薬", value: 3, note: "体力20" }]);
  });

  it("経験点・レベル・所持金を引き継ぐ値として返す", () => {
    expect(stats).toEqual({ exp: 700, level: 4, money: 1200 });
    expect(sheetSection(sheet, "memo")?.text).toBe("メモ本文");
  });

  it("空のデータからは区分も値も作らない", () => {
    const empty = kamigakariFromCharasheet({});
    expect(empty.stats).toEqual({});
    expect(empty.sections.every((s) => s === null || (s.entries.length === 0 && !s.text))).toBe(true);
  });
});
