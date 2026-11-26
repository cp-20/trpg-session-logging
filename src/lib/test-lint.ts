/**
 * テストのソースに対する規約（docs/testing.md）。scripts/lint-tests.ts が全テストに当てる。
 * 文面ではなく形で確かめる: 消し忘れた .only、理由のない skip、node で DOM を使うテストなど。
 */
export interface TestLintViolation {
  line: number;
  rule: string;
  message: string;
}

const ONLY_RE = /\b(?:describe|it|test|suite|bench)(?:\.\w+)*\.only\b|\b(?:fit|fdescribe)\s*\(/;
const SKIP_RE =
  /\b(?:describe|it|test|suite)(?:\.\w+)*\.(?:skip|todo|fixme)\b|\b(?:xit|xdescribe|xtest)\s*\(/;
// Playwright の test.skip(条件, "理由") は理由を引数に持つ
const PLAYWRIGHT_SKIP_WITH_REASON_RE = /\btest\.(?:skip|fixme)\s*\([^,]+,\s*["'`]/;
const SNAPSHOT_RE = /\.toMatch(?:Inline)?Snapshot\s*\(/;
const TRUTHY_RE = /\.toBe(?:Truthy|Falsy)\s*\(\s*\)/;
// node 環境で動く *.test.ts が DOM に触ると、DOM の無い経路（フォールバック）を黙って試すことになる
const DOM_GLOBAL_RE =
  /\b(?:document|window|localStorage|sessionStorage|DOMParser|HTMLElement|FileReader)\b(?!\s*:)|\bnew\s+(?:File|Blob)\s*\(/;
const JSDOM_DOCBLOCK_RE = /^\s*(?:\/\/|\/\*+|\*)\s*@vitest-environment\s+(?:jsdom|happy-dom)\b/m;

function isCommentOrString(line: string, index: number): boolean {
  const before = line.slice(0, index);
  if (/\/\/|^\s*\*|\/\*/.test(before)) return true;
  // 引用符の数が奇数なら文字列の中（テスト名など）
  const quotes = before.match(/["'`]/g)?.length ?? 0;
  return quotes % 2 === 1;
}

function hasReasonComment(lines: string[], i: number): boolean {
  if (/\/\/\s*\S/.test(lines[i]!.replace(/["'`][^"'`]*["'`]/g, ""))) return true;
  for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
    const prev = lines[j]!.trim();
    if (prev === "") continue;
    return prev.startsWith("//") || prev.startsWith("*") || prev.startsWith("/*") || prev.endsWith("*/");
  }
  return false;
}

/** file はリポジトリからの相対パス（拡張子で環境を見分ける） */
export function lintTestSource(file: string, source: string): TestLintViolation[] {
  const out: TestLintViolation[] = [];
  const lines = source.split("\n");
  const isVitestTs = /\.test\.ts$/.test(file);
  const isJsdom = JSDOM_DOCBLOCK_RE.test(source.split("\n").slice(0, 15).join("\n"));
  let domReported = false;

  lines.forEach((line, i) => {
    const at = (re: RegExp) => {
      const m = re.exec(line);
      return m && !isCommentOrString(line, m.index) ? m : null;
    };
    if (at(ONLY_RE))
      out.push({
        line: i + 1,
        rule: "no-only",
        message: ".only を残さない（他のテストが黙って動かなくなる）",
      });
    if (at(SKIP_RE) && !PLAYWRIGHT_SKIP_WITH_REASON_RE.test(line) && !hasReasonComment(lines, i))
      out.push({
        line: i + 1,
        rule: "skip-needs-reason",
        message: "skip / todo には、なぜ飛ばすか・いつ戻すかをすぐ上のコメントに書く",
      });
    if (at(SNAPSHOT_RE))
      out.push({
        line: i + 1,
        rule: "no-snapshot",
        message: "スナップショットは使わない。確かめたい振る舞いを個別に expect する",
      });
    if (at(TRUTHY_RE))
      out.push({
        line: i + 1,
        rule: "no-truthy",
        message: "toBeTruthy / toBeFalsy ではなく、期待する値を toBe / toEqual で書く",
      });
    if (isVitestTs && !isJsdom && !domReported && at(DOM_GLOBAL_RE)) {
      domReported = true;
      out.push({
        line: i + 1,
        rule: "dom-needs-jsdom",
        message: "DOM を使う *.test.ts は先頭に `// @vitest-environment jsdom` を書く（既定は node）",
      });
    }
  });
  return out;
}
