// @vitest-environment jsdom
/**
 * セッションログ取り込み (Udonarium chat.xml) の境界値と、構造化されていない形式 (Discord・テキスト・整形 HTML) を拒むことのテスト。
 * チャンネルのまとめ方・発言者の種別・時刻の解釈を、戻り値の完全一致で確かめる。
 */
import { describe, expect, it } from "vitest";
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

describe("構造化されていない形式は受け付けない (P6)", () => {
  it.each([
    [
      "DiscordChatExporter JSON",
      JSON.stringify({
        channel: { name: "本卓" },
        messages: [{ author: { name: "hanako" }, timestamp: "2026-11-08T12:05:00Z", content: "やあ" }],
      }),
    ],
    [
      "DiscordChatExporter TXT",
      ["Channel: 本卓部屋", "", "[2026/11/08 21:05] 花子 (hanako#1234)", "やあ"].join("\n"),
    ],
    ["Discord Web のコピペ", ["花子 \u2014 2026/11/08 21:05", "やあ"].join("\n")],
    ["名前: 本文 のテキスト", "太郎: こんにちは\n花子: やあ"],
    ["時刻付きテキスト", "[雑談] 21:05 太郎: やあ"],
    ["名前「本文」のテキスト", "太郎「こんにちは」"],
    ["どどんとふ / 整形 HTML", "<html><body><p>[雑談] 花子：やあ</p><p>太郎: どうも</p></body></html>"],
  ])("%s は null", (_label, raw) => {
    expect(importLogFromText(raw)).toBeNull();
  });

  it("HTML 行の .html ファイルも読まない", async () => {
    expect(await importLogFromFile(new File(["<p>[雑談] 花子：やあ</p>"], "log.html"))).toBeNull();
    expect(await importLogFromFile(new File(["花子: やあ"], "log.htm"))).toBeNull();
  });

  it("空・壊れた JSON・messages 配列だけの JSON は null", () => {
    expect(importLogFromText("   ")).toBeNull();
    expect(importLogFromText("{ broken")).toBeNull();
    expect(importLogFromText(JSON.stringify({ messages: [] }))).toBeNull();
  });
});
