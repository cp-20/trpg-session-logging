import { describe, expect, it } from "vitest";
import { destinationLabel, safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("卓譜の中のパスはそのまま戻り先にする", () => {
    expect(safeNextPath("/sessions/s02?tab=log")).toBe("/sessions/s02?tab=log");
    expect(safeNextPath("/characters")).toBe("/characters");
  });
  it("外のサイト・空・LP・ログイン画面はホームにする", () => {
    for (const raw of [
      null,
      "",
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/",
      "/signin?next=/x",
      "/a\nb",
    ]) {
      expect(safeNextPath(raw)).toBe("/home");
    }
  });
});

describe("destinationLabel", () => {
  it("戻る先を画面の名前で言う", () => {
    expect(destinationLabel("/settings")).toBe("設定を開く");
    expect(destinationLabel("/tables/discord?code=x")).toBe("卓を開く");
    expect(destinationLabel("/home")).toBe("ホームを開く");
    expect(destinationLabel("/unknown")).toBe("元の画面に戻る");
  });
});
