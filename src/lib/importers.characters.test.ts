// @vitest-environment jsdom
/**
 * キャラシサイトの JSON（ゆとシートⅡ / キャラクター保管所）の境界値テスト。
 * 各フィールドの読み取り元・優先順位・システム推定の閾値を、戻り値の完全一致で確かめる。
 */
import { describe, expect, it } from "vitest";
import { guessSystemFromText, parseCharasheetJson, parseYtsheetJson } from "./importers";

const sheet = (o: Record<string, unknown>) => JSON.stringify({ pc_name: "灯堂澪", ...o });
const yt = (o: Record<string, unknown>) => JSON.stringify({ characterName: "ルカ", ...o });

describe("guessSystemFromText", () => {
  it.each([
    ["Cthulhu7th", "coc7"],
    ["クトゥルフ神話TRPG第7版", "coc7"],
    ["クトゥルフ神話TRPG7", "coc7"],
    ["CoC 7", "coc7"],
    ["CoC7", "coc7"],
    ["新版 7版", "coc7"],
    ["Cthulhu", "coc6"],
    ["CCB<=50", "coc6"],
    ["クトゥルフ神話TRPG6", "coc6"],
    ["CoC 6", "coc6"],
    ["CoC6", "coc6"],
    ["6版", "coc6"],
    ["SwordWorld2.5", "sw25"],
    ["SW2.5", "sw25"],
    ["ソードワールド", "sw25"],
    ["ソード・ワールド", "sw25"],
    ["Emoklore", "emoklore"],
    ["エモクロア", "emoklore"],
    ["共鳴", "emoklore"],
    ["CC<=70 目星", "coc7"],
    ["CC 70", "coc7"],
    ["XCC<=70", undefined],
    ["CCX", undefined],
    ["", undefined],
  ])("%j → %j", (text, want) => {
    expect(guessSystemFromText(text)).toBe(want);
  });
});

describe("parseCharasheetJson (キャラクター保管所)", () => {
  it.each([
    [12, 12],
    [" 45 ", 45],
    ["-3", -3],
    ["4.55", 4.55],
    ["4.5", 4.5],
    ["45abc", undefined],
    ["abc45", undefined],
    ["4.", undefined],
    ["0x10", undefined],
    [" ", undefined],
    ["", undefined],
    ["1e3", undefined],
    ["9".repeat(400), undefined],
    [true, undefined],
    [null, undefined],
  ])("数値 NP1=%j → str=%j", (v, want) => {
    const c = parseCharasheetJson(sheet({ NP1: v }));
    expect(c?.stats).toStrictEqual(want === undefined ? {} : { str: want });
  });

  it("Infinity (1e999) は数値として扱わない", () => {
    expect(parseCharasheetJson('{"pc_name":"a","NP1":1e999}')?.stats).toStrictEqual({});
  });

  it("NP1..NP14 をすべて対応する能力値に割り当てる", () => {
    const np = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`NP${i + 1}`, i + 1]));
    expect(parseCharasheetJson(sheet(np))?.stats).toStrictEqual({
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
      idea: 12,
      luck: 13,
      know: 14,
    });
  });

  it.each([
    [{ SAN_Left: 40, SAN: 30, san: 20 }, { san: 40 }],
    [{ SAN: 30, san: 20 }, { san: 30 }],
    [{ san: 20 }, { san: 20 }],
    [{ HP: 9, hp: 8 }, { hp: 9 }],
    [{ hp: 8 }, { hp: 8 }],
    [{ MP: 7, mp: 6 }, { mp: 7 }],
    [{ mp: 6 }, { mp: 6 }],
    [{ NP9: 10, HP: 3 }, { hp: 3 }],
    [{ SAN: "x", san: 5 }, { san: 5 }],
  ])("直接の SAN/HP/MP %j → %j", (fields, want) => {
    expect(parseCharasheetJson(sheet(fields))?.stats).toStrictEqual(want);
  });

  it.each([
    [{ works: " 古書店員 " }, "職業: 古書店員"],
    [{ shuzoku: " エルフ " }, "種族: エルフ"],
    [{ works: "医師", shuzoku: "人間" }, "職業: 医師"],
    [{ pc_making_memo: " メモ本文 " }, "メモ本文"],
    [{ works: "医師", pc_making_memo: "メモ" }, "職業: 医師\nメモ"],
    [{ works: "   ", pc_making_memo: "   " }, undefined],
    [{}, undefined],
  ])("メモ %j → %j", (fields, want) => {
    expect(parseCharasheetJson(sheet(fields))?.memo).toBe(want);
  });

  it.each([
    [{ game: "coc7" }, "coc7"],
    [{ game: "7" }, "coc7"],
    [{ game: "CoC" }, "coc6"],
    [{ game: "coc6" }, "coc6"],
    [{ game: "sw2" }, "sw25"],
    [{ game: "emo" }, "emoklore"],
    [{ game: "dx3" }, undefined],
    [{ game: "dx3", shuzoku: "エルフ" }, "sw25"],
    [{ shuzoku: "エルフ" }, "sw25"],
    [{ shuzoku: "人間", SAN: 50 }, "coc6"],
    [{ NP1: 50 }, undefined],
    [{ NP11: "?" }, "coc6"],
    [{ SAN: 50 }, "coc6"],
    [{ SAN: 50, NP1: 24, NP8: 24 }, "coc6"],
    [{ SAN: 50, NP1: 25 }, "coc7"],
    [{ SAN: 50, NP8: 25 }, "coc7"],
    [{ SAN: 50, NP8: 26 }, "coc7"],
    [{}, undefined],
  ])("システム推定 %j → %j", (fields, want) => {
    expect(parseCharasheetJson(sheet(fields))?.systemId).toBe(want);
  });

  it("名前は前後の空白を除き、無い・JSON でない・オブジェクトでないときは null", () => {
    expect(parseCharasheetJson(sheet({ pc_name: "  灯堂  " }))?.name).toBe("灯堂");
    expect(parseCharasheetJson(sheet({ pc_name: "   " }))).toBeNull();
    expect(parseCharasheetJson(sheet({ pc_name: 1 }))).toBeNull();
    expect(parseCharasheetJson("null")).toBeNull();
    expect(parseCharasheetJson("[]")).toBeNull();
    expect(parseCharasheetJson('"灯堂"')).toBeNull();
    expect(parseCharasheetJson("{")).toBeNull();
  });

  it("結果の形を完全一致で返す", () => {
    expect(parseCharasheetJson(sheet({ works: "医師", NP1: 50 }))).toStrictEqual({
      name: "灯堂澪",
      memo: "職業: 医師",
      systemId: undefined,
      stats: { str: 50 },
    });
  });
});

describe("parseYtsheetJson (ゆとシートⅡ)", () => {
  it.each([
    ["characterName", { characterName: "A" }],
    ["sttStr", { pcName: "A", sttStr: 1 }],
    ["hpTotal", { pcName: "A", hpTotal: 1 }],
    ["lv", { pcName: "A", lv: "1" }],
    ["level", { pcName: "A", level: "1" }],
    ["gameSystem", { name: "A", gameSystem: "x" }],
    ["ver", { name: "A", ver: 1 }],
  ])("%s があればゆとシートとして読む", (_, fields) => {
    expect(parseYtsheetJson(JSON.stringify(fields))?.name).toBe("A");
  });

  it("ゆとシートの目印や名前が無ければ null", () => {
    expect(parseYtsheetJson(JSON.stringify({ pcName: "A" }))).toBeNull();
    expect(parseYtsheetJson(JSON.stringify({ name: "A", HP: 3 }))).toBeNull();
    expect(parseYtsheetJson(JSON.stringify({ sttStr: 3 }))).toBeNull();
    expect(parseYtsheetJson(JSON.stringify({ characterName: "  " }))).toBeNull();
    expect(parseYtsheetJson("null")).toBeNull();
    expect(parseYtsheetJson("[1]")).toBeNull();
    expect(parseYtsheetJson("{")).toBeNull();
  });

  it("名前は characterName → pcName → name の順で、前後の空白を除く", () => {
    expect(parseYtsheetJson(JSON.stringify({ characterName: " A ", pcName: "B", name: "C" }))?.name).toBe(
      "A",
    );
    expect(parseYtsheetJson(JSON.stringify({ pcName: " B ", name: "C", ver: 1 }))?.name).toBe("B");
  });

  it.each([
    ["hpTotal", "hp"],
    ["HP", "hp"],
    ["hp", "hp"],
    ["statusHp", "hp"],
    ["mpTotal", "mp"],
    ["MP", "mp"],
    ["mp", "mp"],
    ["statusMp", "mp"],
    ["sanTotal", "san"],
    ["SAN", "san"],
    ["san", "san"],
    ["sanLeft", "san"],
    ["sttStr", "str"],
    ["STR", "str"],
    ["statusStr", "str"],
    ["sttDex", "dex"],
    ["DEX", "dex"],
    ["statusDex", "dex"],
    ["sttAgi", "agi"],
    ["AGI", "agi"],
    ["sttVit", "vit"],
    ["CON", "vit"],
    ["statusCon", "vit"],
    ["sttInt", "int"],
    ["INT", "int"],
    ["statusInt", "int"],
    ["sttMnd", "mnd"],
    ["POW", "mnd"],
    ["statusPow", "mnd"],
  ])("%s → stats.%s", (field, key) => {
    expect(parseYtsheetJson(yt({ [field]: "7" }))?.stats).toStrictEqual({ [key]: 7 });
  });

  it("同じ能力値の候補は先のものを優先し、数値でないものは飛ばす", () => {
    expect(parseYtsheetJson(yt({ hpTotal: 30, HP: 20, hp: 10 }))?.stats).toStrictEqual({ hp: 30 });
    expect(parseYtsheetJson(yt({ hpTotal: "x", HP: 20 }))?.stats).toStrictEqual({ hp: 20 });
    expect(parseYtsheetJson(yt({}))?.stats).toStrictEqual({});
  });

  it.each([
    [{ race: " エルフ " }, "種族: エルフ"],
    [{ job: " ファイター " }, "職業: ファイター"],
    [{ class: "スカウト" }, "職業: スカウト"],
    [{ works: "医師" }, "職業: 医師"],
    [{ job: "A", class: "B", works: "C" }, "職業: A"],
    [{ class: "B", works: "C" }, "職業: B"],
    [{ race: "エルフ", job: "ファイター" }, "種族: エルフ / 職業: ファイター"],
    [{ level: "3" }, "Lv.3"],
    [{ lv: "4" }, "Lv.4"],
    [{ level: "3", lv: "4" }, "Lv.3"],
    [{ level: 3 }, undefined],
    [{ freeNote: " 自由記述 " }, "自由記述"],
    [{ profile: "経歴" }, "経歴"],
    [{ memo: "メモ" }, "メモ"],
    [{ freeNote: "A", profile: "B", memo: "C" }, "A"],
    [{ profile: "B", memo: "C" }, "B"],
    [{ freeNote: "a&lt;br /&gt;b&lt;br&gt;c<br>d<br/>e<BR />f" }, "a\nb\nc\nd\ne\nf"],
    [{ race: "エルフ", level: "2", freeNote: "弓" }, "種族: エルフ\nLv.2\n弓"],
    [{}, undefined],
  ])("メモ %j → %j", (fields, want) => {
    expect(parseYtsheetJson(yt(fields))?.memo).toBe(want);
  });

  it.each([
    [{ gameSystem: "Cthulhu7th" }, "coc7"],
    [{ gameSystem: "Cthulhu7th", race: "人間" }, "coc7"],
    [{ race: "CoC7の人間" }, "coc7"],
    [{ job: "エモクロア" }, "emoklore"],
    [{ freeNote: "CoC6 用" }, "coc6"],
    [{ sttAgi: 10 }, "sw25"],
    [{ sttMnd: 10 }, "sw25"],
    [{ race: "エルフ" }, "sw25"],
    [{ SAN: 50 }, "coc6"],
    [{ SAN: 50, STR: 24 }, "coc6"],
    [{ SAN: 50, STR: 25 }, "coc7"],
    [{ STR: 60 }, undefined],
    [{}, undefined],
  ])("システム推定 %j → %j", (fields, want) => {
    expect(parseYtsheetJson(yt(fields))?.systemId).toBe(want);
  });

  it.each([
    [{ imageURL: "https://example.com/a.png" }, "https://example.com/a.png"],
    [{ imageUrl: " HTTPS://example.com/b.png " }, "HTTPS://example.com/b.png"],
    [{ imageURL: "https://x/1.png", imageUrl: "https://x/2.png" }, "https://x/1.png"],
    [{ imageURL: "http://example.com/a.png" }, undefined],
    [{ imageURL: "javascript:https://x" }, undefined],
    [{ imageURL: "" }, undefined],
  ])("画像 %j → %j", (fields, want) => {
    const c = parseYtsheetJson(yt(fields))!;
    expect(c.image).toBe(want);
    expect("image" in c).toBe(want !== undefined);
  });

  it("結果の形を完全一致で返す", () => {
    expect(parseYtsheetJson(yt({ race: "エルフ", sttAgi: 12 }))).toStrictEqual({
      name: "ルカ",
      memo: "種族: エルフ",
      systemId: "sw25",
      stats: { agi: 12 },
    });
  });
});
