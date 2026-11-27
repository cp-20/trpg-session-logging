import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetAr2e } from "./ytsheet-ar2e";

/** ゆとシートⅡ ar2e の JSON と同じキー構造の作り物（名前・値は架空） */
const SAMPLE = {
  name: "架空の剣士",
  race: "ヒューリン",
  gender: "男",
  age: "20",
  faith: "ブレス",
  level: 3,
  classMain: "ウォーリア",
  classSupport: "シーフ",
  sttStrTotal: 6,
  sttStrBase: 12,
  sttDexTotal: 4,
  sttLukTotal: 2,
  hpTotal: 38,
  mpTotal: 20,
  fateTotal: 6,
  fateLimit: 3,
  battleTotalIni: 8,
  battleTotalMove: 7,
  battleTotalAccR: 2,
  battleTotalAtkR: 11,
  battleTotalEva: 3,
  battleTotalDef: 7,
  battleTotalMDef: 5,
  moneyTotal: 1200,
  money: 10,
  skillNum: 4,
  skill1Name: "オールラウンド",
  skill1Lv: 1,
  skill1Type: "race",
  skill1Timing: "パッシブ",
  skill1Note: "【筋力】基本値+1（計算済）",
  skill2Name: "バッシュ",
  skill2Lv: 2,
  skill2Type: "ウォーリア",
  skill2Timing: "メジャー",
  skill2Roll: "命中判定",
  skill2Cost: 4,
  skill2Range: "武器",
  skill2Reqd: "―",
  skill3Name: "アスレチック",
  skill3Lv: 1,
  skill3Type: "general",
  skill4Lv: 1,
  skill4Type: "general",
  armamentHandRName: "グレートソード",
  armamentHandRType: "両手剣",
  armamentHandRAtk: 11,
  armamentHandRAcc: -1,
  armamentHandRWeight: 10,
  armamentHandLName: "―",
  armamentBodyName: "クロスアーマー",
  armamentBodyType: "防具",
  armamentBodyDef: 3,
  connection1Name: "幼なじみ",
  connection1Relation: "親友",
  connection1Note: "同郷",
  geis1Name: "弱者を守る",
  geis1Cost: 5,
  geis1Note: "見捨てない",
  lifepathOrigin: "戦士の家系",
  lifepathOriginNote: "代々の剣",
  items: "ポーション&lt;br&gt;ロープ",
};

const find = (id: string) => readYtsheetAr2e(SAMPLE).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのアリアンロッド 2E を読む", () => {
  it("種族・性別・信仰とライフパスを経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetAr2e(SAMPLE);
    expect(systemLabel).toBe("アリアンロッドRPG 2E");
    expect(compact(profile).map((e) => [e.label, e.value])).toEqual([
      ["種族", "ヒューリン"],
      ["性別", "男"],
      ["年齢", 20],
      ["信仰", "ブレス"],
      ["出自", "戦士の家系"],
    ]);
    expect(profile.find((e) => e?.label === "出自")?.note).toBe("代々の剣");
  });

  it("種族が「その他」のときは自由記入の種族名を使う", () => {
    const { profile } = readYtsheetAr2e({ race: "free", raceFree: "架空族" });
    expect(profile[0]).toEqual({ label: "種族", value: "架空族" });
  });

  it("キャラクターレベルとメイン・サポートクラスを読み、空の称号クラスは落とす", () => {
    expect(find("levels")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["キャラクターレベル", 3],
      ["メインクラス", "ウォーリア"],
      ["サポートクラス", "シーフ"],
    ]);
  });

  it("七つの能力値は合計を値にして基本値を補足に付け、値のないものは出さない", () => {
    const ab = find("abilities")!.entries;
    expect(ab.map((e) => e.label)).toEqual(["筋力", "器用", "幸運"]);
    expect(ab[0]).toEqual({ label: "筋力", value: 6, note: "基本値12" });
  });

  it("HP・MP・フェイト・行動値・移動力・ゴールドと戦闘値を読む", () => {
    const res = find("resources")!.entries;
    expect(res.find((e) => e.label === "フェイト")).toEqual({
      label: "フェイト",
      value: 6,
      note: "使用上限3",
    });
    expect(res.find((e) => e.label === "ゴールド")?.value).toBe(1200);
    expect(res.find((e) => e.label === "HP")?.value).toBe(38);
    expect(Object.fromEntries(find("combat")!.entries.map((e) => [e.label, e.value]))).toEqual({
      命中判定: 2,
      攻撃力: 11,
      回避判定: 3,
      物理防御力: 7,
      魔法防御力: 5,
    });
  });

  it("スキルは取得元で分け、名前のない行は落とし、使用条件の「―」は出さない", () => {
    const sk = find("skills")!.entries;
    expect(sk.map((e) => e.label)).toEqual(["オールラウンド", "バッシュ", "アスレチック"]);
    expect(sk[0]).toMatchObject({ value: 1, group: "種族", note: "パッシブ　【筋力】基本値+1（計算済）" });
    expect(sk[1]).toMatchObject({ value: 2, group: "ウォーリア", note: "メジャー　命中判定　武器　コスト4" });
    expect(sk[2]?.group).toBe("一般");
  });

  it("装備は空の欄（―）を落とし、部位と能力を補足にする", () => {
    const eq = find("armaments")!.entries;
    expect(eq).toHaveLength(2);
    expect(eq[0]).toEqual({
      label: "グレートソード",
      value: "",
      note: "右手　両手剣　命中-1　攻撃力11　重量10",
    });
    expect(eq[1]).toMatchObject({ label: "クロスアーマー", note: "胴部　物理防御力3" });
  });

  it("縁故・誓約・所持品を読み、保存用の改行表記を戻す", () => {
    expect(find("connections")?.entries[0]).toEqual({ label: "幼なじみ", value: "親友", note: "同郷" });
    expect(find("geises")?.entries[0]).toEqual({
      label: "弱者を守る",
      value: "",
      note: "成長点5　見捨てない",
    });
    expect(find("items")?.text).toBe("ポーション\nロープ");
  });

  it("引き継ぐ値（キャラクターレベル・ゴールド）を stats に入れる", () => {
    expect(readYtsheetAr2e(SAMPLE).stats).toEqual({ level: 3, gold: 1200 });
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetAr2e(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
