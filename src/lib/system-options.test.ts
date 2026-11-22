import { describe, expect, it } from "vitest";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { filterOptions } from "./search-text";
import { INTERNATIONAL_GROUP, recentSystemIds, systemOptions } from "./system-options";

describe("systemOptions", () => {
  const opts = systemOptions();

  it("すべてのシステムを、国際化版を後ろの見出しにまとめて出す", () => {
    expect(opts).toHaveLength(SYSTEM_LIST.length);
    expect(opts.find((o) => o.value === "Cthulhu:Korean")?.group).toBe(INTERNATIONAL_GROUP);
    expect(opts.find((o) => o.value === "coc7")?.group).toBeUndefined();
  });

  it("読みや BCDice の ID・略称でも見つかる", () => {
    expect(filterOptions(opts, "だぶるくろす").items[0]?.value).toBe("DoubleCross");
    expect(filterOptions(opts, "doublecross").items[0]?.value).toBe("DoubleCross");
    expect(filterOptions(opts, "新クトゥルフ").items[0]?.value).toBe("coc7");
    expect(filterOptions(opts, "coc").items.map((o) => o.value)).toEqual(
      expect.arrayContaining(["coc7", "coc6"]),
    );
  });

  it("絞り込みでは渡したシステムだけ", () => {
    expect(systemOptions([SYSTEMS.coc7!, SYSTEMS.sw25!]).map((o) => o.value)).toEqual(["coc7", "sw25"]);
  });
});

describe("recentSystemIds", () => {
  it("新しい順に重複なく、limit 件まで", () => {
    const logs = [
      { systemId: "coc7", sittings: [{ start: 100, end: 110 }], createdAt: "2026-01-01" },
      { systemId: "sw25", sittings: [{ start: 300, end: 310 }], createdAt: "2026-01-03" },
      { systemId: "coc7", sittings: [{ start: 200, end: 210 }], createdAt: "2026-01-02" },
      { systemId: "emoklore", sittings: [], createdAt: "2026-02-01T00:00:00Z" },
    ];
    expect(recentSystemIds(logs)).toEqual(["emoklore", "sw25", "coc7"]);
    expect(recentSystemIds(logs, 1)).toEqual(["emoklore"]);
    expect(recentSystemIds([])).toEqual([]);
  });
});
