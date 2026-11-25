// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCcfoliaLogHtml } from "./ccfolia-parser";
import { parseCcfoliaHtmlEntriesFallback, parseUdonariumChatsFallback } from "./html-xml-fallback";
import { importLogFromText } from "./importers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTML / XML fallback parsers without DOMParser (Hermes compatibility)", () => {
  it("CCFOLIA 素の HTML (<p><span>) を DOMParser なしでも同じ結果で解析する", () => {
    const html = `<!DOCTYPE html>
<html>
  <body>
    <p style="color:#888888;"><span> [メイン]</span> <span>KP :</span> <span>夜の病院に到着しました。&lt;目星&gt;をどうぞ。</span></p>
    <p style="color:#b85d27;"><span> [メイン]</span> <span>遠沢澄花 :</span> <span>CC&lt;=70 【目星】 (1D100&lt;=70) ＞ 32 ＞ レギュラー成功</span></p>
    <p style="color:#446688;"><span> [秘匿HO1]</span> <span>KP :</span> <span>◆ あなただけが知っている情報です。</span></p>
  </body>
</html>`;

    const withDom = parseCcfoliaLogHtml(html);
    vi.stubGlobal("DOMParser", undefined);
    const withoutDom = parseCcfoliaLogHtml(html);

    expect(withDom).not.toBeNull();
    expect(withoutDom).toEqual(withDom);
    expect(withoutDom?.messageCount).toBe(3);
    expect(withoutDom?.channels.find((c) => c.name === "秘匿HO1")?.secret).toBe(true);
  });

  it("CCFOLIA 旧整形ログ (div.tab) を DOMParser なしで解析する", () => {
    const html = `<div class="tab"><div class="tabtitle">メイン</div>
      <p class="player"><b>KP</b>それでは始めます</p>
      <p class="player"><b>白瀬怜</b>了解しました</p>
    </div>`;

    const withDom = parseCcfoliaLogHtml(html);
    vi.stubGlobal("DOMParser", undefined);
    const withoutDom = parseCcfoliaLogHtml(html);

    expect(withDom).not.toBeNull();
    expect(withoutDom).toEqual(withDom);
    expect(withoutDom?.channels[0]?.name).toBe("メイン");
    expect(withoutDom?.messageCount).toBe(2);
  });

  it("CCFOLIA 新整形ログ (section.tab) の <br> 改行と実体参照を DOMParser なしで展開する", () => {
    const html = `<section class="tab"><h2 class="tabtitle">メイン</h2>
      <div class="player"><span class="speaker-text">遠沢澄花</span><div class="player-message">1行目<br />2行目 &amp; &quot;確認&quot;</div></div>
      <div class="player"><span class="speaker-text">system</span><div class="player-message">SAN値チェック</div></div>
    </section>`;

    vi.stubGlobal("DOMParser", undefined);
    const parsed = parseCcfoliaLogHtml(html);

    expect(parsed).not.toBeNull();
    expect(parsed?.messageCount).toBe(2);
    expect(parsed?.channels[0]?.msgs[0]?.text).toBe('1行目\n2行目 & "確認"');
    expect(parsed?.channels[0]?.msgs[1]?.kind).toBe("SYSTEM");
  });

  it("Udonarium chat.xml を DOMParser なしで解析する", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<chat-log>
  <chat tab="メイン" time="1794831600000" name="KP:夜霜">それでは導入を始めます。</chat>
  <chat tab="メイン" time="1794831660000" name="遠沢澄花">「周囲を見渡してみます」</chat>
  <chat tab="雑談" time="1794831700000" name="みかん">よろしくお願いします！</chat>
  <chat tab="秘匿HO1" time="1794831720000" name="KP:夜霜">◆ 個別情報：鍵を持っています。</chat>
</chat-log>`;

    vi.stubGlobal("DOMParser", undefined);
    const res = importLogFromText(xml);

    expect(res?.sourceLabel).toBe("Udonarium");
    expect(res?.log.messageCount).toBe(4);
    expect(res?.log.channels.map((c) => c.name)).toContain("メイン");
    expect(res?.log.channels.map((c) => c.name)).toContain("チャット");
    const secret = res?.log.channels.find((c) => c.name === "秘匿HO1");
    expect(secret?.secret).toBe(true);
    // 個別の資料は場面の見出しではない
    expect(secret?.msgs[0]?.type).toBe("text");
  });

  it("無効な HTML / XML は DOMParser なしでも null を返す", () => {
    vi.stubGlobal("DOMParser", undefined);
    expect(parseCcfoliaLogHtml("<div><span>空</span></div>")).toBeNull();
    expect(importLogFromText("<chat-log><chat></chat></chat-log>")).toBeNull();
  });

  it("コメント・script/style・CDATA・void要素・引用符バリエーション・文字実体・タイトル欠落・Udonarium属性を扱う", () => {
    const html = `<!DOCTYPE html>
    <html>
      <head>
        <style>.ignored { color: red; }</style>
        <script>console.log("<p>fake</p>");</script>
      </head>
      <body>
        <!-- <span>ignored comment</span> -->
        <p><span>[]</span><span>空タブ者</span><span>1行目</span><span>2行目</span></p>
        <p><span> [雑談] </span><span></span><span>欠落発言者</span></p>
        <p><span>[メイン]</span><span>太郎</span><span></span></p>
      </body>
    </html>`;
    expect(parseCcfoliaHtmlEntriesFallback(html)).toEqual([
      { tab: "ch0", sp: "空タブ者", text: "1行目\n2行目" },
      // 発言者が空でも本文は残す（名前は呼び出し側で「不明な発言者」にする）
      { tab: "雑談", sp: "", text: "欠落発言者" },
    ]);

    const divHtml = `<html><head><script>ignored</script><style>ignored</style></head><body>
        <div class="extra tab wrapper"><img src=hero.png alt='x'><hr>
          <p class="player foo"><b>霧島 霞</b>&#65;&#x42;&apos;&nbsp;&unknown;<br>次行</p>
        </div>
        <div class="tab"><p class="tabtitle"></p><p class="player"><b>空</b></p></div>
        <section class="tab secondary">
          <div class="player"><span class="speaker-text">PC1</span><span class="player-message">本文1</span></div>
        </section>
      </body></html>`;
    const divEntries = parseCcfoliaHtmlEntriesFallback(divHtml);
    expect(divEntries).toEqual([{ tab: "ch1", sp: "霧島 霞", text: "AB' &unknown;\n次行" }]);

    const secHtml = `<section class="tab"><h2 class="tabtitle"></h2><div class="player"><span class="speaker-text">A</span><div class="player-message">台詞</div></div></section>`;
    expect(parseCcfoliaHtmlEntriesFallback(secHtml)).toEqual([{ tab: "ch1", sp: "A", text: "台詞" }]);

    // unclosed script/style・空属性・数値実体エラー境界・section 空白スキップ
    const edgeHtml = `<section class="tab"><div class="player"><span class="speaker-text"></span><div class="player-message">x</div></div></section>&#9999999;&#x110000;<script>unclosed`;
    expect(parseCcfoliaHtmlEntriesFallback(edgeHtml)).toEqual([]);

    // Udonarium from / timestamp / type="system"
    const chats = parseUdonariumChatsFallback(
      `<chat-log><chat from="GM" timestamp="1794831600000" type=" SYSTEM ">システム通知</chat><chat>無記名</chat></chat-log>`,
    );
    expect(chats[0]).toEqual({
      name: "GM",
      tab: "",
      time: "1794831600000",
      type: "system",
      text: "システム通知",
    });
  });
});
