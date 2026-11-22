import { describe, expect, it } from "vitest";
import { cleanTags, tagOptions } from "./tags";

describe("tagOptions", () => {
  it("よく使われている順に、表記ゆれをまとめて並べる", () => {
    const items = [
      { tags: ["継続", "学生"] },
      { tags: ["ホラー", "けいぞく"] },
      { tags: [" 学生", "ホラー", "ほらー"] },
      {},
    ];
    // ホラー 3・学生 2・継続 1・けいぞく 1（漢字とかなは別のタグ）
    expect(tagOptions(items).map((o) => o.label)).toEqual(["ホラー", "学生", "継続", "けいぞく"]);
  });
});

describe("cleanTags", () => {
  it("空白・空・重複を落とす", () => {
    expect(cleanTags([" ホラー ", "", "ほらー", "継続"])).toEqual(["ホラー", "継続"]);
  });
});
