// @vitest-environment jsdom
/**
 * キャラクター取り込み (ゆとシートⅡ / キャラクター保管所 / エモクロア / いあきゃら / Udonarium) の境界値テスト。
 * 各フィールドの読み取り元・優先順位・システム推定の閾値を、戻り値の完全一致で確かめる。
 */
import { describe, expect, it } from "vitest";
import {
  guessSystemFromText,
  importCharacterFromText,
  importCharactersFromText,
  parseCharasheetJson,
  parseEmokloreCharacter,
  parseIacharaText,
  parseYtsheetJson,
} from "./importers";

const sheet = (o: Record<string, unknown>) => JSON.stringify({ pc_name: "灯堂澪", ...o });
const yt = (o: Record<string, unknown>) => JSON.stringify({ characterName: "ルカ", ...o });
const emo = (o: Record<string, unknown>) => JSON.stringify({ name: "結城", von: 3, ...o });

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

describe("parseEmokloreCharacter (JSON)", () => {
  it.each([
    ["system", { name: "A", system: "EMOKLORE" }],
    ["resonance", { name: "A", resonance: 1 }],
    ["taisyo", { name: "A", taisyo: 1 }],
    ["von", { name: "A", von: 1 }],
    ["emotion", { name: "A", emotion: "x" }],
  ])("%s があればエモクロアとして読む", (_, fields) => {
    expect(parseEmokloreCharacter(JSON.stringify(fields))?.name).toBe("A");
  });

  it("目印・名前が無い / JSON が壊れているときは null", () => {
    expect(parseEmokloreCharacter(JSON.stringify({ name: "A" }))).toBeNull();
    expect(parseEmokloreCharacter(JSON.stringify({ name: "A", system: "coc" }))).toBeNull();
    expect(parseEmokloreCharacter(JSON.stringify({ von: 1 }))).toBeNull();
    expect(parseEmokloreCharacter(JSON.stringify({ von: 1, name: "  " }))).toBeNull();
    expect(parseEmokloreCharacter("{ broken")).toBeNull();
    expect(parseEmokloreCharacter("   ")).toBeNull();
  });

  it("前後の空白を許し、名前は name → characterName", () => {
    expect(parseEmokloreCharacter(`  ${emo({})}  `)?.name).toBe("結城");
    expect(parseEmokloreCharacter(JSON.stringify({ characterName: " 千早 ", von: 1 }))?.name).toBe("千早");
  });

  it.each([
    [{ von: 3 }, { von: 3 }],
    [{ von: undefined, resonance: "4" }, { von: 4 }],
    [{ von: "x" }, {}],
    [{ taisyo: 2 }, { von: 3, taisyo: 2 }],
    [{ ego: 5 }, { von: 3, taisyo: 5 }],
    [{ hp: 9 }, { von: 3, hp: 9 }],
    [{ HP: 8 }, { von: 3, hp: 8 }],
    [{ skills: { 運動: 2, 知覚: "3", 交渉: "x" } }, { von: 3, 運動: 2, 知覚: 3 }],
    [{ skills: [1, 2] }, { von: 3 }],
  ])("能力値 %j → %j", (fields, want) => {
    expect(parseEmokloreCharacter(emo(fields))?.stats).toStrictEqual(want);
  });

  it.each([
    [{ roots: "学生", emotion: "好奇心", memo: "備考" }, "ルーツ: 学生\n共鳴感情: 好奇心\n備考"],
    [{ emotion: "好奇心" }, "共鳴感情: 好奇心"],
    [{ memo: "備考" }, "備考"],
    [{}, undefined],
  ])("メモ %j → %j", (fields, want) => {
    expect(parseEmokloreCharacter(emo(fields))).toStrictEqual({
      name: "結城",
      memo: want,
      systemId: "emoklore",
      stats: { von: 3 },
    });
  });
});

describe("parseEmokloreCharacter (テキスト)", () => {
  const base = "共鳴者名: 結城";
  it.each([
    ["共鳴者名: 結城\n共鳴感情: 好奇心", "結城"],
    ["共鳴者名:結城\n共鳴感情: x", "結城"],
    ["共鳴者名 : 結城\n共鳴感情: x", "結城"],
    ["名前: 結城\nエモクロア", "結城"],
    ["旧名前: 偽物\n名前: 結城\nエモクロア", "結城"],
  ])("名前 %j → %j", (text, want) => {
    expect(parseEmokloreCharacter(text)?.name).toBe(want);
  });

  it("目印か名前行が無ければ null", () => {
    expect(parseEmokloreCharacter("名前: 結城\nクトゥルフ")).toBeNull();
    expect(parseEmokloreCharacter("エモクロア\n名無し")).toBeNull();
    for (const marker of ["共鳴者", "共鳴感情", "DM<=", "EMOKLORE", "エモクロア"]) {
      expect(parseEmokloreCharacter(`名前: 結城\n${marker}`)?.name).toBe("結城");
    }
  });

  it.each([
    ["共鳴: 5", { von: 5 }],
    ["共鳴度:12", { von: 12 }],
    ["共鳴度 : 7", { von: 7 }],
    ["共鳴度 8", { von: 8 }],
    ["HP: 12", { hp: 12 }],
    ["HP : 9", { hp: 9 }],
    ["HP 7", { hp: 7 }],
    ["hp:6", { hp: 6 }],
    ["〈運動〉 [3]", { 運動: 3 }],
    ["〈運動〉[12]", { 運動: 12 }],
    ["〈知覚〉: 12", { 知覚: 12 }],
    ["〈知覚〉:4", { 知覚: 4 }],
    ["〈交渉〉12", { 交渉: 12 }],
    ["〈 交渉 〉 2", { 交渉: 2 }],
  ])("能力値 %j → %j", (line, want) => {
    expect(parseEmokloreCharacter(`${base}\n${line}`)?.stats).toStrictEqual(want);
  });

  it.each([
    ["職業: 学生", "職業: 学生"],
    ["職業 : 学生  \n共鳴", "職業: 学生"],
    ["ルーツ:学生", "職業: 学生"],
    ["前職業: 偽\n職業: 学生", "職業: 学生"],
    ["共鳴感情: 好奇心", "共鳴感情: 好奇心"],
    ["共鳴感情 :好奇心  \n共鳴", "共鳴感情: 好奇心"],
    ["旧共鳴感情: 偽\n共鳴感情: 恐怖", "共鳴感情: 恐怖"],
    ["職業: 学生\n共鳴感情: 好奇心", "職業: 学生\n共鳴感情: 好奇心"],
    ["共鳴", undefined],
  ])("メモ %j → %j", (lines, want) => {
    expect(parseEmokloreCharacter(`${base}\n${lines}`)).toStrictEqual({
      name: "結城",
      memo: want,
      systemId: "emoklore",
      stats: {},
    });
  });
});

describe("parseIacharaText (いあきゃら)", () => {
  it.each([
    ["名前: 白瀬怜\nHP: 10", "白瀬怜"],
    ["名前:白瀬怜\nHP: 10", "白瀬怜"],
    ["名前 : 白瀬怜\nHP: 10", "白瀬怜"],
    ["名前：白瀬怜  \nHP: 10", "白瀬怜"],
    ["本名前: 偽\n名前: 白瀬怜\nHP: 10", "白瀬怜"],
  ])("名前 %j → %j", (text, want) => {
    expect(parseIacharaText(text)?.name).toBe(want);
  });

  it.each([
    ["名前: 白瀬怜\n職業: 看護師"],
    ["名前: 白瀬怜\n職業 : 看護師"],
    ["名前: 白瀬怜\n【能力値】"],
    ["名前: 白瀬怜\n【ステータス】"],
    ["名前: 白瀬怜\n【技能】"],
    ["名前: 白瀬怜\n【メモ】"],
    ["名前: 白瀬怜\n【基本情報】"],
    ["名前: 白瀬怜\n【プロフィール】"],
    ["名前: 白瀬怜\nSAN: 50"],
    ["名前: 白瀬怜\nhp : 5"],
    ["名前: 白瀬怜\nMP:5"],
  ])("目印があれば読む: %j", (text) => {
    expect(parseIacharaText(text)?.name).toBe("白瀬怜");
  });

  it.each([
    ["名前: 白瀬怜\nただのメモ"],
    ["名前: 白瀬怜\n前職業: 看護師"],
    ["名前: 白瀬怜\nSAN: x"],
    ["名前: 白瀬怜\nXSAN: 5"],
    ["HP: 10"],
    ["HP: 10\n名前:   "],
  ])("目印か名前が無ければ null: %j", (text) => {
    expect(parseIacharaText(text)).toBeNull();
  });

  it("職業はメモ先頭に入り、メモ・探索者メモ・プロフィールの順で本文を探す", () => {
    expect(parseIacharaText("名前: A\n職業 : 看護師  \n【メモ】\n本文")?.memo).toBe("職業: 看護師\n本文");
    expect(parseIacharaText("名前: A\n職業:看護師")?.memo).toBe("職業: 看護師");
    expect(parseIacharaText("名前: A\n前職業: X\n職業: 本職")?.memo).toBe("職業: 本職");
    expect(parseIacharaText("名前: A\n【探索者メモ】\n探索\n【プロフィール】\nプロ")?.memo).toBe("探索");
    expect(parseIacharaText("名前: A\n【プロフィール】\n  プロ  \n")?.memo).toBe("プロ");
    expect(parseIacharaText("名前: A\n【メモ】\n一行目\r\n二行目")?.memo).toBe("一行目\n二行目");
    expect(parseIacharaText("名前: A\nHP: 1")?.memo).toBeUndefined();
  });

  it("見出しは単独行の【…】だけで、後ろの空白を許す", () => {
    const c = parseIacharaText("名前: A\n【 メモ 】  \n本文\n【技能】のあとに 目星 50\n【能力値】\nSTR 10");
    expect(c?.memo).toBe("本文\n【技能】のあとに 目星 50");
    expect(c?.stats).toStrictEqual({ str: 10 });
  });

  it("行頭が【でない行は見出しにしない", () => {
    expect(parseIacharaText("名前: A\nHP: 1\n注【メモ】\n本文")?.memo).toBeUndefined();
  });

  it("技能名と値は同じ行にあるときだけ読む", () => {
    expect(parseIacharaText("名前: A\n【技能】\n目星\n50\r\n聞き耳\r\n60")?.stats).toStrictEqual({});
  });

  it("同じ見出しが二度出ても前の内容を保つ", () => {
    const c = parseIacharaText("名前: A\n【メモ】\n一\n【能力値】\nSTR 10\n【メモ】\n二");
    expect(c?.memo).toBe("一\n二");
  });

  it("英字の能力値を ヘッダ・能力値・ステータス から読む", () => {
    const c = parseIacharaText(
      "名前: A\nSTR: 50 CON：60 POW 65\n【能力値】\nDEX 70 APP:55 SIZ:60 INT:75 EDU:80 LUCK:40 IDEA:70 KNOW:80\n【ステータス】\nhp: 12 mp:13 san 58\n【メモ】\nSTR: 99",
    );
    expect(c?.stats).toStrictEqual({
      str: 50,
      con: 60,
      pow: 65,
      dex: 70,
      app: 55,
      siz: 60,
      int: 75,
      edu: 80,
      luck: 40,
      idea: 70,
      know: 80,
      hp: 12,
      mp: 13,
      san: 58,
    });
  });

  it("英字の能力値は単語境界で区切る", () => {
    expect(parseIacharaText("名前: A\nHP: 1\nXSTR: 5 STRX 6 STR7")?.stats).toStrictEqual({ hp: 1 });
  });

  it("日本語の能力値を読む", () => {
    const c = parseIacharaText(
      "名前: A\nHP: 1\nSAN値: 60\n【ステータス】\n幸運 : 50 アイデア:70 知識：80\n正気度:55",
    );
    expect(c?.stats).toStrictEqual({ hp: 1, san: 55, 幸運: 50, アイデア: 70, 知識: 80 });
    expect(parseIacharaText("名前: A\nHP: 1\n幸運:  50")?.stats).toStrictEqual({ hp: 1, 幸運: 50 });
  });

  it("【技能】から技能値を読む", () => {
    const c = parseIacharaText(
      "名前: A\n【技能】\n応急手当 75%  精神分析:70 目星：65\n芸術(絵画) 40% 製作（料理）: 30\r\n図書館  1234\nコンピューター 0",
    );
    expect(c?.stats).toStrictEqual({
      応急手当: 75,
      精神分析: 70,
      目星: 65,
      "芸術(絵画)": 40,
      "製作（料理）": 30,
      図書館: 123,
      コンピューター: 0,
    });
  });

  it.each([
    ["名前: A\nCthulhu7th\nHP: 1", "coc7"],
    ["名前: A\nHP: 1", undefined],
    ["名前: A\nSAN: 50", "coc7"],
    ["名前: A\n【技能】", "coc7"],
    ["名前: A\nSAN: 50 STR: 15 EDU: 21", "coc6"],
    ["名前: A\nSAN: 50 STR: 21", "coc6"],
    ["名前: A\nSAN: 50 STR: 22", "coc7"],
    ["名前: A\nSAN: 50 STR: 15 EDU: 22", "coc7"],
    ["名前: A\nSAN: 50 STR: 0", "coc7"],
    ["名前: A\nSAN: 50 STR: 1", "coc6"],
  ])("システム推定 %j → %j", (text, want) => {
    expect(parseIacharaText(text)?.systemId).toBe(want);
  });
});

describe("importCharacterFromText の判定順", () => {
  it.each([
    [yt({ pc_name: "保管所" }), "ゆとシートⅡ"],
    [sheet({ von: 1 }), "キャラクター保管所"],
    [emo({}), "エモクロア"],
    [JSON.stringify({ kind: "character", data: { name: "C" } }), "CCFOLIA"],
    ["名前: A\nHP: 1", "いあきゃら"],
  ])("%j → %s", (raw, label) => {
    expect(importCharacterFromText(`  ${raw}  `)?.sourceLabel).toBe(label);
  });

  it("空・空白のみは null", () => {
    expect(importCharacterFromText("   ")).toBeNull();
  });
});

describe("importCharactersFromText", () => {
  it("JSON 配列の各要素を取り込み、読めない要素は飛ばす", () => {
    const res = importCharactersFromText(
      ` ${JSON.stringify([{ pc_name: "A" }, { foo: 1 }, { characterName: "B" }])} `,
    );
    expect(res.map((r) => [r.sourceLabel, r.character.name])).toEqual([
      ["キャラクター保管所", "A"],
      ["ゆとシートⅡ", "B"],
    ]);
  });

  it("配列でない JSON や壊れた配列は単体テキストとして読む", () => {
    expect(importCharactersFromText("[名前: A]\nHP: 1").map((r) => r.character.name)).toEqual([]);
    expect(importCharactersFromText("[]")).toEqual([]);
    expect(importCharactersFromText("")).toEqual([]);
    expect(importCharactersFromText("  \n ")).toEqual([]);
  });

  it("--- 区切りのブロックを別々に読む", () => {
    const res = importCharactersFromText("名前: A\nHP: 1\n---\n\n----\n名前: B\nHP: 2\n---\n読めない");
    expect(res.map((r) => r.character.name)).toEqual(["A", "B"]);
  });

  it("区切りがあっても読めるブロックが 1 つなら全体を 1 体として読む", () => {
    const res = importCharactersFromText("名前: A\nHP: 1\n---\nただのメモ");
    expect(res).toHaveLength(1);
    expect(res[0]?.character.name).toBe("A");
    expect(res[0]?.character.stats).toStrictEqual({ hp: 1 });
  });

  it("読めるブロックが 1 つなら他のブロックの内容も含めて全体を読む", () => {
    const res = importCharactersFromText("名前: A\nHP: 1\n---\nSTR: 50");
    expect(res.map((r) => r.character.stats)).toStrictEqual([{ hp: 1, str: 50 }]);
  });

  it("-- (2 本) は区切りとみなさない", () => {
    const res = importCharactersFromText("名前: A\nHP: 1\n--\n名前: B\nHP: 2");
    expect(res.map((r) => r.character.name)).toEqual(["A"]);
  });

  it("区切りが無い単体テキストも 1 件として返す", () => {
    expect(importCharactersFromText("名前: A\nHP: 1").map((r) => r.character.name)).toEqual(["A"]);
    expect(importCharactersFromText("ただの文章")).toEqual([]);
  });
});
