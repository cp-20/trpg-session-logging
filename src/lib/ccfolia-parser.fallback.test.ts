// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCcfoliaLog, parseCcfoliaLogHtml } from "./ccfolia-parser";

/* DOMParser が無い環境(React Native 等)では html-xml-fallback 経由で同じ結果を返す */
describe("parseCcfoliaLogHtml (DOMParser なし)", () => {
  beforeEach(() => vi.stubGlobal("DOMParser", undefined));
  afterEach(() => vi.unstubAllGlobals());

  it("DOMParser が無い", () => {
    expect(typeof DOMParser).toBe("undefined");
  });

  it("生ログから発言者・本文・種別・タブを復元する(ts は 0)", () => {
    const parsed = parseCcfoliaLog(`﻿<body>
      <p><span>[情報]</span><span>system</span><span>◆ 開始</span></p>
      <p><span>[情報]</span><span>KP:夜霜</span><span>本文◆</span></p>
      <p><span>[]</span><span>探索者</span><span>こんにちは</span></p>
    </body>`)!;
    expect(parsed.messageCount).toBe(3);
    const info = parsed.channels.find((c) => c.id === "情報")!;
    expect(info.msgs.map((m) => [m.sp, m.text, m.kind, m.type, m.ts])).toEqual([
      ["system", "◆ 開始", "SYSTEM", "note", 0],
      ["KP:夜霜", "本文◆", "KP", "text", 0],
    ]);
    expect(parsed.channels.find((c) => c.id === "ch0")!.msgs[0]).toMatchObject({
      sp: "探索者",
      kind: "PC",
      type: "text",
    });
    expect(parsed.kinds).toEqual({ system: "SYSTEM", "KP:夜霜": "KP", 探索者: "PC" });
  });

  it("旧整形ログ・新整形ログも読む", () => {
    const fromDiv = parseCcfoliaLogHtml(
      `<div class="tab"><p class="tabtitle">main</p><p class="player"><b>GM 花子</b>進めます</p></div>`,
    )!;
    expect(fromDiv.channels[0]).toMatchObject({ id: "main", name: "メイン" });
    expect(fromDiv.channels[0]!.msgs[0]).toMatchObject({ sp: "GM 花子", text: "進めます", kind: "KP" });

    const fromSec = parseCcfoliaLogHtml(
      `<section class="tab"><ol><li class="player"><span class="speaker-text">A</span><div class="player-message">x</div></li></ol></section>`,
    )!;
    expect(fromSec.channels[0]!.id).toBe("ch1");
  });

  it("何も取れなければ null", () => {
    expect(parseCcfoliaLogHtml("<p>none</p>")).toBeNull();
  });
});
