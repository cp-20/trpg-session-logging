// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import fixtureRaw from "../../e2e/fixtures/ccfolia-sample.json";
import {
  guessSystemFromText,
  importCharacterFromFile,
  importCharacterFromText,
  importCharactersFromFiles,
  importCharactersFromText,
  importLogFromFile,
  importLogFromText,
  importLogsFromFiles,
  parseCharasheetJson,
  parseEmokloreCharacter,
  parseIacharaText,
  parseYtsheetJson,
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

describe("拡張パーサー群 (ゆとシートⅡ / エモクロア / 一括 / Discord / どどんとふHTML)", () => {
  it("guessSystemFromText と parseYtsheetJson / parseEmokloreCharacter / parseCharasheetJson を正しく扱う", () => {
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

    const emoJson = parseEmokloreCharacter(
      JSON.stringify({
        system: "emoklore",
        name: "黒崎 律",
        von: 4,
        taisyo: 6,
        hp: 13,
        roots: "探偵",
        emotion: "好奇心",
        skills: { 調査: 3, 知識: 2 },
      }),
    );
    expect(emoJson?.name).toBe("黒崎 律");
    expect(emoJson?.systemId).toBe("emoklore");
    expect(emoJson?.stats).toMatchObject({ von: 4, taisyo: 6, hp: 13, 調査: 3 });

    const emoTxt = parseEmokloreCharacter(
      `共鳴者名: 霧島 透\n職業: 医師\n共鳴感情: 慈愛\n共鳴: 3\nHP: 11\n〈心理学〉[2]\n〈応急手当〉: 3`,
    );
    expect(emoTxt?.name).toBe("霧島 透");
    expect(emoTxt?.stats).toMatchObject({ von: 3, hp: 11, 心理学: 2, 応急手当: 3 });

    const chJson = parseCharasheetJson(
      JSON.stringify({ pc_name: "水無瀬", game: "coc6", NP1: "12", HP: "10", MP: "14" }),
    );
    expect(chJson?.name).toBe("水無瀬");
    expect(chJson?.systemId).toBe("coc6");
    expect(parseIacharaText("ただのメモ")).toBeNull();
  });

  it("importCharactersFromText & importCharactersFromFiles で複数キャラ・ZIP を一括取得できる", async () => {
    const arr = JSON.stringify([
      { characterName: "エルナ", hpTotal: 30, mpTotal: 20 },
      { system: "emoklore", name: "黒崎 律", von: 3, taisyo: 6 },
    ]);
    const batchText = importCharactersFromText(arr);
    expect(batchText).toHaveLength(2);
    expect(batchText[0]?.sourceLabel).toBe("ゆとシートⅡ");
    expect(batchText[1]?.sourceLabel).toBe("エモクロア");

    const divided = importCharactersFromText(
      `名前: 太郎\nSTR: 50\nCON: 50\nSAN: 60\n---\n共鳴者名: 花子\n共鳴: 3\n〈調査〉[2]`,
    );
    expect(divided).toHaveLength(2);

    const zip = new JSZip();
    zip.file(
      "taro.xml",
      `<character><data name="common"><data name="name">ユドナ太郎</data><data name="HP" type="numberResource" currentValue="10">12</data></data></character>`,
    );
    zip.file("hanako.json", JSON.stringify({ system: "emoklore", name: "ジプ花子", von: 2, taisyo: 5 }));
    const zipBuf = await zip.generateAsync({ type: "arraybuffer" });
    const zipFile = new File([zipBuf], "chars.zip", { type: "application/zip" });
    const textFile = new File([JSON.stringify({ characterName: "単体", hpTotal: 15 })], "single.json", {
      type: "application/json",
    });

    const filesOut = await importCharactersFromFiles([zipFile, textFile]);
    expect(filesOut.map((x) => x.character.name)).toEqual(["ユドナ太郎", "ジプ花子", "単体"]);
  });

  it("Discord JSON/TXT・どどんとふ HTML・複数ログファイルを正しく取り込む", async () => {
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
    const dJsonRes = importLogFromText(discordJson);
    expect(dJsonRes?.sourceLabel).toBe("Discord");
    expect(dJsonRes?.log.channels[0]?.name).toBe("本編セッション");
    expect(dJsonRes?.log.channels[0]?.msgs[1]?.roll).toEqual({
      cmd: "1D100<=70",
      skill: "目星",
      dice: "24",
      result: "成功",
    });

    const discordTxt = `Channel: 雑談卓
==================================================
[2026/11/10 21:00] 遠沢澄花 (uid1)
懐中電灯で照らします。
1D100<=65 (CC<=65) ＞ 31 ＞ 成功

KP佐々 \u2014 2026/11/10 21:02
扉の奥に日誌が見つかります。`;
    const dTxtRes = importLogFromText(discordTxt);
    expect(dTxtRes?.sourceLabel).toBe("Discord");
    expect(dTxtRes?.log.channels[0]?.name).toBe("雑談卓");
    expect(dTxtRes?.log.messageCount).toBe(2);

    const genericHtml = `<html><body><p>[メイン] 探索者A：部屋を調べます</p><p>GM：本棚に鍵があります</p></body></html>`;
    const htmlFile = new File([genericHtml], "dodon.html", { type: "text/html" });
    const txtFile = new File(["[メイン] 探偵: 手がかりを発見"], "extra.txt", { type: "text/plain" });
    const batchLogs = await importLogsFromFiles([htmlFile, txtFile]);
    expect(batchLogs).toHaveLength(2);
    expect(batchLogs[0]?.sourceLabel).toBe("どどんとふ / HTML");
    expect(batchLogs[1]?.fileName).toBe("extra.txt");
  });

  it("個別文字シート・一括区切り/JSON配列・ZIP破損・Discord/テキスト/HTMLログ境界を網羅する", async () => {
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

    // parseEmokloreCharacter (resonance / ego / 不正JSON / 名前なしテキスト / 共鳴感情・ルーツなし)
    const emoAlt = parseEmokloreCharacter(
      JSON.stringify({
        system: "emoklore",
        name: "黒崎",
        resonance: 5,
        ego: 2,
      }),
    )!;
    expect(emoAlt.stats).toMatchObject({ von: 5, taisyo: 2 });
    expect(parseEmokloreCharacter("{broken")).toBeNull();
    expect(parseEmokloreCharacter("共鳴: 3")).toBeNull();

    // parseIacharaText 日本語キー (SAN値/正気度/幸運/アイデア/知識) と CoC6/CoC7
    const coc6Txt = parseIacharaText(
      "名前: 佐藤\n【能力値】\nSTR: 11\nCON: 10\nPOW: 12\nDEX: 9\nAPP: 10\nSIZ: 12\nINT: 14\nEDU: 15\nSAN値: 60\n正気度: 61\n幸運: 50\nアイデア: 70\n知識: 75\n【探索者メモ】\n古いメモ",
    );
    expect(coc6Txt?.systemId).toBe("coc6");
    expect(coc6Txt?.stats).toMatchObject({
      str: 11,
      con: 10,
      pow: 12,
      dex: 9,
      app: 10,
      siz: 12,
      int: 14,
      edu: 15,
      san: 61,
      幸運: 50,
      アイデア: 70,
      知識: 75,
    });
    expect(coc6Txt?.memo).toBe("古いメモ");

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

    // importCharactersFromText: 空入力 / 不正 JSON 配列 / 内部 '---' を1キャラとして扱う
    expect(importCharactersFromText("   ")).toEqual([]);
    expect(importCharactersFromText("[broken json")).toEqual([]);
    const singleWithHr = importCharactersFromText("名前: 凛\nSTR: 50\nSAN: 60\n---\nメモだけのセクション");
    expect(singleWithHr).toHaveLength(1);
    expect(singleWithHr[0]?.character.name).toBe("凛");

    // importCharactersFromFiles & importCharacterFromFile: Udonarium XML+JPEG/GIF/WEBP・CCFOLIA images/・MIME=application/zip・破損 ZIP
    const udoImgZip = new JSZip();
    udoImgZip.file(
      "u.xml",
      `<character><data name="image"><data name="imageIdentifier" type="image">avatar</data></data><data name="common"><data name="name">図像U</data></data></character>`,
    );
    udoImgZip.file("avatar.jpeg", "AQID", { base64: true });
    const udoSingle = await importCharacterFromFile(
      new File([await udoImgZip.generateAsync({ type: "arraybuffer" })], "arch.bin", {
        type: "application/zip",
      }),
    );
    expect(udoSingle?.sourceLabel).toBe("Udonarium");
    expect(udoSingle?.character.image).toMatch(/^data:image\/jpeg;base64,/);

    // importCharactersFromFiles: Udonarium ZIP内キャラクター + CCFOLIA生JSON + gif/webp 画像 + ZIP フォールバック
    const mixZip = new JSZip();
    mixZip.file(
      "u.xml",
      `<character><data name="image"><data name="imageIdentifier" type="image">uimg.gif</data></data><data name="common"><data name="name">図像U2</data></data><data name="SAN値">58</data><data name="メモ">行1</data><data name="説明" type="note">行2</data></character>`,
    );
    mixZip.file("uimg.gif", "AQID", { base64: true });
    mixZip.file(
      "chars/cc_raw.txt",
      JSON.stringify({ kind: "character", data: { name: "生CC", imageId: "hero2" } }),
    );
    mixZip.file("images/hero2.webp", "AQID", { base64: true });
    const mixFile = new File([await mixZip.generateAsync({ type: "arraybuffer" })], "mix.zip", {
      type: "application/zip",
    });
    const badZipFile = new File([new Uint8Array([1, 2, 3])], "broken.zip", { type: "application/zip" });
    expect(await importCharacterFromFile(badZipFile)).toBeNull();
    const charsFromZip = await importCharactersFromFiles([mixFile, badZipFile]);
    expect(charsFromZip.map((x) => x.character.name)).toEqual(["図像U2", "生CC"]);
    expect(charsFromZip[0]?.character.stats).toEqual({ san: 58 });
    expect(charsFromZip[0]?.character.memo).toBe("行1\n行2");
    expect(charsFromZip[0]?.character.image).toMatch(/^data:image\/gif;base64,/);
    expect(charsFromZip[1]?.character.image).toMatch(/^data:image\/webp;base64,/);

    // 画像拡張子なし・CCFフォールバック path (foundInZip === 0 の ZIP に単体キャラ)
    const fallbackZip = new JSZip();
    fallbackZip.file("single.json", JSON.stringify({ kind: "character", data: { name: "単体Fallback" } }));
    expect(
      (
        await importCharactersFromFiles([
          new File([await fallbackZip.generateAsync({ type: "arraybuffer" })], "fb.zip"),
        ])
      )[0]?.character.name,
    ).toBe("単体Fallback");

    // Discord JSON: embeds / bot / authorName / top-level channel / ◆ノート / info 正規化
    const dEmbed = importLogFromText(
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
    )!;
    expect(dEmbed.sourceLabel).toBe("Discord");
    expect(dEmbed.log.channels[0]?.name).toBe("情報");
    expect(dEmbed.log.channels[0]?.msgs[0]?.type).toBe("note");
    expect(dEmbed.log.channels[0]?.msgs[1]?.roll).toEqual({
      cmd: "1D100<=50",
      skill: "",
      dice: "25",
      result: "判定",
    });

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

    // importLogFromFile: CCFOLIA ZIP / XML優先度(chat.xml) / TXT入りZIP / CCFOLIA HTML file / 破損 ZIP
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
      (await importLogFromFile(new File([await txtInZip.generateAsync({ type: "arraybuffer" })], "t.zip")))
        ?.sourceLabel,
    ).toBe("テキストログ");

    const ccHtmlFile = new File(
      [
        `<section class="tab"><h2 class="tabtitle">メイン</h2><div class="player"><span class="speaker-text">A</span><div class="player-message">x</div></div></section>`,
      ],
      "c.HTML",
      { type: "text/html" },
    );
    expect((await importLogFromFile(ccHtmlFile))?.sourceLabel).toBe("CCFOLIA");

    // Discord TXT: === 区切り + 複数行
    const dMulti = importLogFromText(
      "==================================================\n[2026/11/10 21:00] A\n1行目\n2行目\n\nB \u2014 2026/11/10 21:05\n返答",
    )!;
    expect(dMulti.log.channels[0]?.msgs[0]?.text).toBe("1行目\n2行目");

    // テキストログ: 日付+秒 / 時刻のみの日またぎ (23:55 から 00:05) / https・mailto スキップ / ◆ノート / 時刻なし継承
    const rollover = importLogFromText(
      [
        "[秘匿1] 23:55 KP: 夜霜: 深夜です",
        "[秘匿1] 00:05 遠沢: 明けました",
        "https://example.com",
        "mailto:test@example.com",
        "[秘匿1] 00:10 KP: ◆ ノート",
        "[秘匿1] 遠沢: 時刻継承",
        "[メイン] 2026-11-10 21:00:05 進行: 別日ログ",
      ].join("\n"),
    )!;
    expect(rollover.sourceLabel).toBe("テキストログ");
    const secretCh = rollover.log.channels.find((c) => c.name === "秘匿1")!;
    expect(secretCh.secret).toBe(false); // 発言者3人? いや KP: 夜霜 / 遠沢 / KP で3名なので secret=false
    expect(secretCh.msgs).toHaveLength(4);
    expect(secretCh.msgs[1]!.ts).toBeGreaterThan(secretCh.msgs[0]!.ts);
    expect(secretCh.msgs[2]?.type).toBe("note");
    expect(secretCh.msgs[3]?.ts).toBe(secretCh.msgs[2]?.ts);
    const mainCh = rollover.log.channels.find((c) => c.name === "メイン")!;
    expect(mainCh.msgs[0]?.ts).toBeGreaterThan(0);

    // 汎用 HTML: エンティティ展開・style/script除去・情報/雑談チャネル・◆ノート・URL スキップ
    const entityHtml = importLogFromText(
      `<html><head><style>.a{color:red}</style><script>bad: code</script></head><body><p>[雑談] A&amp;B: 本文 &lt;確認&gt; &quot;ok&quot;</p><p>[情報] system: ◆ 資料公開</p><p>https://skip.example.com</p></body></html>`,
    )!;
    expect(entityHtml.sourceLabel).toBe("どどんとふ / HTML");
    const htmlChat = entityHtml.log.channels.find((c) => c.name === "チャット")!;
    expect(htmlChat.secret).toBe(false);
    expect(htmlChat.msgs[0]).toMatchObject({
      sp: "A&B",
      text: '本文 <確認> "ok"',
    });
    const htmlInfo = entityHtml.log.channels.find((c) => c.name === "情報")!;
    expect(htmlInfo.msgs[0]).toMatchObject({ sp: "system", kind: "SYSTEM", type: "note" });

    // Discord JSON: broken/empty + author.name fallback + Discord TXT: empty Channel & ◆ note & sorted Udonarium epoch
    expect(importLogFromText("{broken json")).toBeNull();
    expect(
      importLogFromText(JSON.stringify({ messages: ["bad", { author: { name: "BotName" }, content: "hi" }] }))
        ?.log.channels[0]?.msgs[0]?.sp,
    ).toBe("BotName");
    const dNote = importLogFromText("Channel:   \n[2026-1-2 9:05:10] GM\n◆ 開始宣言")!;
    expect(dNote.log.channels[0]?.name).toBe("メイン");
    expect(dNote.log.channels[0]?.msgs[0]).toMatchObject({ kind: "KP", type: "note" });

    // Udonarium 大きな画像 (> 0x8000 bytes でチャンク分割) と timestamp <= 1e9 の 0 扱い
    const largeZip = new JSZip();
    largeZip.file(
      "hero.xml",
      `<character><data name="image"><data name="imageIdentifier" type="image">big.png</data></data><data name="common"><data name="name">大画像U</data></data></character>`,
    );
    largeZip.file("big.png", new Uint8Array(40000));
    const largeRes = await importCharacterFromFile(
      new File([await largeZip.generateAsync({ type: "arraybuffer" })], "large.zip", {
        type: "application/zip",
      }),
    );
    expect(largeRes?.character.image).toMatch(/^data:image\/png;base64,/);
    expect(
      importLogFromText(`<chat-log><chat name="A" time="500">b</chat></chat-log>`)?.log.channels[0]?.msgs[0]
        ?.ts,
    ).toBe(0);

    // importLogFromFile: 破損 ZIP・HTML ファイル・テキスト空ファイル
    expect(await importLogFromFile(badZipFile)).toBeNull();
    expect(await importLogFromFile(new File(["   "], "empty.txt", { type: "text/plain" }))).toBeNull();
    const htmlLogRes = await importLogFromFile(
      new File([genericHtmlFallbackHtml()], "f.htm", { type: "text/html" }),
    );
    expect(htmlLogRes?.log.messageCount).toBe(1);
  });
});

function genericHtmlFallbackHtml(): string {
  return "<html><body><p>[メイン] 太郎: テスト発言</p></body></html>";
}
