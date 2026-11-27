import { describe, expect, it } from "vitest";
import { sanitizeEditChanges } from "./edit-request";

describe("sanitizeEditChanges（他人が書いた修正提案の中身を確かめる）", () => {
  it("決まった欄の文字とキーワードの並びは、そのまま通す", () => {
    expect(sanitizeEditChanges({ title: "新しい題名", tags: ["ホラー", "初心者向け"] })).toEqual({
      title: "新しい題名",
      tags: ["ホラー", "初心者向け"],
    });
  });

  it("決まっていない欄は落とす", () => {
    expect(sanitizeEditChanges({ title: "題名", ownerUid: "u_x" })).toEqual({ title: "題名" });
  });

  it.each([
    ["中身がない", null],
    ["並び", ["title"]],
    ["題名が数", { title: 1 }],
    ["題名が長すぎる", { title: "あ".repeat(201) }],
    ["キーワードが並びでない", { tags: "ホラー" }],
    ["キーワードに文字でないものが混じる", { tags: ["ホラー", { x: 1 }] }],
    ["キーワードが 21 個", { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ["中身のある欄が 1 つもない", { ownerUid: "u_x" }],
  ])("%s ものは null（一覧から外す）", (_label, raw) => {
    expect(sanitizeEditChanges(raw)).toBeNull();
  });
});
