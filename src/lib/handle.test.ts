import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  alternateHandle,
  handleProblem,
  isValidHandle,
  normalizeHandle,
  RESERVED_HANDLES,
  suggestHandle,
} from "./handle";

describe("handle", () => {
  it("英小文字・数字・_ の 3〜20 文字で、英字で始まり英数字で終わるものだけを通す", () => {
    for (const ok of ["mikan", "abc", "kp_sora", "a1b2c3", "a".repeat(20)])
      expect(isValidHandle(ok)).toBe(true);
    for (const ng of [
      "ab",
      "a".repeat(21),
      "1abc",
      "_abc",
      "abc_",
      "ab__c",
      "Mikan",
      "みかん",
      "a-b",
      "a.b",
      "a b",
    ])
      expect(isValidHandle(ng)).toBe(false);
  });

  it("予約語は使えない", () => {
    expect(RESERVED_HANDLES.has("settings")).toBe(true);
    expect(handleProblem("settings")).toBe("この ID は使えません");
    expect(handleProblem("join")).not.toBeNull();
  });

  it("理由は文字数・文字種・先頭の順に 1 つだけ返す", () => {
    expect(handleProblem("ab")).toMatch("3文字以上");
    expect(handleProblem("abc-d")).toMatch("英小文字");
    expect(handleProblem("9abc")).toMatch("英字で始め");
  });

  it("入力の @ と空白を落とし、大文字を小文字にする", () => {
    expect(normalizeHandle("  @Mikan_01 ")).toBe("mikan_01");
  });

  it("メールアドレスから候補を作り、作れないときはアカウントから決まる player 番号にする", () => {
    expect(suggestHandle({ email: "Naoki.Nagata+trpg@example.com", uid: "x" })).toBe("naoki_nagata_trpg");
    expect(suggestHandle({ email: "12@example.com", uid: "abc" })).toMatch(/^player\d{5}$/);
    expect(suggestHandle({ name: "みかん", uid: "abc" })).toBe(suggestHandle({ name: "みかん", uid: "abc" }));
    expect(suggestHandle({ email: "admin@example.com", uid: "abc" })).toMatch(/^player/);
    expect(isValidHandle(suggestHandle({ email: `${"a".repeat(30)}@x.jp`, uid: "u" }))).toBe(true);
  });

  it("代わりの候補は 20 文字に収まり、決定的に作られる", () => {
    const alt = alternateHandle("a".repeat(20), 1);
    expect(alt).toHaveLength(20);
    expect(isValidHandle(alt)).toBe(true);
    expect(alternateHandle("mikan", 2)).toBe(alternateHandle("mikan", 2));
    expect(alternateHandle("mikan", 1)).not.toBe("mikan");
  });

  it("予約語と文字の規則は Firestore のルールと同じ", () => {
    const rules = readFileSync(path.resolve(__dirname, "../../firestore.rules"), "utf8");
    const listed = /function validHandle[\s\S]*?in \[([^\]]*)\]/.exec(rules)?.[1] ?? "";
    const inRules = new Set([...listed.matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
    expect(inRules).toEqual(new Set(RESERVED_HANDLES));
    expect(rules).toContain("handle.size() >= 3 && handle.size() <= 20");
  });
});
