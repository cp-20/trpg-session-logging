import { describe, expect, it } from "vitest";
import { readSoukoStellar } from "./souko-stellar";

/** 倉庫の実データと同じキー構造を持つ、作り物のシート */
const FIXTURE = {
  base: {
    name: "架空 ブリンガー",
    sex: "女性",
    age: "13",
    organization: "架空学園",
    yourstory: "天才",
    keyword: "咲き誇れ",
    wish: "誰も傷つかない世界",
    knight: { type: "ステラナイト" },
    character: { "1st": "華麗", "2nd": "泣きやすい" },
    hopedespair: { choice: "絶望", detail: "理不尽な世界" },
    personalflower: { color: "黒", essence: "オダマキ" },
  },
  status: { hp: "16", defense: "3", charge: "3", medal: null, resonance: "1" },
  skills: [
    {
      name: "騎士のたしなみ",
      type: "アタック／ムーヴ",
      timing: "あなたのターン",
      effect: "移動して攻撃する",
      hidden: null,
    },
    {},
    { name: "愚者の咆哮", type: "ギャンビット", timing: "耐久力が1～4になった直後" },
  ],
  sheath: {
    name: "架空 シース",
    age: "11",
    character: { "1st": "ゆるふわ", "2nd": null },
    hopedespair: { choice: "希望", detail: null },
    personalflower: { color: "白", essence: null },
  },
  partner: {
    bringer: { name: "相手 ブリンガー", wish: "誰かの笑顔" },
    sheath: {
      wish: "（願い、花章はパートナーを取り込むと反映されます）",
      character: { "1st": null },
      personalflower: {},
    },
  },
};

describe("倉庫の銀剣のステラナイツのシートを読む", () => {
  const r = readSoukoStellar(FIXTURE);
  const sec = (id: string) => r.sections.find((s) => s?.id === id);

  it("ブリンガーのプロフィールに種別・物語・希望／絶望・性格・花章を出す", () => {
    const byLabel = Object.fromEntries(r.profile.map((p) => [p?.label, p?.value]));
    expect(byLabel).toMatchObject({
      種別: "ステラナイト",
      性別: "女性",
      年齢: 13,
      所属組織: "架空学園",
      あなたの物語: "天才",
      絶望: "理不尽な世界",
      願い: "誰も傷つかない世界",
      性格: "華麗にして泣きやすい",
      花章: "黒のオダマキ",
      変身キーワード: "咲き誇れ",
    });
    expect(r.systemLabel).toBe("銀剣のステラナイツ");
  });

  it("耐久力・防御力・チャージ・歪みの共鳴を読み、空の勲章は落とす", () => {
    expect(sec("resources")?.entries).toEqual([
      { label: "耐久力", value: 16 },
      { label: "防御力", value: 3 },
      { label: "チャージ", value: 3 },
      { label: "歪みの共鳴", value: 1 },
    ]);
    expect(r.stats).toEqual({ hp: 16, defense: 3, charge: 3, resonance: 1 });
    expect(readSoukoStellar({ status: { medal: "4" } }).stats).toEqual({ medal: 4 });
  });

  it("スキルは名前のある行だけ、種別を値にタイミングと効果を添えて読む", () => {
    expect(sec("skills")?.entries).toEqual([
      {
        label: "騎士のたしなみ",
        value: "アタック／ムーヴ",
        note: "タイミング：あなたのターン　移動して攻撃する",
      },
      {
        label: "愚者の咆哮",
        value: "ギャンビット",
        note: "タイミング：耐久力が1～4になった直後",
      },
    ]);
  });

  it("シースとパートナーは名前があるときだけ読む（取り込み前の案内文は読まない）", () => {
    expect(sec("sheath")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["名前", "架空 シース"],
      ["年齢", 11],
      ["性格", "ゆるふわ"],
      ["花章", "白"],
    ]);
    expect(sec("partner-bringer")?.entries).toEqual([
      { label: "名前", value: "相手 ブリンガー" },
      { label: "願い", value: "誰かの笑顔" },
    ]);
    expect(sec("partner-sheath")?.entries).toEqual([]);
  });

  it("隠匿されたシート（スキルが空）や空のシートでも落ちない", () => {
    const e = readSoukoStellar({ base: { name: "x" }, skills: [{}, {}], status: null });
    expect(e.stats).toEqual({});
    expect(e.sections.every((s) => !s || s.entries.length === 0)).toBe(true);
  });
});
