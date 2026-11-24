import { describe, expect, it } from "vitest";
import { SYSTEMS, SYSTEM_LIST, isInternationalSystem } from "../data/systems";
import { BCDICE_SYSTEMS } from "./bcdice-systems";
import { roleLabel, roleOfKind, speakerRoleOptions, systemHasEnemies } from "./roles";

describe("roleLabel", () => {
  it("システムの画面ではそのシステムの言葉を使う", () => {
    expect(roleLabel("coc7", "GM")).toBe("KP");
    expect(roleLabel("coc6", "KP")).toBe("KP");
    expect(roleLabel("PulpCthulhu", "GM")).toBe("KP");
    expect(roleLabel("sw25", "ENEMY")).toBe("魔物");
    expect(roleLabel("DoubleCross", "ENEMY")).toBe("エネミー");
  });

  it("横断する画面とシステムの言葉がないものは一般語", () => {
    expect(roleLabel("coc7", "GM", "generic")).toBe("GM");
    expect(roleLabel("emoklore", "GM")).toBe("GM");
    expect(roleLabel(undefined, "KP")).toBe("GM");
    expect(roleLabel("unknown-system", "PL")).toBe("PL");
    expect(roleLabel("coc7", "SYSTEM")).toBe("システム");
  });
});

describe("roleOfKind", () => {
  it("KP と GM は同じ進行役", () => {
    expect(roleOfKind("KP")).toBe("GM");
    expect(roleOfKind("GM")).toBe("GM");
    expect(roleOfKind("ENEMY")).toBe("ENEMY");
    expect(roleOfKind("SYSTEM")).toBeNull();
  });
});

describe("speakerRoleOptions", () => {
  it("エネミーはエネミーのいるシステムだけに出す", () => {
    expect(systemHasEnemies("sw25")).toBe(true);
    expect(systemHasEnemies("coc7")).toBe(false);
    expect(speakerRoleOptions("coc7").map((o) => o.label)).toEqual([
      "KP",
      "PC",
      "PL",
      "NPC",
      "描写",
      "システム",
    ]);
    expect(speakerRoleOptions("sw25").map((o) => o.value)).toEqual([
      "GM",
      "PC",
      "PL",
      "NPC",
      "ENEMY",
      "NARRATION",
      "SYSTEM",
    ]);
  });

  it("取り込みで KP と読んだ値と、付いているエネミーを保つ", () => {
    expect(speakerRoleOptions("coc7", "KP")[0]).toEqual({ value: "KP", label: "KP" });
    expect(speakerRoleOptions("coc7", "ENEMY").map((o) => o.value)).toContain("ENEMY");
  });
});

describe("システムの一覧", () => {
  it("BCDice のシステムをすべて選べる（詳しい定義のあるものは重ねない）", () => {
    const bcdiceIds = new Set(SYSTEM_LIST.map((s) => s.bcdiceId));
    for (const b of BCDICE_SYSTEMS) expect(bcdiceIds.has(b.id), b.id).toBe(true);
    expect(SYSTEM_LIST.filter((s) => s.bcdiceId === "Cthulhu7th").map((s) => s.id)).toEqual(["coc7"]);
    expect(new Set(SYSTEM_LIST.map((s) => s.id)).size).toBe(SYSTEM_LIST.length);
  });

  it("名前は BCDice の正式名をそのまま使い、読みで探せる", () => {
    expect(SYSTEMS.DoubleCross?.name).toBe("ダブルクロス2nd,3rd");
    expect(SYSTEMS.DoubleCross?.keywords).toContain("たふるくろす2");
    expect(SYSTEMS.coc7?.keywords).toContain("新クトゥルフ神話TRPG");
  });

  it("国際化版を見分ける", () => {
    expect(isInternationalSystem(SYSTEMS["Cthulhu:Korean"]!)).toBe(true);
    expect(isInternationalSystem(SYSTEMS.coc7!)).toBe(false);
  });
});
