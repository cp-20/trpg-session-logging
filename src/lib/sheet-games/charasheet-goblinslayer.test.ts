import { describe, expect, it } from "vitest";
import { goblinSlayerFromCharasheet } from "./charasheet-goblinslayer";
import type { SheetSection } from "../sheet";

/** 保管所のゴブリンスレイヤーTRPG（game: "gobusla"）の形を真似た架空のシート */
const fixture = {
  game: "gobusla",
  pc_name: "試験 三郎",
  shuzoku_name: "人間",
  shutuji_name: "無頼",
  raireki_name: "牢獄",
  kaikou_name: "師匠",
  age: "30",
  sex: "男",
  NP1: "4",
  NP2: "0",
  NP3: "3",
  NP4: "3",
  NP5: "3",
  NP6: "2",
  NP7: "4",
  NP8: "25",
  NP9: "34",
  NP9pe: "30",
  NP10: "1",
  NP11: "7",
  lv: "3",
  GLv1: "0",
  GLv2: "4",
  GLv5: "3",
  GLv9: "0",
  now_exp: "2000",
  left_ap: "5",
  money: "25",
  effect_name: ["□秘法", "迎撃魔術", "", "□精霊使い", "雷矢"],
  effect_keitou: ["", "攻撃", "", "", "攻撃"],
  effect_zokusei: ["", "汎/物質", "", "", "雷"],
  effect_nanido: ["", "10", "", "", "12"],
  effect_taishou: ["", "扉", "", "", "-"],
  effect_range: ["", "10m", "", "", "30m"],
  ginou_header: ["生得", "", "出自"],
  ginou_name: ["体術", "", "獣人の野生"],
  ginou_lv: ["1", "0", "1"],
  ginou_memo: ["運動系判定+1", "", "鳥の目"],
  arms_name: ["金砕棒", "なし"],
  arms_hit: ["14", ""],
  arms_yoho: ["両手", ""],
  arms_rank: ["殴", ""],
  arms_iryoku: ["2d6+2", ""],
  arms_memo: ["長大", ""],
  armor_name: "綿鎧",
  armor_bougo: "2",
  item_name: ["鎮痛剤", ""],
  item_num: ["2", ""],
  item_memo: ["", ""],
  pc_making_memo: "生い立ち",
};

describe("保管所のゴブリンスレイヤーTRPG", () => {
  const parts = goblinSlayerFromCharasheet(fixture);
  const sec = (id: string): SheetSection | undefined => parts.sections.find((s) => s?.id === id) ?? undefined;
  const values = (id: string) => Object.fromEntries(sec(id)!.entries.map((e) => [e.label, e.value]));

  it("種族・出自・来歴・邂逅を読む", () => {
    const p = Object.fromEntries(parts.profile.flatMap((e) => (e ? [[e.label, e.value]] : [])));
    expect(p).toMatchObject({ 種族: "人間", 出自: "無頼", 来歴: "牢獄", 邂逅: "師匠" });
    expect(parts.systemLabel).toBe("ゴブリンスレイヤーTRPG");
  });

  it("能力値は 0 も含めて 7 つ読む", () => {
    expect(sec("abilities")!.entries.map((e) => [e.label, e.value])).toEqual([
      ["体力", 4],
      ["魂魄", 0],
      ["技量", 3],
      ["知力", 3],
      ["集中", 3],
      ["持久", 2],
      ["反射", 4],
    ]);
  });

  it("冒険者レベル・生命・呪文回数・経験点を読み、持ち越す値を stats にする", () => {
    expect(values("resources")).toMatchObject({
      冒険者レベル: 3,
      生命: 25,
      移動: 34,
      "移動（装備込み）": 30,
      呪文回数: 1,
      呪文抵抗: 7,
      現在の経験点: 2000,
      所持金: 25,
    });
    expect(parts.stats).toEqual({ hp: 25, exp: 2000, gold: 25, growth: 5 });
  });

  it("職業レベルは 1 以上のものだけ読む", () => {
    expect(sec("levels")!.entries.map((e) => [e.label, e.value])).toEqual([
      ["武道家", 4],
      ["魔術師", 3],
    ]);
  });

  it("呪文は見出し行を group にして、難易度を値にする", () => {
    const spells = sec("spells")!.entries;
    expect(spells.map((e) => [e.label, e.value, e.group, e.note])).toEqual([
      ["迎撃魔術", 10, "秘法", "攻撃　汎/物質　扉　10m"],
      ["雷矢", 12, "精霊使い", "攻撃　雷　30m"],
    ]);
  });

  it("技能・武器と防具・所持品を読み、空の行を落とす", () => {
    expect(sec("skills")!.entries.map((e) => [e.label, e.value, e.group])).toEqual([
      ["体術", 1, "生得"],
      ["獣人の野生", 1, "出自"],
    ]);
    expect(sec("equipment")!.entries.map((e) => [e.label, e.value, e.note])).toEqual([
      ["金砕棒", "2d6+2", "命中 14　両手　殴　長大"],
      ["綿鎧", "", "防護 2"],
    ]);
    expect(sec("items")!.entries.map((e) => [e.label, e.value])).toEqual([["鎮痛剤", 2]]);
  });
});
