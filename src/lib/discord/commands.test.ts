import { describe, expect, it } from "vitest";
import { COMMANDS } from "./commands";

describe("Discord のコマンド", () => {
  it.each(COMMANDS.map((c) => [c.name]))("/%s は英字の名前で、日本語入力なしに打てる", (name) => {
    expect(name).toMatch(/^[a-z][a-z-]{1,31}$/);
  });

  it.each(COMMANDS.map((c) => [c.name, c]))(
    "/%s は親の下にまとめない（サブコマンドにすると、名前から何ができるか分からない）",
    (_name, command) => {
      const options: { type: number }[] = "options" in command ? [...command.options] : [];
      expect(options.filter((o) => o.type === 1 || o.type === 2)).toEqual([]);
    },
  );

  it("名前が重ならない", () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
