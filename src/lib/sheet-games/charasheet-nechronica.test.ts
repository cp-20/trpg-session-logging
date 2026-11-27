import { describe, expect, it } from "vitest";
import { sheetSection } from "../sheet";
import { nechronicaFromCharasheet } from "./charasheet-nechronica";

const pad = <T>(a: T[], fill: T, n = 8): T[] => [...a, ...Array<T>(n - a.length).fill(fill)];

const fixture = {
  game: "nechro",
  Position_Name: "アリス",
  MCLS_Name: "ステーシー",
  SCLS_Name: "ホリック",
  shuzoku: "ドール",
  age: "14",
  sex: "煉獄",
  pc_carma: "罪人",
  NP1: "1",
  NP2: "2",
  NP3: "0",
  Act_Total: "9",
  exp_his_sum: "5",
  Power_name: pad(["個性", "突撃", "", "のうみそ", "こぶし", "ほね"], ""),
  Power_hantei: pad(["1", "2", "0", "4", "5", "7"], "0"),
  Power_Type: pad(["4", "1", "0", "3", "1", "7"], "0"),
  Power_timing: pad(["0", "1", "0", "0", "1", "1"], "0"),
  Power_cost: pad(["-", "2", "", "", "2", "1"], ""),
  Power_range: pad(["自身", "0", "", "", "0", "自身"], ""),
  Power_memo: pad(["補助効果", "肉弾攻撃", "", "最大行動値+2", "肉弾攻撃1", "移動1"], ""),
  Power_shozoku: pad(["アリス", "ステーシー", "", "基本パーツ", "基本パーツ", "改造1"], ""),
  Power_Lost: pad(["0", "0", "0", "0", "1", "0"], "0"),
  Power_Used: pad(["0", "1", "0", "0", "0", "0"], "0"),
  roice_name: ["相棒", "", ""],
  roice_pos: ["依存", "", ""],
  roice_damage: ["2", "3", "3"],
  roice_neg: ["幼児退行", "", ""],
  roice_break: ["最大行動値-2", "", ""],
  roice_memo: ["パーツで所持", "", ""],
  carma_name: ["記憶のカケラを獲得する", "もう一つ", ""],
  carma_completed: ["1", "", ""],
  carma_memo: ["", "詳細", ""],
  kakera_name: ["訓練", ""],
  kakera_memo: ["思い出", ""],
  pc_making_memo: "メモ本文",
};

describe("保管所のネクロニカのシートを読む", () => {
  const { profile, sections, stats, systemLabel } = nechronicaFromCharasheet(fixture);
  const sheet = { sections: sections.filter((s) => s !== null) } as Parameters<typeof sheetSection>[0];

  it("ポジション・クラス・暗示などをプロフィールに出す", () => {
    expect(systemLabel).toBe("永い後日談のネクロニカ");
    const labels = profile.flatMap((p) => (p ? [`${p.label}:${p.value}`] : []));
    expect(labels).toEqual([
      "ポジション:アリス",
      "メインクラス:ステーシー",
      "サブクラス:ホリック",
      "種族:ドール",
      "享年:14",
      "初期配置:煉獄",
      "暗示:罪人",
    ]);
  });

  it("パーツを部位（頭・腕・脚）ごとに分け、ポジション・クラスのマニューバと混ぜない", () => {
    const parts = sheetSection(sheet, "parts")?.entries ?? [];
    expect(parts.map((e) => [e.group, e.label])).toEqual([
      ["頭", "のうみそ"],
      ["腕", "こぶし"],
      ["脚", "ほね"],
    ]);
    const man = sheetSection(sheet, "maneuvers")?.entries ?? [];
    expect(man.map((e) => [e.group, e.label])).toEqual([
      ["ポジション", "個性"],
      ["メインクラス", "突撃"],
    ]);
  });

  it("マニューバのタイミング・カテゴリ・コスト・射程・損傷を読む", () => {
    const arm = sheetSection(sheet, "parts")?.entries[1];
    expect(arm?.value).toBe("アクション");
    expect(arm?.note).toBe("通常技 / コスト 2 / 射程 0 / 肉弾攻撃1 / 取得先 基本パーツ / 損傷");
    const used = sheetSection(sheet, "maneuvers")?.entries[1];
    expect(used?.note).toContain("使用済");
  });

  it("未練を対象・種類・狂気度・発狂効果で出し、名前のない行は捨てる", () => {
    const roices = sheetSection(sheet, "roices")?.entries ?? [];
    expect(roices).toHaveLength(1);
    expect(roices[0]).toMatchObject({ label: "相棒", value: "依存" });
    expect(roices[0]?.note).toBe("狂気度 2 / 発狂 幼児退行 / 発狂効果 最大行動値-2 / パーツで所持");
  });

  it("カルマの達成と記憶のカケラを読む", () => {
    const carma = sheetSection(sheet, "carma")?.entries ?? [];
    expect(carma.map((e) => [e.label, e.value])).toEqual([
      ["記憶のカケラを獲得する", "達成"],
      ["もう一つ", ""],
    ]);
    expect(sheetSection(sheet, "kakera")?.entries).toEqual([{ label: "訓練", value: "", note: "思い出" }]);
  });

  it("行動値・武装/変異/改造と寵愛点を返す", () => {
    const res = sheetSection(sheet, "resources")?.entries.map((e) => [e.label, e.value]);
    expect(res).toEqual([
      ["行動値", 9],
      ["武装", 1],
      ["変異", 2],
      ["改造", 0],
      ["寵愛点", 5],
    ]);
    expect(stats).toEqual({ favor: 5 });
  });
});
