// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import fixtureRaw from "../../e2e/fixtures/ccfolia-sample.json";
import {
  guessSystemFromText,
  importLogFromFile,
  importLogFromText,
  importLogsFromFiles,
  parseCharasheetJson,
  parseYtsheetJson,
} from "./importers";
import { buildIcsCalendar, googleCalendarUrl, icsDataUrl } from "./ics";

describe("importLogFromText", () => {
  it("CCFOLIA JSON を取り込む", () => {
    const res = importLogFromText(JSON.stringify(fixtureRaw));
    expect(res?.sourceLabel).toBe("CCFOLIA");
    expect(res?.log.messageCount).toBe(12);
  });

  it("Udonarium chat.xml を取り込む", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<chat-log>
  <chat tab="メイン" time="1794831600000" name="KP:夜霜">それでは導入を始めます。</chat>
  <chat tab="メイン" time="1794831660000" name="遠沢澄花">「周囲を見渡してみます」</chat>
  <chat tab="雑談" time="1794831700000" name="みかん">よろしくお願いします！</chat>
  <chat tab="秘匿HO1" time="1794831720000" name="KP:夜霜">◆ 個別情報：鍵を持っています。</chat>
</chat-log>`;
    const res = importLogFromText(xml);
    expect(res?.sourceLabel).toBe("Udonarium");
    expect(res?.log.messageCount).toBe(4);
    expect(res?.log.channels.map((c) => c.name)).toContain("メイン");
    expect(res?.log.channels.map((c) => c.name)).toContain("チャット");
    const secret = res?.log.channels.find((c) => c.name === "秘匿HO1");
    expect(secret?.secret).toBe(true);
    expect(secret?.msgs[0]?.type).toBe("note");
  });

  it("自由形式のテキストログ (Tekey 形式・名前「本文」) は取り込まない", () => {
    expect(
      importLogFromText("[メイン] 21:00 KP: 夜霜: それではセッションを始めます。\n[雑談] 21:03 みかん: やあ"),
    ).toBeNull();
    expect(
      importLogFromText("21:05 遠沢澄花: 懐中電灯を取り出します\n白瀬怜「後ろからついていきます」"),
    ).toBeNull();
  });

  it("不正な入力には null を返す", () => {
    expect(importLogFromText("not json")).toBeNull();
    expect(importLogFromText('{"foo":1}')).toBeNull();
  });
});

describe("importLogFromFile", () => {
  it("chat.xml を含む ZIP から Udonarium ログを取り込む", async () => {
    const zip = new JSZip();
    zip.file(
      "chat.xml",
      `<chat-log><chat tab="メイン" time="1794831600000" name="遠沢澄花">テスト発言</chat></chat-log>`,
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([buf], "room_log.zip", { type: "application/zip" });
    const res = await importLogFromFile(file);
    expect(res?.sourceLabel).toBe("Udonarium");
    expect(res?.log.messageCount).toBe(1);
  });

  it(".txt ファイルは取り込まない", async () => {
    const file = new File(["[メイン] 太郎: こんにちは"], "log.txt", { type: "text/plain" });
    expect(await importLogFromFile(file)).toBeNull();
  });
});

describe("ics helpers", () => {
  it("RFC 5545 準拠の ICS と Google カレンダー URL を生成する", () => {
    const ics = buildIcsCalendar([
      {
        uid: "ev_1@takufu",
        title: "廃校の十三時間目, 第2夜; 最終章",
        date: "2026-11-21",
        startTime: "21:00",
        endTime: "24:00",
        description: "持ち物: ルルブ\nDiscord集合",
      },
    ]);
    expect(ics).toContain("\r\n");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;TZID=Asia/Tokyo:20261121T210000");
    expect(ics).toContain("DTEND;TZID=Asia/Tokyo:20261122T000000");
    expect(ics).toContain("SUMMARY:廃校の十三時間目\\, 第2夜\\; 最終章");
    expect(ics).toContain("DESCRIPTION:持ち物: ルルブ\\nDiscord集合");
    expect(icsDataUrl(ics)).toMatch(/^data:text\/calendar;charset=utf-8,/);

    const gUrl = googleCalendarUrl({
      title: "潮騒の会",
      date: "2026-11-21",
      startTime: "21:00",
      endTime: "23:30",
      details: "ココフォリア集合",
    });
    expect(gUrl).toContain("calendar.google.com");
    const withoutDetails = googleCalendarUrl({
      title: "潮騒の会",
      date: "2026-11-21",
      startTime: "21:00",
      endTime: "23:30",
    });
    expect(withoutDetails).not.toContain("details=");
  });
});

describe("拡張パーサー群 (ゆとシートⅡ / 保管所 / 自由形式ログの拒否)", () => {
  it("guessSystemFromText と parseYtsheetJson / parseCharasheetJson を正しく扱う", () => {
    expect(guessSystemFromText("新クトゥルフ神話TRPG 7版")).toBe("coc7");
    expect(guessSystemFromText("クトゥルフ6版")).toBe("coc6");
    expect(guessSystemFromText("エモクロアTRPG 共鳴者")).toBe("emoklore");
    expect(guessSystemFromText("SW2.5 冒険者")).toBe("sw25");
    expect(guessSystemFromText("不明")).toBeUndefined();

    const yt = parseYtsheetJson(
      JSON.stringify({
        characterName: "エルナ",
        race: "エルフ",
        job: "コンジャラー",
        level: "5",
        sttStr: "12",
        sttDex: "18",
        sttAgi: "16",
        sttVit: "10",
        sttInt: "21",
        sttMnd: "24",
        hpTotal: "28",
        mpTotal: "45",
        freeNote: "森の案内人&lt;br&gt;魔法が得意",
        imageURL: "https://cdn.example.com/elna.png",
      }),
    );
    expect(yt?.name).toBe("エルナ");
    expect(yt?.systemId).toBe("sw25");
    expect(yt?.stats).toMatchObject({ hp: 28, mp: 45, str: 12, mnd: 24 });
    expect(yt?.memo).toContain("森の案内人\n魔法が得意");
    expect(yt?.image).toBe("https://cdn.example.com/elna.png");
    expect(parseYtsheetJson("{bad")).toBeNull();

    const chJson = parseCharasheetJson(
      JSON.stringify({ pc_name: "水無瀬", game: "coc6", NP1: "12", HP: "10", MP: "14" }),
    );
    expect(chJson?.name).toBe("水無瀬");
    expect(chJson?.systemId).toBe("coc6");
  });

  it("Discord JSON/TXT・どどんとふ HTML・テキストのログファイルは取り込まない", async () => {
    const discordJson = JSON.stringify({
      channel: { name: "本編セッション" },
      messages: [
        {
          author: { nickname: "KP佐々", isBot: false },
          timestamp: "2026-11-10T21:00:00+09:00",
          content: "開始します。",
        },
        {
          author: { name: "BCDice-Bot", isBot: true },
          timestamp: "2026-11-10T21:05:00+09:00",
          content: "【目星】 (1D100<=70) ＞ 24 ＞ 成功",
        },
      ],
    });
    expect(importLogFromText(discordJson)).toBeNull();

    const discordTxt = `Channel: 雑談卓
==================================================
[2026/11/10 21:00] 遠沢澄花 (uid1)
懐中電灯で照らします。
1D100<=65 (CC<=65) ＞ 31 ＞ 成功

KP佐々 \u2014 2026/11/10 21:02
扉の奥に日誌が見つかります。`;
    expect(importLogFromText(discordTxt)).toBeNull();

    const genericHtml = `<html><body><p>[メイン] 探索者A：部屋を調べます</p><p>GM：本棚に鍵があります</p></body></html>`;
    expect(importLogFromText(genericHtml)).toBeNull();
    const htmlFile = new File([genericHtml], "dodon.html", { type: "text/html" });
    const txtFile = new File(["[メイン] 探偵: 手がかりを発見"], "extra.txt", { type: "text/plain" });
    const jsonFile = new File([discordJson], "discord.json", { type: "application/json" });
    expect(await importLogsFromFiles([htmlFile, txtFile, jsonFile])).toEqual([]);
  });

  it("キャラシ JSON の分岐・ZIP破損・自由形式ログの拒否を網羅する", async () => {
    // guessSystemFromText の残分岐
    expect(guessSystemFromText("Cthulhu7th")).toBe("coc7");
    expect(guessSystemFromText("CCB<=65")).toBe("coc6");
    expect(guessSystemFromText("CC<=70 目星")).toBe("coc7");
    expect(guessSystemFromText("SwordWorld 2.5")).toBe("sw25");
    expect(guessSystemFromText("共鳴")).toBe("emoklore");

    // parseYtsheetJson (pcName / name / sanTotal / CoC7・CoC6 フォールバック / 不正画像URL / 欠落名)
    const ytAlt = parseYtsheetJson(
      JSON.stringify({
        pcName: "セリア",
        sanTotal: 60,
        hpTotal: 15,
        imageURL: "ftp://invalid/x.png",
      }),
    )!;
    expect(ytAlt.name).toBe("セリア");
    expect(ytAlt.stats).toEqual({ san: 60, hp: 15 });
    expect(ytAlt.systemId).toBe("coc6");
    expect(ytAlt.image).toBeUndefined();
    expect(
      parseYtsheetJson(
        JSON.stringify({
          name: "CoC7員",
          lv: "3",
          works: "探偵",
          memo: "古いメモ<br/>行2",
          sttStr: 65,
          statusDex: 50,
          statusCon: 55,
          statusInt: 70,
          statusPow: 60,
          statusHp: 12,
          statusMp: 14,
          sanLeft: 62,
        }),
      ),
    ).toMatchObject({
      systemId: "coc7",
      stats: { str: 65, dex: 50, vit: 55, int: 70, mnd: 60, hp: 12, mp: 14, san: 62 },
      memo: "職業: 探偵\nLv.3\n古いメモ\n行2",
    });
    expect(parseYtsheetJson(JSON.stringify({ name: "ytsheetではない" }))).toBeNull();
    expect(parseYtsheetJson(JSON.stringify({ characterName: "  " }))).toBeNull();

    // parseCharasheetJson 全 NP1..NP14・direct override・game: coc7 / sw2 / emo / 不明+高STR(coc7)
    expect(parseCharasheetJson(JSON.stringify({ pc_name: "A", game: "coc7", NP1: "60" }))?.systemId).toBe(
      "coc7",
    );
    expect(parseCharasheetJson(JSON.stringify({ pc_name: "B", game: "sw2", HP: "20" }))?.systemId).toBe(
      "sw25",
    );
    expect(parseCharasheetJson(JSON.stringify({ pc_name: "C", game: "emo", HP: "10" }))?.systemId).toBe(
      "emoklore",
    );
    expect(parseCharasheetJson(JSON.stringify({ pc_name: "D", NP1: "70", NP11: "65" }))?.systemId).toBe(
      "coc7",
    );
    const cs = parseCharasheetJson(
      JSON.stringify({
        pc_name: "水無瀬",
        NP1: "40",
        NP2: "50",
        NP3: "60",
        NP4: "55",
        NP5: "45",
        NP6: "65",
        NP7: "70",
        NP8: "75",
        NP9: "11",
        NP10: "12",
        NP11: "60",
        NP12: "70",
        NP13: "50",
        NP14: "75",
        HP: "99",
        MP: "88",
        SAN: "77",
        pc_making_memo: "メモ",
      }),
    )!;
    expect(cs.stats).toEqual({
      str: 40,
      con: 50,
      pow: 60,
      dex: 55,
      app: 45,
      siz: 65,
      int: 70,
      edu: 75,
      hp: 99,
      mp: 88,
      san: 77,
      idea: 70,
      luck: 50,
      know: 75,
    });
    expect(cs.memo).toBe("メモ");
    expect(parseCharasheetJson("{")).toBeNull();

    // Discord JSON (embeds / bot / authorName) は取り込まない
    expect(
      importLogFromText(
        JSON.stringify({
          channel: { name: "情報" },
          messages: [
            {
              authorName: "system",
              timestamp: "2026-11-10T21:00:00Z",
              content: "◆ シナリオ導入",
              embeds: [{ title: "情景描写", description: "霧が濃くなる。" }],
            },
            {
              authorName: "手動Bot",
              timestamp: "2026-11-10T21:01:00Z",
              content: "(1D100<=50) > 25",
            },
          ],
        }),
      ),
    ).toBeNull();

    // Udonarium XML: DOMParser 経路 (壊れた XML は htmlDoc フォールバックで from/timestamp/type=system を読む) と DOMParser 未定義時
    const htmlFallbackUdo = importLogFromText(
      `<chat-log><chat from="進行役" tab="雑談" timestamp="1794831600000" type="system">案内<br></chat><chat name="" tab="" time="2026-11-10T21:05:00Z">本文<unclosed></chat></chat-log>`,
    )!;
    expect(htmlFallbackUdo.sourceLabel).toBe("Udonarium");
    expect(htmlFallbackUdo.log.channels.find((c) => c.name === "チャット")?.msgs[0]?.kind).toBe("SYSTEM");
    expect(htmlFallbackUdo.log.channels.find((c) => c.name === "メイン")?.msgs[0]?.sp).toBe("不明な発言者");

    const origDomParser = globalThis.DOMParser;
    (globalThis as { DOMParser?: typeof DOMParser }).DOMParser = undefined;
    try {
      const noDomUdo = importLogFromText(
        `<chat-log><chat type="system" time="1794831600">◆ システムノート</chat><chat></chat></chat-log>`,
      )!;
      expect(noDomUdo.sourceLabel).toBe("Udonarium");
      expect(noDomUdo.log.channels[0]?.msgs[0]).toMatchObject({
        sp: "不明な発言者",
        kind: "SYSTEM",
        type: "note",
      });
    } finally {
      (globalThis as { DOMParser?: typeof DOMParser }).DOMParser = origDomParser;
    }

    // importLogFromFile: CCFOLIA ZIP / XML優先度(chat.xml) / TXT入りZIP は拒否 / CCFOLIA HTML file / 破損 ZIP
    const ccLogZip = new JSZip();
    ccLogZip.file(
      "log.json",
      JSON.stringify({ messages: [{ name: "P1", text: "hi", createdAt: 1794831600000 }] }),
    );
    expect(
      (await importLogFromFile(new File([await ccLogZip.generateAsync({ type: "arraybuffer" })], "cc.zip")))
        ?.sourceLabel,
    ).toBe("CCFOLIA");

    const xmlPriorityZip = new JSZip();
    xmlPriorityZip.file("a/other.xml", `<data/>`);
    xmlPriorityZip.file("sub/chat.xml", `<chat-log><chat name="A" time="1794831600">ok</chat></chat-log>`);
    expect(
      (
        await importLogFromFile(
          new File([await xmlPriorityZip.generateAsync({ type: "arraybuffer" })], "u.zip"),
        )
      )?.sourceLabel,
    ).toBe("Udonarium");

    const txtInZip = new JSZip();
    txtInZip.file("room.txt", "[メイン] 凛: ZIP内テキスト");
    expect(
      await importLogFromFile(new File([await txtInZip.generateAsync({ type: "arraybuffer" })], "t.zip")),
    ).toBeNull();

    const ccHtmlFile = new File(
      [
        `<section class="tab"><h2 class="tabtitle">メイン</h2><div class="player"><span class="speaker-text">A</span><div class="player-message">x</div></div></section>`,
      ],
      "c.HTML",
      { type: "text/html" },
    );
    expect((await importLogFromFile(ccHtmlFile))?.sourceLabel).toBe("CCFOLIA");

    // Discord TXT・テキストログ・汎用 HTML・Discord JSON はどれも取り込まない
    for (const raw of [
      "==================================================\n[2026/11/10 21:00] A\n1行目\n2行目\n\nB \u2014 2026/11/10 21:05\n返答",
      [
        "[秘匿1] 23:55 KP: 夜霜: 深夜です",
        "[秘匿1] 00:05 遠沢: 明けました",
        "[メイン] 2026-11-10 21:00:05 進行: 別日ログ",
      ].join("\n"),
      `<html><head><style>.a{color:red}</style></head><body><p>[雑談] A&amp;B: 本文</p><p>[情報] system: ◆ 資料公開</p></body></html>`,
      "{broken json",
      JSON.stringify({ messages: ["bad", { author: { name: "BotName" }, content: "hi" }] }),
      "Channel:   \n[2026-1-2 9:05:10] GM\n◆ 開始宣言",
    ]) {
      expect(importLogFromText(raw)).toBeNull();
    }

    // timestamp <= 1e9 は 0 として扱う
    expect(
      importLogFromText(`<chat-log><chat name="A" time="500">b</chat></chat-log>`)?.log.channels[0]?.msgs[0]
        ?.ts,
    ).toBe(0);

    // importLogFromFile: 破損 ZIP・CCFOLIA でない HTML ファイル・テキスト空ファイル
    const badZipFile = new File([new Uint8Array([1, 2, 3])], "broken.zip", { type: "application/zip" });
    expect(await importLogFromFile(badZipFile)).toBeNull();
    expect(await importLogFromFile(new File(["   "], "empty.txt", { type: "text/plain" }))).toBeNull();
    expect(
      await importLogFromFile(new File([genericHtmlFallbackHtml()], "f.htm", { type: "text/html" })),
    ).toBeNull();
  });
});

function genericHtmlFallbackHtml(): string {
  return "<html><body><p>[メイン] 太郎: テスト発言</p></body></html>";
}
