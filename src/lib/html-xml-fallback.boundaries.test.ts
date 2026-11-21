import { describe, expect, it } from "vitest";
import {
  parseCcfoliaHtmlEntriesFallback as parseHtml,
  parseUdonariumCharacterFallback as parseChar,
  parseUdonariumChatsFallback as parseChats,
} from "./html-xml-fallback";

/** 生ログ形式の 1 行 */
const rawP = (tab: string, sp: string, text: string) =>
  `<p><span>${tab}</span><span>${sp}</span><span>${text}</span></p>`;
/** chat.xml の本文だけを取り出す */
const chatText = (inner: string) => parseChats(`<chat name="A">${inner}</chat>`)[0]?.text;

describe("文字実体の展開", () => {
  it.each([
    ["&#65;&#x42;&#X43;", "ABC"],
    ["&#39;&apos;&quot;&lt;&gt;&amp;", `''"<>&`],
    ["a&nbsp;b", "a b"],
    ["&#x10FFFF;", String.fromCodePoint(0x10ffff)],
    ["&#1114111;", String.fromCodePoint(0x10ffff)],
    ["&#x110000;", "&#x110000;"],
    ["&#1114112;", "&#1114112;"],
    ["&#x0;&#0;", "&#x0;&#0;"],
    ["&unknown;&#xZZ;&;", "&unknown;&#xZZ;&;"],
  ])("%s → %j", (raw, expected) => {
    expect(chatText(raw)).toBe(expected);
  });
});

describe("属性の読み取り", () => {
  it("引用符なし・単引用符・二重引用符・値なしの属性を読む", () => {
    const xml = `<character><data name=HP type='numberResource' currentValue>12</data><data NAME="MP" currentValue="">3</data></character>`;
    expect(parseChar(xml)?.leafData).toEqual([
      { dataName: "HP", dataType: "numberResource", currentValue: "", text: "12" },
      { dataName: "MP", dataType: "", currentValue: "", text: "3" },
    ]);
  });

  it("= の前後の空白を許す", () => {
    expect(parseChats(`<chat name = "夜霜" tab ='メイン'>x</chat>`)[0]).toMatchObject({
      name: "夜霜",
      tab: "メイン",
    });
  });

  it("属性値の実体参照を展開し、前後の空白を落とす", () => {
    expect(
      parseChats(`<chat name=" 夜&amp;霜 " tab=" メイン " type=" Note " time="1">本文</chat>`)[0],
    ).toEqual({ name: "夜&霜", tab: "メイン", time: "1", type: "note", text: "本文" });
  });
});

describe("コメント・宣言・処理命令・CDATA", () => {
  it("> や空白を含むコメントの中身は読まない", () => {
    const html = `<!-- ${rawP("[偽]", "偽者", "読まない")} -->${rawP("[メイン]", "太郎", "本物")}`;
    expect(parseHtml(html)).toEqual([{ tab: "メイン", sp: "太郎", text: "本物" }]);
  });

  it("要素の中のコメント・宣言・処理命令は子要素にも本文にもならない", () => {
    const html = `<p><!-- c --><?pi x?><!x y><span>[メイン]</span><span>太郎</span><span>本文</span></p>`;
    expect(parseHtml(html)).toEqual([{ tab: "メイン", sp: "太郎", text: "本文" }]);
    expect(chatText("前<!-- a > b -->後")).toBe("前後");
    expect(chatText("前<?pi a b?>後")).toBe("前後");
    expect(chatText("前<!DOCTYPE x>後")).toBe("前後");
  });

  it("CDATA は空白も記号もそのまま本文にする", () => {
    expect(chatText("<![CDATA[星野 光 <b>&amp;</b>]]>")).toBe("星野 光 <b>&amp;</b>");
    expect(chatText("<![CDATA[]]>本文")).toBe("本文");
  });
});

describe("閉じタグと末尾", () => {
  it("閉じた要素の後ろの兄弟は中に入れない", () => {
    expect(parseChats(`<chat name=A>x</chat><chat name=B>y</chat>`).map((c) => c.text)).toEqual(["x", "y"]);
  });

  it("対応しない閉じタグは無視して、開いている要素を閉じない", () => {
    expect(chatText("x</b>y")).toBe("xy");
  });

  it("閉じられていない要素の末尾の文字も本文にする", () => {
    expect(parseChats(`<chat name=A>途中まで&amp;`)[0]?.text).toBe("途中まで&");
    expect(parseChats(`<chat name=A>`)[0]?.text).toBe("");
  });

  it("XML の自己終了タグは子を持たない", () => {
    const xml = `<character><data name="a"/><data name="b">x</data></character>`;
    expect(parseChar(xml)?.leafData.map((d) => [d.dataName, d.text])).toEqual([
      ["a", ""],
      ["b", "x"],
    ]);
  });

  it("XML では <br> も script も普通の要素として扱う", () => {
    expect(chatText("a<br/>b<script>c</script>")).toBe("abc");
    expect(parseChar(`<character><chat-palette>a<br/>b</chat-palette></character>`)?.paletteText).toBe("ab");
  });
});

describe("HTML の script / style / void 要素", () => {
  const fake = rawP("[偽]", "偽者", "読まない");
  it.each([
    ["script", `<script>${fake}</script>`],
    ["style", `<style>${fake}</style>`],
    ["大文字の SCRIPT", `<SCRIPT>${fake}</SCRIPT >`],
  ])("%s の中身は読まない", (_label, block) => {
    const html = `${rawP("[メイン]", "太郎", "前")}${block}${rawP("[メイン]", "花子", "後")}`;
    expect(parseHtml(html)).toEqual([
      { tab: "メイン", sp: "太郎", text: "前" },
      { tab: "メイン", sp: "花子", text: "後" },
    ]);
  });

  it("本文の途中の script は前後の文字をつなげる", () => {
    expect(parseHtml(rawP("[メイン]", "太郎", "本<script>0123456789abc</script>文"))[0]?.text).toBe("本文");
  });

  it("void 要素の後ろの兄弟は void 要素の中に入れない", () => {
    const html = `<div class="tab"><img src=x.png><input><p class="player"><b>太郎</b>本文</p></div>`;
    expect(parseHtml(html)).toEqual([{ tab: "ch1", sp: "太郎", text: "本文" }]);
  });
});

describe("CCFOLIA 生ログ (p > span×3)", () => {
  it("直下の span だけを数え、ほかの要素は数えない", () => {
    expect(parseHtml("<p><i>a</i><i>b</i><i>c</i></p>")).toEqual([]);
    expect(parseHtml("<div><span>[a]</span><span>b</span><span>c</span></div>")).toEqual([]);
    expect(parseHtml("<p><b>x</b><span>[メイン]</span><span>太郎</span><span>本文</span></p>")).toEqual([
      { tab: "メイン", sp: "太郎", text: "本文" },
    ]);
  });

  it("タブ名は前後の角括弧だけを落とし、発言者と本文の空白を落とす", () => {
    expect(parseHtml(rawP(" [a[b]c] ", " 太郎 ", "  本文  "))).toEqual([
      { tab: "a[b]c", sp: "太郎", text: "本文" },
    ]);
  });

  it("生ログが見つかれば整形ログは読まない", () => {
    const html = `${rawP("[メイン]", "太郎", "生")}<div class="tab"><p class="player"><b>花子</b>旧</p></div>`;
    expect(parseHtml(html)).toEqual([{ tab: "メイン", sp: "太郎", text: "生" }]);
  });
});

describe("CCFOLIA 旧整形ログ (div.tab > p.player > b)", () => {
  it("タブ名と発言者・本文の前後の空白を落とす", () => {
    const html = `<div class="tab"><div class="tabtitle"> メイン </div><p class="player"><b>太郎</b>  本文  </p></div>`;
    expect(parseHtml(html)).toEqual([{ tab: "メイン", sp: "太郎", text: "本文" }]);
  });

  it("発言者の末尾の空白を落とし、本文から発言者を除く", () => {
    const html = `<div class="tab"><p class="player"><b>太郎 </b>本文</p></div>`;
    expect(parseHtml(html)).toEqual([{ tab: "ch1", sp: "太郎", text: "本文" }]);
  });

  it("直下の p.player だけを行とみなす", () => {
    const html = `<div class="tab">
      <p class="other"><b>甲</b>読まない</p>
      <p><b>乙</b>読まない</p>
      <div class="player"><b>丙</b>読まない</div>
      <p class="player"><i>補足</i><b>丁</b>本文</p>
      <p class="player"><b>戊</b>本文2</p>
    </div>`;
    // 発言者は先頭の要素ではなく最初の <b>
    expect(parseHtml(html).map((e) => e.sp)).toEqual(["丁", "戊"]);
  });

  it("<b> のない行は飛ばす", () => {
    expect(
      parseHtml(
        `<div class="tab"><p class="player">本文だけの行で、発言者の名前はどこにも書かれていない</p></div>`,
      ),
    ).toEqual([]);
  });

  it("class が空・tab を含まない div はタブにしない", () => {
    expect(parseHtml(`<div class=""><p class="player"><b>太郎</b>本文</p></div>`)).toEqual([]);
    expect(parseHtml(`<div class="tabs"><p class="player"><b>太郎</b>本文</p></div>`)).toEqual([]);
  });
});

describe("CCFOLIA 新整形ログ (section.tab > .player)", () => {
  const row = (sp: string | null, msg: string | null) =>
    `<li class="player">${sp === null ? "" : `<span class="speaker-text">${sp}</span>`}${msg === null ? "" : `<div class="player-message">${msg}</div>`}</li>`;

  it("タブ名・発言者・本文の前後の空白を落とし、発言者か本文がない行は飛ばす", () => {
    const html = `<section class="tab"><h2 class="tabtitle"> メイン </h2><ol>${row(" 太郎 ", "  本文  ")}${row(null, "本文だけ")}${row("発言者だけ", null)}</ol></section>`;
    expect(parseHtml(html)).toEqual([{ tab: "メイン", sp: "太郎", text: "本文" }]);
  });

  it("タブ名がなければ ch 番号を振る", () => {
    expect(parseHtml(`<section class="tab">${row("太郎", "本文")}</section>`)).toEqual([
      { tab: "ch1", sp: "太郎", text: "本文" },
    ]);
  });

  it("class=tab の section だけをタブにする", () => {
    expect(parseHtml(`<section>${row("太郎", "本文")}</section>`)).toEqual([]);
    expect(parseHtml(`<article class="tab">${row("太郎", "本文")}</article>`)).toEqual([]);
  });
});

describe("Udonarium character.xml", () => {
  it("子の data を持たない data だけを葉として読み、chat-palette は葉にしない", () => {
    const xml = `<character><data name="detail"><data name=" HP " type=" numberResource "> 12 </data><data>名無し</data><data name="メモ">a<b>強調</b></data></data><chat-palette dicebot="DiceBot"> 1d6 </chat-palette></character>`;
    expect(parseChar(xml)).toEqual({
      leafData: [
        { dataName: "HP", dataType: "numberResource", currentValue: null, text: "12" },
        { dataName: "", dataType: "", currentValue: null, text: "名無し" },
        { dataName: "メモ", dataType: "", currentValue: null, text: "a強調" },
      ],
      dicebot: "DiceBot",
      paletteText: " 1d6 ",
    });
  });
});

describe("Udonarium chat.xml", () => {
  it("属性がない chat は空文字と null で埋める", () => {
    expect(parseChats(`<chat-log><chat>  無記名  </chat></chat-log>`)).toEqual([
      { name: "", tab: "", time: null, type: "", text: "無記名" },
    ]);
  });

  it("name より from、time より timestamp を後回しにする", () => {
    expect(parseChats(`<chat name="A" from="B" time="1" timestamp="2">x</chat>`)[0]).toMatchObject({
      name: "A",
      time: "1",
    });
  });
});
