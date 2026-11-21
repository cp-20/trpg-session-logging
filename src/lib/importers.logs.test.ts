// @vitest-environment jsdom
/**
 * セッションログ取り込み (Udonarium chat.xml / Discord JSON・テキスト / どどんとふ HTML / 汎用テキスト) の境界値テスト。
 * チャンネルのまとめ方・発言者の種別・時刻の解釈を、戻り値の完全一致で確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importLogFromFile, importLogFromText, type LogImportResult } from "./importers";

/** JST の日時 → epoch 秒 */
const J = (date: string, hh: number, mm: number, ss = 0) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, hh, mm, ss) / 1000 - 9 * 3600;
};

type ChatAttrs = Record<string, string>;
const chatXml = (chats: [ChatAttrs, string][]) =>
  `<chat-log>${chats
    .map(
      ([attrs, text]) =>
        `<chat ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}>${text}</chat>`,
    )
    .join("")}</chat-log>`;

const msgs = (res: LogImportResult | null) => res?.log.channels.flatMap((c) => c.msgs) ?? [];
const view = (res: LogImportResult | null) =>
  res?.log.channels.map((c) => ({ id: c.id, name: c.name, secret: c.secret, sps: c.msgs.map((m) => m.sp) }));

describe("チャンネルのまとめ方 (assembleLogEntries)", () => {
  it.each([
    ["main-room", "メイン"],
    ["Main", "メイン"],
    ["メイン", "メイン"],
    ["INFO", "情報"],
    ["情報", "情報"],
    ["room-info", "情報"],
    ["CHAT", "チャット"],
    ["チャット", "チャット"],
    ["free-chat", "チャット"],
    ["雑談", "チャット"],
  ])("タブ %s は公開チャンネル %s", (tab, name) => {
    const res = importLogFromText(chatXml([[{ tab, name: "A" }, "x"]]));
    expect(view(res)).toEqual([{ id: tab, name, secret: false, sps: ["A"] }]);
  });

  it("その他のタブは発言者 2 人までなら秘匿、3 人以上なら公開", () => {
    const res = importLogFromText(
      chatXml([
        [{ tab: "HO1", name: "A" }, "x"],
        [{ tab: "HO1", name: "B" }, "x"],
        [{ tab: "HO1", name: "A" }, "x"],
        [{ tab: "相談", name: "A" }, "x"],
        [{ tab: "相談", name: "B" }, "x"],
        [{ tab: "相談", name: "C" }, "x"],
      ]),
    );
    expect(view(res)).toEqual([
      { id: "HO1", name: "HO1", secret: true, sps: ["A", "B", "A"] },
      { id: "相談", name: "相談", secret: false, sps: ["A", "B", "C"] },
    ]);
    expect(res?.log.messageCount).toBe(6);
  });

  it("メインを先頭にし、他のチャンネルは出現順を保つ", () => {
    const res = importLogFromText(
      chatXml([
        [{ tab: "HO1", name: "A" }, "x"],
        [{ tab: "雑談", name: "B" }, "x"],
        [{ tab: "メイン", name: "C" }, "x"],
        [{ tab: "情報", name: "D" }, "x"],
      ]),
    );
    expect(res?.log.channels.map((c) => c.name)).toEqual(["メイン", "HO1", "チャット", "情報"]);

    const res2 = importLogFromText(
      chatXml([
        [{ tab: "メイン", name: "C" }, "x"],
        [{ tab: "HO1", name: "A" }, "x"],
        [{ tab: "情報", name: "D" }, "x"],
      ]),
    );
    expect(res2?.log.channels.map((c) => c.name)).toEqual(["メイン", "HO1", "情報"]);

    const res3 = importLogFromText(
      chatXml([
        [{ tab: "HO1", name: "A" }, "x"],
        [{ tab: "情報", name: "D" }, "x"],
        [{ tab: "メイン", name: "C" }, "x"],
      ]),
    );
    expect(res3?.log.channels.map((c) => c.name)).toEqual(["メイン", "HO1", "情報"]);
  });

  it("チャンネル内の発言を時刻順に並べ、id は元の出現順", () => {
    const res = importLogFromText(
      chatXml([
        [{ name: "A", time: "1794831900" }, "3"],
        [{ name: "B", time: "1794831600" }, "1"],
        [{ name: "C", time: "1794831700" }, "2"],
      ]),
    );
    expect(msgs(res).map((m) => [m.id, m.text, m.ts])).toEqual([
      ["p1", "1", 1794831600],
      ["p2", "2", 1794831700],
      ["p0", "3", 1794831900],
    ]);
  });

  it("発言者ごとの種別 (kinds) をまとめる", () => {
    const res = importLogFromText(
      chatXml([
        [{ name: "KP:夜霜" }, "x"],
        [{ name: "A", tab: "HO1" }, "x"],
        [{ name: "ログ", type: "system" }, "x"],
      ]),
    );
    expect(res?.log.kinds).toStrictEqual({ "KP:夜霜": "KP", A: "PC", ログ: "SYSTEM" });
  });

  it("発言の形を完全一致で返す", () => {
    const res = importLogFromText(chatXml([[{ name: "A", time: "1794831600" }, "こんにちは"]]));
    expect(res).toStrictEqual({
      sourceLabel: "Udonarium",
      log: {
        channels: [
          {
            id: "メイン",
            name: "メイン",
            secret: false,
            msgs: [{ id: "p0", ts: 1794831600, sp: "A", kind: "PC", type: "text", text: "こんにちは" }],
          },
        ],
        kinds: { A: "PC" },
        messageCount: 1,
      },
    });
  });
});

describe("Udonarium chat.xml", () => {
  it.each([
    [{ name: "A", type: "pc" }, "PC"],
    [{ name: "KP:夜霜", type: "pc" }, "PC"],
    [{ name: "A", type: "NPC" }, "NPC"],
    [{ name: "A", type: "kp" }, "KP"],
    [{ name: "A", type: "pl" }, "PL"],
    [{ name: "A", type: "gm" }, "GM"],
    [{ name: "A", type: "system" }, "SYSTEM"],
    [{ name: "A", type: " System " }, "SYSTEM"],
    [{ name: "A", type: " npc " }, "NPC"],
    [{ name: "A", type: "" }, "PC"],
    [{ name: "A", type: "other" }, "PC"],
    [{ name: "A" }, "PC"],
    [{ name: "KP:夜霜" }, "KP"],
    [{ name: "KP 夜霜" }, "KP"],
    [{ name: "gm：夜霜" }, "KP"],
    [{ name: "KP" }, "KP"],
    [{ name: "GM" }, "KP"],
    [{ name: "KPX" }, "PC"],
    [{ name: "見学KP:A" }, "PC"],
    [{ name: "System" }, "SYSTEM"],
  ])("種別 %j → %s", (attrs, kind) => {
    expect(msgs(importLogFromText(chatXml([[attrs, "x"]])))[0]?.kind).toBe(kind);
  });

  it.each([
    [{ name: " A " }, "A"],
    [{ from: "B" }, "B"],
    [{ name: "A", from: "B" }, "A"],
    [{ name: "  " }, "不明な発言者"],
    [{}, "不明な発言者"],
  ])("発言者 %j → %s", (attrs, sp) => {
    expect(msgs(importLogFromText(chatXml([[attrs, "x"]])))[0]?.sp).toBe(sp);
  });

  it.each([
    [{ time: "1794831600000" }, 1794831600],
    [{ time: " 1794831600999 " }, 1794831600],
    [{ time: "1794831600" }, 1794831600],
    [{ timestamp: "1794831600" }, 1794831600],
    [{ time: "1794831600", timestamp: "1" }, 1794831600],
    [{ time: "1000000001" }, 1000000001],
    [{ time: "1000000000" }, 0],
    [{ time: "12345" }, 0],
    [{ time: "1000000000000" }, 1000000000000],
    [{ time: "1000000000001" }, 1000000000],
    [{ time: "2026-11-21T12:00:00Z" }, J("2026-11-21", 21, 0)],
    [{ time: "Sat Nov 21 2026 21:00:00 GMT+0900" }, J("2026-11-21", 21, 0)],
    [{ time: "1969-12-31T23:59:59Z" }, 0],
    [{ time: "abc" }, 0],
    [{ time: "" }, 0],
    [{}, 0],
  ])("時刻 %j → %d", (attrs, ts) => {
    expect(msgs(importLogFromText(chatXml([[{ name: "A", ...attrs }, "x"]])))[0]?.ts).toBe(ts);
  });

  it("本文の前後の空白を除き、空の発言は飛ばす。◆ で始まる発言はノート", () => {
    const res = importLogFromText(
      chatXml([
        [{ name: "A" }, "  本文  "],
        [{ name: "B" }, "   "],
        [{ name: "C" }, ""],
        [{ name: "D" }, "◆ 場面転換"],
      ]),
    );
    expect(msgs(res).map((m) => [m.sp, m.text, m.type])).toEqual([
      ["A", "本文", "text"],
      ["D", "◆ 場面転換", "note"],
    ]);
  });

  it("タブ名の前後の空白を除き、空ならメイン", () => {
    const res = importLogFromText(
      chatXml([
        [{ name: "A", tab: " 雑談 " }, "x"],
        [{ name: "B", tab: "  " }, "x"],
      ]),
    );
    expect(view(res)).toEqual([
      { id: "メイン", name: "メイン", secret: false, sps: ["B"] },
      { id: "雑談", name: "チャット", secret: false, sps: ["A"] },
    ]);
  });

  it("CDATA は XML として読む", () => {
    const res = importLogFromText(`<chat-log><chat name="A"><![CDATA[a<b]]></chat></chat-log>`);
    expect(msgs(res).map((m) => m.text)).toEqual(["a<b"]);
  });

  it("XML として壊れていても HTML として chat 要素が読めれば取り込む", () => {
    const res = importLogFromText(`<chat-log><chat name="A">x & y</chat></chat-log>`);
    expect(res?.sourceLabel).toBe("Udonarium");
    expect(msgs(res).map((m) => m.text)).toEqual(["x & y"]);
  });

  it("chat 要素が無い・発言が無いときは Udonarium として扱わない", () => {
    expect(importLogFromText(`<chat-log><foo></chat-log`)).toBeNull();
    expect(importLogFromText(`<chat-log></chat-log>`)).toBeNull();
    expect(importLogFromText(`<chat-log><chat name="A"> </chat></chat-log>`)).toBeNull();
    expect(importLogFromText(`メモ <chat name="A">x</chat>`)?.sourceLabel).not.toBe("Udonarium");
  });
});

describe("Discord JSON (DiscordChatExporter)", () => {
  const dj = (messages: unknown[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({ messages, ...extra });

  it("発言の形を完全一致で返す", () => {
    const res = importLogFromText(
      `  ${dj([{ author: { name: "花子" }, content: "やあ", timestamp: "2026-11-21T12:00:00Z" }])}  `,
    );
    expect(res).toStrictEqual({
      sourceLabel: "Discord",
      log: {
        channels: [
          {
            id: "メイン",
            name: "メイン",
            secret: false,
            msgs: [
              { id: "p0", ts: J("2026-11-21", 21, 0), sp: "花子", kind: "PC", type: "text", text: "やあ" },
            ],
          },
        ],
        kinds: { 花子: "PC" },
        messageCount: 1,
      },
    });
  });

  it.each([
    [{ channel: { name: " 本卓 " } }, "本卓"],
    [{ channel: { name: "  " } }, "メイン"],
    [{ channel: "本卓" }, "メイン"],
    [{}, "メイン"],
  ])("チャンネル名 %j → %s", (extra, id) => {
    const res = importLogFromText(dj([{ author: { name: "A" }, content: "x" }], extra));
    expect(res?.log.channels[0]?.id).toBe(id);
  });

  it.each([
    [{ author: { nickname: " ハナ ", name: "hanako" } }, "ハナ"],
    [{ author: { name: "hanako" }, authorName: "x" }, "hanako"],
    [{ authorName: "ゲスト" }, "ゲスト"],
    [{ author: "hanako" }, "不明な発言者"],
    [{ author: { name: "  " } }, "不明な発言者"],
  ])("発言者 %j → %s", (fields, sp) => {
    expect(msgs(importLogFromText(dj([{ content: "x", ...fields }])))[0]?.sp).toBe(sp);
  });

  it("本文と埋め込みのタイトル・説明を改行でつなぐ", () => {
    const res = importLogFromText(
      dj([
        {
          author: { name: "A" },
          content: "本文  ",
          embeds: [
            null,
            "x",
            {},
            { title: " T " },
            { description: " D " },
            { title: "T2", description: "D2" },
          ],
        },
        { author: { name: "B" }, embeds: [{ title: "埋め込みのみ" }] },
        { author: { name: "C" }, content: "  ", embeds: [] },
        { author: { name: "D" }, content: "x", embeds: "nope" },
        null,
        "str",
      ]),
    );
    expect(msgs(res).map((m) => [m.sp, m.text])).toEqual([
      ["A", "本文\nT\nD\nT2\nD2"],
      ["B", "埋め込みのみ"],
      ["D", "x"],
    ]);
  });

  it("ボットの発言は SYSTEM で、ダイス結果を読む", () => {
    const res = importLogFromText(
      dj([
        { author: { name: "Helper", isBot: true }, content: "【目星】 (1D100<=65) ＞ 32 ＞ 成功" },
        { author: { name: "DiceBot" }, content: "(1D100<=65)＞32＞成功" },
        { author: { name: "BCDice" }, content: "技【能】 ( 2D6 ) → 7" },
        { author: { name: "bot2" }, content: "【目】星 (1D6) > 3 > 成功  \n二行目" },
        { author: { name: "Helper2", isBot: false }, content: "ただの発言" },
      ]),
    );
    expect(msgs(res).map((m) => [m.sp, m.kind, m.roll])).toEqual([
      ["Helper", "SYSTEM", { cmd: "1D100<=65", skill: "目星", dice: "32", result: "成功" }],
      ["DiceBot", "SYSTEM", { cmd: "1D100<=65", skill: "", dice: "32", result: "成功" }],
      ["BCDice", "SYSTEM", { cmd: "2D6", skill: "技【能", dice: "7", result: "判定" }],
      ["bot2", "SYSTEM", { cmd: "1D6", skill: "目】星", dice: "3", result: "成功" }],
      ["Helper2", "PC", undefined],
    ]);
    expect(msgs(res)[4]).not.toHaveProperty("roll");
  });

  it("人の発言は ＞/→ のあとに判定結果があるときだけダイス結果を読む", () => {
    const res = importLogFromText(
      dj([
        { author: { name: "A" }, content: "目星 (1D100<=65) ＞ 32 ＞ 成功" },
        { author: { name: "B" }, content: "(1D100<=65) ＞ 99 → ファンブル" },
        { author: { name: "C" }, content: "(1D100<=65)＞5＞クリティカル" },
        { author: { name: "D" }, content: "(1D100) ＞ 32" },
        { author: { name: "E" }, content: "(1D6) > 3 > 成功" },
        { author: { name: "F" }, content: "(1D6) ＞ 3 ＞失敗" },
        { author: { name: "G" }, content: "結果: 成功" },
      ]),
    );
    expect(msgs(res).map((m) => [m.sp, m.roll?.result ?? null])).toEqual([
      ["A", "成功"],
      ["B", "ファンブル"],
      ["C", "クリティカル"],
      ["D", null],
      ["E", null],
      ["F", "失敗"],
      ["G", null],
    ]);
    expect(msgs(res)[0]?.roll).toStrictEqual({ cmd: "1D100<=65", skill: "目星", dice: "32", result: "成功" });
  });

  it("◆ で始まる発言はノート、時刻が無ければ 0", () => {
    const res = importLogFromText(dj([{ author: { name: "A" }, content: "◆ メモ", timestamp: 1 }]));
    expect(msgs(res).map((m) => [m.type, m.ts])).toEqual([["note", 0]]);
  });

  it("messages 配列が無ければ Discord として扱わない", () => {
    expect(importLogFromText(JSON.stringify({ messages: {} }))).toBeNull();
    expect(importLogFromText(JSON.stringify({ messages: [] }))).toBeNull();
    expect(importLogFromText("{ broken")).toBeNull();
  });
});

describe("Discord テキストログ", () => {
  it("DiscordChatExporter TXT を読む", () => {
    const res = importLogFromText(
      [
        "==============================",
        "Channel: 本卓部屋",
        "==============================",
        "",
        "[2026/11/08 21:05] 花子 (hanako#1234)",
        "",
        "一行目",
        "",
        "二行目",
        "=====",
        "  =====  ",
        "====",
        "x=====",
        "=====x",
        "Channel: 本文",
        "",
        "[2026-1-2 9:05:30]  太郎",
        "(1D100<=50) ＞ 20 ＞ 成功",
        "[2026/11/08 21:07] 空の発言",
        "[2026/11/08 21:08] 次郎  ",
        "◆ ノート",
        "[2026/11/08  21:09] 三郎(saburo#1)",
        "どうも",
      ].join("\n"),
    );
    expect(res?.sourceLabel).toBe("Discord");
    expect(res?.log.channels.map((c) => c.id)).toEqual(["本卓部屋"]);
    expect(msgs(res).map((m) => ({ sp: m.sp, ts: m.ts, text: m.text, type: m.type, roll: m.roll }))).toEqual([
      {
        sp: "太郎",
        ts: J("2026-01-02", 9, 5),
        text: "(1D100<=50) ＞ 20 ＞ 成功",
        type: "text",
        roll: { cmd: "1D100<=50", skill: "", dice: "20", result: "成功" },
      },
      {
        sp: "花子",
        ts: J("2026-11-08", 21, 5),
        text: "一行目\n\n二行目\n====\nx=====\n=====x\nChannel: 本文",
        type: "text",
        roll: undefined,
      },
      { sp: "次郎", ts: J("2026-11-08", 21, 8), text: "◆ ノート", type: "note", roll: undefined },
      { sp: "三郎", ts: J("2026-11-08", 21, 9), text: "どうも", type: "text", roll: undefined },
    ]);
    expect(msgs(res)[1]).not.toHaveProperty("roll");
  });

  it("Discord Web のコピペ (名前 \u2014 日付 時刻) を読む", () => {
    const res = importLogFromText(
      [
        "花子 \u2014 2026/11/08  21:05  ",
        "やあ",
        "太郎  -  2026-11-8 9:07",
        "おう",
        "次郎 \u2014 2026/11/08 21:09 編集済み",
        "続き",
      ].join("\n"),
    );
    expect(msgs(res).map((m) => [m.sp, m.ts, m.text])).toEqual([
      ["太郎", J("2026-11-08", 9, 7), "おう\n次郎 \u2014 2026/11/08 21:09 編集済み\n続き"],
      ["花子", J("2026-11-08", 21, 5), "やあ"],
    ]);
    expect(res?.log.channels[0]?.id).toBe("メイン");
  });

  it("Channel: 行は最初の発言より前で、行頭にあるときだけ使う", () => {
    const a = importLogFromText("Channel:卓部屋\n[2026/11/08 21:05] 花子\nやあ");
    expect(a?.log.channels[0]?.id).toBe("卓部屋");
    const b = importLogFromText("Channel:   \n[2026/11/08 21:05] 花子\nやあ");
    expect(b?.log.channels[0]?.id).toBe("メイン");
    const c = importLogFromText("My Channel: 卓部屋\n[2026/11/08 21:05] 花子\nやあ");
    expect(c?.log.channels[0]?.id).toBe("メイン");
  });

  it("見出しの書式が違う行は本文として扱う", () => {
    const res = importLogFromText(
      [
        "[2026/11/08 21:05] 花子",
        "[2026/11/08 2105] 偽",
        "[26/11/08 21:05] 偽",
        "x [2026/11/08 21:05] 偽",
      ].join("\n"),
    );
    expect(msgs(res).map((m) => [m.sp, m.text])).toEqual([
      ["花子", "[2026/11/08 2105] 偽\n[26/11/08 21:05] 偽\nx [2026/11/08 21:05] 偽"],
    ]);
  });
});

describe("どどんとふ / 汎用 HTML", () => {
  it("タグを除いて 発言者：本文 を読む", () => {
    const res = importLogFromText(
      [
        "<html><head><style>",
        ".a: b",
        "</style><script>",
        "x: y",
        "</script></head><body>",
        "<p>[ 雑談 ] 花子：やあ</p>",
        "<div>太郎: a&lt;b&gt;c&amp;d&quot;e&#39;f</div>",
        "<p>次郎: 一<br>三郎: 二<br />四郎: 三<BR/>五郎: ◆ 四</p>",
        "<p>[HO1]六郎: 秘密</p>",
        "<p>区切りのない行</p>",
        "<p>[HO2] : 名前なし</p>",
        "<p>http: //example.com</p><p>HTTPS: //example.com</p>",
        "<p>xhttp: 1</p><p>https2: 2</p>",
        `<p>${"あ".repeat(40)}: 長すぎる名前</p>`,
        "</body></html>",
      ].join("\n"),
    );
    expect(res?.sourceLabel).toBe("どどんとふ / HTML");
    expect(res?.log.channels.map((c) => [c.id, c.name])).toEqual([
      ["メイン", "メイン"],
      ["雑談", "チャット"],
      ["HO1", "HO1"],
    ]);
    expect(msgs(res).map((m) => [m.sp, m.text, m.type, m.ts])).toEqual([
      ["太郎", "a<b>c&d\"e'f", "text", 0],
      ["次郎", "一", "text", 0],
      ["三郎", "二", "text", 0],
      ["四郎", "三", "text", 0],
      ["五郎", "◆ 四", "note", 0],
      ["xhttp", "1", "text", 0],
      ["https2", "2", "text", 0],
      ["花子", "やあ", "text", 0],
      ["六郎", "秘密", "text", 0],
    ]);
    expect(res?.log.kinds["太郎"]).toBe("PC");
  });

  it("KP / GM の発言者は KP", () => {
    const res = importLogFromText("<p>KP 夜霜: 始めます</p>");
    expect(msgs(res)[0]?.kind).toBe("KP");
  });

  it(".html ファイルは先頭の空白を許し、< で始まらなければ読まない", async () => {
    const ok = await importLogFromFile(new File(["  \n<p>花子: やあ</p>"], "log.html"));
    expect(ok?.sourceLabel).toBe("どどんとふ / HTML");
    expect(await importLogFromFile(new File(["花子: やあ"], "log.html"))).toBeNull();
    expect(await importLogFromFile(new File(["花子: やあ"], "log.htm"))).toBeNull();
  });
});

describe("汎用 / Tekey テキストログ", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-21T03:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const plain = (text: string) => {
    const res = importLogFromText(text);
    if (res) expect(res.sourceLabel).toBe("テキストログ");
    return msgs(res).map((m) => ({ sp: m.sp, text: m.text, ts: m.ts, kind: m.kind, type: m.type }));
  };
  const one = (line: string) => plain(line)[0];

  it("時刻の無い行は日時 0 のままメインに入る", () => {
    const res = importLogFromText("太郎: やあ");
    expect(res).toStrictEqual({
      sourceLabel: "テキストログ",
      log: {
        channels: [
          {
            id: "メイン",
            name: "メイン",
            secret: false,
            msgs: [{ id: "p0", ts: 0, sp: "太郎", kind: "PC", type: "text", text: "やあ" }],
          },
        ],
        kinds: { 太郎: "PC" },
        messageCount: 1,
      },
    });
  });

  it.each([
    ["[雑談] 太郎: やあ", "雑談"],
    ["[雑談]太郎: やあ", "雑談"],
    ["[ ] 太郎: やあ", "メイン"],
    ["太郎: [注] やあ", "メイン"],
    ["[21:05] 太郎: やあ", "メイン"],
  ])("チャンネル %j → %s", (line, id) => {
    const res = importLogFromText(line);
    expect(res?.log.channels.map((c) => c.id)).toEqual([id]);
    expect(msgs(res)[0]?.sp).toBe("太郎");
  });

  it.each([
    ["2026/11/20 21:05 太郎: やあ", J("2026-11-20", 21, 5)],
    ["[2026-11-20 21:05:30] 太郎: やあ", J("2026-11-20", 21, 5, 30)],
    ["2026-11-20T21:05 太郎: やあ", J("2026-11-20", 21, 5)],
    ["2026/11/20  21:05 太郎: やあ", J("2026-11-20", 21, 5)],
    ["2026/1/2 9:05 太郎: やあ", J("2026-01-02", 9, 5)],
    ["21:05 太郎: やあ", J("2026-11-21", 21, 5)],
    ["[21:05:30] 太郎: やあ", J("2026-11-21", 21, 5, 30)],
    ["9:05 太郎: やあ", J("2026-11-21", 9, 5)],
    ["29:59 太郎: やあ", J("2026-11-21", 29, 59)],
    ["[雑談] 21:05 太郎: やあ", J("2026-11-21", 21, 5)],
  ])("時刻 %j → %d", (line, ts) => {
    expect(one(line)).toMatchObject({ sp: "太郎", text: "やあ", ts });
  });

  it.each([["30:00 太郎: やあ"], ["21:60 太郎: やあ"]])("範囲外の時刻 %j は読まない", (line) => {
    expect(importLogFromText(line)).toBeNull();
  });

  it("本文中の日時は時刻として扱わない", () => {
    expect(one("太郎: 2026/11/21 21:05 集合")).toMatchObject({ text: "2026/11/21 21:05 集合", ts: 0 });
    expect(one("太郎: 21:05 集合")).toMatchObject({ text: "21:05 集合", ts: 0 });
  });

  it("2 行目以降も行頭の空白を除いてから時刻を読む", () => {
    expect(plain("太郎: a\n   21:05 花子: b")).toEqual([
      { sp: "太郎", text: "a", ts: 0, kind: "PC", type: "text" },
      { sp: "花子", text: "b", ts: J("2026-11-21", 21, 5), kind: "PC", type: "text" },
    ]);
  });

  it("時刻の無い行は直前の時刻を引き継ぐ", () => {
    expect(plain("21:05 太郎: やあ\n花子: おう").map((m) => m.ts)).toEqual([
      J("2026-11-21", 21, 5),
      J("2026-11-21", 21, 5),
    ]);
  });

  it("時刻が 12 時間以上巻き戻ったら翌日とみなす", () => {
    expect(plain("23:50 A: x\n00:10 B: y\n00:20 C: z").map((m) => m.ts)).toEqual([
      J("2026-11-21", 23, 50),
      J("2026-11-22", 0, 10),
      J("2026-11-22", 0, 20),
    ]);
    expect(plain("12:59 A: x\n00:58 B: y").map((m) => m.ts)).toEqual([
      J("2026-11-21", 12, 59),
      J("2026-11-22", 0, 58),
    ]);
    expect(plain("12:59 A: x\n00:59 B: y").map((m) => m.ts)).toEqual([
      J("2026-11-21", 0, 59),
      J("2026-11-21", 12, 59),
    ]);
    expect(plain("21:00 A: x\n21:05 B: y\n09:00 C: z").map((m) => m.ts)).toEqual([
      J("2026-11-21", 21, 0),
      J("2026-11-21", 21, 5),
      J("2026-11-22", 9, 0),
    ]);
    expect(plain("21:00 A: x\n09:05 B: y").map((m) => m.ts)).toEqual([
      J("2026-11-21", 9, 5),
      J("2026-11-21", 21, 0),
    ]);
  });

  it("名前「本文」形式", () => {
    expect(one("太郎 「後ろからついていきます」")).toMatchObject({
      sp: "太郎",
      text: "「後ろからついていきます」",
    });
    expect(importLogFromText("太郎「やあ」です")).toBeNull();
    expect(importLogFromText("「前」太郎「やあ」")).toBeNull();
  });

  it.each([
    ["KP : 夜霜: 本文", "KP : 夜霜", "本文", "KP"],
    ["KP:夜霜: 本文", "KP:夜霜", "本文", "KP"],
    ["GM：夜霜： 本文 です", "GM：夜霜", "本文 です", "KP"],
    ["PL: 太郎: 本文", "PL: 太郎", "本文", "PC"],
    ["太郎 : 本文", "太郎", "本文", "PC"],
    ["xhttp: 1", "xhttp", "1", "PC"],
    ["https2: 1", "https2", "1", "PC"],
    ["xmailto: 1", "xmailto", "1", "PC"],
    ["mailtox: 1", "mailtox", "1", "PC"],
    ["System: 1", "System", "1", "SYSTEM"],
  ])("名前: 本文 形式 %j", (line, sp, text, kind) => {
    expect(one(line)).toMatchObject({ sp, text, kind, type: "text" });
  });

  it.each([
    ["太郎:やあ"],
    ["http: //example.com"],
    ["HTTPS: //example.com"],
    ["mailto: a@example.com"],
    [`${"あ".repeat(40)}: 長すぎる名前`],
    ["   "],
    ["ただの文章"],
  ])("発言として読まない %j", (line) => {
    expect(importLogFromText(line)).toBeNull();
  });

  it("前後の空白・空行・◆ ノートを扱う", () => {
    expect(plain("   21:05 太郎: やあ\n\n  花子: ◆ 場面転換  ")).toEqual([
      { sp: "太郎", text: "やあ", ts: J("2026-11-21", 21, 5), kind: "PC", type: "text" },
      { sp: "花子", text: "◆ 場面転換", ts: J("2026-11-21", 21, 5), kind: "PC", type: "note" },
    ]);
  });

  it.each([["{太郎: こんにちは"], ["<b>太郎「やあ」"], ['["太郎: やあ"]'], ["[1, 2]"]])(
    "JSON / XML らしいもの %j はテキストログとして読まない",
    (raw) => {
      expect(importLogFromText(raw)).toBeNull();
    },
  );

  it("JSON として読める文字列でも [ で始まらなければテキストログとして読む", () => {
    expect(one('"太郎: やあ"')).toMatchObject({ sp: '"太郎', text: 'やあ"' });
  });
});
