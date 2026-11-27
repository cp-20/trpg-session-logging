import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetGs } from "./ytsheet-gs";

/** ゆとシートⅡ gs の JSON と同じキー構造の作り物（名前・値は架空） */
const SAMPLE = {
  characterName: "架空の冒険者",
  race: "獣人:格闘態",
  raceFree: "虎人",
  gender: "女",
  age: 19,
  rank: "鋼鉄等級",
  faith: "地母神",
  careerOrigin: "無頼",
  careerGenesis: "孤児",
  careerEncounter: "宿敵",
  level: 5,
  lvFig: 3,
  lvPri: 2,
  lvMon: 0,
  ability1Str: 5,
  ability1Psy: 3,
  ability1Tec: 4,
  ability1Int: 1,
  ability1Bonus: "Psy",
  ability2Foc: 4,
  ability2Edu: 2,
  ability2Ref: 1,
  statusLife: 31,
  statusMove: 30,
  statusSpell: 2,
  statusResist: 7,
  expTotal: 8000,
  adpTotal: 62,
  adventures: 4,
  completed: 3,
  hitScoreFigMelee: 8,
  hitScoreFigThrowing: 6,
  spellCastPri: 9,
  skillNum: 3,
  skill1Name: "強打攻撃・斬",
  skill1Grade: "習熟",
  skill1Note: "命中と威力に+2",
  skill1Page: "基本253",
  skill2Name: "",
  skill2Grade: "初歩",
  generalSkill1Name: "礼儀作法",
  generalSkill1Grade: "初歩",
  spell1Name: "ヒール",
  spell1System: "奇跡",
  spell1Type: "回復",
  spell1Attr: "神聖",
  spell1Dfclt: 7,
  arts1Name: "無念無想",
  arts1Cost: "1戦闘1回",
  arts1Note: "魂魄点を加える",
  weapon1Name: "小剣",
  weapon1Type: "片手剣",
  weapon1Weight: "軽",
  weapon1Usage: "片手",
  weapon1Attr: "斬刺",
  weapon1HitTotal: 13,
  weapon1Power: "1d6",
  weapon1PowerMod: 1,
  weapon1Class: "戦士",
  weapon1Range: "近接",
  armor1Name: "革鎧",
  armor1Type: "軽鎧",
  armor1Material: "革",
  armor1Armor: 2,
  armor1DodgeTotal: 8,
  armor1MoveTotal: 30,
  shield1Name: "円盾",
  shield1BlockTotal: 5,
  shield1ArmorTotal: 4,
  items: "冒険者セット&lt;br&gt;治癒の水薬",
};

const find = (id: string) => readYtsheetGs(SAMPLE).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのゴブリンスレイヤーTRPG を読む", () => {
  it("種族（自由記入＋本来の種族）・等級・経歴を経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetGs(SAMPLE);
    expect(systemLabel).toBe("ゴブリンスレイヤーTRPG");
    expect(Object.fromEntries(compact(profile).map((e) => [e.label, e.value]))).toEqual({
      種族: "虎人（獣人:格闘態）",
      性別: "女",
      年齢: 19,
      等級: "鋼鉄等級",
      信仰: "地母神",
      "出自／来歴／邂逅": "無頼／孤児／宿敵",
    });
  });

  it("冒険者レベルと習得した職業（レベル0は出さない）を読み、神官には信仰を添える", () => {
    expect(find("levels")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["冒険者レベル", 5],
      ["戦士", 3],
      ["神官（地母神）", 2],
    ]);
  });

  it("第一能力値・第二能力値・状態を読み、ボーナスの付く能力値に印を付ける", () => {
    const first = find("abilities")!.entries;
    expect(first.map((e) => [e.label, e.value])).toEqual([
      ["体力点", 5],
      ["魂魄点", 3],
      ["技量点", 4],
      ["知力点", 1],
    ]);
    expect(first[1]?.note).toBe("ボーナス");
    expect(find("abilities2")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["集中度", 4],
      ["持久度", 2],
      ["反射度", 1],
    ]);
    const res = Object.fromEntries(find("resources")!.entries.map((e) => [e.label, e.value]));
    expect(res).toMatchObject({ 生命力: 31, 移動力: 30, 呪文使用回数: 2, 呪文抵抗基準値: 7 });
    expect(res).toMatchObject({ 経験点: 8000, 成長点: 62, 冒険回数: 4, 達成数: 3 });
  });

  it("命中基準値と呪文行使基準値は値のある職業だけ出す", () => {
    expect(find("hitscores")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["戦士：近接", 8],
      ["戦士：投擲", 6],
      ["神官の呪文行使基準値", 9],
    ]);
  });

  it("冒険者技能・一般技能は名称と習得段階と効果を読み、名前のない行は落とす", () => {
    expect(find("skills")?.entries).toEqual([
      { label: "強打攻撃・斬", value: "習熟", note: "命中と威力に+2（基本253）" },
    ]);
    expect(find("generalSkills")?.entries).toEqual([{ label: "礼儀作法", value: "初歩" }]);
  });

  it("呪文・武技を読む", () => {
    expect(find("spells")?.entries[0]).toEqual({
      label: "ヒール",
      value: "",
      note: "奇跡　回復（神聖）　難易度7",
    });
    expect(find("arts")?.entries[0]).toEqual({
      label: "無念無想",
      value: "",
      note: "1戦闘1回　魂魄点を加える",
    });
  });

  it("武器の威力は表示と同じく職業レベルと修正を足し、鎧・盾は基準値を補足にする", () => {
    expect(find("weapons")?.entries[0]).toEqual({
      label: "小剣",
      value: "",
      note: "片手剣　軽　片手／斬刺　命中13　威力1d6+3+1　近接",
    });
    expect(find("armors")?.entries[0]).toEqual({
      label: "革鎧",
      value: "",
      note: "軽鎧（革）　回避基準値8　装甲値2　移動力30",
    });
    expect(find("shields")?.entries[0]).toEqual({
      label: "円盾",
      value: "",
      note: "盾受け基準値5　盾受け値4",
    });
  });

  it("引き継ぐ値（冒険者レベル・経験点・成長点）を stats に入れ、所持品の改行を戻す", () => {
    expect(readYtsheetGs(SAMPLE).stats).toEqual({ level: 5, exp: 8000, growth: 62 });
    expect(find("items")?.text).toBe("冒険者セット\n治癒の水薬");
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetGs(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
