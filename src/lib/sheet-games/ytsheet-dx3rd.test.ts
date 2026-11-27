import { describe, expect, it } from "vitest";
import { buildSheet } from "../sheet";
import { readYtsheetDx3rd } from "./ytsheet-dx3rd";

/** ゆとシートⅡ dx3rd の JSON と同じキー構造の作り物（名前・値は架空） */
const SAMPLE = {
  characterName: "架空 太郎",
  cover: "高校生",
  works: "UGNチルドレンC",
  age: 17,
  gender: "女",
  syndrome1: "ブラム＝ストーカー",
  syndrome2: "ノイマン",
  sttTotalBody: 1,
  sttTotalSense: 3,
  sttTotalMind: 4,
  sttTotalSocial: 2,
  maxHpTotal: 25,
  baseEncroach: 41,
  initiativeTotal: 9,
  moveTotal: 14,
  dashTotal: 28,
  stockTotal: 4,
  expTotal: 325,
  skillTotalDodge: 1,
  skillRC: 3,
  skillTotalRC: 8,
  skillRide1Name: "二輪",
  skillRide1: 2,
  skillTotalRide1: 2,
  skillInfo1Name: "情報:UGN",
  skillInfo1: 4,
  skillTotalInfo1: 4,
  skillInfo2Name: "",
  effectNum: 3,
  effect1Name: "リザレクト",
  effect1Lv: 1,
  effect1Type: "auto",
  effect1Timing: "オート",
  effect1Skill: "―",
  effect1Range: "至近",
  effect1Encroach: "効果参照",
  effect2Name: "未知なる陣形",
  effect2Lv: 1,
  effect2Timing: "常時",
  effect3Name: "イージー例",
  effect3Type: "easy",
  lois1Name: "|精鋭《トゥルーボーン》：RC",
  lois1Relation: "Dロイス",
  lois1State: "ロイス",
  lois2Name: "旧友",
  lois2Relation: "友人",
  lois2EmoPosi: "友情",
  lois2EmoPosiCheck: 1,
  lois2EmoNega: "偏愛",
  lois2State: "タイタス",
  lois3State: "ロイス",
  combo1Name: "迫る青を恐れよ",
  combo1Combo: "《得意領域》《加速する領域》",
  combo1Timing: "セットアップ",
  combo1Encroach: 7,
  combo1Dice1: "3+5",
  combo1Crit1: 7,
  combo1Atk1: "2+12",
  lifepathOrigin: "天涯孤独",
  lifepathOriginNote: "幼少時に家族を喪う",
  lifepathAwaken: "渇望",
  lifepathAwakenEncroach: 17,
  weapon1Name: "パイルバンカー",
  weapon1Type: "白兵",
  weapon1Skill: "〈白兵〉",
  weapon1Atk: "LV+4",
  weapon1Range: "至近",
  weapon1Stock: 9,
  armor1Name: "強化服",
  armor1Armor: 1,
  armor1Dodge: "―",
  item1Name: "ブルージズ",
  item1Exp: 35,
  freeNote: "一行目&lt;br&gt;二行目 &amp; 三",
};

const find = (id: string) => readYtsheetDx3rd(SAMPLE).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのダブルクロス 3rd を読む", () => {
  it("カヴァー・ワークス・シンドロームを経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetDx3rd(SAMPLE);
    expect(systemLabel).toBe("ダブルクロス The 3rd Edition");
    expect(profile.map((e) => [e?.label, e?.value])).toEqual([
      ["カヴァー", "高校生"],
      ["ワークス", "UGNチルドレンC"],
      ["シンドローム", "ブラム＝ストーカー／ノイマン"],
      ["年齢", 17],
      ["性別", "女"],
    ]);
  });

  it("四つの能力値と副能力値（HP・侵蝕率基本値・行動値・移動・常備化・経験点）を読む", () => {
    expect(find("abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["肉体", 1],
      ["感覚", 3],
      ["精神", 4],
      ["社会", 2],
    ]);
    const res = Object.fromEntries(find("resources")!.entries.map((e) => [e.label, e.value]));
    expect(res).toEqual({
      HP: 25,
      侵蝕率基本値: 41,
      行動値: 9,
      戦闘移動: 14,
      全力移動: 28,
      常備化ポイント: 4,
      経験点: 325,
    });
  });

  it("技能は合計を優先し、系統ごとに分け、運転・情報などは名前を添える", () => {
    const skills = find("skills")!.entries;
    expect(skills.find((e) => e.label === "RC")).toMatchObject({ value: 8, group: "精神" });
    expect(skills.find((e) => e.label === "回避")).toMatchObject({ value: 1, group: "肉体" });
    expect(skills.find((e) => e.label === "運転：二輪")).toMatchObject({ value: 2, group: "肉体" });
    expect(skills.find((e) => e.label === "情報：UGN")).toMatchObject({ value: 4, group: "社会" });
    // 値のない技能は出さない
    expect(skills.find((e) => e.label === "白兵")).toBeUndefined();
    expect(skills.some((e) => e.label === "情報")).toBe(false);
  });

  it("エフェクトはレベルと補足を持ち、イージーはレベルの代わりにその印を出す", () => {
    const arts = find("arts")!;
    expect(arts.kind).toBe("levels");
    expect(arts.entries[0]).toEqual({
      label: "リザレクト",
      value: 1,
      note: "オート　至近　侵蝕効果参照　自動取得",
    });
    expect(arts.entries[1]).toMatchObject({ label: "未知なる陣形", value: 1, note: "常時" });
    expect(arts.entries[2]).toMatchObject({ label: "イージー例", value: "イージー" });
  });

  it("ロイスはふりがな記法を外し、名前のない欄を落とし、表の感情に印を付ける", () => {
    const lois = find("lois")!.entries;
    expect(lois).toHaveLength(2);
    expect(lois[0]).toEqual({ label: "精鋭：RC", value: "ロイス", note: "Dロイス" });
    expect(lois[1]).toEqual({ label: "旧友", value: "タイタス", note: "友人　◎友情／偏愛" });
  });

  it("コンボ・ライフパス・武器・防具・アイテムを補足つきで読む", () => {
    expect(find("combos")?.entries[0]).toEqual({
      label: "迫る青を恐れよ",
      value: "",
      note: "《得意領域》《加速する領域》　セットアップ　侵蝕7　ダイス3+5 C値7 攻撃力2+12",
    });
    expect(find("lifepath")?.entries).toEqual([
      { label: "出自", value: "天涯孤独", note: "幼少時に家族を喪う" },
      { label: "覚醒", value: "渇望", note: "侵蝕17" },
    ]);
    expect(find("weapons")?.entries[0]).toMatchObject({
      label: "パイルバンカー",
      note: "白兵　〈白兵〉　攻撃力LV+4　至近　常備化9",
    });
    expect(find("armors")?.entries[0]).toMatchObject({ label: "強化服", note: "装甲1" });
    expect(find("items")?.entries[0]).toMatchObject({ label: "ブルージズ", note: "経験点35" });
  });

  it("引き継ぐ値（HP・経験点）を stats に入れ、メモの改行と記号を戻す", () => {
    expect(readYtsheetDx3rd(SAMPLE).stats).toEqual({ hp: 25, exp: 325 });
    expect(find("memo")).toMatchObject({ kind: "text", text: "一行目\n二行目 & 三" });
  });

  it("空の JSON や配列は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null, "x"]) {
      const read = readYtsheetDx3rd(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
