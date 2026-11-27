import { describe, expect, it } from "vitest";
import { arianrhod2eFromCharasheet } from "./charasheet-arianrhod2e";
import type { SheetSection } from "../sheet";

/** 保管所のアリアンロッド 2E（game: "ara2"）の形を真似た架空のシート */
const fixture = {
  game: "ara2",
  pc_name: "試験 花子",
  shuzoku: "エルダナーン",
  main_class: "メイジ",
  support_class: "セージ",
  age: "14",
  sex: "女",
  V_level: "5",
  V_fate: "3",
  NK1: "6",
  NK2: "9",
  NK3: "7",
  NK4: "12",
  NK5: "8",
  NK6: "10",
  NK7: "7",
  NB1: "2",
  NB2: "3",
  NB3: "2",
  NB4: "4",
  NB5: "2",
  NB6: "3",
  NB7: "2",
  NP1: "2",
  NP2: "3",
  NP3: "2",
  NP4: "6",
  NP5: "2",
  NP6: "4",
  NP7: "2",
  NP8: "40",
  NP9: "55",
  BSUM1R: "1",
  BSUM1T: "",
  BSUM2R: "8",
  BSUM3: "2",
  BSUM4: "3",
  BSUM5: "9",
  BSUM6: "5",
  BSUM7: "12",
  dice_meichu: "2",
  money: "1500",
  seicho_point: "20",
  exp_his_sum: "300",
  seichoten_left: "40",
  shuzoku_skill_name: "マジックセンス",
  shuzoku_skill_timing: "パッシヴ",
  shuzoku_skill_hantei: "-",
  shuzoku_skill_taisho: "自身",
  shuzoku_skill_range: "-",
  shuzoku_skill_cost: "-",
  shuzoku_skill_memo: "知力基本値+3",
  shuzoku_skill_shozoku: "エルダナーン",
  skill_name: ["ファイアボルト", "＜パッシブ＞", "コンセントレイション"],
  skill_lv: ["3", "10", "★"],
  skill_timing: ["メジャー", "", "パッシブ"],
  skill_hantei: ["魔術", "", "-"],
  skill_taisho: ["単体", "", "自身"],
  skill_range: ["20m", "", "-"],
  skill_cost: ["6", "", "-"],
  skill_memo: ["2D+10の火属性魔法ダメージ", "", "魔術判定+1D"],
  skill_shozoku: ["メイジ", "", "メイジ"],
  ippanskill_name: ["バイタリティ"],
  ippanskill_lv: ["★"],
  ippanskill_memo: ["【最大HP】+10"],
  IR_name: "ロッド",
  IR_memo: "魔術判定+1D",
  IL_name: "",
  IB_name: "ローブ",
  pc_making_memo: "経歴の本文",
};

describe("保管所のアリアンロッド 2E", () => {
  const parts = arianrhod2eFromCharasheet(fixture);
  const sec = (id: string): SheetSection | undefined => parts.sections.find((s) => s?.id === id) ?? undefined;
  const values = (id: string) => Object.fromEntries(sec(id)!.entries.map((e) => [e.label, e.value]));

  it("種族とクラスを読む", () => {
    const p = Object.fromEntries(parts.profile.flatMap((e) => (e ? [[e.label, e.value]] : [])));
    expect(p).toMatchObject({ 種族: "エルダナーン", メインクラス: "メイジ", サポートクラス: "セージ" });
    expect(parts.systemLabel).toBe("アリアンロッド 2E");
  });

  it("能力値は修正込みの値を主に、基本値とボーナスを補足にする", () => {
    const abilities = sec("abilities")!.entries;
    expect(abilities.map((e) => e.label)).toEqual(["筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"]);
    expect(abilities[3]).toMatchObject({ value: 6, note: "基本値 12　ボーナス 4" });
  });

  it("レベル・HP・MP・フェイトと戦闘の値を読む", () => {
    expect(values("resources")).toMatchObject({
      レベル: 5,
      HP: 40,
      MP: 55,
      フェイト: 3,
      命中判定: 1,
      攻撃力: 8,
      回避判定: 2,
      物理防御: 3,
      魔法防御: 9,
      行動値: 5,
      移動力: 12,
      所持金: 1500,
      獲得経験点: 300,
      残り経験点: 40,
      成長点: 20,
    });
    expect(parts.stats).toEqual({ hp: 40, mp: 55, fate: 3, level: 5, exp: 300, gold: 1500 });
  });

  it("スキルは所属を group に、タイミングなどを補足にして、見出し行を落とす", () => {
    const skills = sec("skills")!.entries;
    expect(skills.map((e) => e.label)).toEqual(["マジックセンス", "ファイアボルト", "コンセントレイション"]);
    expect(skills[0]).toMatchObject({ group: "エルダナーン", note: "パッシヴ　自身：知力基本値+3" });
    expect(skills[1]).toMatchObject({
      value: 3,
      group: "メイジ",
      note: "メジャー　魔術　単体　20m　6：2D+10の火属性魔法ダメージ",
    });
    expect(skills[2].value).toBe("★");
    expect(sec("general-skills")!.entries[0]).toMatchObject({ label: "バイタリティ", value: "★" });
  });

  it("装備は部位ごとに読み、空の部位を落とす", () => {
    expect(sec("equipment")!.entries.map((e) => [e.label, e.value])).toEqual([
      ["右手", "ロッド"],
      ["胴", "ローブ"],
    ]);
  });

  it("経験点が空なら経験点を出さない", () => {
    const p = arianrhod2eFromCharasheet({ V_level: "1", NP8: "10", seichoten_left: "-1800" });
    expect(p.stats).toEqual({ hp: 10, level: 1 });
    expect(p.sections.find((s) => s?.id === "resources")?.entries.map((e) => e.label)).toEqual([
      "レベル",
      "HP",
    ]);
  });
});
