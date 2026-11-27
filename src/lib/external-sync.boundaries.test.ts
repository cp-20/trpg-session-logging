import { describe, expect, it } from "vitest";
import type { Character, ExternalSyncProvider } from "../types";
import {
  computeExternalContentHash,
  decodeHtmlEntities,
  extractArchetypeFromMemo,
  isIpLiteral,
  isPrivateOrReservedIp,
  mergeExternalCharacterUpdate,
  parseBoothResponse,
  parseCharasheetResponse,
  parseExternalResponse,
  parseExternalUrl,
  parseTaltoResponse,
  parseYtsheetResponse,
  shouldAutoSync,
} from "./external-sync";

const IA = "https://iachara.com/view/1";
const BOOTH = "https://booth.pm/ja/items/1";
const TALTO = "https://talto.cc/projects/1";
const EMO = "https://emoklore.charasheet.jp/chars/1";

const html = (head: string, body = "") => `<html><head>${head}</head><body>${body}</body></html>`;
const og = (prop: string, content: string) => `<meta property="${prop}" content="${content}" />`;

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: "ch_1",
    ownerId: "u_1",
    name: "遠沢",
    systemId: "coc7",
    color: "#3f5e78",
    archetype: "探索者",
    bio: "紹介",
    tags: [],
    stats: { san: 60, mp: 10 },
    sessions: [],
    growth: [],
    share: {
      enabled: false,
      scope: "link",
      includeProfile: true,
      includeStats: true,
      includeGrowth: true,
      includeSessions: true,
    },
    ...overrides,
  };
}

const mergeOpts = {
  url: IA,
  provider: "iachara" as ExternalSyncProvider,
  syncedAt: "2026-11-20T00:00:00.000Z",
};

describe("isIpLiteral の境界", () => {
  it.each([
    ["[1]", true],
    ["[8.8.8.8]", true],
    ["1.22.33.44", true],
    ["%eth0", false],
    ["1[2", false],
    ["1]2", false],
    ["a0x1", false],
    ["0X1F", true],
    ["1.2.3", false],
  ])("%s → %s", (host, expected) => {
    expect(isIpLiteral(host)).toBe(expected);
  });
});

describe("isPrivateOrReservedIp の境界", () => {
  it.each([
    // 前後空白は除去してから判定する
    [" 8.8.8.8 ", false],
    ["[2001:4860:4860::8888]", false],
    // 括弧は先頭・末尾のみ除去する
    ["8.8[.8.8", true],
    ["8.8].8.8", true],
    // オクテット数・各オクテットの形式
    ["1.2.3", true],
    ["1.2.3.4.5", true],
    ["8.8.8.1e1", true],
    ["8.8.8.+1", true],
    ["8.8..8", true],
    ["8.8.8. 8", true],
    ["8.8.8.256", true],
    ["8.8.8.255", false],
    ["8.8.8.0", false],
    // IPv4 互換 (::a.b.c.d) / マップド
    ["::10.0.0.1", true],
    ["::8.8.8.8", false],
    ["::ffff:8.8.8.8", false],
    ["::ffff:10.0.0.1", true],
    ["::1:0:8.8.8.8", false],
    // 第 6 グループが 0 / ffff 以外なら IPv4 として扱わない
    ["::1:a00:1", false],
    // TEST-NET は第 2 オクテットまで一致した時のみ
    ["198.52.100.1", false],
    ["203.1.113.1", false],
    ["::2", true],
    ["0:0:0:0:0:0:0:2", true],
    // 埋め込み IPv4 は末尾のみ
    ["::1.2.3.4:1", true],
    ["1.2.3.4::1", true],
    ["::ffff:1.2.3", true],
    ["1:2:3:4:5:6:1.2.3.4", false],
    ["1:2:3:4:5:6:7:1.2.3.4", true],
    // 16 進グループの形式
    ["2001:db8::12345", true],
    ["2001:db8::g1", true],
    ["2001:db8::x1", true],
    ["2001:db8::1x", true],
    // 範囲の境界
    ["fc00::", true],
    ["fdff::", true],
    ["fe00::", false],
    ["fe80::", true],
    ["febf::", true],
    ["fec0::", false],
    ["ff00::", true],
    ["feff::", false],
  ])("%s → %s", (ip, expected) => {
    expect(isPrivateOrReservedIp(ip)).toBe(expected);
  });
});

describe("parseExternalUrl のエラー文と正規化", () => {
  const HOST_ERR = "対応していないホストです。";
  const UNSUPPORTED =
    "未対応の URL です。キャラエノ・キャラッシュ・いあきゃら・キャラクター保管所・ゆとシートⅡ・キャラクターシート倉庫・冒険窓口・BOOTH・TALTO に対応しています。";
  it.each([
    ["   ", "外部サービスの URL を入力してください。"],
    ["", "外部サービスの URL を入力してください。"],
    ["not a url", "URL の形式が正しくありません（https:// から入力してください）。"],
    ["http://iachara.com/view/1", "https:// の URL のみ読み込めます。"],
    ["https://u@iachara.com/view/1", "認証情報付きの URL は指定できません。"],
    ["https://:p@iachara.com/view/1", "認証情報付きの URL は指定できません。"],
    ["https://iachara.com:8443/view/1", "標準外のポートを含む URL は指定できません。"],
    ["https://localhost/view/1", HOST_ERR],
    ["https://foo.local/view/1", HOST_ERR],
    ["https://127.0.0.1/view/1", HOST_ERR],
    ["https://[::1]/view/1", HOST_ERR],
    ["https://local.example.com/x", UNSUPPORTED],
    ["https://localhost.example.com/x", UNSUPPORTED],
    ["https://evil.example.com/sheet/1", UNSUPPORTED],
    ["https://a.b.booth.pm/items/1", UNSUPPORTED],
    [
      "https://iachara.com/foo/view/1",
      "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
    ],
    [
      "https://iachara.com/x/sns/1/view",
      "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
    ],
    [
      "https://charasheet.vampire-blood.net/a/1",
      "キャラクター保管所のキャラシート URL（例: https://charasheet.vampire-blood.net/1234567）を指定してください。",
    ],
    [
      "https://charasheet.vampire-blood.net/123abc",
      "キャラクター保管所のキャラシート URL（例: https://charasheet.vampire-blood.net/1234567）を指定してください。",
    ],
    [
      "https://yutorize.2-d.jp/ytsheet/sw2.5/",
      "ゆとシートⅡのキャラシート URL（?id=… 付き）を指定してください。",
    ],
    [
      "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=",
      "ゆとシートⅡのキャラシート URL（?id=… 付き）を指定してください。",
    ],
    [
      "https://yutorize.2-d.jp/ytsheet/?id=a.b",
      "ゆとシートⅡのキャラシート URL（?id=… 付き）を指定してください。",
    ],
    [
      "https://iachara.com/view/abc",
      "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
    ],
    [
      "https://iachara.com/view/",
      "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
    ],
    ["https://emoklore.charasheet.jp/", "エモクロアのキャラシはキャラッシュの URL を貼ってください。"],
    ["https://emoklore.charasheet.jp/ab?x=1", "エモクロアのキャラシはキャラッシュの URL を貼ってください。"],
    [
      "https://character-sheets.appspot.com/sw2/edit.html?key=ahVzfmNoYXJhY3Rlci1z",
      "キャラクターシート倉庫はダブルクロス3rd・シノビガミ・インセイン・マギカロギア・キルデスビジネス・銀剣のステラナイツ・サタスペ・フタリソウサのキャラシに対応しています。",
    ],
    [
      "https://character-sheets.appspot.com/dx3/edit.html",
      "キャラクターシート倉庫のキャラシート URL（…/edit.html?key=…）を指定してください。",
    ],
    [
      "https://lhrpg.com/lhz/pc?id=abc",
      "冒険窓口のキャラクター URL（例: https://lhrpg.com/lhz/pc?id=…）を指定してください。",
    ],
    ["https://admin.booth.pm/items/1", "BOOTH の商品 URL（items/番号）を指定してください。"],
    ["https://-x.booth.pm/items/1", "BOOTH の商品 URL（items/番号）を指定してください。"],
    ["https://booth.pm/xyz/items/1", "BOOTH の商品ページ URL（/items/番号）を指定してください。"],
    ["https://booth.pm/items/abc", "BOOTH の商品ページ URL（/items/番号）を指定してください。"],
    ["https://talto.cc/x/projects/1", "TALTO のシナリオページ URL（/projects/…）を指定してください。"],
  ])("%s を拒否する", (url, error) => {
    expect(parseExternalUrl(url)).toEqual({ ok: false, error });
  });

  it.each([
    [
      "https://charasheet.vampire-blood.net/1234567",
      {
        provider: "charasheet",
        kind: "character",
        displayUrl: "https://charasheet.vampire-blood.net/1234567",
        fetchUrls: ["https://charasheet.vampire-blood.net/1234567.js"],
      },
    ],
    [
      "https://charasheet.vampire-blood.net/123.js",
      {
        provider: "charasheet",
        kind: "character",
        displayUrl: "https://charasheet.vampire-blood.net/123",
        fetchUrls: ["https://charasheet.vampire-blood.net/123.js"],
      },
    ],
    [
      "https://charasheet.vampire-blood.net/m77/",
      {
        provider: "charasheet",
        kind: "character",
        displayUrl: "https://charasheet.vampire-blood.net/m77",
        fetchUrls: ["https://charasheet.vampire-blood.net/m77.js"],
      },
    ],
    [
      "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=%20abc%20&mode=x",
      {
        provider: "ytsheet",
        kind: "character",
        displayUrl: "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=abc",
        fetchUrls: [
          "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=abc&mode=json",
          "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=abc",
        ],
      },
    ],
    [
      " https://lhrpg.com/lhz/pc?id=51 ",
      {
        provider: "lhrpg",
        kind: "character",
        displayUrl: "https://lhrpg.com/lhz/pc?id=51",
        fetchUrls: ["https://lhrpg.com/lhz/api/51.json"],
      },
    ],
    [
      "https://circle.booth.pm/items/987",
      {
        provider: "booth",
        kind: "scenario",
        displayUrl: "https://circle.booth.pm/items/987",
        fetchUrls: ["https://circle.booth.pm/items/987.json", "https://circle.booth.pm/items/987"],
      },
    ],
    [
      "https://circle.booth.pm/en/items/987",
      {
        provider: "booth",
        kind: "scenario",
        displayUrl: "https://circle.booth.pm/en/items/987",
        fetchUrls: ["https://circle.booth.pm/en/items/987.json", "https://circle.booth.pm/en/items/987"],
      },
    ],
    [
      "https://talto.cc/projects/AbC_1-2/extra",
      {
        provider: "talto",
        kind: "scenario",
        displayUrl: "https://talto.cc/projects/AbC_1-2",
        fetchUrls: ["https://talto.cc/projects/AbC_1-2"],
      },
    ],
  ])("%s を正規化する", (url, expected) => {
    expect(parseExternalUrl(url)).toEqual({ ok: true, ...expected });
  });
});

describe("decodeHtmlEntities の境界", () => {
  it.each([
    ["&#0;", "&#0;"],
    ["&#x0;", "&#x0;"],
    ["&#1;", "\u0001"],
    ["&#x1;", "\u0001"],
    ["&#1114111;", "\u{10ffff}"],
    ["&#x10FFFF;", "\u{10ffff}"],
    ["&#1114112;", "&#1114112;"],
    ["&#x110000;", "&#x110000;"],
    ["&#X27;", "'"],
    // 二重デコードしない
    ["&amp;lt;", "&lt;"],
    ["&amp;#65;", "&#65;"],
    ["&amp;amp;", "&amp;"],
  ])("%s → %j", (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });
});

describe("parseCharasheetResponse の JSONP 判定", () => {
  const body = JSON.stringify({ pc_name: "保管所", HP: 10, pc_image: "https://cdn.example.com/p.png" });
  it.each([
    [body, true],
    [`callback(${body})`, true],
    [`cb (${body})`, true],
    [`cb(${body}) ;`, true],
    [`a.b$(${body});`, true],
    [`  cb(${body});  `, true],
    [`/**/cb(${body});`, false],
    [`cb(${body}); // trailing`, false],
    [`cb(${body});x`, false],
  ])("%s → %s", (raw, ok) => {
    const r = parseCharasheetResponse(raw);
    if (ok) {
      expect(r).toStrictEqual({
        name: "保管所",
        memo: undefined,
        systemId: undefined,
        stats: { hp: 10 },
        image: "https://cdn.example.com/p.png",
      });
    } else {
      expect(r).toBeNull();
    }
  });

  it("pc_name が無ければ画像があっても null を返す", () => {
    expect(parseCharasheetResponse(JSON.stringify({ pc_image: "https://cdn.example.com/p.png" }))).toBeNull();
  });

  it("画像は image キーからも読む", () => {
    expect(
      parseCharasheetResponse(JSON.stringify({ pc_name: "A", image: "https://cdn.example.com/i.png" }))
        ?.image,
    ).toBe("https://cdn.example.com/i.png");
  });

  it("画像は image_url キーからも読む", () => {
    expect(
      parseCharasheetResponse(JSON.stringify({ pc_name: "A", image_url: "https://cdn.example.com/u.png" }))
        ?.image,
    ).toBe("https://cdn.example.com/u.png");
  });

  it("画像がなければ image キーを持たない", () => {
    const noImg = parseCharasheetResponse(JSON.stringify({ pc_name: "A" }));
    expect(noImg && Object.hasOwn(noImg, "image")).toBe(false);
  });
});

describe("parseYtsheetResponse の HTML フォールバック", () => {
  it("og タグから名前・説明・画像・システム推定を拾う", () => {
    expect(
      parseYtsheetResponse(
        html(
          og("og:title", "CoC7探索者 - ゆとシートⅡ") +
            og("og:description", "説明文") +
            og("og:image", "https://cdn.example.com/y.png"),
        ),
      ),
    ).toStrictEqual({
      name: "CoC7探索者",
      memo: "説明文",
      systemId: "coc7",
      stats: {},
      image: "https://cdn.example.com/y.png",
    });
  });

  it("og タグがなければ meta description と title を使い、先頭の空白を許す", () => {
    expect(
      parseYtsheetResponse(
        ` ${html(`<meta name="description" content="記述" /><title>名 | ゆとシート</title>`)}`,
      ),
    ).toStrictEqual({ name: "名", memo: "記述", systemId: "sw25", stats: {} });
  });

  it("説明がなければ memo を空にする", () => {
    expect(parseYtsheetResponse(html(og("og:title", "説明無し")))).toStrictEqual({
      name: "説明無し",
      memo: undefined,
      systemId: "sw25",
      stats: {},
    });
  });

  it.each([
    ["名-ゆとシートⅡ", "名"],
    ["名&nbsp;", "名"],
    ["名 ｜ ゆとシート", "名"],
  ])("og:title %j → %s", (title, expected) => {
    expect(parseYtsheetResponse(html(og("og:title", title)))?.name).toBe(expected);
  });

  it("改行を含むサフィックスは除去しない", () => {
    expect(parseYtsheetResponse(`<html><title>名 - ゆとシート\nX</title></html>`)?.name).toBe(
      "名 - ゆとシート\nX",
    );
  });

  it("タイトルが無い・HTML でないなら null", () => {
    expect(parseYtsheetResponse(html(og("og:description", "説明のみ")))).toBeNull();
    expect(parseYtsheetResponse("<html></html>")).toBeNull();
    expect(parseYtsheetResponse("x <title>A</title>")).toBeNull();
  });
});

describe("parseBoothResponse", () => {
  it("JSON: 全項目を読み、タグの正規化とシステム推定をする", () => {
    expect(
      parseBoothResponse(
        ` ${JSON.stringify({
          name: "  境界  ",
          shop: { name: "   " },
          tags: [" CoC ", 5, { name: "x" }, null, "x"],
          description: "a\r\nb",
        })}`,
        BOOTH,
      ),
    ).toStrictEqual({
      title: "境界",
      author: undefined,
      systemId: "coc7",
      source: "booth",
      sourceUrl: BOOTH,
      tags: ["CoC", "x"],
      description: "a\nb",
    });
  });

  it.each([
    [{ name: "T", tags: ["CoC", "x"] }, "coc7"],
    [{ name: "T", description: "エモクロア" }, "emoklore"],
    [{ name: "T" }, "general"],
  ])("JSON のシステム推定 %j → %s", (obj, expected) => {
    expect(parseBoothResponse(JSON.stringify(obj), BOOTH)?.systemId).toBe(expected);
  });

  it("JSON: 名前無しは null を返す", () => {
    expect(parseBoothResponse("{}", BOOTH)).toBeNull();
  });

  it("JSON: HTML 文字列を含む JSON も HTML として扱わない", () => {
    expect(parseBoothResponse(JSON.stringify({ description: "<title>X</title>" }), BOOTH)).toBeNull();
  });

  it("HTML: 作者を分割し、連続した区切りと空の説明を正規化する", () => {
    expect(
      parseBoothResponse(
        html(og("og:title", "上巻  -  下巻  -  作者 - BOOTH") + og("og:description", "&nbsp;")),
        BOOTH,
      ),
    ).toStrictEqual({
      title: "上巻 - 下巻",
      author: "作者",
      systemId: "general",
      source: "booth",
      sourceUrl: BOOTH,
      tags: [],
      description: undefined,
    });
  });

  it("HTML: タイトル末尾の &nbsp; を除く", () => {
    expect(parseBoothResponse(html(og("og:title", "題&nbsp;")), BOOTH)?.title).toBe("題");
  });

  it("HTML: 改行を含むサフィックスは BOOTH 接尾辞として扱わず作者にする", () => {
    expect(parseBoothResponse(html(og("og:title", "題 - 作 - BOOTH\nX")), BOOTH)).toMatchObject({
      title: "題 - 作",
      author: "BOOTH\nX",
    });
  });

  it.each([
    ["タイトルがなく説明だけ", html(og("og:description", "説明のみ"))],
    ["空の HTML", "<html></html>"],
  ])("HTML: %s なら null を返す", (_label, text) => {
    expect(parseBoothResponse(text, BOOTH)).toBeNull();
  });

  it.each([
    ["a".repeat(420), "a".repeat(420)],
    ["a".repeat(421), `${"a".repeat(420)}…`],
    [`${"a".repeat(419)} b`, `${"a".repeat(419)}…`],
    ["a\nb", "a\nb"],
    ["a\n\nb", "a\n\nb"],
    ["a\n\n\n\nb", "a\n\nb"],
    ["a\r\n\r\n\r\nb", "a\n\nb"],
  ])("説明 %# の整形", (desc, expected) => {
    expect(parseBoothResponse(JSON.stringify({ name: "T", description: desc }), BOOTH)?.description).toBe(
      expected,
    );
  });
});

describe("parseTaltoResponse", () => {
  it("JSON: 必須はタイトルのみで、他は既定値にする", () => {
    expect(parseTaltoResponse(` ${JSON.stringify({ name: "名のみ" })}`, TALTO)).toStrictEqual({
      title: "名のみ",
      author: undefined,
      systemId: "general",
      source: "talto",
      sourceUrl: TALTO,
      tags: [],
      description: undefined,
    });
  });

  it("JSON: タグは 8 件までにする", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `t${i}`);

    expect(parseTaltoResponse(JSON.stringify({ title: "T", tags }), TALTO)?.tags).toEqual(tags.slice(0, 8));
  });

  it("JSON: 説明文からシステムを推定する", () => {
    expect(parseTaltoResponse(JSON.stringify({ title: "T", description: "マダミス" }), TALTO)?.systemId).toBe(
      "madamis",
    );
  });

  it("HTML: meta の作者・説明を JSON-LD より優先し、og:title を JSON-LD の name より優先する", () => {
    expect(
      parseTaltoResponse(
        html(
          og("og:title", "題 | TALTO") +
            `<meta name="author" content="M" />` +
            og("og:description", "D") +
            `<script type="application/ld+json">{"name":"LD","author":"L","description":"LDD"}</script>`,
        ),
        TALTO,
      ),
    ).toStrictEqual({
      title: "題",
      author: "M",
      systemId: "general",
      source: "talto",
      sourceUrl: TALTO,
      tags: [],
      description: "D",
    });
  });

  it.each([
    `<script type="application/ld+json" data-x="1">{"author": "L"}</script>`,
    `<script id="ld" type="application/ld+json">{"author": "L"}</script>`,
    `<script type = "application/ld+json">{"author": "L"}</script>`,
    `<script type='application/ld+json'>\n{"author":\n"L"}\n</script>`,
  ])("JSON-LD タグ %s を読む", (ld) => {
    expect(parseTaltoResponse(html(og("og:title", "題") + ld), TALTO)?.author).toBe("L");
  });

  it.each([
    ["題-TALTO", "題"],
    ["題&nbsp;", "題"],
    ["題 - TALTO\nX", "題 - TALTO\nX"],
  ])("og:title %j → %s", (title, expected) => {
    expect(parseTaltoResponse(html(og("og:title", title)), TALTO)?.title).toBe(expected);
  });

  it("og:description を説明にする", () => {
    expect(
      parseTaltoResponse(html(og("og:title", "題") + og("og:description", "OGD")), TALTO)?.description,
    ).toBe("OGD");
  });

  it("説明が欠けていれば description を空にする", () => {
    expect(parseTaltoResponse(html(og("og:title", "題")), TALTO)?.description).toBeUndefined();
  });

  it("題名の手がかりが何もなければ null を返す", () => {
    expect(parseTaltoResponse(html(""), TALTO)).toBeNull();
    expect(
      parseTaltoResponse(html(`<script type="application/ld+json">{"author":"L"}</script>`), TALTO),
    ).toBeNull();
  });

  it("og:title / <title> が無くても JSON-LD の name を題名にし、サイト名の接尾辞は落とす", () => {
    expect(
      parseTaltoResponse(html(`<script type="application/ld+json">{"name":"LD | TALTO"}</script>`), TALTO)
        ?.title,
    ).toBe("LD");
  });
});

describe("シナリオのシステム推定 (BOOTH JSON 経由)", () => {
  it.each([
    ["CoC7", "coc7"],
    ["7版", "coc7"],
    ["クトゥルフ神話 第7話 6人", "coc7"],
    ["CoC 7 (6版対応)", "coc7"],
    ["クトゥルフ神話6", "coc6"],
    ["CoC 6", "coc6"],
    ["CoC", "coc7"],
    ["Call of Cthulhu", "coc7"],
    ["ソードワールド", "sw25"],
    ["SW2.5", "sw25"],
    ["マダミス", "madamis"],
    ["汎用", "general"],
  ])("%s → %s", (title, expected) => {
    expect(parseBoothResponse(JSON.stringify({ name: title }), BOOTH)?.systemId).toBe(expected);
  });
});

describe("computeExternalContentHash の安定性", () => {
  it.each([
    ["入れ子の値", { name: "A", stats: { san: 50, hp: 10 }, tags: ["x", null] }, "f99e7fa0acf434eb"],
    ["数値", { n: 140 }, "093a0b140f09aeed"],
  ])("%s に対して固定のハッシュを返す（保存済みハッシュとの互換）", (_label, value, hash) => {
    expect(computeExternalContentHash(value)).toBe(hash);
  });

  const h = computeExternalContentHash;

  it("null と undefined は同じハッシュに正規化する", () => {
    expect(h(null)).toBe(h(undefined));
    expect(h([undefined])).toBe(h([null]));
  });

  it.each([
    ["null を含む配列と空配列", [null], []],
    ["配列とオブジェクト", [1], { 0: 1 }],
    ["配列の値違い", [1], [2]],
    ["オブジェクトの値違い", { a: 1 }, { a: 2 }],
    ["オブジェクトのキー違い", { a: 1 }, { b: 1 }],
  ])("%s は別のハッシュになる", (_label, a, b) => {
    expect(h(a)).not.toBe(h(b));
  });
});

describe("parseExternalResponse のプロバイダ振り分け", () => {
  it("TALTO は TALTO パーサーで解析する", () => {
    const talto = parseExternalResponse("talto", JSON.stringify({ title: "T" }), "application/json", TALTO);
    expect(talto).toMatchObject({ kind: "scenario", provider: "talto", providerLabel: "TALTO", url: TALTO });
    expect(talto?.kind === "scenario" && talto.scenario.title).toBe("T");
  });

  it("BOOTH は BOOTH パーサーで解析し、title だけの JSON や空文字は null を返す", () => {
    expect(
      parseExternalResponse("booth", JSON.stringify({ title: "T" }), "application/json", BOOTH),
    ).toBeNull();
    expect(parseExternalResponse("booth", "", "text/html", BOOTH)).toBeNull();
  });

  it("未知のプロバイダは null", () => {
    expect(
      parseExternalResponse(
        "unknown" as ExternalSyncProvider,
        JSON.stringify({ system: "emoklore", name: "E", von: 1 }),
        "application/json",
        EMO,
      ),
    ).toBeNull();
  });

  it("キャラクターのペイロードは解析結果とそのハッシュを持つ", () => {
    const LH = "https://lhrpg.com/lhz/pc?id=51";
    const p = parseExternalResponse(
      "lhrpg",
      JSON.stringify({ name: "ベアもん", main_job: "施療神官", level: "90", max_hitpoint: 56 }),
      "application/json",
      LH,
    );
    expect(p?.kind).toBe("character");
    if (p?.kind !== "character") return;
    expect(p.providerLabel).toBe("冒険窓口");
    expect(p.character).toMatchObject({
      name: "ベアもん",
      memo: "職業: 施療神官",
      systemId: "LogHorizon",
      stats: { hp: 56, lv: 90 },
    });
    expect(p.contentHash).toBe(computeExternalContentHash(p.character));
  });

  it("iachara の JSON 応答は null を返す", () => {
    expect(
      parseExternalResponse("iachara", JSON.stringify({ name: "I", san: 1 }), "application/json", IA),
    ).toBeNull();
  });
});

describe("extractArchetypeFromMemo の境界", () => {
  it.each([
    ["職業 : 探偵", "探偵"],
    ["職業:  探偵  ", "探偵"],
    ["旧職業: 探偵", ""],
    ["メモ\nルーツ：学者\n続き", "学者"],
  ])("%j → %j", (memo, expected) => {
    expect(extractArchetypeFromMemo(memo)).toBe(expected);
  });
});

describe("mergeExternalCharacterUpdate の境界", () => {
  it("システム定義のラベルを使い、未知システムでも落ちない", () => {
    const emo = mergeExternalCharacterUpdate(
      character({ systemId: "emoklore", stats: { von: 1 } }),
      { name: "遠沢", systemId: "emoklore", stats: { von: 2 } },
      mergeOpts,
    );
    expect(emo.statChanges).toEqual([{ key: "von", label: "共鳴", from: 1, to: 2 }]);
    const unknown = mergeExternalCharacterUpdate(
      character({ systemId: "unknown", stats: { 目星x: 1, x目星: 1, abc_1: 1 } }),
      { name: "遠沢", stats: { 目星x: 2, x目星: 2, abc_1: 2 } },
      mergeOpts,
    );
    expect(unknown.statChanges.map((d) => d.label)).toEqual(["目星x", "x目星", "ABC_1"]);
  });

  it("数値でない能力値は差分に含めない", () => {
    const res = mergeExternalCharacterUpdate(
      character({ stats: { san: 60 } }),
      { name: "遠沢", stats: { san: "60" as unknown as number } },
      mergeOpts,
    );
    expect(res.statChanges).toEqual([]);
  });

  it("新規の能力値は差分に含めず、値はマージする", () => {
    const res = mergeExternalCharacterUpdate(
      character({ stats: { san: 60 } }),
      { name: "遠沢", stats: { san: 60, hp: 12 } },
      { ...mergeOpts, contentHash: "h_new" },
    );
    expect(res.statChanges).toEqual([]);
    expect(res.next.stats).toEqual({ san: 60, hp: 12 });
  });

  it("contentHash 指定時はそれを保存し、未指定なら incoming のハッシュを保存する", () => {
    const incoming = { name: "遠沢", stats: { san: 60, mp: 10 } };
    expect(
      mergeExternalCharacterUpdate(character(), incoming, { ...mergeOpts, contentHash: "given" }).next
        .externalSync?.contentHash,
    ).toBe("given");
    expect(
      mergeExternalCharacterUpdate(character(), incoming, mergeOpts).next.externalSync?.contentHash,
    ).toBe(computeExternalContentHash(incoming));
  });

  it("同一ハッシュでも、既存ハッシュが空なら差分を変更として扱う", () => {
    const existing = character({
      externalSync: { provider: "iachara", url: IA, contentHash: "", autoSync: false },
    });
    const res = mergeExternalCharacterUpdate(
      existing,
      { name: "遠沢", stats: { san: 1 } },
      {
        ...mergeOpts,
        contentHash: "",
      },
    );
    expect(res.changed).toBe(true);
    /* SAN の増減は成長ではない（続く値として残る） */
    expect(res.next.growth).toHaveLength(0);
    // 既存の autoSync=false は opts 未指定なら維持する
    expect(res.next.externalSync?.autoSync).toBe(false);
  });

  it("変更なしなら成長履歴の配列をそのまま再利用する", () => {
    const existing = character();
    const res = mergeExternalCharacterUpdate(
      existing,
      { name: "遠沢", memo: "紹介", systemId: "coc7", stats: { san: 60, mp: 10 } },
      mergeOpts,
    );
    expect(res.changed).toBe(false);
    expect(res.profileChanges).toEqual([]);
    expect(res.next.growth).toBe(existing.growth);
  });

  it("ハッシュ一致でも差分があれば statChanges は返すが成長履歴は追記しない", () => {
    const existing = character({
      externalSync: { provider: "iachara", url: IA, contentHash: "same", autoSync: true },
    });
    const res = mergeExternalCharacterUpdate(
      existing,
      { name: "遠沢", stats: { san: 1 } },
      {
        ...mergeOpts,
        contentHash: "same",
      },
    );
    expect(res.changed).toBe(false);
    expect(res.statChanges).toHaveLength(1);
    expect(res.next.growth).toBe(existing.growth);
  });
});

describe("shouldAutoSync の境界", () => {
  const now = Date.parse("2026-11-20T12:00:00.000Z");
  it("lastSyncedAt が空文字なら同期する", () => {
    expect(shouldAutoSync({ provider: "iachara", url: IA, autoSync: true, lastSyncedAt: "" }, now)).toBe(
      true,
    );
  });

  it("間隔を指定でき、ちょうどなら同期し 1ms 足りなければ同期しない", () => {
    const sync = {
      provider: "iachara" as const,
      url: IA,
      autoSync: true,
      lastSyncedAt: new Date(now - 1000).toISOString(),
    };
    expect(shouldAutoSync(sync, now, 1000)).toBe(true);
    expect(shouldAutoSync(sync, now, 1001)).toBe(false);
  });
});
