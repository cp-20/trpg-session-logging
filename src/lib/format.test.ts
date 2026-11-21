import { describe, expect, it } from "vitest";
import { fmtDelta } from "./format";

describe("fmtDelta", () => {
  it("増減を括弧で包み、負号は − にする", () => {
    expect(fmtDelta(-3)).toBe("(−3)");
    expect(fmtDelta(7)).toBe("(+7)");
    expect(fmtDelta(0)).toBe("(±0)");
  });
});
