import { describe, expect, it } from "vitest";
import {
  comboEntries,
  filterOptions,
  groupInOrder,
  hasExactLabel,
  matchRank,
  normalizeForSearch,
} from "./search-text";

describe("normalizeForSearch", () => {
  it.each([
    ["ソード・ワールド2.5", "そーどわーるど25"],
    ["ｸﾄｩﾙﾌ", "くとぅるふ"],
    ["ＣｏＣ", "coc"],
    ["Double Cross", "doublecross"],
    ["「目星」", "目星"],
  ])("%s", (input, want) => {
    expect(normalizeForSearch(input)).toBe(want);
  });

  it("ひらがな・カタカナ・全角半角の違いを同じ形にする", () => {
    expect(normalizeForSearch("エモクロア")).toBe(normalizeForSearch("えもくろあ"));
    expect(normalizeForSearch("ｴﾓｸﾛｱ")).toBe(normalizeForSearch("エモクロア"));
    expect(normalizeForSearch("TRPG")).toBe(normalizeForSearch("ｔｒｐｇ"));
  });
});

describe("matchRank", () => {
  const sw = { label: "ソード・ワールド2.5", keywords: ["SwordWorld2.5", "そおとわあると2.5"] };
  it("完全一致・先頭・途中・別名の順に強い", () => {
    expect(matchRank(sw, "ソードワールド2.5")).toBe(0);
    expect(matchRank(sw, "そーど")).toBe(1);
    expect(matchRank(sw, "ワールド")).toBe(2);
    expect(matchRank(sw, "sword")).toBe(3);
    expect(matchRank(sw, "world2")).toBe(4);
    expect(matchRank(sw, "クトゥルフ")).toBe(-1);
  });
});

describe("filterOptions", () => {
  const opts = [
    { value: "a", label: "新クトゥルフ神話TRPG" },
    { value: "b", label: "クトゥルフ神話TRPG" },
    { value: "c", label: "パルプ・クトゥルフ" },
    { value: "d", label: "엔진", group: "その他の言語" },
    { value: "e", label: "ダブルクロス", keywords: ["DoubleCross"] },
  ];

  it("入力が空なら元の順で、群は続けて並べる", () => {
    expect(filterOptions(opts, "").items.map((o) => o.value)).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("先頭一致を途中一致より前に出す", () => {
    expect(filterOptions(opts, "くとぅるふ").items.map((o) => o.value)).toEqual(["b", "a", "c"]);
  });

  it("別名でも見つかる", () => {
    expect(filterOptions(opts, "double").items.map((o) => o.value)).toEqual(["e"]);
  });

  it("描画する数を limit で切り、総数を返す", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ value: `s${i}`, label: `システム${i}` }));
    const res = filterOptions(many, "システム", 50);
    expect(res.items).toHaveLength(50);
    expect(res.total).toBe(600);
  });
});

describe("groupInOrder", () => {
  it("最初に現れた群の順にまとめる", () => {
    const items = [{ id: 1, group: "x" }, { id: 2, group: "y" }, { id: 3, group: "x" }, { id: 4 }];
    expect(groupInOrder(items).map((o) => o.id)).toEqual([1, 3, 2, 4]);
  });
});

describe("hasExactLabel", () => {
  it("表記ゆれを除いて同じ名前があるか", () => {
    expect(hasExactLabel([{ label: "ホラー" }], "ほらー")).toBe(true);
    expect(hasExactLabel([{ label: "ホラー" }], "ホラーA")).toBe(false);
    expect(hasExactLabel([], "")).toBe(true);
  });
});

describe("comboEntries", () => {
  const options = [
    { value: "a", label: "クトゥルフ神話TRPG" },
    { value: "b", label: "ソード・ワールド2.5" },
    { value: "c", label: "Korean", group: "ほかの言語の版" },
  ];
  const base = { options, pinnedLabel: "最近", allLabel: "すべて", canCreate: false, limit: 50 };

  it("入力が空なら pinned を見出し付きで先頭に出す", () => {
    const { entries } = comboEntries({ ...base, query: "", pinned: ["b"] });
    expect(entries.map((e) => (e.kind === "option" ? [e.option.value, e.section] : null))).toEqual([
      ["b", "最近"],
      ["a", "すべて"],
      ["c", "ほかの言語の版"],
    ]);
  });

  it("一致する名前がなければ「追加」行を足す", () => {
    expect(comboEntries({ ...base, canCreate: true, query: "新しい" }).entries.at(-1)).toEqual({
      kind: "create",
      text: "新しい",
    });
    expect(comboEntries({ ...base, canCreate: true, query: "ソードワールド2.5" }).entries).toHaveLength(1);
  });

  it("limit で切った数を hidden で返す", () => {
    const res = comboEntries({ ...base, query: "", limit: 1 });
    expect(res.entries).toHaveLength(1);
    expect(res.hidden).toBe(2);
  });
});
