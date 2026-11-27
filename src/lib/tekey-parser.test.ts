// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { importLogFromFile, importLogFromText } from "./importers";
import { parseTekeyLogHtml } from "./tekey-parser";

const tabs = `<div class="tab-list">
<label class="tab-checkbox"><input type="checkbox" id="tab1" checked>main</label>
<label class="tab-checkbox"><input type="checkbox" id="tab2" checked>控え室</label>
</div>`;

const wrap = (rows: string, head = tabs) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>log</title></head><body>${head}<div class="chatlog">${rows}</div></body></html>`;

const sample = wrap(`
<div class="tab1" style="color:#336699"><span>[main]</span><b>夜霜：</b>それでは始めます。<br>「ようこそ」&amp;&lt;注意&gt;</div>
<div class="tab1 diceroll" style="color:#cc3333"><span>[main]</span><b>遠沢：</b>CC&lt;=70 【目星】 (1D100&lt;=70) ＞ 42 ＞ 成功</div>
<div class="tab2" style="color:#009900"><span>[控え室]</span><b>みかん：</b>よろしくです</div>
`);

describe("Tekey HTML の取り込み", () => {
  it("タブをチャンネルにし、発言者を末尾の全角コロン抜きで取り出す", () => {
    const log = parseTekeyLogHtml(sample)!;
    expect(log.channels.map((c) => c.name)).toEqual(["メイン", "控え室"]);
    expect(log.messageCount).toBe(3);
    expect(log.channels[0]!.msgs.map((m) => m.sp)).toEqual(["夜霜", "遠沢"]);
  });

  it("本文の改行と HTML 実体参照を文字に戻し、発言者や span は本文に混ぜない", () => {
    const m = parseTekeyLogHtml(sample)!.channels[0]!.msgs[0]!;
    expect(m.text).toBe("それでは始めます。\n「ようこそ」&<注意>");
  });

  it("diceroll の BCDice 結果を CCFOLIA と同じ roll にする", () => {
    const m = parseTekeyLogHtml(sample)!.channels[0]!.msgs[1]!;
    expect(m.type).toBe("roll");
    expect(m.roll).toMatchObject({ skill: "目星", dice: "42", result: "成功" });
  });

  it("文字色は発言者の判別に影響せず、本文に色指定が混ざらない", () => {
    const log = parseTekeyLogHtml(sample)!;
    expect(log.channels.flatMap((c) => c.msgs).some((m) => /color|#336699/.test(m.text ?? ""))).toBe(false);
  });

  it("時刻は作らず 0 のまま、文書順を保つ", () => {
    const msgs = parseTekeyLogHtml(sample)!.channels[0]!.msgs;
    expect(msgs.map((m) => m.ts)).toEqual([0, 0]);
    expect(msgs.map((m) => m.sp)).toEqual(["夜霜", "遠沢"]);
  });

  it("ログに書かれていないのでシークレットにはしない（発言者 2 人以下のタブでも）", () => {
    const log = parseTekeyLogHtml(sample)!;
    expect(log.channels.every((c) => !c.secret)).toBe(true);
  });

  it("タブ一覧にない tab クラスの発言があれば推測せず取り込まない", () => {
    expect(parseTekeyLogHtml(wrap(`<div class="tab9"><b>誰か：</b>こんにちは</div>`))).toBeNull();
  });

  it("発言者 <b> の無い行があれば取り込まない", () => {
    expect(parseTekeyLogHtml(wrap(`<div class="tab1">本文だけ</div>`))).toBeNull();
  });

  it("タブ一覧か .chatlog が無い HTML は取り込まない", () => {
    expect(parseTekeyLogHtml(`<div class="chatlog"><div class="tab1"><b>a：</b>b</div></div>`)).toBeNull();
    expect(parseTekeyLogHtml(`<html>${tabs}</html>`)).toBeNull();
  });
});

describe("ログ形式の判別", () => {
  it("Tekey の HTML は Tekey として読む（テキスト・ファイルとも）", async () => {
    expect(importLogFromText(sample)?.sourceLabel).toBe("Tekey");
    const file = new File([sample], "log.html", { type: "text/html" });
    expect((await importLogFromFile(file))?.sourceLabel).toBe("Tekey");
  });

  it("CCFOLIA の HTML は CCFOLIA のまま読む", async () => {
    const ccf = `<html><body><article class="message" data-channel="main"><span class="speaker">夜霜</span><div class="message-text">始めます</div><time class="timestamp" datetime="2026-01-01T10:00:00Z"></time></article></body></html>`;
    expect(importLogFromText(ccf)?.sourceLabel).toBe("CCFOLIA");
    const file = new File([ccf], "log.html", { type: "text/html" });
    expect((await importLogFromFile(file))?.sourceLabel).toBe("CCFOLIA");
  });
});
