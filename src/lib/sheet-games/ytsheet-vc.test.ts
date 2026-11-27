import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetVc } from "./ytsheet-vc";

/** ゆとシートⅡ vc の JSON と同じキー構造の作り物（名前・値は架空） */
const SAMPLE = {
  race: "センリ",
  class: "ウォーリア",
  style1: "ヘルパー",
  style2: "リーダー",
  gender: "男",
  vitality: 4,
  technic: 4,
  clever: 3,
  carisma: 5,
  level: 2,
  hpMax: 39,
  staminaMax: 9,
  staminaHalf: 4,
  battleTotalAcc: 4,
  battleTotalAtk: 5,
  battleTotalDef: 10,
  battleTotalEva: 10,
  battleTotalIni: 2,
  battleTotalStr: 39,
  battleTotalSpl: 0,
  battleWeaponName: "ロングソード",
  battleWeaponAtk: 3,
  battleWeaponEva: 1,
  battleHeadName: "ヘルム",
  battleHeadDef: 2,
  battleHeadMdf: 2,
  battleRaceName: "生存本能",
  battleRaceEva: 1,
  battleAcc1Name: "ドッジリング",
  battleAcc1Eva: 1,
  speciality1Name: "アドバイス",
  speciality1Note: "戦闘値判定を振り直す。シナリオ1回",
  speciality2Name: "",
  itemNum: 2,
  item1Name: "ポーション",
  item1Type: "消耗品",
  item1Lv: 1,
  item1Note: "HP回復",
  goods1Name: "ドリンク",
  goods1Type: "一般",
  goods1Note: "スタミナ2点回復",
  freeNote: "設定",
};

const find = (id: string) => readYtsheetVc(SAMPLE).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのヴィジランテ・コードを読む", () => {
  it("種族・クラス・スタイルを経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetVc(SAMPLE);
    expect(systemLabel).toBe("ヴィジランテ・コード");
    expect(Object.fromEntries(compact(profile).map((e) => [e.label, e.value]))).toEqual({
      種族: "センリ",
      クラス: "ウォーリア",
      スタイル: "ヘルパー／リーダー",
      性別: "男",
    });
  });

  it("四つの能力値と、レベル・HP・スタミナを読む", () => {
    expect(find("abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["バイタリティ", 4],
      ["テクニック", 4],
      ["クレバー", 3],
      ["カリスマ", 5],
    ]);
    const res = find("resources")!.entries;
    expect(res.find((e) => e.label === "スタミナ")).toEqual({ label: "スタミナ", value: 9, note: "半分4" });
    expect(res.find((e) => e.label === "HP")?.value).toBe(39);
  });

  it("戦闘値は合計を、命中値・詠唱値…の順で読む（0も値として残す）", () => {
    const labels = find("battle")!.entries.map((e) => e.label);
    expect(labels).toEqual(["命中値", "詠唱値", "回避値", "攻撃値", "物防値", "行動値", "耐久値"]);
    expect(find("battle")?.entries.find((e) => e.label === "攻撃値")?.value).toBe(5);
  });

  it("装備は武器・防具・種族特性・アクセサリの修正を補足にする", () => {
    expect(find("equipment")?.entries).toEqual([
      { label: "ロングソード", value: "", note: "武器　回避値+1　攻撃値+3" },
      { label: "ヘルム", value: "", note: "頭　物防値+2　魔防値+2" },
      { label: "生存本能", value: "", note: "種族特性　回避値+1" },
      { label: "ドッジリング", value: "", note: "アクセサリ　回避値+1" },
    ]);
  });

  it("特技・アイテム・グッズを読み、名前のない行を落とす", () => {
    expect(find("specialities")?.entries).toEqual([
      { label: "アドバイス", value: "", note: "戦闘値判定を振り直す。シナリオ1回" },
    ]);
    expect(find("items")?.entries).toEqual([{ label: "ポーション", value: 1, note: "消耗品　HP回復" }]);
    expect(find("goods")?.entries[0]).toMatchObject({ label: "ドリンク", note: "一般　スタミナ2点回復" });
  });

  it("引き継ぐ値（レベル）と HP・スタミナを stats に入れる", () => {
    expect(readYtsheetVc(SAMPLE).stats).toEqual({ level: 2, hp: 39, stamina: 9 });
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetVc(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
