import { describe, expect, it } from "vitest";
import { FUTARISOUSA_SKILLS, readSoukoFutariSousa } from "./souko-2s";

/** 倉庫の実データと同じキー構造を持つ、作り物のシート */
const FIXTURE = {
  base: {
    name: "架空 探偵",
    role: "探偵",
    roleclass: "天性の才能",
    background: "既に名探偵",
    job: "高校生",
    sex: "男",
    age: "17",
    atmosphere: "トレンチコート",
    like: "おやつ",
    dislike: null,
    memo: "設定の本文",
  },
  mental: { margin: "2" },
  anxiety: { level: "1" },
  skills: {
    row0: { cell0: "1", cell2: "1" },
    row2: { cell3: "1", cell4: "" },
    row3: { cell5: "1" },
  },
  abnormal: { text1: "だいたいわかりました", text2: null, text3: "身分を偽る" },
  actions: [
    { name: "フタリソウサ", type: "補助", cost: "なし", effect: "シーン終了時に使える" },
    { name: null, type: "補助" },
  ],
  guests: [
    { name: "矢口", relationship: "親友", skill: "流行", memo: "同級生" },
    { name: null, relationship: null },
  ],
  partner: { name: "架空 助手", role: "助手", roleclass: "好奇心の人", age: "18" },
  partnerthought: { nickname: "九龍", like: "自由奔放", dislike: null },
  investigation: { memo: "捜査のメモ" },
};

describe("倉庫のフタリソウサのシートを読む", () => {
  const r = readSoukoFutariSousa(FIXTURE);
  const sec = (id: string) => r.sections.find((s) => s?.id === id);

  it("プロフィールに役割・クラス・背景・職業を出し、空の嫌いなものは落とす", () => {
    const labels = r.profile.filter(Boolean).map((p) => [p?.label, p?.value]);
    expect(labels).toContainEqual(["役割", "探偵"]);
    expect(labels).toContainEqual(["クラス", "天性の才能"]);
    expect(labels).toContainEqual(["背景", "既に名探偵"]);
    expect(r.profile.map((p) => p?.label)).not.toContain("嫌いなもの");
    expect(r.systemLabel).toBe("フタリソウサ");
  });

  it("余裕と心労を読む", () => {
    expect(sec("resources")?.entries).toEqual([
      { label: "余裕", value: 2 },
      { label: "心労", value: 1, max: 3 },
    ]);
    expect(r.stats).toEqual({ margin: 2, anxiety: 1 });
  });

  it("技能は 1 のついたマスだけを分野つきで読む", () => {
    expect(sec("skills")?.entries).toEqual([
      { label: "嘘", value: "習得", group: "洞察" },
      { label: "外見", value: "習得", group: "洞察" },
      { label: "説得", value: "習得", group: "人間" },
      { label: "追跡", value: "習得", group: "肉体" },
    ]);
    expect(FUTARISOUSA_SKILLS).toHaveLength(4);
    for (const [, names] of FUTARISOUSA_SKILLS) expect(names).toHaveLength(6);
  });

  it("異常な癖・アクション・ゲスト・パートナーを読む", () => {
    expect(sec("quirks")?.entries.map((e) => e.label)).toEqual(["だいたいわかりました", "身分を偽る"]);
    expect(sec("actions")?.entries).toEqual([
      { label: "フタリソウサ", value: "補助", note: "コスト：なし　シーン終了時に使える" },
    ]);
    expect(sec("guests")?.entries).toEqual([{ label: "矢口", value: "親友", note: "技能：流行　同級生" }]);
    expect(sec("partner")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["名前", "架空 助手"],
      ["呼び名", "九龍"],
      ["役割", "助手"],
      ["クラス", "好奇心の人"],
      ["年齢", 18],
      ["気に入ったところ", "自由奔放"],
    ]);
    expect(sec("memo")?.text).toBe("設定の本文");
    expect(sec("investigation")?.text).toBe("捜査のメモ");
  });

  it("空のシートでも落ちない", () => {
    const e = readSoukoFutariSousa({});
    expect(e.stats).toEqual({});
    expect(e.sections.every((s) => !s || (s.entries.length === 0 && !s.text))).toBe(true);
  });
});
