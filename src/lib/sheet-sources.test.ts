import { describe, expect, it } from "vitest";
import {
  cocSkillGroup,
  parseCharaenoJson,
  parseCharashJson,
  sheetFromCcfolia,
  sheetFromCharasheet,
  sheetFromYtsheet,
  skillsFromPalette,
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
import { importCharacterFromText } from "./importers";
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

  it("エモクロア: 能力値は日本語、技能は段階、共鳴は続く値", () => {
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

  it("書き出した JSON を貼り付けても取り込める", () => {
    const res = importCharacterFromText(JSON.stringify({ ...base, systems: { coc6: {} } }));
    expect(res?.sourceLabel).toBe("キャラッシュ");
    expect(res?.character.systemId).toBe("coc6");
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

describe("ココフォリアのコマ（いあきゃら等の駒出力）", () => {
  it("チャットパレットから技能値を拾う（能力値ロール・SAN は除く）", () => {
    expect(
      skillsFromPalette(
        "CCB<=70 【目星】\nCC<=60 聞き耳\nCCB<={SAN} 【SANチェック】\nCCB<=50 【STR×5】\n1d100<=40 【図書館】",
      ),
    ).toEqual([
      { label: "目星", value: 70, group: "探索技能" },
      { label: "聞き耳", value: 60, group: "探索技能" },
      { label: "図書館", value: 40, group: "探索技能" },
    ]);
  });

  it("status は副能力値、params の英字 3 文字は能力値", () => {
    const sheet = sheetFromCcfolia(
      {
        status: [{ label: "SAN", value: 50, max: 99 }],
        params: [
          { label: "STR", value: "10" },
          { label: "アイデア", value: "60" },
        ],
        commands: "CCB<=80 【図書館】",
      },
      "coc6",
    )!;
    expect(sheetSection(sheet, "abilities")?.entries).toEqual([{ label: "STR", value: 10 }]);
    expect(sheetSection(sheet, "resources")?.entries.map((e) => e.label)).toEqual(["SAN", "アイデア"]);
    expect(sheetSkillValue(sheet, "図書館")).toBe(80);
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

  it("入力中の URL を案内する（いあきゃらは貼り付け、旧エモクロアは移転先）", () => {
    expect(describeSheetUrl("")).toEqual({ state: "empty" });
    expect(describeSheetUrl("https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac")).toMatchObject({
      state: "ok",
      label: "キャラエノ",
    });
    expect(describeSheetUrl("https://iachara.com/view/123")).toMatchObject({
      state: "paste",
      url: "https://iachara.com/view/123",
    });
    expect(describeSheetUrl("https://emoklore.charasheet.jp/sheet/1")).toMatchObject({ state: "invalid" });
    expect(describeSheetUrl("https://booth.pm/ja/items/1")).toMatchObject({ state: "invalid" });
  });
});

describe("続く値とひとこと紹介", () => {
  it("CoC は SAN（7 版は幸運も）、SW は HP を続く値にしない", () => {
    expect(carriedStats(SYSTEMS.coc6).map((s) => s.key)).toEqual(["san"]);
    expect(carriedStats(SYSTEMS.coc7).map((s) => s.key)).toEqual(["san", "luck"]);
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
      sessions: [],
      growth: [],
      share: {
        enabled: false,
        scope: "private",
        includeProfile: true,
        includeStats: true,
        includeGrowth: true,
        includeSessions: true,
      },
      sheet: parseCharaenoJson(CHARAENO_7TH)!.sheet,
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
      today: "2026-11-21",
    });
    expect(res.changed).toBe(true);
    expect(res.next.bio).toBe("自分で書いた紹介");
    expect(res.next.growth.map((g) => [g.skill, g.from, g.to])).toEqual([["図書館", 70, 75]]);
    expect(res.next.sheet?.fetchedAt).toBe("2026-11-21T00:00:00.000Z");
    expect(sheetSkillValue(res.next.sheet, "図書館")).toBe(75);
  });
});
