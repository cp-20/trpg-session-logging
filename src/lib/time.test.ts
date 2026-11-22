import { describe, expect, it } from "vitest";
import { countTextNodes, fmtDates, jstEpoch, sessionDay, sessionMinutes, sessionPlayMinutes } from "./time";

describe("countTextNodes", () => {
  it("配列・入れ子オブジェクトから空でない文字列 text プロパティだけを再帰的に数える", () => {
    expect(countTextNodes(null)).toBe(0);
    expect(countTextNodes("text")).toBe(0);
    expect(countTextNodes({ text: "" })).toBe(0);
    expect(countTextNodes({ text: 123 })).toBe(0);
    expect(
      countTextNodes([
        { text: "A", child: { text: "B" } },
        { text: { nested: true }, items: [{ text: "C" }, { text: "" }, null] },
      ]),
    ).toBe(3);
    expect(countTextNodes({ text: "Top", other: { text: "Sub" } })).toBe(2);
    expect(countTextNodes({ text: "OnlyTextProp", deep: [{ text: "D" }] })).toBe(2);
  });
});

describe("sessionDay (6:00 区切りの30時間制)", () => {
  it("深夜2時は前日に含まれる", () => {
    const ts = jstEpoch("2026-11-15", "26:00");
    expect(sessionDay(ts)).toBe("2026-11-15");
  });
  it("6:00ちょうどは新しい日、5:59は前日", () => {
    expect(sessionDay(jstEpoch("2026-11-15", "29:59"))).toBe("2026-11-15");
    expect(sessionDay(jstEpoch("2026-11-15", "30:00"))).toBe("2026-11-16");
  });
});

describe("jstEpoch", () => {
  it("JST の date+time(30h表記) を epoch秒に変換する", () => {
    const ts = jstEpoch("2026-11-15", "21:00");
    expect(sessionDay(ts)).toBe("2026-11-15");
    expect(new Date(ts * 1000).toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });
});

describe("fmtDates", () => {
  it("単日", () => {
    expect(fmtDates(["2026-11-15"])).toContain("11月15日");
  });
  it("複数日は省略表示", () => {
    const s = fmtDates(["2026-11-14", "2026-11-15"]);
    expect(s).toContain("11月14日");
    expect(s).toContain("15日");
  });
});

describe("sessionMinutes / sessionPlayMinutes", () => {
  it("区間の分は最小 1 分、遊んだ時間は集まりの合計で間の空白を数えない", () => {
    const a = jstEpoch("2026-11-14", "21:00");
    expect(sessionMinutes(a, a)).toBe(1);
    expect(
      sessionPlayMinutes({
        sittings: [
          { start: a, end: a + 3 * 3600 },
          { start: a + 7 * 86400, end: a + 7 * 86400 + 90 * 60 },
        ],
      }),
    ).toBe(270);
  });
});
