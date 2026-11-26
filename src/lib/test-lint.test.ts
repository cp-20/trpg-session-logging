import { describe, expect, it } from "vitest";
import { lintTestSource } from "./test-lint";

const rules = (file: string, source: string) => lintTestSource(file, source).map((v) => v.rule);

describe("lintTestSource", () => {
  describe("no-only", () => {
    it.each(["it.only(", "describe.only(", "test.only(", "it.only.each([1])(", "fit("])(
      "%s を拒む",
      (call) => {
        expect(rules("a.test.ts", `${call}"x", () => {});`)).toEqual(["no-only"]);
      },
    );

    it("テスト名の中の .only は見逃す", () => {
      expect(rules("a.test.ts", `it("it.only( を書かない", () => {});`)).toEqual([]);
    });
  });

  describe("skip-needs-reason", () => {
    it("理由のない it.skip を拒む", () => {
      expect(rules("a.test.ts", `it.skip("x", () => {});`)).toEqual(["skip-needs-reason"]);
    });

    it("理由のない it.skip.each を拒む", () => {
      expect(rules("a.test.ts", `it.skip.each([1])("x", () => {});`)).toEqual(["skip-needs-reason"]);
    });

    it("すぐ上の行にコメントがある skip は通す", () => {
      const source = `// 外部 API が止まっているため（#12 で戻す）\nit.skip("x", () => {});`;

      expect(rules("a.test.ts", source)).toEqual([]);
    });

    it("空行を挟んで離れたコメントは理由として数えない", () => {
      const source = `// 別の話\nconst a = 1;\nit.todo("x");`;

      expect(rules("a.test.ts", source)).toEqual(["skip-needs-reason"]);
    });

    it("理由を引数に持つ Playwright の test.skip(条件, 理由) は通す", () => {
      expect(rules("e2e/a.spec.ts", `test.skip(!ok, "pnpm run x で実行する");`)).toEqual([]);
    });

    it("条件で飛ばす skipIf は条件そのものが理由なので通す", () => {
      expect(rules("a.test.ts", `it.skipIf(!enabled)("x", () => {});`)).toEqual([]);
    });
  });

  it("スナップショットを拒む", () => {
    expect(rules("a.test.tsx", `expect(html).toMatchInlineSnapshot();`)).toEqual(["no-snapshot"]);
  });

  it("toBeTruthy / toBeFalsy を拒む", () => {
    expect(rules("a.test.ts", `expect(a).toBeTruthy();\nexpect(b).toBeFalsy();`)).toEqual([
      "no-truthy",
      "no-truthy",
    ]);
  });

  describe("dom-needs-jsdom", () => {
    it("jsdom を宣言せずに DOMParser を使う *.test.ts を 1 回だけ指摘する", () => {
      const source = `new DOMParser();\nnew DOMParser();`;

      expect(lintTestSource("a.test.ts", source)).toEqual([
        expect.objectContaining({ line: 1, rule: "dom-needs-jsdom" }),
      ]);
    });

    it("先頭で jsdom を宣言していれば通す", () => {
      expect(rules("a.test.ts", `// @vitest-environment jsdom\nlocalStorage.clear();`)).toEqual([]);
    });

    it("*.test.tsx は既定で jsdom なので通す", () => {
      expect(rules("a.test.tsx", `document.body.innerHTML = "";`)).toEqual([]);
    });

    it("オブジェクトのキーとしての window: は DOM の利用に数えない", () => {
      expect(rules("a.test.ts", `const opts = { window: 3 };`)).toEqual([]);
    });
  });
});
