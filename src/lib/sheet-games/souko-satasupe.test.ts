import { describe, expect, it } from "vitest";
import { readSoukoSatasupe, SATASUPE_HOBBIES } from "./souko-satasupe";

/** 倉庫の実データと同じキー構造を持つ、作り物のシート */
const FIXTURE = {
  base: {
    name: "架空 純兵",
    surface: "学生",
    team: "テストチーム",
    homeland: "日本",
    style: "着物",
    age: "17",
    sex: "男",
    likes: "祭り",
    dislikes: null,
    langueges: "日本語",
    emotion: "10",
    abl: {
      crime: { value: "7" },
      life: { value: "2" },
      love: { value: "1" },
      culture: { value: "3" },
      combat: { value: "3" },
    },
    gift: { body: { value: "6" }, mind: { value: "4" } },
    power: { initiative: "9", attack: "2", destroy: "1", total: { value: "12" } },
    exp: { total: "12", use: "10", waste: "2", remain: "0" },
    memo: "メモの本文",
  },
  cond: {
    body: { value: "0" },
    mental: { value: null },
    wallet: { value: "0" },
    addiction: { value: "LSD" },
    san: { value: null },
  },
  home: { place: "沙京", comfortable: "10", security: null },
  learned: [
    { id: null, judge: null },
    { id: "hobby.3_2" },
    { id: "hobby.2_2" },
    { id: "hobby.5_6" },
    { id: "hobby.3_2" },
    { id: "hobby.9_9" },
  ],
  karma: [
    {
      name: "(S5終了時)\nペテン師",
      talent: { name: "邪魔", use: "割り込み", target: "単体", judge: null, effect: "難易度+1" },
      price: { name: "大口", use: "常駐", target: null, judge: null, effect: null },
    },
    { name: null, talent: { name: "x" } },
  ],
  weapons: [
    { name: "拳銃", damage: "5", aim: "9", range: "射撃", notes: "散弾　両手", place: null },
    { name: null, damage: null },
  ],
  outfits: [
    { name: "テレカ×5", use: null, effect: null },
    { name: "手袋+1", use: "支援", effect: "振れる回数+2\n（犯罪）", place: "乗物" },
  ],
  vehicles: [{ name: "SUV", speed: "3", frame: "5", burden: "6" }, { name: null }],
  history: [
    {
      name: "組の崩壊",
      exp: "2点(MVP)",
      dd: "レーベル",
      speakeasy: "リーダー",
      date: "11/6",
      comment: "一行目\n二行目",
    },
  ],
};

describe("倉庫のサタスペのシートを読む", () => {
  const r = readSoukoSatasupe(FIXTURE);
  const sec = (id: string) => r.sections.find((s) => s?.id === id);
  const pairs = (id: string) => sec(id)?.entries.map((e) => [e.label, e.value]);

  it("プロフィールに表の顔・チーム・故郷・外見を出し、空の嫌は落とす", () => {
    const labels = r.profile.map((p) => p?.label);
    expect(labels).toContain("表の顔");
    expect(labels).toContain("チーム");
    expect(labels).not.toContain("嫌");
    expect(r.systemLabel).toBe("サタスペ");
  });

  it("犯罪・生活・恋愛・教養・戦闘と天分値・戦闘力を読む", () => {
    expect(pairs("abilities")).toEqual([
      ["犯罪", 7],
      ["生活", 2],
      ["恋愛", 1],
      ["教養", 3],
      ["戦闘", 3],
    ]);
    expect(pairs("gift")).toEqual([
      ["肉体", 6],
      ["精神", 4],
    ]);
    expect(pairs("power")).toEqual([
      ["反応力", 9],
      ["攻撃力", 2],
      ["破壊力", 1],
      ["戦闘力", 12],
    ]);
  });

  it("性業値・状態・経験値を読み、空の状態は落とす", () => {
    expect(pairs("resources")).toEqual([
      ["性業値", 10],
      ["肉体点", 0],
      ["サイフ", 0],
      ["中毒", "LSD"],
    ]);
    expect(pairs("exp")).toEqual([
      ["獲得", 12],
      ["使用", 10],
      ["維持合計", 2],
      ["残り", 0],
    ]);
    expect(r.stats).toEqual({
      crime: 7,
      life: 2,
      love: 1,
      culture: 3,
      combat: 3,
      emotion: 10,
      exp: 0,
    });
  });

  it("習得特技を趣味表の番号から名前に直し、表にない番号や重複は読まない", () => {
    expect(sec("skills")?.entries).toEqual([
      { label: "おせっかい", value: "習得", group: "マジメ系" },
      { label: "好きなタグ", value: "習得", group: "アート系" },
      { label: "ワビサビ", value: "習得", group: "イヤシ系" },
    ]);
    expect(SATASUPE_HOBBIES).toHaveLength(6);
    for (const [, names] of SATASUPE_HOBBIES) expect(names).toHaveLength(6);
  });

  it("カルマは異能と代償を 1 行にまとめ、名前のない行は読まない", () => {
    expect(sec("karma")?.entries).toEqual([
      {
        label: "(S5終了時) ペテン師",
        value: "",
        note: "異能：邪魔（割り込み・単体） 難易度+1　代償：大口（常駐）",
      },
    ]);
  });

  it("武器・一般装備・乗物・アジト・履歴を読む", () => {
    expect(sec("weapons")?.entries).toEqual([
      { label: "拳銃", value: 5, note: "命中：9　射程：射撃　散弾　両手" },
    ]);
    expect(sec("outfits")?.entries).toEqual([
      { label: "テレカ×5", value: "" },
      { label: "手袋+1", value: "支援", note: "振れる回数+2 （犯罪）　保管：乗物" },
    ]);
    expect(sec("vehicles")?.entries).toEqual([{ label: "SUV", value: 3, note: "車体：5　荷物：6" }]);
    expect(pairs("home")).toEqual([
      ["場所", "沙京"],
      ["快適度", 10],
    ]);
    expect(sec("history")?.entries).toEqual([
      { label: "組の崩壊", value: "2点(MVP)", note: "DD：レーベル　カルマ：リーダー　11/6　一行目" },
    ]);
    expect(sec("memo")?.text).toBe("メモの本文");
  });

  it("空のシートでも落ちない", () => {
    const e = readSoukoSatasupe({});
    expect(e.stats).toEqual({});
    expect(e.sections.every((s) => !s || (s.entries.length === 0 && !s.text))).toBe(true);
  });
});
