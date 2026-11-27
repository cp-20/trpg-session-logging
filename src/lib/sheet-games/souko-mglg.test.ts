import { describe, expect, it } from "vitest";
import { readSoukoMglg, soukoLearnedSkills } from "./souko-mglg";
import { MAGICALOGIA_SKILLS } from "./skill-table-magicalogia";

/** 倉庫の実データと同じキー構造を持つ、作り物のシート */
const FIXTURE = {
  base: {
    covername: "架空 太郎",
    magicname: "硝子の城＜グラスキャッスル＞",
    cover: "会社員",
    level: "3",
    levelname: "実践者",
    domain: "de",
    career: "書工/天涯",
    belief: "仲間を守る",
    exp: "28/33",
    attack: "3",
    defense: "2",
    source: "4",
    age: "20歳",
    sex: "男",
    memo: "テスト用の設定\n二行目",
  },
  magic: { value: "5", max: "12", temp: null },
  soul: { skill: "秒針" },
  learned: [
    { id: null, judge: null },
    { id: "skills.row0.name0", judge: null },
    { id: "skills.row10.name3", judge: null },
    { id: "skills.row10.name3", judge: null },
    { id: "skills.row99.name0", judge: null },
    { id: "skills.row2.name5", judge: null },
  ],
  library: [
    {
      name: "緊急召喚\nコーリング",
      type: "召喚",
      skill: "可変",
      target: "なし",
      cost: "なし",
      effect: "精霊を召喚する。",
      charge: { value: "2" },
    },
    { name: null, type: "呪文" },
  ],
  anchor: [
    { name: "友人", attribute: "恩人", destiny: "4", memo: "同僚" },
    { name: null, attribute: "興味", destiny: "3" },
  ],
  duty: [
    { anchor: "友人", notes: "守ること" },
    { anchor: null, notes: null },
  ],
  trueform: { name: "時計頭の男", effect: "元型変化", notes: "黒いスーツ姿" },
};

describe("倉庫のマギカロギアのシートを読む", () => {
  const r = readSoukoMglg(FIXTURE);
  const sec = (id: string) => r.sections.find((s) => s?.id === id);

  it("プロフィールに魔法名・階梯・領域・経歴を出す", () => {
    const byLabel = Object.fromEntries(r.profile.map((p) => [p?.label, p]));
    expect(byLabel["魔法名"]?.value).toBe("硝子の城＜グラスキャッスル＞");
    expect(byLabel["階梯"]).toMatchObject({ value: "第3階梯", note: "実践者" });
    expect(byLabel["領域"]?.value).toBe("夢");
    expect(byLabel["経歴/機関"]?.value).toBe("書工/天涯");
    expect(byLabel["魂の特技"]?.value).toBe("秒針");
    expect(byLabel["功績点"]?.value).toBe("28/33");
  });

  it("能力値と魔力を読み、空の一時的魔力は落とす", () => {
    expect(sec("abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["攻撃力", 3],
      ["防御力", 2],
      ["根源力", 4],
    ]);
    expect(sec("resources")?.entries).toEqual([{ label: "魔力", value: 5, max: 12 }]);
  });

  it("習得特技を特技表の領域ごとに名前に直し、表にない番号や重複は読まない", () => {
    expect(sec("skills")?.entries).toEqual([
      { label: "黄金", value: "習得", group: "星" },
      { label: "時", value: "習得", group: "歌" },
      { label: "裏切り", value: "習得", group: "闇" },
    ]);
  });

  it("蔵書・アンカー・義務・真の姿を名前のある行だけ読む", () => {
    expect(sec("library")?.entries).toEqual([
      {
        label: "緊急召喚",
        value: "召喚",
        note: "コーリング　指定特技：可変　目標：なし　コスト：なし　チャージ：2　精霊を召喚する。",
      },
    ]);
    expect(sec("anchors")?.entries).toEqual([{ label: "友人", value: 4, note: "恩人　同僚" }]);
    expect(sec("duty")?.entries).toEqual([{ label: "友人", value: "", note: "守ること" }]);
    expect(sec("trueform")?.entries).toEqual([
      { label: "時計頭の男", value: "元型変化", note: "黒いスーツ姿" },
    ]);
  });

  it("経験をまたぐ値を stats に出す（功績点は数値のときだけ）", () => {
    expect(r.stats).toEqual({ attack: 3, defense: 2, source: 4, magic: 5 });
    expect(readSoukoMglg({ base: { exp: "7" } }).stats).toEqual({ exp: 7 });
    expect(r.systemLabel).toBe("マギカロギア");
  });

  it("空のシートでも落ちず、中身のある項目を作らない", () => {
    const empty = readSoukoMglg({});
    expect(empty.stats).toEqual({});
    expect(empty.profile.filter(Boolean)).toEqual([]);
    expect(empty.sections.every((s) => !s || (s.entries.length === 0 && !s.text))).toBe(true);
  });
});

describe("マギカロギアの特技表", () => {
  it("6 つの領域に 2〜12 の 11 行ずつ並ぶ", () => {
    expect(MAGICALOGIA_SKILLS.map(([f]) => f)).toEqual(["星", "獣", "力", "歌", "夢", "闇"]);
    for (const [, names] of MAGICALOGIA_SKILLS) expect(names).toHaveLength(11);
    expect(MAGICALOGIA_SKILLS[0][1][0]).toBe("黄金");
    expect(MAGICALOGIA_SKILLS[5][1][10]).toBe("死");
  });

  it("習得特技は行番号が 2 の目の順（row0 = 2）", () => {
    const out = soukoLearnedSkills({ learned: [{ id: "skills.row1.name1" }] }, MAGICALOGIA_SKILLS);
    expect(out).toEqual([{ label: "蟲", value: "習得", group: "獣" }]);
  });
});
