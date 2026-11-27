import { describe, expect, it } from "vitest";
import { sheetSection } from "../sheet";
import { nightWizardFromCharasheet } from "./charasheet-nightwizard";

const fixture = {
  game: "nw3",
  pc_name: "試験 花子",
  pc_codename: "試験の二つ名",
  level: "3",
  class1_name: "魔剣使い",
  class2_name: "",
  main_attribute_name: "火",
  sub_attribute_name: "風",
  shuzoku: "人間",
  age: "17",
  sex: "女",
  NP1: "9",
  NP2: "10",
  NP3: "8",
  NP4: "5",
  NP5: "5",
  NP6: "6",
  NP7: "34",
  NP8: "14",
  NP9: "5",
  NP10: "2",
  BSUM1: "8",
  BSUM2: "10",
  BSUM3: "4",
  BSUM4: "12",
  BSUM5: "4",
  BSUM6: "2",
  max_weight: "10",
  max_memory: "6",
  money: "300000",
  effect_name: ["魔剣所持", "", "硬化神経"],
  effect_lv: ["1", "1", "2"],
  effect_timing: ["常時", "", "常時"],
  effect_hantei: ["自動", "", "自動"],
  effect_taisho: ["自身", "", "自身"],
  effect_range: ["", "", ""],
  effect_cost: ["", "", ""],
  effect_memo: ["ウィッチブレードを取得", "", "命中+[SL+1]"],
  effect_shozoku: ["魔剣使い", "", "強化人間"],
  arms_name: ["試験剣", ""],
  arms_status1: ["", ""],
  arms_status2: ["2", ""],
  arms_status5: ["3", ""],
  arms_range: ["至近", ""],
  ea_head_name: "試験の帽子",
  ea_head_status6: "1",
  ea_all_name: "",
  item_name: ["お守り", ""],
  item_num: ["2", "1"],
  item_memo: ["効果", ""],
  works_name: "学生",
  shutuji_name: "家系",
  shutuji_sonota: "古い家",
  mokuteki_name: "",
  pc_making_memo: "メモ本文",
};

describe("保管所のナイトウィザード3rdのシートを読む", () => {
  const { profile, sections, stats, systemLabel } = nightWizardFromCharasheet(fixture);
  const sheet = { sections: sections.filter((s) => s !== null) } as Parameters<typeof sheetSection>[0];

  it("クラス・属性・二つ名をプロフィールに出し、空のクラス2は出さない", () => {
    expect(systemLabel).toBe("ナイトウィザード The 3rd Edition");
    const labels = profile.flatMap((p) => (p ? [`${p.label}:${p.value}`] : []));
    expect(labels).toContain("クラス1:魔剣使い");
    expect(labels).toContain("属性:火/風");
    expect(labels).toContain("二つ名:試験の二つ名");
    expect(labels.some((l) => l.startsWith("クラス2"))).toBe(false);
  });

  it("能力値 10 個と戦闘値を読み、無い値は落とす", () => {
    const ab = sheetSection(sheet, "abilities")?.entries ?? [];
    expect(ab.map((e) => e.label)).toEqual([
      "筋力",
      "器用",
      "感覚",
      "理知",
      "意思",
      "幸運",
      "耐久",
      "魔法",
      "内包",
      "CF",
    ]);
    expect(ab.find((e) => e.label === "耐久")?.value).toBe(34);
    expect(sheetSection(sheet, "battle")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["行動", 8],
      ["命中", 10],
      ["魔導", 4],
      ["回避", 12],
      ["物攻", 4],
      ["物防", 2],
    ]);
  });

  it("特技をレベル・タイミング・効果で読み、名前のない行は捨てる", () => {
    const fx = sheetSection(sheet, "effects")?.entries ?? [];
    expect(fx.map((e) => [e.label, e.value, e.group])).toEqual([
      ["魔剣所持", "SL1", "魔剣使い"],
      ["硬化神経", "SL2", "強化人間"],
    ]);
    expect(fx[1]?.note).toBe("タイミング 常時 / 判定 自動 / 対象 自身 / 命中+[SL+1]");
  });

  it("武器・防具は 0 でない戦闘値だけを補足に出す", () => {
    const eq = sheetSection(sheet, "equipment")?.entries ?? [];
    expect(eq.map((e) => e.label)).toEqual(["試験剣", "試験の帽子"]);
    expect(eq[0]?.note).toBe("命中+2 物攻+3 至近");
    expect(eq[1]?.note).toBe("物防+1");
  });

  it("ライフパスは入力のある項目だけ出す", () => {
    expect(sheetSection(sheet, "lifepath")?.entries).toEqual([
      { label: "ワークス", value: "学生" },
      { label: "出自", value: "家系", note: "古い家" },
    ]);
  });

  it("キャラクターレベルと所持金を返す", () => {
    expect(stats).toEqual({ level: 3, money: 300000 });
    expect(sheetSection(sheet, "items")?.entries).toEqual([{ label: "お守り", value: 2, note: "効果" }]);
  });
});
