// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCcfoliaLogHtml } from "./ccfolia-parser";

/* 旧整形ログ（div.tab > p.player > b）で、発言者の前後に空白や別要素があっても本文が欠けない。
 * DOMParser あり（ブラウザ）となし（html-xml-fallback）で同じ結果になること */
const CASES: [string, string, string, string][] = [
  ["<b>  system </b>  ◆ 開始", "system", "◆ 開始", "note"],
  ["<b> 太郎</b>本文", "太郎", "本文", "text"],
  ["<i>補足</i><b>丁</b>本文", "丁", "補足本文", "text"],
  ["<b>GM 花子</b>進めます", "GM 花子", "進めます", "text"],
];

function parse(row: string) {
  const parsed = parseCcfoliaLogHtml(
    `<div class="tab"><p class="tabtitle">main</p><p class="player">${row}</p></div>`,
  );
  return parsed?.channels[0]?.msgs[0];
}

describe("旧整形ログの本文切り出し", () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const [row, sp, text, type] of CASES) {
    it(`DOMParser あり: ${row}`, () => {
      expect(parse(row)).toMatchObject({ sp, text, type });
    });
    it(`DOMParser なし: ${row}`, () => {
      vi.stubGlobal("DOMParser", undefined);
      expect(parse(row)).toMatchObject({ sp, text, type });
    });
  }
});
