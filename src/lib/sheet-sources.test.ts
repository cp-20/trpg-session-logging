import { describe, expect, it } from "vitest";
import {
  cocSkillGroup,
  parseCharaenoJson,
  parseCharashJson,
  parseLhrpgJson,
  parseSoukoJson,
  sheetFromCharasheet,
  sheetFromYtsheet,
  ytsheetSystemFromUrl,
} from "./sheet-sources";
import {
  coerceSheet,
  diffSheetSkills,
  groupSkills,
  isGrownSkill,
  sheetSection,
  sheetSkillValue,
} from "./sheet";
import {
  bioFromMemo,
  describeSheetUrl,
  mergeExternalCharacterUpdate,
  parseExternalResponse,
  parseExternalUrl,
} from "./external-sync";
import { carriedStats, SYSTEMS } from "../data/systems";
import type { Character } from "../types";

const CHARAENO_7TH = {
  name: "大宮 龍馬",
  occupation: "学芸員",
  age: "25",
  sex: "男",
  characteristics: { str: 85, con: 40, pow: 60, dex: 45, app: 50, siz: 70, int: 65, edu: 70 },
  attribute: { hp: 11, mp: 12, mov: 8, build: 1, db: "+1D4", san: { value: 65, max: 99 }, luck: 78 },
  skills: [
    { name: "威圧", value: 15, edited: false },
    { name: "運転（）", value: 20, edited: false },
    { name: "図書館", value: 70, edited: true },
  ],
  weapons: [
    { name: "素手", value: "25", damage: "1D3+DB", range: "", attacks: "", ammo: "", malfunction: "" },
  ],
  possessions: [{ name: "財布", count: "", detail: "" }],
  backstory: [{ name: "容姿の描写", entries: [{ text: "背が高い" }] }],
  note: "メモ",
};

describe("キャラエノ", () => {
  it("7 版の summary を汎用シートと続く値に読み替える（HP・MP は stats に入れない）", () => {
    const c = parseCharaenoJson(JSON.stringify(CHARAENO_7TH), "https://charaeno.com/7th/abc")!;
    expect(c.name).toBe("大宮 龍馬");
    expect(c.systemId).toBe("coc7");
    expect(c.memo).toBe("職業: 学芸員");
    expect(c.stats).toEqual({ san: 65, luck: 78 });
    expect(sheetSection(c.sheet, "abilities")?.entries.map((e) => e.label)).toEqual([
      "STR",
      "CON",
      "POW",
      "DEX",
      "APP",
      "SIZ",
      "INT",
      "EDU",
    ]);
    expect(sheetSection(c.sheet, "resources")?.entries.find((e) => e.label === "SAN")).toEqual({
      label: "SAN",
      value: 65,
      max: 99,
    });
    const skills = sheetSection(c.sheet, "skills")!.entries;
    expect(skills.map((e) => e.label)).toEqual(["威圧", "運転", "図書館"]);
    expect(skills[2]).toMatchObject({ grown: true, group: "探索技能" });
    expect(sheetSection(c.sheet, "backstory")?.text).toBe("【容姿の描写】\n背が高い");
  });

  it("6 版は幸運を stats に入れない。形が違えば null", () => {
    const sixth = { ...CHARAENO_7TH, attribute: { hp: 10, mp: 10, db: "+0", san: { value: 50, max: 99 } } };
    delete (sixth as { backstory?: unknown }).backstory;
    const c = parseCharaenoJson(sixth, "https://charaeno.com/6th/abc")!;
    expect(c.systemId).toBe("coc6");
    expect(c.stats).toEqual({ san: 50 });
    expect(parseCharaenoJson("{}")).toBeNull();
    expect(parseCharaenoJson("not json")).toBeNull();
  });
});

describe("キャラッシュ", () => {
  const base = {
    format: "charash-character",
    formatVersion: 1,
    profile: { name: "見本", occupation: "探偵" },
  };

  it("coc7: 分類・初期値・成長を技能に持つ", () => {
    const c = parseCharashJson({
      ...base,
      images: [{ url: "https://charash.jp/api/v1/characters/x/images/1", main: true }],
      systems: {
        coc7: {
          abilities: { STR: { value: 50 } },
          derived: { san: { value: 60, max: 95 }, luck: { value: 40 }, hp: { value: 10 } },
          skills: [
            { name: "目星", category: "search", base: { value: 25 }, growth: 0, value: 70 },
            { name: "回避", category: "combat", base: { value: 30 }, growth: 0, value: 30 },
            {
              name: "運転",
              specialty: "自動車",
              category: "action",
              base: { value: 20 },
              growth: 3,
              value: 23,
            },
          ],
        },
      },
    })!;
    expect(c.systemId).toBe("coc7");
    expect(c.stats).toEqual({ san: 60, luck: 40 });
    expect(c.image).toBe("https://charash.jp/api/v1/characters/x/images/1");
    const skills = sheetSection(c.sheet, "skills")!.entries;
    expect(skills.map((e) => [e.label, e.group, isGrownSkill(e)])).toEqual([
      ["目星", "探索技能", true],
      ["回避", "戦闘技能", false],
      ["運転（自動車）", "行動技能", true],
    ]);
  });

  it("エモクロア: 能力値は日本語、技能は段階、共鳴は値として残す（卓をまたいでは続かない）", () => {
    const c = parseCharashJson({
      ...base,
      systems: {
        emoklore: {
          abilities: { body: { value: 2 }, intellect: { value: 4 } },
          resonance: { level: { value: 3 } },
          skills: [{ name: "検索", level: 2, ability: "intellect", value: 6 }],
          echoes: [{ scenario: "雨", emotion: "郷愁", consumed: true }],
        },
      },
    })!;
    expect(c.systemId).toBe("emoklore");
    expect(c.stats).toEqual({ von: 3 });
    expect(sheetSection(c.sheet, "abilities")?.entries.map((e) => e.label)).toEqual(["身体", "知力"]);
    expect(sheetSection(c.sheet, "skills")?.entries[0]).toMatchObject({
      label: "検索",
      value: 6,
      rank: { value: 2, max: 3 },
      note: "知力",
    });
    expect(sheetSection(c.sheet, "echoes")?.entries[0]).toMatchObject({ label: "雨", note: "消費済み" });
  });

  it("卓譜にないシステムは汎用にして名前を残す。形式が違えば null", () => {
    const c = parseCharashJson({ ...base, systems: { gaiacare: { abilities: { 力: { value: 3 } } } } })!;
    expect(c.systemId).toBe("general");
    expect(c.sheet?.systemLabel).toBe("ガイアケアTRPG");
    expect(parseCharashJson({ profile: { name: "x" } })).toBeNull();
  });
});

describe("キャラクター保管所", () => {
  it("6 版の技能欄を既定の技能名・分野・追加技能で読む", () => {
    const sheet = sheetFromCharasheet({
      pc_name: "A",
      game: "coc",
      shuzoku: "探偵",
      NP1: "9",
      NP9: "11",
      SAN_Left: "60",
      SAN_Max: "99",
      TFAP: ["30", "1"],
      TFAD: ["30", "1"],
      TAAP: ["40"],
      TAAD: ["20"],
      TAAA: ["5"],
      unten_bunya: "自動車",
      TBAP: ["26", "25", "25", "50", "10", "25", "1", "20", "15", "30", "15", "25", "60"],
      TBAD: ["26", "25", "25", "50", "10", "25", "1", "20", "15", "30", "15", "25", "1"],
      TBAName: ["刀"],
    })!;
    expect(sheet.profile[0]).toEqual({ label: "職業", value: "探偵" });
    const skills = sheetSection(sheet, "skills")!.entries;
    expect(skills.find((e) => e.label === "応急手当")).toMatchObject({
      value: 30,
      base: 30,
      group: "探索技能",
    });
    expect(skills.find((e) => e.label === "運転（自動車）")).toMatchObject({ value: 40, grown: true });
    expect(skills.find((e) => e.label === "刀")).toMatchObject({ value: 60, base: 1, group: "戦闘技能" });
    expect(sheetSkillValue(sheet, "運転")).toBe(40);
    expect(sheetSection(sheet, "resources")?.entries.find((e) => e.label === "SAN")).toMatchObject({
      value: 60,
      max: 99,
    });
  });

  it("URL から読むと汎用シートが付く", () => {
    const p = parseExternalResponse(
      "charasheet",
      JSON.stringify({ pc_name: "A", game: "coc", NP1: "9", TFAP: ["30"], TFAD: ["30"] }),
      "application/json",
      "https://charasheet.vampire-blood.net/1",
    );
    expect(p?.kind === "character" && p.character.sheet?.url).toBe("https://charasheet.vampire-blood.net/1");
  });
});

describe("ゆとシートⅡ", () => {
  const sw = {
    characterName: "人間の戦士",
    level: "2",
    race: "人間",
    sttDex: "18",
    bonusDex: "3",
    hpTotal: "20",
    expTotal: "3000",
    combatFeatsLv3: "鷹の目",
    combatFeatsLv1: "全力攻撃Ⅰ",
    sheetDescriptionM: "種族:人間　性別:　年齢:\n技能:ファイター2／スカウト1",
    gameVersion: "2.5",
  };

  it("URL のパスからシステムを決める（各地のサーバーでも）", () => {
    expect(ytsheetSystemFromUrl("https://yutorize.work/ytsheet/sw2.5/?id=a")).toEqual({ id: "sw25" });
    expect(ytsheetSystemFromUrl("https://example.com/ytsheet/dx3rd/?id=a")?.label).toBe(
      "ダブルクロス The 3rd Edition",
    );
    expect(ytsheetSystemFromUrl("https://example.com/x")).toBeUndefined();
  });

  it("SW2.5 は技能レベル・能力値ボーナス・戦闘特技を読む", () => {
    const sheet = sheetFromYtsheet(sw, "https://yutorize.work/ytsheet/sw2.5/?id=a")!;
    expect(sheetSection(sheet, "levels")?.entries).toEqual([
      { label: "冒険者レベル", value: 2 },
      { label: "ファイター", value: 2 },
      { label: "スカウト", value: 1 },
    ]);
    expect(sheetSection(sheet, "abilities")?.entries[0]).toEqual({ label: "器用度", value: 18, note: "+3" });
    expect(sheetSection(sheet, "feats")?.entries.map((e) => e.label)).toEqual(["全力攻撃Ⅰ", "鷹の目"]);
  });

  it("URL からの取り込みでは冒険者レベル・経験点を続く値にする", () => {
    const p = parseExternalResponse(
      "ytsheet",
      JSON.stringify(sw),
      "application/json",
      "https://yutorize.work/ytsheet/sw2.5/?id=a",
    );
    expect(p?.kind === "character" && p.character.stats).toMatchObject({ lv: 2, exp: 3000 });
  });

  it("ほかのシステムは unitStatus と説明行を汎用に並べる", () => {
    const sheet = sheetFromYtsheet(
      { characterName: "D", unitStatus: [{ HP: "28" }, { 侵蝕率: "34" }], sheetDescriptionM: "ワークス:UGN" },
      "https://yutorize.work/ytsheet/dx3rd/?id=a",
    )!;
    expect(sheet.systemLabel).toBe("ダブルクロス The 3rd Edition");
    expect(sheet.profile).toEqual([{ label: "ワークス", value: "UGN" }]);
    expect(sheetSection(sheet, "resources")?.entries).toEqual([
      { label: "HP", value: 28 },
      { label: "侵蝕率", value: 34 },
    ]);
  });
});

describe("汎用シートの補助", () => {
  it("分類はクトゥルフの順に並べる", () => {
    const g = groupSkills([
      { label: "a", value: 1, group: "知識技能" },
      { label: "b", value: 1, group: "戦闘技能" },
      { label: "c", value: 1 },
    ]);
    expect(g.map((x) => x.group)).toEqual(["戦闘技能", "知識技能", ""]);
    expect(cocSkillGroup("運転（自動車）")).toBe("行動技能");
  });

  it("前のシートから上がった技能だけを返す", () => {
    const prev = coerceSheet({
      v: 1,
      provider: "charaeno",
      profile: [],
      sections: [{ id: "skills", title: "技能", kind: "skills", entries: [{ label: "目星", value: 60 }] }],
    });
    const next = coerceSheet({
      v: 1,
      provider: "charaeno",
      profile: [],
      sections: [
        {
          id: "skills",
          title: "技能",
          kind: "skills",
          entries: [
            { label: "目星", value: 65 },
            { label: "新技能", value: 50 },
          ],
        },
      ],
    });
    expect(diffSheetSkills(prev, next)).toEqual([{ label: "目星", from: 60, to: 65 }]);
  });

  it("壊れた保存値は読めるところだけ残す", () => {
    expect(coerceSheet(null)).toBeUndefined();
    expect(coerceSheet({ provider: "x" })).toBeUndefined();
    const s = coerceSheet({
      provider: "charaeno",
      sections: [
        null,
        { id: "a", title: "A", kind: "skills", entries: [{ label: "x", value: 1 }, { bad: 1 }] },
      ],
    });
    expect(s?.sections).toEqual([
      { id: "a", title: "A", kind: "skills", entries: [{ label: "x", value: 1 }] },
    ]);
    expect(s?.profile).toEqual([]);
  });
});

describe("キャラシの URL", () => {
  it.each([
    [
      "https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac",
      "charaeno",
      "https://charaeno.com/api/v1/7th/h_wQNXeiHPXDEDtG3r2ac/summary",
    ],
    [
      "https://charaeno.sakasin.net/6th/Ot1AbujwN3lYS3zpUP_hE",
      "charaeno",
      "https://charaeno.com/api/v1/6th/Ot1AbujwN3lYS3zpUP_hE/summary",
    ],
    ["https://charash.jp/view/abc123", "charash", "https://charash.jp/api/v1/characters/abc123"],
    /* 閲覧 URL は /view/{id}/{システム} に転送される */
    [
      "https://charash.jp/view/Xc6dAeJHMCjV/emoklore",
      "charash",
      "https://charash.jp/api/v1/characters/Xc6dAeJHMCjV",
    ],
    [
      "https://character-sheets.appspot.com/dx3/edit.html?key=ahVzfmNoYXJhY3Rlci1zaGVldHMtbXBy",
      "souko",
      "https://character-sheets.appspot.com/dx3/display?ajax=1&key=ahVzfmNoYXJhY3Rlci1zaGVldHMtbXBy",
    ],
    ["https://lhrpg.com/lhz/pc?id=196293", "lhrpg", "https://lhrpg.com/lhz/api/196293.json"],
    [
      "https://yutorize.work/ytsheet/sw2.5/?id=GYwVqv",
      "ytsheet",
      "https://yutorize.work/ytsheet/sw2.5/?id=GYwVqv&mode=json",
    ],
    [
      "https://example.org/tools/ytsheet/dx3rd/?id=abc",
      "ytsheet",
      "https://example.org/tools/ytsheet/dx3rd/?id=abc&mode=json",
    ],
  ])("%s を読める", (url, provider, fetchUrl) => {
    const r = parseExternalUrl(url);
    expect(r.ok && r.provider).toBe(provider);
    expect(r.ok && r.fetchUrls[0]).toBe(fetchUrl);
  });

  it("キャラエノ・キャラッシュの個別ページ以外は断る", () => {
    expect(parseExternalUrl("https://charaeno.com/7th/new").ok).toBe(false);
    expect(parseExternalUrl("https://charash.jp/terms").ok).toBe(false);
  });

  it("入力中の URL を案内する。URL から読めないサイト（旧エモクロア）は受け付けない", () => {
    expect(describeSheetUrl("")).toEqual({ state: "empty" });
    expect(describeSheetUrl("https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac")).toMatchObject({
      state: "ok",
      label: "キャラエノ",
    });
    expect(describeSheetUrl("https://iachara.com/view/123")).toEqual({
      state: "ok",
      provider: "iachara",
      label: "いあきゃら",
      url: "https://iachara.com/view/123",
    });
    expect(describeSheetUrl("https://emoklore.charasheet.jp/sheet/1")).toMatchObject({ state: "invalid" });
    expect(describeSheetUrl("https://booth.pm/ja/items/1")).toMatchObject({ state: "invalid" });
    expect(
      describeSheetUrl("https://character-sheets.appspot.com/sw2/edit.html?key=ahVzfmNoYXJhY3Rlci1z"),
    ).toMatchObject({
      state: "invalid",
    });
  });
});

describe("続く値とひとこと紹介", () => {
  it("CoC は SAN だけ（幸運は続かない）、エモクロアの共鳴は続かない、SW は HP を続く値にしない", () => {
    expect(carriedStats(SYSTEMS.coc6).map((s) => s.key)).toEqual(["san"]);
    expect(carriedStats(SYSTEMS.coc7).map((s) => s.key)).toEqual(["san"]);
    expect(carriedStats(SYSTEMS.emoklore)).toEqual([]);
    expect(carriedStats(SYSTEMS.sw25).map((s) => s.key)).not.toContain("hp");
    expect(carriedStats(SYSTEMS.coc7).map((s) => s.key)).not.toContain("mp");
  });

  it("職業などの行は紹介文に入れない", () => {
    expect(bioFromMemo("職業: 記者\n港町の記者。")).toBe("港町の記者。");
    expect(bioFromMemo(undefined)).toBe("");
  });

  it("同期ではシートを置き換え、伸びた技能を成長として残し、ひとこと紹介は残す", () => {
    const existing = {
      id: "c",
      ownerId: "u",
      name: "A",
      systemId: "coc7",
      color: "#000",
      archetype: "",
      bio: "自分で書いた紹介",
      tags: [],
      stats: { san: 60 },
      sessions: [
        { logId: "s1", date: "2026-11-01", title: "前の卓", delta: {}, rolls: [], memo: "" },
        { logId: "s2", date: "2026-11-14", title: "廃校", delta: {}, rolls: [], memo: "" },
      ],
      growth: [],
      share: {
        enabled: false,
        scope: "private",
        includeProfile: true,
        includeStats: true,
        includeGrowth: true,
        includeSessions: true,
      },
      sheet: { ...parseCharaenoJson(CHARAENO_7TH)!.sheet!, fetchedAt: "2026-11-05T00:00:00.000Z" },
    } satisfies Character;
    const grown = {
      ...CHARAENO_7TH,
      skills: [{ name: "図書館", value: 75, edited: true }],
      attribute: { ...CHARAENO_7TH.attribute, san: { value: 60, max: 99 } },
    };
    const res = mergeExternalCharacterUpdate(existing, parseCharaenoJson(grown)!, {
      url: "https://charaeno.com/7th/abc",
      provider: "charaeno",
      syncedAt: "2026-11-21T00:00:00.000Z",
    });
    expect(res.changed).toBe(true);
    expect(res.next.bio).toBe("自分で書いた紹介");
    /* 前の同期（11/5）のあとに遊んだうち最新のセッションのあとの成長。日付はそのセッションの日付 */
    expect(res.next.growth.map((g) => [g.skill, g.from, g.to, g.logId, g.date])).toEqual([
      ["図書館", 70, 75, "s2", "2026-11-14"],
    ]);
    expect(res.growth).toEqual(res.next.growth);
    expect(res.next.sheet?.fetchedAt).toBe("2026-11-21T00:00:00.000Z");
    expect(sheetSkillValue(res.next.sheet, "図書館")).toBe(75);
  });
});

describe("キャラクターシート倉庫", () => {
  /* character-sheets.appspot.com の display?ajax=1 の形（実物を縮めたもの） */
  const dx3 = {
    base: {
      name: "獅峯 玲緒奈",
      player: "りんなの",
      age: "18",
      sex: "女",
      cover: "高校生",
      works: "UGNチルドレンA",
      syndromes: { primary: { syndrome: "キュマイラ" }, secondary: { syndrome: "エグザイル" }, tertiary: {} },
      memo: null,
    },
    baseAbility: {
      body: { total: "10" },
      sense: { total: "1" },
      mind: { total: "1" },
      society: { total: "2" },
    },
    skills: {
      hak: { A: { lv: "2" } },
      kai: { A: { lv: "1" } },
      sha: { A: { lv: null } },
      B: [{ name1: null, lv1: null, name4: "UGN", lv4: "1" }],
    },
    subAbility: { hp: { total: "61" }, erotion: { total: "38" }, action: { total: "3" } },
    arts: [{ name: "リザレクト", level: "1", timing: "オート", judge: "自動" }],
    lois: [{ name: "テレーズブルム", type: "ﾗｲﾌ:恩人", Pfeel: "信頼", Nfeel: "憐憫" }],
  };

  it("ダブルクロス 3rd: 能力値・技能（追加技能は種類つき）・エフェクト・ロイスを読む", () => {
    const c = parseSoukoJson(
      JSON.stringify(dx3),
      "dx3",
      "https://character-sheets.appspot.com/dx3/edit.html?key=k",
    )!;
    expect(c).toMatchObject({
      name: "獅峯 玲緒奈",
      systemId: "DoubleCross",
      memo: "職業: 高校生",
      stats: { hp: 61 },
    });
    expect(c.sheet?.systemLabel).toBe("ダブルクロス3rd");
    expect(c.sheet?.profile).toContainEqual({ label: "シンドローム", value: "キュマイラ／エグザイル" });
    expect(sheetSection(c.sheet, "abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["肉体", 10],
      ["感覚", 1],
      ["精神", 1],
      ["社会", 2],
    ]);
    expect(sheetSection(c.sheet, "skills")?.entries.map((e) => [e.label, e.value, e.group])).toEqual([
      ["白兵", 2, "肉体"],
      ["回避", 1, "肉体"],
      ["情報：UGN", 1, "社会"],
    ]);
    expect(sheetSection(c.sheet, "arts")?.entries[0]).toMatchObject({ label: "リザレクト", value: 1 });
    expect(sheetSection(c.sheet, "lois")?.entries[0]).toMatchObject({
      label: "テレーズブルム",
      note: "信頼　憐憫",
    });
  });

  it("シノビガミ・インセイン: 習得した特技を特技表の名前で読む（表にない番号は読まない）", () => {
    const sg = parseSoukoJson(
      {
        base: { name: "戦士", cover: "アイドル", level: "上忍頭", belief: "我" },
        learned: [
          { id: "skills.row9.name1" },
          { id: "skills.row3.name1" },
          { id: "skills.row99.name0" },
          { id: null },
        ],
        ninpou: [{ name: "接近戦攻撃", type: "攻撃", targetSkill: "手練" }],
      },
      "shinobigami",
    )!;
    expect(sg.systemId).toBe("ShinobiGami");
    expect(sheetSection(sg.sheet, "skills")?.entries).toEqual([
      { label: "刀術", value: "習得", group: "体術" },
      { label: "手練", value: "習得", group: "体術" },
    ]);
    expect(sheetSection(sg.sheet, "abilities-list")?.title).toBe("忍法");

    const ins = parseSoukoJson(
      {
        base: { name: "新たな探索者", cover: "作家", nightmare: "脅す" },
        learned: [{ id: "skills.row5.name4" }],
        hitpoint: { max: "6", value: "6" },
        sanepoint: { max: "5", value: "5" },
        item: [{ name: "鎮痛剤", effect: "回復する" }],
      },
      "insane",
    )!;
    expect(ins.systemId).toBe("Insane");
    expect(sheetSection(ins.sheet, "skills")?.entries).toEqual([
      { label: "教養", value: "習得", group: "知識" },
    ]);
    expect(sheetSection(ins.sheet, "resources")?.entries).toEqual([
      { label: "生命力", value: 6, max: 6 },
      { label: "正気度", value: 5, max: 5 },
    ]);
    expect(ins.sheet?.profile).toContainEqual({ label: "恐怖心", value: "脅す" });
  });

  it("「データが存在しません」・対応外のシステム・名前のないものは読まない", () => {
    expect(parseSoukoJson({ error: "データが存在しません。" }, "dx3")).toBeNull();
    expect(parseSoukoJson(dx3, "sw2")).toBeNull();
    expect(parseSoukoJson({ base: { name: "" } }, "dx3")).toBeNull();
    expect(parseSoukoJson("{broken", "dx3")).toBeNull();
  });

  it("URL から読むと倉庫のシステムで振り分ける", () => {
    const url = "https://character-sheets.appspot.com/dx3/edit.html?key=ahVzfmNoYXJhY3Rlci1z";
    const p = parseExternalResponse("souko", JSON.stringify(dx3), "text/plain", url);
    expect(p?.kind === "character" && p.character.systemId).toBe("DoubleCross");
  });
});

describe("冒険窓口（ログ・ホライズンTRPG）", () => {
  it("公開 JSON を読む。形が違えば null", () => {
    const c = parseLhrpgJson({
      name: "ベアもん",
      level: "90",
      race: "ドワーフ",
      main_job: "施療神官",
      sub_job: "戦司祭",
      max_hitpoint: 56,
      str_value: 1,
      skills: [{ name: "ヒール", skill_rank: 1, timing: "メジャー" }],
    })!;
    expect(c).toMatchObject({ name: "ベアもん", systemId: "LogHorizon", stats: { hp: 56, lv: 90 } });
    expect(sheetSection(c.sheet, "skills")?.entries[0]).toMatchObject({
      label: "ヒール",
      value: 1,
      note: "メジャー",
    });
    expect(parseLhrpgJson({ name: "x" })).toBeNull();
  });
});
