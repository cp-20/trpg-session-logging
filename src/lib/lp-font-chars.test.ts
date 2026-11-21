import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LP_FONT_FILES } from "../data/lp-fonts";
import { lpFontChars, lpRightsLabels, lpSourceSlice, missingChars } from "./lp-font-chars";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("LP の書体の文字", () => {
  it("LP の範囲だけを集め、制御文字と絵文字は入れない", () => {
    const src = `前\n/* ---------- 公開ページの外枠 */ 卓譜\t😀 /* ================= ライセンス・規約 */ 後`;
    expect(lpSourceSlice(src)).not.toContain("前");
    const chars = lpFontChars(src);
    expect(chars).toContain("卓");
    expect(chars).not.toContain("後");
    expect(chars).not.toContain("\n");
    expect(chars).not.toContain("😀");
    expect(() => lpSourceSlice("目印なし")).toThrow();
  });

  it("LP の文言を変えたら書体を作り直している（pnpm run fonts:lp）", () => {
    const needed = lpFontChars(read("src/screens/Landing.tsx"), [lpRightsLabels(read("src/lib/rights.ts"))]);
    expect(missingChars(needed, read("public/fonts/lp-chars.txt"))).toEqual([]);
  });

  it("書体ファイルは小さく保つ（丸ごとの書体を置かない）", () => {
    expect(statSync(path.join(ROOT, "public", LP_FONT_FILES.display)).size).toBeLessThan(70_000);
    expect(statSync(path.join(ROOT, "public", LP_FONT_FILES.sans)).size).toBeLessThan(160_000);
    // 古いハッシュのファイルを残さない
    expect(readdirSync(path.join(ROOT, "public/fonts")).filter((f) => f.endsWith(".woff2"))).toHaveLength(2);
  });

  it("LP の書体の代わりの候補に Web フォントを入れない（読み込み中に分割ファイルを呼ぶため）", () => {
    const css = read("src/styles.css");
    const stacks = [...css.matchAll(/--pst-font-(?:sans|display):([^;]+);/g)].map((m) => m[1]!);
    expect(stacks).toHaveLength(2);
    for (const stack of stacks) expect(stack).not.toMatch(/Noto Sans JP|Dela Gothic|Google Sans/);
    expect(css).not.toMatch(/font-family:\s*"Dela Gothic One"/);
  });
});
