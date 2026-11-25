/**
 * サンプルデータのキャラシ。各サイトが返す JSON の形のまま書き、取り込みと同じ関数で汎用シートにする
 * （「キャラシの JSON をそのまま入れて、見せ方はシステムごとに決める」の見本も兼ねる）。
 * URL はサンプル用の架空のもの。サンプルでは開いたときの自動更新をしない。
 */
import type { Character } from "../types";
import { parseCharaenoJson, parseCharashJson, sheetFromYtsheet } from "../lib/sheet-sources";
import type { ExternalSyncConfig, ExternalSyncProvider } from "../types";

const SYNCED_AT = "2026-11-20T09:00:00.000Z";

function linked(provider: ExternalSyncProvider, url: string): ExternalSyncConfig {
  return { provider, url, lastSyncedAt: SYNCED_AT, lastStatus: "ok", autoSync: false };
}

const sk = (name: string, value: number, edited = false) => ({ name, value, edited });

/* キャラエノ（新クトゥルフ神話TRPG）の /summary の形 */
const TOWA_CHARAENO = {
  name: "遠沢澄花",
  occupation: "地方紙記者",
  age: "27",
  sex: "女",
  residence: "港町",
  birthplace: "長野県",
  characteristics: { str: 45, con: 60, pow: 55, dex: 65, app: 70, siz: 50, int: 80, edu: 85 },
  attribute: { hp: 11, mp: 11, mov: 8, build: 0, db: "+0", san: { value: 42, max: 96 }, luck: 60 },
  skills: [
    sk("威圧", 15),
    sk("言いくるめ", 45, true),
    sk("医学", 1),
    sk("運転（自動車）", 40, true),
    sk("応急手当", 75, true),
    sk("オカルト", 25, true),
    sk("回避", 32),
    sk("鍵開け", 1),
    sk("隠密", 20),
    sk("機械修理", 10),
    sk("近接戦闘（格闘）", 25),
    sk("経理", 5),
    sk("芸術/製作（写真術）", 50, true),
    sk("考古学", 1),
    sk("コンピューター", 25, true),
    sk("自然", 10),
    sk("射撃（拳銃）", 20),
    sk("信用", 40, true),
    sk("心理学", 72, true),
    sk("人類学", 1),
    sk("水泳", 20),
    sk("精神分析", 1),
    sk("説得", 55, true),
    sk("跳躍", 20),
    sk("追跡", 10),
    sk("電子工学", 1),
    sk("登攀", 20),
    sk("投擲", 20),
    sk("図書館", 75, true),
    sk("ナビゲート", 10),
    sk("変装", 5),
    sk("法律", 5),
    sk("ほかの言語（英語）", 41, true),
    sk("母国語（日本語）", 85),
    sk("魅惑", 15),
    sk("目星", 65, true),
    sk("聞き耳", 60, true),
    sk("歴史", 40, true),
    sk("クトゥルフ神話", 3),
  ],
  possessions: [
    { name: "取材用カメラ", count: "1", detail: "フィルムの一眼レフ。父のお下がり" },
    { name: "古い万年筆", count: "1", detail: "" },
    { name: "取材手帳", count: "3", detail: "事件ごとに 1 冊" },
  ],
  weapons: [
    { name: "素手", value: "25", damage: "1D3+DB", range: "", attacks: "1", ammo: "", malfunction: "" },
  ],
  credit: { spendingLevel: "2万円", cash: "8万円", assetsDetails: "" },
  backstory: [
    { name: "容姿の描写", entries: [{ text: "短く切った黒髪に、色の抜けたトレンチコート" }] },
    { name: "イデオロギー／信念", entries: [{ text: "書かれなかったことにも理由がある" }] },
    { name: "重要な人々", entries: [{ text: "文化部デスクの槙さん", keyConnection: true }] },
  ],
  fellows: [],
  note: "港町の連続失踪を追ってから、夜の取材は二人一組と決めている。",
  chatpalette: "",
};

const KASUMI_CHARASH = {
  format: "charash-character",
  formatVersion: 1,
  profile: {
    name: "霧島霞",
    occupation: "探偵事務所の調査助手",
    age: { value: "24" },
    gender: "女",
    origin: "東京都",
    background: "資料整理と張り込みが仕事。鍵の構造を見ると分解したくなる。",
  },
  systems: {
    coc7: {
      abilities: {
        STR: { value: 50 },
        CON: { value: 55 },
        POW: { value: 65 },
        DEX: { value: 75 },
        APP: { value: 60 },
        SIZ: { value: 45 },
        INT: { value: 70 },
        EDU: { value: 60 },
      },
      derived: {
        hp: { value: 10 },
        mp: { value: 13 },
        san: { value: 64, max: 99 },
        luck: { value: 55 },
        damageBonus: { value: "+0" },
        build: { value: 0 },
        mov: { value: 9 },
      },
      skills: [
        { name: "回避", category: "combat", base: { value: 37 }, growth: 0, value: 37 },
        {
          name: "近接戦闘",
          specialty: "格闘",
          category: "combat",
          base: { value: 25 },
          growth: 0,
          value: 25,
        },
        { name: "鍵開け", category: "search", base: { value: 1 }, growth: 5, value: 71 },
        { name: "隠密", category: "search", base: { value: 20 }, growth: 0, value: 60 },
        { name: "聞き耳", category: "search", base: { value: 20 }, growth: 0, value: 55 },
        { name: "目星", category: "search", base: { value: 25 }, growth: 0, value: 70 },
        { name: "図書館", category: "search", base: { value: 20 }, growth: 0, value: 50 },
        { name: "追跡", category: "search", base: { value: 10 }, growth: 0, value: 45 },
        { name: "運転", specialty: "自動車", category: "action", base: { value: 20 }, growth: 0, value: 20 },
        { name: "説得", category: "negotiate", base: { value: 10 }, growth: 0, value: 30 },
        { name: "心理学", category: "knowledge", base: { value: 10 }, growth: 0, value: 65 },
        { name: "法律", category: "knowledge", base: { value: 5 }, growth: 0, value: 25 },
      ],
      weapons: [],
      items: [{ name: "ピッキングツール", quantity: "1", note: "" }],
    },
  },
};

const FUYUKI_CHARASH = {
  format: "charash-character",
  formatVersion: 1,
  profile: {
    name: "逢坂冬樹",
    occupation: "大学図書館の司書",
    age: { value: "31" },
    gender: "男",
    background: "郷土資料室の書庫番。深夜の怪異譚を集めている。",
  },
  systems: {
    emoklore: {
      abilities: {
        body: { value: 2 },
        dexterity: { value: 3 },
        mind: { value: 4 },
        senses: { value: 3 },
        intellect: { value: 5 },
        charm: { value: 2 },
        social: { value: 3 },
        fortune: { value: 2 },
      },
      derived: { hp: { value: 12 }, mp: { value: 14 } },
      resonance: {
        level: { acquired: 1, permanent: 5, value: 6 },
        emotions: { surface: "好奇", hidden: "孤独", roots: "書庫" },
      },
      skills: [
        { name: "検索", level: 3, ability: "intellect", value: 8 },
        { name: "洞察", level: 2, ability: "intellect", value: 7 },
        { name: "知覚", level: 2, ability: "senses", value: 5 },
        { name: "直感", level: 1, ability: "mind", value: 5 },
        { name: "芸術", specialty: "朗読", level: 1, ability: "charm", value: 3 },
        { name: "運動", level: 0, ability: "body", value: 2 },
        { name: "隠密", level: 0, ability: "dexterity", value: 3 },
        { name: "説得", level: 0, ability: "social", value: 3 },
      ],
      echoes: [{ scenario: "雨の書庫", emotion: "郷愁", consumed: false }],
      weapons: [],
      items: [],
    },
  },
};

/* ゆとシートⅡ for SW2.5 の ?mode=json の形（必要な項目だけ） */
const AKANTHA_YTSHEET = {
  characterName: "アカンタ",
  race: "エルフ",
  birth: "射手",
  age: "62",
  gender: "女",
  level: "3",
  gameVersion: "2.5",
  sttDex: "20",
  sttAgi: "19",
  sttStr: "9",
  sttVit: "12",
  sttInt: "16",
  sttMnd: "18",
  bonusDex: "3",
  bonusAgi: "3",
  bonusStr: "1",
  bonusVit: "2",
  bonusInt: "2",
  bonusMnd: "3",
  hpTotal: "32",
  mpTotal: "18",
  vitResistTotal: "5",
  mndResistTotal: "6",
  defenseTotalAllEva: "6",
  defenseTotalAllDef: "2",
  mobilityTotal: "19",
  expTotal: "5500",
  historyHonorTotal: "40",
  combatFeatsLv1: "精密射撃",
  combatFeatsLv3: "鷹の目",
  sheetDescriptionM: "種族:エルフ　性別:女　年齢:62\n技能:シューター3／スカウト2／セージ1",
  freeNote: "森の辺境から王都へ。先に撃って、先に逃げる。",
};

type DemoPatch = (c: Character) => Partial<Character>;

export const DEMO_SHEETS: Record<string, DemoPatch> = {
  ch_towa: (c) => {
    const url = "https://charaeno.com/7th/Tq3kZ8vX1pLm0aYb7RcWe";
    const parsed = parseCharaenoJson(TOWA_CHARAENO, url)!;
    return {
      stats: { san: c.stats.san ?? 42, luck: 60 },
      sheet: { ...parsed.sheet!, fetchedAt: SYNCED_AT },
      externalSync: linked("charaeno", url),
      import: { source: "キャラエノ", importedAt: "2026-09-05" },
    };
  },
  ch_kasumi: (c) => {
    const url = "https://charash.jp/view/demo-kasumi";
    const parsed = parseCharashJson(KASUMI_CHARASH, url)!;
    return {
      stats: { san: c.stats.san ?? 64, luck: 55 },
      sheet: { ...parsed.sheet!, fetchedAt: SYNCED_AT },
      externalSync: linked("charash", url),
      import: { source: "キャラッシュ", importedAt: "2026-09-05" },
    };
  },
  ch_fuyuki: (c) => {
    const url = "https://charash.jp/view/demo-fuyuki";
    const parsed = parseCharashJson(FUYUKI_CHARASH, url)!;
    return {
      stats: { von: c.stats.von ?? 6 },
      sheet: { ...parsed.sheet!, fetchedAt: SYNCED_AT },
      externalSync: linked("charash", url),
      import: { source: "キャラッシュ", importedAt: "2026-09-05" },
    };
  },
  ch_akantha: () => {
    const url = "https://yutorize.work/ytsheet/sw2.5/?id=DemoAk1";
    return {
      stats: { lv: 3, exp: 5500, honor: 40, hp: 32 },
      sheet: { ...sheetFromYtsheet(AKANTHA_YTSHEET, url)!, fetchedAt: SYNCED_AT },
      externalSync: linked("ytsheet", url),
      import: { source: "ゆとシートⅡ", importedAt: "2026-09-05" },
    };
  },
};
