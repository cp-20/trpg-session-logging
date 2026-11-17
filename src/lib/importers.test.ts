import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import fixtureRaw from "../../e2e/fixtures/ccfolia-sample.json";
import {
  importCharacterFromFile,
  importCharacterFromText,
  importLogFromFile,
  importLogFromText,
} from "./importers";
import { buildIcsCalendar, googleCalendarUrl, icsDataUrl } from "./ics";

describe("importCharacterFromText", () => {
  it("CCFOLIA JSON を取り込む", () => {
    const raw = JSON.stringify({
      kind: "character",
      data: {
        name: "遠沢澄花",
        memo: "地方紙記者",
        color: "#b85d27",
        commands: "CC<=70 目星",
        status: [
          { label: "SAN", value: 52 },
          { label: "HP", value: 11 },
          { label: "MP", value: 12 },
        ],
        params: [{ label: "STR", value: "50" }],
      },
    });
    const res = importCharacterFromText(raw);
    expect(res?.sourceLabel).toBe("CCFOLIA");
    expect(res?.character.name).toBe("遠沢澄花");
    expect(res?.character.systemId).toBe("coc7");
    expect(res?.character.stats).toMatchObject({ san: 52, hp: 11, mp: 12, str: 50 });
  });

  it("キャラクター保管所 JSON (NP1..NP12 / works / pc_making_memo) を取り込む", () => {
    const raw = JSON.stringify({
      pc_name: "灯堂澪",
      works: "古書店店員",
      game: "coc",
      NP1: "45",
      NP2: "50",
      NP3: "60",
      NP9: "10",
      NP10: "12",
      NP11: "60",
      SAN_Left: "51",
      pc_making_memo: "古文書と歴史の判定が得意。",
    });
    const res = importCharacterFromText(raw);
    expect(res?.sourceLabel).toBe("キャラクター保管所");
    expect(res?.character.name).toBe("灯堂澪");
    expect(res?.character.systemId).toBe("coc6");
    expect(res?.character.stats).toMatchObject({ str: 45, con: 50, pow: 60, hp: 10, mp: 12, san: 51 });
    expect(res?.character.memo).toContain("古書店店員");
    expect(res?.character.memo).toContain("古文書と歴史");
  });

  it("キャラクター保管所 JSON (SW2.5 / shuzoku / HP/MP) を取り込む", () => {
    const raw = JSON.stringify({
      pc_name: "アカンタ",
      shuzoku: "エルフ",
      HP: 32,
      MP: 18,
      pc_making_memo: "弓使い",
    });
    const res = importCharacterFromText(raw);
    expect(res?.sourceLabel).toBe("キャラクター保管所");
    expect(res?.character.systemId).toBe("sw25");
    expect(res?.character.stats).toEqual({ hp: 32, mp: 18 });
    expect(res?.character.memo).toContain("種族: エルフ");
  });

  it("いあきゃら (iachara) テキストを取り込む", () => {
    const text = `名前: 白瀬怜
職業: 救急外来看護師
SAN: 58 / 99  HP: 12  MP: 13

【能力値】
STR: 50  CON: 60  POW: 65  DEX: 70
APP: 55  SIZ: 60  INT: 75  EDU: 80

【技能】
応急手当 75%  精神分析 70%  目星 65%

【メモ】
夜間救急で働く看護師。`;

    const res = importCharacterFromText(text);
    expect(res?.sourceLabel).toBe("いあきゃら");
    expect(res?.character.name).toBe("白瀬怜");
    expect(res?.character.systemId).toBe("coc7");
    expect(res?.character.stats).toMatchObject({
      san: 58,
      hp: 12,
      mp: 13,
      str: 50,
      edu: 80,
      応急手当: 75,
      精神分析: 70,
      目星: 65,
    });
    expect(res?.character.memo).toContain("職業: 救急外来看護師");
    expect(res?.character.memo).toContain("夜間救急で働く看護師。");
  });

  it("Udonarium XML を取り込む", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<character>
  <data name="character">
    <data name="image">
      <data type="image" name="imageIdentifier">img_hash_01</data>
    </data>
    <data name="common">
      <data name="name">霧島霞</data>
      <data name="size">1</data>
    </data>
    <data name="detail">
      <data name="ステータス">
        <data type="numberResource" currentValue="11" name="HP">12</data>
        <data type="numberResource" currentValue="10" name="MP">11</data>
        <data type="numberResource" currentValue="64" name="SAN">64</data>
      </data>
      <data name="メモ" type="note">探偵事務所の調査助手</data>
    </data>
  </data>
  <chat-palette dicebot="Cthulhu7th">CC&lt;=70 目星</chat-palette>
</character>`;

    const res = importCharacterFromText(xml);
    expect(res?.sourceLabel).toBe("Udonarium");
    expect(res?.character.name).toBe("霧島霞");
    expect(res?.character.systemId).toBe("coc7");
    expect(res?.character.imageId).toBe("img_hash_01");
    expect(res?.character.stats).toMatchObject({ hp: 11, mp: 10, san: 64 });
    expect(res?.character.memo).toBe("探偵事務所の調査助手");
  });

  it("不正な入力には null を返す", () => {
    expect(importCharacterFromText("")).toBeNull();
    expect(importCharacterFromText("ただのテキスト")).toBeNull();
    expect(importCharacterFromText('{"foo":"bar"}')).toBeNull();
  });
});

describe("importCharacterFromFile", () => {
  it("Udonarium ZIP から character.xml と画像を取り込む", async () => {
    const zip = new JSZip();
    zip.file(
      "character.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<character>
  <data name="character">
    <data name="image"><data type="image" name="imageIdentifier">portrait_hash</data></data>
    <data name="common"><data name="name">天城誠</data></data>
    <data name="detail"><data name="ステータス"><data type="numberResource" currentValue="55" name="SAN">55</data></data></data>
  </data>
</character>`,
    );
    zip.file(
      "portrait_hash.png",
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=",
      { base64: true },
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([buf], "amagi.zip", { type: "application/zip" });
    const res = await importCharacterFromFile(file);
    expect(res?.sourceLabel).toBe("Udonarium");
    expect(res?.character.name).toBe("天城誠");
    expect(res?.character.image).toMatch(/^data:image\/png;base64,/);
  });

  it("CCFOLIA ZIP からキャラと画像を取り込む", async () => {
    const zip = new JSZip();
    zip.file(
      "character.json",
      JSON.stringify({
        kind: "character",
        data: { name: "波多乃波音", imageId: "nami", status: [{ label: "SAN", value: 54 }] },
      }),
    );
    zip.file(
      "images/nami.png",
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=",
      { base64: true },
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const file = new File([buf], "nami.zip", { type: "application/zip" });
    const res = await importCharacterFromFile(file);
    expect(res?.sourceLabel).toBe("CCFOLIA");
    expect(res?.character.name).toBe("波多乃波音");
    expect(res?.character.image).toMatch(/^data:image\/png;base64,/);
  });
});

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

  it("汎用 / Tekey テキストログを取り込む", () => {
    const text = `[メイン] 21:00 KP: 夜霜: それではセッションを始めます。
[メイン] 21:02 遠沢澄花: 「まずは扉の鍵を調べます」
[雑談] 21:03 みかん: ダイス調子良さそう
[メイン] 21:05 KP: 夜霜: ◆ 場面転換：資料室へ`;
    const res = importLogFromText(text);
    expect(res?.sourceLabel).toBe("テキストログ");
    expect(res?.log.messageCount).toBe(4);
    const main = res!.log.channels.find((c) => c.name === "メイン")!;
    expect(main.msgs).toHaveLength(3);
    expect(main.msgs[0]?.kind).toBe("KP");
    expect(main.msgs[2]?.type).toBe("note");
    expect(main.msgs[0]?.ts).toBeGreaterThan(0);
  });

  it("名前「本文」や 時刻 名前: 本文 形式を取り込む", () => {
    const text = `21:05 遠沢澄花: 懐中電灯を取り出します
白瀬怜「後ろからついていきます」`;
    const res = importLogFromText(text);
    expect(res?.sourceLabel).toBe("テキストログ");
    expect(res?.log.messageCount).toBe(2);
    expect(res?.log.channels[0]?.msgs[1]?.sp).toBe("白瀬怜");
    expect(res?.log.channels[0]?.msgs[1]?.text).toBe("「後ろからついていきます」");
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

  it(".txt ファイルからテキストログを取り込む", async () => {
    const file = new File(["[メイン] 太郎: こんにちは"], "log.txt", { type: "text/plain" });
    const res = await importLogFromFile(file);
    expect(res?.sourceLabel).toBe("テキストログ");
    expect(res?.log.messageCount).toBe(1);
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
    expect(gUrl).toContain("https://calendar.google.com/calendar/render?");
    expect(gUrl).toContain("action=TEMPLATE");
    expect(gUrl).toContain("20261121T120000Z%2F20261121T143000Z");
  });
});
