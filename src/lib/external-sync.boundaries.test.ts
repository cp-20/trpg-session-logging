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
  parseEmokloreResponse,
  parseExternalResponse,
  parseExternalUrl,
  parseIacharaResponse,
  parseTaltoResponse,
  parseYtsheetResponse,
  shouldAutoSync,
} from "./external-sync";

const IA = "https://iachara.com/view/1";
const BOOTH = "https://booth.pm/ja/items/1";
const TALTO = "https://talto.cc/projects/1";
const EMO = "https://emoklore.charasheet.jp/chars/1";

const ia = (obj: unknown) => parseIacharaResponse(JSON.stringify(obj), IA);
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
  today: "2026-11-20",
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
    "未対応の URL です。キャラエノ・キャラッシュ・キャラクター保管所・ゆとシートⅡ・いあきゃら・BOOTH・TALTO に対応しています。";
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
      "いあきゃらのキャラクター共有 URL（例: https://iachara.com/view/123456）を指定してください。",
    ],
    [
      "https://iachara.com/x/sns/1/view",
      "いあきゃらのキャラクター共有 URL（例: https://iachara.com/view/123456）を指定してください。",
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
    ["https://emoklore.charasheet.jp/", "エモクロアキャラクターシートの個別 URL を指定してください。"],
    ["https://emoklore.charasheet.jp/a", "エモクロアキャラクターシートの個別 URL を指定してください。"],
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
      " https://iachara.com/view/42 ",
      {
        provider: "iachara",
        kind: "character",
        displayUrl: "https://iachara.com/view/42",
        fetchUrls: ["https://iachara.com/view/42"],
      },
    ],
    [
      "https://iachara.com/view/42",
      {
        provider: "iachara",
        kind: "character",
        displayUrl: "https://iachara.com/view/42",
        fetchUrls: ["https://iachara.com/view/42"],
      },
    ],
    [
      "https://iachara.com:443/view/42",
      {
        provider: "iachara",
        kind: "character",
        displayUrl: "https://iachara.com/view/42",
        fetchUrls: ["https://iachara.com/view/42"],
      },
    ],
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
      "https://emoklore.charasheet.jp/ab?x=1",
      {
        provider: "emoklore",
        kind: "character",
        displayUrl: "https://emoklore.charasheet.jp/ab",
        fetchUrls: ["https://emoklore.charasheet.jp/ab"],
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

describe("parseIacharaResponse: JSON 経路", () => {
  it("12 の直接キー（小文字・大文字）を全て拾い、非数値は捨てる", () => {
    const r = ia({
      name: "全能力",
      str: 1,
      CON: 2,
      pow: 3,
      DEX: 4,
      app: 5,
      SIZ: 6,
      int: 7,
      EDU: 8,
      hp: 9,
      MP: 10,
      san: 11,
      LUCK: 12,
    });
    expect(r?.stats).toStrictEqual({
      str: 1,
      con: 2,
      pow: 3,
      dex: 4,
      app: 5,
      siz: 6,
      int: 7,
      edu: 8,
      hp: 9,
      mp: 10,
      san: 11,
      luck: 12,
    });
  });

  it.each([
    [" 5 ", 5],
    ["-3", -3],
    ["1.25", 1.25],
    ["1e2", undefined],
    ["+5", undefined],
    ["0x10", undefined],
    ["5a", undefined],
    ["", undefined],
    ["9".repeat(400), undefined],
  ])("文字列の数値 %j → %s", (raw, expected) => {
    const r = ia({ name: "数値", str: raw });
    expect(r?.stats.str).toBe(expected);
    expect(Object.hasOwn(r!.stats, "str")).toBe(expected !== undefined);
  });

  it("非有限の数値 (1e999) は捨てる", () => {
    const r = parseIacharaResponse('{"name":"巨大","str":1e999,"san":5}', IA);
    expect(r?.stats).toStrictEqual({ san: 5 });
  });

  it("配列フィールド: ラベル候補・値候補・大文字略称の正規化・欠損項目を扱う", () => {
    const r = ia({
      name: "配列",
      abilities: [
        null,
        3,
        "str",
        ["x"],
        { label: "STR", total: 50 },
        { name: "目星", value: 60 },
        { key: "聞き耳", current: 70 },
        { label: "回避", now: 30 },
        { label: "幸運", score: 45 },
        { label: "考古STR", value: 1 },
        { label: "STR値", value: 2 },
        { label: "値なし" },
        { value: 99 },
        { label: "   ", name: "代替名", value: 5 },
      ],
      status: [{ label: "HP", total: 12 }],
      params: [{ label: "MP", total: 13 }],
    });
    expect(r?.stats).toStrictEqual({
      str: 50,
      目星: 60,
      聞き耳: 70,
      回避: 30,
      幸運: 45,
      考古STR: 1,
      STR値: 2,
      代替名: 5,
      hp: 12,
      mp: 13,
    });
  });

  it("レコード型フィールド: 数値のみ取り込み、略称キーのみ小文字化する", () => {
    const r = ia({
      name: "レコード",
      attributes: { STR: 10, 考古STR: 1, STR値: 2, メモ: "文字", 空: null },
      params: "12",
      status: 7,
    });
    expect(r?.stats).toStrictEqual({ str: 10, 考古STR: 1, STR値: 2 });
  });

  it.each([
    ["abilities", { abilities: [] }],
    ["status", { status: {} }],
    ["params", { params: {} }],
    ["skills", { skills: [] }],
    ["occupation", { occupation: "探偵" }],
    ["str", { str: 10 }],
    ["san", { san: 10 }],
  ])("キャラ判定キー %s 単独でもキャラとみなす", (_k, extra) => {
    const r = ia({ wrapper: { name: "外側" }, data: { name: "本体", ...extra } });
    expect(r?.name).toBe("本体");
  });

  it("キャラ判定: 名前のみ・名前なし・空白名・非文字列名はスキップして子を探す", () => {
    expect(ia({ name: "メタ", child: { name: "子", san: 1 } })?.name).toBe("子");
    expect(ia({ str: 1, data: { name: "子2", str: 3 } })?.name).toBe("子2");
    expect(ia({ name: "  ", str: 1, child: { name: "子3", str: 2 } })?.name).toBe("子3");
    expect(ia({ name: 5, str: 1, child: { name: "子4", str: 2 } })?.name).toBe("子4");
    expect(ia({ a: {}, b: [], c: { name: "子5", san: 1 } })?.name).toBe("子5");
    expect(ia([{ name: "配列", san: 1 }])).toBeNull();
  });

  it("探索は深さ 8 まで", () => {
    const nest = (depth: number) => {
      let node: unknown = { name: "深層", san: 40 };
      for (let i = 0; i < depth; i++) node = { a: node };
      return node;
    };
    expect(ia(nest(8))?.name).toBe("深層");
    expect(ia(nest(9))).toBeNull();
    const arrNest = (depth: number) => {
      let node: unknown = { name: "配列深層", san: 40 };
      for (let i = 0; i < depth; i++) node = [node];
      return { root: node };
    };
    expect(ia(arrNest(7))?.name).toBe("配列深層");
    expect(ia(arrNest(8))).toBeNull();
  });

  it("メモ・職業の組み立て", () => {
    expect(ia({ name: "A", job: "刑事", str: 1 })?.memo).toBe("職業: 刑事");
    expect(ia({ name: "A", profile: "経歴", str: 1 })?.memo).toBe("経歴");
    expect(ia({ name: "A", str: 1 })?.memo).toBeUndefined();
  });

  it.each([
    // [説明, 入力, 期待 systemId]
    ["system から推定 (CoC7)", { system: "CoC7", san: 50, str: 10, edu: 10 }, "coc7"],
    ["system から推定 (CoC6) は STR 推定より優先", { system: "CoC6", san: 50, str: 50 }, "coc6"],
    ["職業から推定", { occupation: "6版探偵", san: 50, str: 50 }, "coc6"],
    ["memo から推定", { memo: "CoC6 用", san: 50, str: 50 }, "coc6"],
    ["game に 6", { game: "6", san: 50, str: 50 }, "coc6"],
    ["game に 7", { game: "7", san: 50, str: 10, edu: 10 }, "coc6"],
    ["game 7 + STR 大", { game: "7", san: 50, str: 50 }, "coc7"],
    ["version に 6", { version: "6th", str: 50 }, "coc6"],
    ["STR のみは推定しない", { str: 10 }, undefined],
    ["SAN のみ", { san: 50 }, "coc7"],
    ["HP のみ + STR 小", { hp: 10, str: 10 }, "coc6"],
    ["STR 0", { san: 1, str: 0, edu: 10 }, "coc7"],
    ["STR 21", { san: 1, str: 21, edu: 10 }, "coc6"],
    ["STR 22", { san: 1, str: 22, edu: 10 }, "coc7"],
    ["EDU 21", { san: 1, str: 10, edu: 21 }, "coc6"],
    ["EDU 22", { san: 1, str: 10, edu: 22 }, "coc7"],
    ["EDU 30", { san: 1, str: 10, edu: 30 }, "coc7"],
    ["STR 50 EDU 10", { san: 1, str: 50, edu: 10 }, "coc7"],
    ["EDU 無し", { san: 1, str: 10 }, "coc6"],
  ])("%s", (_d, extra, expected) => {
    expect(ia({ name: "推定", ...extra })?.systemId).toBe(expected);
  });

  it.each([
    [" https://cdn.example.com/a.png ", "https://cdn.example.com/a.png"],
    ["HTTPS://cdn.example.com/a.png", undefined],
    ["https://", undefined],
    ["http://cdn.example.com/a.png", undefined],
    [5, undefined],
  ])("画像 URL %j → %s", (image, expected) => {
    const r = ia({ name: "画像", str: 1, image });
    expect(r?.image).toBe(expected);
    expect(Object.hasOwn(r!, "image")).toBe(expected !== undefined);
  });

  it("前後空白付き JSON も直接 JSON として読む", () => {
    expect(parseIacharaResponse(`  ${JSON.stringify({ name: "空白", san: 1 })}`, IA)?.name).toBe("空白");
  });
});

describe("parseIacharaResponse: HTML / テキスト経路", () => {
  it("__NEXT_DATA__ の属性順・空白に依存しない", () => {
    const data = JSON.stringify({ props: { pageProps: { name: "次", san: 33 } } });
    const r = parseIacharaResponse(
      `<html><head><script type="application/json" id = "__NEXT_DATA__">${data}</script></head></html>`,
      IA,
    );
    expect(r).toStrictEqual({ name: "次", memo: undefined, systemId: "coc7", stats: { san: 33 } });
  });

  it("__NEXT_DATA__ にキャラが無ければ meta 経路へ進む", () => {
    const r = parseIacharaResponse(
      `<html><head><script id="__NEXT_DATA__">{"props":{}}</script>${og("og:title", "メタ名")}${og("og:description", "説明")}</head></html>`,
      IA,
    );
    expect(r).toStrictEqual({ name: "メタ名", memo: "説明", systemId: "coc6", stats: {} });
  });

  it("タイトルを名前として補い、本文の能力・技能を解析する", () => {
    const r = parseIacharaResponse(
      html(og("og:title", "朝霧 - いあきゃら"), "SAN: 50<br>【技能】<br>図書館 70"),
      IA,
    );
    expect(r?.name).toBe("朝霧");
    expect(r?.stats).toStrictEqual({ san: 50, 図書館: 70 });
  });

  it.each([
    ["名前: 本文名", "本文名"],
    ["名前 : 本文名", "本文名"],
    ["旧名前: 別", "タイトル名"],
  ])("本文の名前行 %j がある時の名前 → %s", (line, expected) => {
    const r = parseIacharaResponse(
      html(og("og:title", "タイトル名"), `${line}<br>SAN: 50<br>【技能】<br>図書館 70`),
      IA,
    );
    expect(r?.name).toBe(expected);
    expect(r?.stats.図書館).toBe(70);
  });

  it.each([
    ["朝霧-いあきゃら", "朝霧"],
    ["朝霧 ｜ いあきゃら", "朝霧"],
    ["朝霧いあきゃら", "朝霧いあきゃら"],
    ["いあきゃら 朝霧", "朝霧"],
    ["【いあきゃら 朝霧", "朝霧"],
    ["【いあきゃら】朝霧", "朝霧"],
    ["朝霧&nbsp;", "朝霧"],
    ["  【いあきゃら】朝霧  ", "朝霧"],
  ])("og:title %j → %s", (title, expected) => {
    const r = parseIacharaResponse(html(og("og:title", title), "STR: 10"), IA);
    expect(r?.name).toBe(expected);
  });

  it("<title> の改行を含むサフィックスは除去しない（行末までの一致のみ）", () => {
    const r = parseIacharaResponse(
      `<html><head><title>朝霧 - いあきゃら\nサブ</title></head><body>STR: 10</body></html>`,
      IA,
    );
    expect(r?.name).toBe("朝霧 - いあきゃら\nサブ");
  });

  it("<title> の前後空白を除いてから接頭辞を外す", () => {
    expect(
      parseIacharaResponse(
        `<html><head><title>  【いあきゃら】朝霧  </title></head><body>STR: 10</body></html>`,
        IA,
      )?.name,
    ).toBe("朝霧");
  });

  it("<title> 属性付き・og:title 優先", () => {
    expect(
      parseIacharaResponse(
        `<html><head><title lang="ja">属性付き</title></head><body>STR: 10</body></html>`,
        IA,
      )?.name,
    ).toBe("属性付き");
    expect(
      parseIacharaResponse(
        `<html><head><title>T</title>${og("og:title", "OG")}</head><body>STR: 10</body></html>`,
        IA,
      )?.name,
    ).toBe("OG");
  });

  it("数値フォールバック: 能力値の書式とシステム推定、説明の有無", () => {
    const r = parseIacharaResponse(html(og("og:title", "数値"), "STR :60 DEX:70"), IA);
    expect(r).toStrictEqual({ name: "数値", memo: undefined, systemId: "coc7", stats: { str: 60, dex: 70 } });
    expect(parseIacharaResponse(html(og("og:title", "境界"), "STR: 25"), IA)?.systemId).toBe("coc7");
    expect(parseIacharaResponse(html(og("og:title", "境界"), "STR: 24"), IA)?.systemId).toBe("coc6");
    expect(
      parseIacharaResponse(html(og("og:title", "推定") + og("og:description", "エモクロア"), "STR: 5"), IA)
        ?.systemId,
    ).toBe("emoklore");
    // タイトルのみ（能力値も説明も無い）なら null
    expect(parseIacharaResponse(html(og("og:title", "空")), IA)).toBeNull();
    // タイトル無しなら能力値があっても null
    expect(parseIacharaResponse(html("", "STR: 5"), IA)).toBeNull();
    expect(parseIacharaResponse(html("", "SAN: 50"), IA)).toBeNull();
    // 説明のみ
    const d = parseIacharaResponse(
      html(og("og:title", "説明") + `<meta name="description" content="記述" />`),
      IA,
    );
    expect(d).toStrictEqual({ name: "説明", memo: "記述", systemId: "coc6", stats: {} });
  });

  it("og:image は https のみ採用し、テキスト経路にも付与する", () => {
    const withImg = parseIacharaResponse(
      html(
        og("og:title", "画像") + og("og:image", "https://cdn.example.com/i.png"),
        "SAN: 50<br>【技能】<br>図書館 70",
      ),
      IA,
    );
    expect(withImg?.image).toBe("https://cdn.example.com/i.png");
    const noImg = parseIacharaResponse(html(og("og:title", "画像"), "SAN: 50<br>【技能】<br>図書館 70"), IA);
    expect(noImg && Object.hasOwn(noImg, "image")).toBe(false);
  });

  it("本文 HTML: script/style 除去・ブロック要素の改行化・インライン要素の空白化", () => {
    const r = parseIacharaResponse(
      `<html><body>名前: 神崎<span>律</span><script type="x">var a = "SAN: 99";</script>
職業: 探偵<style>.a { color: red }</style>
SAN: 50 <br>【技能】</h2>図書館 70</p></p></p>目星 60</body></html>`,
      IA,
    );
    expect(r?.name).toBe("神崎 律");
    expect(r?.memo).toBe("職業: 探偵");
    expect(r?.stats).toStrictEqual({ san: 50, 図書館: 70, 目星: 60 });
  });

  it("script / style を空文字でなく改行に置き換える", () => {
    const r = parseIacharaResponse(
      `<html><body>名前: A<script>x</script>職業: B<style>y</style>SAN: 5</body></html>`,
      IA,
    );
    expect(r?.name).toBe("A");
    expect(r?.memo).toBe("職業: B");
  });

  it("メモ欄: 行末の連続空白を落とし、単独の改行はそのまま残す", () => {
    const r = parseIacharaResponse(
      `<html><body>名前: A<br>SAN: 5<br>【メモ】<br>行1  <br>行2</body></html>`,
      IA,
    );
    expect(r?.memo).toBe("行1\n行2");
  });

  it("連続改行を圧縮し、行末空白を落とす", () => {
    const r = parseIacharaResponse(`<html><body>名前: A</p></p></p></p>SAN: 5 <br>職業: B</body></html>`, IA);
    expect(r?.name).toBe("A");
    expect(r?.memo).toBe("職業: B");
    expect(r?.stats).toStrictEqual({ san: 5 });
  });

  it("プレーンテキストはエンティティをデコードしない・配列 JSON は扱わない", () => {
    expect(parseIacharaResponse("名前: A&amp;B\nSAN: 5", IA)?.name).toBe("A&amp;B");
    expect(parseIacharaResponse(JSON.stringify([{ name: "X", san: 5 }]), IA)).toBeNull();
  });

  it("meta 属性: 空白付き = / 単引用符 / キー・値の前後空白 / content 無し meta", () => {
    const r = parseIacharaResponse(
      `<html><head><meta charset="utf-8"><meta name="robots"><meta property = " og:title " content = "  空白付き  " /><meta name ='og:description' content = '  説明  ' /></head></html>`,
      IA,
    );
    expect(r).toStrictEqual({ name: "空白付き", memo: "説明", systemId: "coc6", stats: {} });
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

  it("pc_name が無ければ画像があっても null、画像キーの候補順", () => {
    expect(parseCharasheetResponse(JSON.stringify({ pc_image: "https://cdn.example.com/p.png" }))).toBeNull();
    expect(
      parseCharasheetResponse(JSON.stringify({ pc_name: "A", image: "https://cdn.example.com/i.png" }))
        ?.image,
    ).toBe("https://cdn.example.com/i.png");
    expect(
      parseCharasheetResponse(JSON.stringify({ pc_name: "A", image_url: "https://cdn.example.com/u.png" }))
        ?.image,
    ).toBe("https://cdn.example.com/u.png");
    const noImg = parseCharasheetResponse(JSON.stringify({ pc_name: "A" }));
    expect(noImg && Object.hasOwn(noImg, "image")).toBe(false);
  });
});

describe("parseYtsheetResponse の HTML フォールバック", () => {
  it("説明・画像・システム推定を拾う", () => {
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
    expect(
      parseYtsheetResponse(
        ` ${html(`<meta name="description" content="記述" /><title>名 | ゆとシート</title>`)}`,
      ),
    ).toStrictEqual({ name: "名", memo: "記述", systemId: "sw25", stats: {} });
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

describe("parseEmokloreResponse の HTML フォールバック", () => {
  it("本文の共鳴者名を優先し、無ければタイトルを補う", () => {
    const body = "<p>共鳴者名: 本文名</p><p>共鳴: 3</p>";
    expect(parseEmokloreResponse(html(og("og:title", "題名 - エモクロア"), body), EMO)).toStrictEqual({
      name: "本文名",
      memo: undefined,
      systemId: "emoklore",
      stats: { von: 3 },
    });
    expect(
      parseEmokloreResponse(html(og("og:title", "題名"), "<p>共鳴者名 : 本文名</p><p>共鳴: 3</p>"), EMO)
        ?.name,
    ).toBe("本文名");
    expect(
      parseEmokloreResponse(html(og("og:title", "題名"), "<p>旧共鳴者名: 別</p><p>共鳴: 3</p>"), EMO),
    ).toStrictEqual({ name: "題名", memo: undefined, systemId: "emoklore", stats: { von: 3 } });
  });

  it.each([
    ["題名-EMOKLORE", "題名"],
    ["題名 ｜ エモクロアTRPG", "題名"],
    ["題名&nbsp;", "題名"],
  ])("og:title %j → %s", (title, expected) => {
    expect(parseEmokloreResponse(html(og("og:title", title), "<p>共鳴: 2</p>"), EMO)?.name).toBe(expected);
  });

  it("改行を含むサフィックスは除去しない（名前は 1 行目）", () => {
    expect(
      parseEmokloreResponse(`<html><title>題名 - エモクロア\nX</title><body>共鳴: 2</body></html>`, EMO)
        ?.name,
    ).toBe("題名 - エモクロア");
  });

  it("前後空白付き HTML・タイトル末尾の空白も扱う", () => {
    expect(
      parseEmokloreResponse(`  ${html(og("og:title", "題名&nbsp;"), "<p>名前: 他</p>")}`, EMO),
    ).toStrictEqual({ name: "題名", memo: undefined, systemId: "emoklore", stats: {} });
  });

  it("本文が非エモクロアならタイトルと説明だけで作る", () => {
    expect(
      parseEmokloreResponse(
        html(og("og:title", "題名") + og("og:description", "説明"), "<p>名前: 他</p>"),
        EMO,
      ),
    ).toStrictEqual({ name: "題名", memo: "説明", systemId: "emoklore", stats: {} });
    expect(parseEmokloreResponse(html(og("og:title", "題名"), "<p>名前: 他</p>"), EMO)).toStrictEqual({
      name: "題名",
      memo: undefined,
      systemId: "emoklore",
      stats: {},
    });
  });

  it("タイトルも本文の名前も無ければ null（画像だけでは作らない）", () => {
    expect(
      parseEmokloreResponse(html(og("og:image", "https://cdn.example.com/e.png"), "<p>紹介</p>"), EMO),
    ).toBeNull();
    expect(parseEmokloreResponse("<html></html>", EMO)).toBeNull();
    expect(parseEmokloreResponse("x <title>A</title>", EMO)).toBeNull();
    const plain = parseEmokloreResponse(" 共鳴者名: テキスト\n共鳴: 1", EMO);
    expect(plain?.name).toBe("テキスト");
  });
});

describe("parseBoothResponse", () => {
  it("JSON: 全項目・タグの正規化・システム推定", () => {
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

  it("JSON: 名前無しは null、HTML 文字列を含む JSON も HTML として扱わない", () => {
    expect(parseBoothResponse("{}", BOOTH)).toBeNull();
    expect(parseBoothResponse(JSON.stringify({ description: "<title>X</title>" }), BOOTH)).toBeNull();
  });

  it("HTML: 作者の分割・連続区切り・説明の正規化", () => {
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
    expect(parseBoothResponse(html(og("og:title", "題&nbsp;")), BOOTH)?.title).toBe("題");
    expect(parseBoothResponse(html(og("og:title", "題 - 作 - BOOTH\nX")), BOOTH)).toMatchObject({
      title: "題 - 作",
      author: "BOOTH\nX",
    });
    expect(parseBoothResponse(html(og("og:description", "説明のみ")), BOOTH)).toBeNull();
    expect(parseBoothResponse("<html></html>", BOOTH)).toBeNull();
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
  it("JSON: 必須はタイトルのみ・タグは 8 件まで", () => {
    expect(parseTaltoResponse(` ${JSON.stringify({ name: "名のみ" })}`, TALTO)).toStrictEqual({
      title: "名のみ",
      author: undefined,
      systemId: "general",
      source: "talto",
      sourceUrl: TALTO,
      tags: [],
      description: undefined,
    });
    const tags = Array.from({ length: 10 }, (_, i) => `t${i}`);
    expect(parseTaltoResponse(JSON.stringify({ title: "T", tags }), TALTO)?.tags).toEqual(tags.slice(0, 8));
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

  it("og:description / description / 欠損", () => {
    expect(
      parseTaltoResponse(html(og("og:title", "題") + og("og:description", "OGD")), TALTO)?.description,
    ).toBe("OGD");
    expect(parseTaltoResponse(html(og("og:title", "題")), TALTO)?.description).toBeUndefined();
    expect(parseTaltoResponse(html(""), TALTO)).toBeNull();
    // og:title / <title> が無くても JSON-LD の name を題名にする（サイト名の接尾辞は落とす）
    expect(
      parseTaltoResponse(html(`<script type="application/ld+json">{"name":"LD | TALTO"}</script>`), TALTO)
        ?.title,
    ).toBe("LD");
    expect(
      parseTaltoResponse(html(`<script type="application/ld+json">{"author":"L"}</script>`), TALTO),
    ).toBeNull();
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
  it("既知の値に対して固定のハッシュを返す（保存済みハッシュとの互換）", () => {
    expect(computeExternalContentHash({ name: "A", stats: { san: 50, hp: 10 }, tags: ["x", null] })).toBe(
      "f99e7fa0acf434eb",
    );
    expect(computeExternalContentHash({ n: 140 })).toBe("093a0b140f09aeed");
  });

  it("null / undefined / 配列 / オブジェクトを区別して正規化する", () => {
    const h = computeExternalContentHash;
    expect(h(null)).toBe(h(undefined));
    expect(h([undefined])).toBe(h([null]));
    expect(h([null])).not.toBe(h([]));
    expect(h([1])).not.toBe(h({ 0: 1 }));
    expect(h([1])).not.toBe(h([2]));
    expect(h({ a: 1 })).not.toBe(h({ a: 2 }));
    expect(h({ a: 1 })).not.toBe(h({ b: 1 }));
  });
});

describe("parseExternalResponse のプロバイダ振り分け", () => {
  it("TALTO は TALTO パーサー、BOOTH は BOOTH パーサーで解析する", () => {
    const talto = parseExternalResponse("talto", JSON.stringify({ title: "T" }), "application/json", TALTO);
    expect(talto).toMatchObject({ kind: "scenario", provider: "talto", providerLabel: "TALTO", url: TALTO });
    expect(talto?.kind === "scenario" && talto.scenario.title).toBe("T");
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
    const p = parseExternalResponse("iachara", JSON.stringify({ name: "I", san: 1 }), "application/json", IA);
    const sheet = {
      v: 1,
      provider: "iachara",
      url: IA,
      profile: [],
      sections: [
        { id: "resources", title: "副能力値", kind: "resources", entries: [{ label: "SAN", value: 1 }] },
      ],
    };
    expect(p).toStrictEqual({
      kind: "character",
      provider: "iachara",
      providerLabel: "いあきゃら",
      url: IA,
      character: { name: "I", memo: undefined, systemId: "coc7", stats: { san: 1 }, sheet },
      contentHash: computeExternalContentHash({ name: "I", systemId: "coc7", stats: { san: 1 }, sheet }),
    });
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
    expect(res.next.growth).toHaveLength(1);
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
  it("lastSyncedAt が空文字なら同期する・間隔を指定できる", () => {
    expect(shouldAutoSync({ provider: "iachara", url: IA, autoSync: true, lastSyncedAt: "" }, now)).toBe(
      true,
    );
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
