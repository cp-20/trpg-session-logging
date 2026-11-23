import { describe, expect, it } from "vitest";
import { fmtDateText, parseDateText, weekdaySuffix } from "./date-text";

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

describe("weekdaySuffix", () => {
  it("曜日と祝日を添え、読めない値には何も添えない", () => {
    const holiday = (iso: string) => (iso === "2026-11-23" ? "勤労感謝の日" : null);
    expect(weekdaySuffix("2026-11-17", holiday)).toBe("(火)");
    expect(weekdaySuffix("2026-11-23", holiday)).toBe("(月・祝)");
    expect(weekdaySuffix("2026-11-22")).toBe("(日)");
    expect(weekdaySuffix("")).toBe("");
    expect(weekdaySuffix("2026/11/17")).toBe("");
  });
});
