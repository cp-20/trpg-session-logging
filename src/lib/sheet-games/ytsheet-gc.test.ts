import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetGc } from "./ytsheet-gc";

/** ゆとシートⅡ gc の JSON と同じキー構造の作り物（名前・値は架空） */
const SAMPLE = {
  class: "ロード",
  works: "騎士",
  style: "セイバー",
  gender: "男",
  level: 3,
  sttStrTotal: 13,
  sttStrCheckTotal: 6,
  sttRefTotal: 12,
  sttMndTotal: 12,
  sttMndCheckTotal: 5,
  sttHpTotal: 40,
  sttMpTotal: 33,
  sttInitTotal: 6,
  sttMoveTotal: 2,
  sttMaxWeight: 26,
  sttFateTotal: 3,
  skillStr1Label: "力技",
  skillStr1Lv: 2,
  skillStr2Label: "格闘",
  skillStr2Lv: 3,
  skillInt1Label: "専門知識:",
  skillInt1LabelBranch: "魔獣",
  skillInt1Lv: 2,
  skillEmp1Label: "芸術:",
  skillEmp1Lv: 1,
  classAbility1Name: "光炎の印",
  classAbility1Lv: 1,
  classAbility1Type: "天恵",
  classAbility1Timing: "セットアップ",
  classAbility1Check: "自動成功",
  classAbility1Range: "―",
  classAbility1Cost: 5,
  classAbility1MC: "FW",
  classAbility1Note: "武器に炎熱を付与する。",
  worksAbility1Name: "",
  magic1Name: "ファイアボルト",
  magic1Lv: 2,
  magic1Duration: "瞬間",
  magic1Dfclty: "対決",
  weaponMainName: "グレートソード",
  weaponMainType: "重武器（大剣）",
  weaponMainSkill: "〈重武器〉",
  weaponMainAcc: -1,
  weaponMainAtk: "12+3D",
  weaponMainWeight: 10,
  armorMainName: "メイル",
  armorMainDefWeapon: 4,
  armorMainDefFire: 9,
  armorMainEva: -2,
  vehicle1Name: "ウォーホース",
  vehicle1Move: 5,
  force1Type: "歩兵",
  force1Lv: 1,
  force1Hp: 20,
  force1Morale: 5,
  force1Str: 1,
  bond1Name: "幼なじみ",
  bond1Relation: "親友",
  bond1EmotionMain: "友情",
  bond1EmotionSub: "尊敬",
};

const find = (id: string) => readYtsheetGc(SAMPLE).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのグランクレストRPG を読む", () => {
  it("クラス・ワークス・スタイルを経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetGc(SAMPLE);
    expect(systemLabel).toBe("グランクレストRPG");
    expect(Object.fromEntries(compact(profile).map((e) => [e.label, e.value]))).toEqual({
      クラス: "ロード",
      ワークス: "騎士",
      スタイル: "セイバー",
      性別: "男",
    });
  });

  it("六つの能力値は合計を値にして判定値を補足にし、値のないものは出さない", () => {
    const ab = find("abilities")!.entries;
    expect(ab.map((e) => e.label)).toEqual(["筋力", "反射", "精神"]);
    expect(ab[0]).toEqual({ label: "筋力", value: 13, note: "判定値6" });
    expect(ab[1]).toEqual({ label: "反射", value: 12 });
  });

  it("HP・MP・行動値・移動力・所持可能重量・天運を副能力値にする", () => {
    expect(Object.fromEntries(find("resources")!.entries.map((e) => [e.label, e.value]))).toEqual({
      レベル: 3,
      HP: 40,
      MP: 33,
      行動値: 6,
      移動力: 2,
      所持可能重量: 26,
      天運: 3,
    });
  });

  it("技能は能力値ごとに分け、分野つきの技能は名前をつなげ、分野のない「芸術:」は印を外す", () => {
    const sk = find("skills")!.entries;
    expect(sk.find((e) => e.label === "格闘")).toMatchObject({ value: 3, group: "筋力" });
    expect(sk.find((e) => e.label === "専門知識:魔獣")).toMatchObject({ value: 2, group: "知力" });
    expect(sk.find((e) => e.label === "芸術")).toMatchObject({ value: 1, group: "共感" });
  });

  it("クラス特技・魔法はレベルと補足を読み、名前のない行は落とす", () => {
    expect(find("classAbilities")?.entries).toEqual([
      {
        label: "光炎の印",
        value: 1,
        note: "天恵　セットアップ　自動成功　コスト5　MC：FW　武器に炎熱を付与する。",
      },
    ]);
    expect(find("worksAbilities")?.entries ?? []).toEqual([]);
    expect(find("magic")?.entries[0]).toEqual({
      label: "ファイアボルト",
      value: 2,
      note: "瞬間　目標値対決",
    });
  });

  it("武器・防具・乗騎・部隊・絆を読む", () => {
    expect(find("weapons")?.entries[0]).toEqual({
      label: "グレートソード",
      value: "",
      note: "メイン　重武器（大剣）　〈重武器〉　命中-1　攻撃力12+3D　重量10",
    });
    expect(find("armors")?.entries[0]).toEqual({
      label: "メイル",
      value: "",
      note: "メイン　防御力 武器4/炎熱9　回避-2",
    });
    expect(find("vehicles")?.entries[0]).toMatchObject({ label: "ウォーホース", note: "移動5" });
    expect(find("forces")?.entries[0]).toEqual({
      label: "歩兵",
      value: 1,
      note: "HP20　士気5　筋力1",
    });
    expect(find("bonds")?.entries[0]).toEqual({ label: "幼なじみ", value: "親友", note: "友情／尊敬" });
  });

  it("引き継ぐ値（レベル）と HP・MP・天運を stats に入れる", () => {
    expect(readYtsheetGc(SAMPLE).stats).toEqual({ level: 3, hp: 40, mp: 33, fate: 3 });
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetGc(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
