import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

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
