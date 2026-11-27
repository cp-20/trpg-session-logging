import { describe, expect, it } from "vitest";
import { KILLDEATH_SKILLS, readSoukoHelltv } from "./souko-helltv";

/** 倉庫の実データと同じキー構造を持つ、作り物のシート */
const FIXTURE = {
  base: {
    name: "架空 花子",
    age: "24",
    attribute: "正義",
    battlestyle: "サイコキャット",
    wish: "みんなと仲良くなりたい",
    soul: "1500",
    hellslug: null,
    sex: "女",
    memo: "設定のメモ",
  },
  charge: { level: "2" },
  block: { level: null },
  deathcount: { level: "1" },
  learned: [
    { id: null, judge: null },
    { id: "skills.row0.name0" },
    { id: "skills.row4.name1" },
    { id: "skills.row10.name5" },
    { id: "skills.row0.name9" },
  ],
  ability: [
    { name: "魔猫《キャット》", level: "なし", targetSkill: "生", effect: null },
    { name: null, level: null },
    { name: "可愛げ《キュートネス》", level: null, targetSkill: "フォーマル", effect: "ダメージ軽減" },
  ],
  hellcyber: [
    { name: "ビーム", effect: "判定補助" },
    { name: null, effect: null },
  ],
  relations: [
    { name: "水瓜", depth: "2", attribute: "親近感", notes: "達成！" },
    { name: null, depth: null, attribute: null, notes: null },
  ],
  subplot: { name: "心酔", conditions: "条件の文", reward: "200【ソウル】" },
  season: [
    { no: "312", count: "2", theme: "最初の行\n二行目" },
    { no: null, count: "1" },
  ],
};

describe("倉庫のキルデスビジネスのシートを読む", () => {
  const r = readSoukoHelltv(FIXTURE);
  const sec = (id: string) => r.sections.find((s) => s?.id === id);

  it("プロフィールにキャラ属性・戦闘スタイル・願い事を出す", () => {
    expect(r.profile.map((p) => [p?.label, p?.value])).toEqual([
      ["キャラ属性", "正義"],
      ["戦闘スタイル", "サイコキャット"],
      ["願い事", "みんなと仲良くなりたい"],
      ["年齢", 24],
      ["性別", "女"],
    ]);
    expect(r.systemLabel).toBe("キルデスビジネス");
  });

  it("ソウル・チャージ・死亡回数を読み、空のブロックとヘルスラッグは落とす", () => {
    expect(sec("resources")?.entries).toEqual([
      { label: "ソウル", value: 1500 },
      { label: "チャージ", value: 2, max: 3 },
      { label: "死亡回数", value: 1, max: 6 },
    ]);
    expect(r.stats).toEqual({ soul: 1500, charge: 2, deathcount: 1 });
  });

  it("習得特技を 職業・動作・… の分野つきで名前に直す", () => {
    expect(sec("skills")?.entries).toEqual([
      { label: "無職", value: "習得", group: "職業" },
      { label: "投げる", value: "習得", group: "動作" },
      { label: "生", value: "習得", group: "願望" },
    ]);
  });

  it("アビリティは行の位置から リスク を添え、名前のない行は読まない", () => {
    expect(sec("abilities-list")?.entries).toEqual([
      { label: "魔猫《キャット》", value: "なし", note: "リスク7　指定特技：生" },
      {
        label: "可愛げ《キュートネス》",
        value: "",
        note: "リスク5　指定特技：フォーマル　ダメージ軽減",
      },
    ]);
  });

  it("ヘルサイバー・関係・サブプロット・シーズンを読む", () => {
    expect(sec("hellcyber")?.entries).toEqual([{ label: "ビーム", value: "判定補助" }]);
    expect(sec("relations")?.entries).toEqual([{ label: "水瓜", value: 2, note: "親近感　達成！" }]);
    expect(sec("subplot")?.entries).toEqual([
      { label: "心酔", value: "", note: "条件の文　報酬：200【ソウル】" },
    ]);
    expect(sec("seasons")?.entries).toEqual([{ label: "シーズン312", value: "2話", note: "最初の行" }]);
    expect(sec("memo")?.text).toBe("設定のメモ");
  });

  it("空のシートでも落ちない", () => {
    const e = readSoukoHelltv({});
    expect(e.stats).toEqual({});
    expect(e.sections.every((s) => !s || (s.entries.length === 0 && !s.text))).toBe(true);
  });
});

describe("キルデスビジネスの特技表", () => {
  it("6 つの分野に 2〜12 の 11 行ずつ並ぶ", () => {
    expect(KILLDEATH_SKILLS.map(([f]) => f)).toEqual(["職業", "動作", "小道具", "衣装", "情動", "願望"]);
    for (const [, names] of KILLDEATH_SKILLS) expect(names).toHaveLength(11);
  });
});
