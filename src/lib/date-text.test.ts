import { describe, expect, it } from "vitest";
import { fmtDateText, parseDateText } from "./date-text";

describe("parseDateText / fmtDateText", () => {
  it("区切りの違い・全角・年月日・8 桁を読む", () => {
    for (const s of [
      "2026/10/17",
      "2026-10-17",
      "2026.10.17",
      "2026年10月17日",
      "20261017",
      "２０２６／１０／１７",
      " 2026/1/7 ",
    ]) {
      expect(parseDateText(s)).toMatch(/^2026-(10-17|01-07)$/);
    }
  });
  it("ありえない日付・形の違うものは読まない", () => {
    for (const s of [
      "",
      "2026/02/30",
      "2026/13/01",
      "10/17/2026",
      "17/10/2026",
      "2026/10",
      "abc",
      "1800/01/01",
    ]) {
      expect(parseDateText(s)).toBeNull();
    }
    expect(parseDateText("2028/02/29")).toBe("2028-02-29");
  });
  it("表示は YYYY/MM/DD", () => {
    expect(fmtDateText("2026-10-17")).toBe("2026/10/17");
    expect(fmtDateText("")).toBe("");
  });
});
