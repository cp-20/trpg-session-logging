import { BCDICE_SYSTEMS } from "../lib/bcdice-systems.ts";
import type { BcdiceSystem } from "../lib/bcdice-systems.ts";
import type { Channel, RoleKey, SystemDef } from "../types";

/** BCDice の一覧にあるシステムを、能力値・続く値まで持つ定義にする（名前は BCDice の一覧から） */
function bcdiceDetailed(
  bcdiceId: string,
  def: Omit<SystemDef, "id" | "name" | "short" | "bcdiceId">,
): SystemDef {
  const b = BCDICE_SYSTEMS.find((x) => x.id === bcdiceId);
  if (!b) throw new Error(`BCDice に ${bcdiceId} がありません`);
  return { id: bcdiceId, name: b.name, short: b.name, bcdiceId, ...def };
}

/**
 * 能力値・技能まで持つシステム。ID は保存データに残っているので変えない。
 * BCDice が対応するものは bcdiceId で結び、BCDice の一覧から同じものを重ねて出さない。
 */
const DETAILED_SYSTEMS: Record<string, SystemDef> = {
  coc7: {
    id: "coc7",
    name: "クトゥルフ神話TRPG 7版",
    short: "クトゥルフ神話TRPG 7版",
    color: "#3f5e78",
    emoji: "CoC7",
    bcdiceId: "Cthulhu7th",
    keywords: ["CoC", "新クトゥルフ神話TRPG"],
    roles: { GM: "KP" },
    /*
     * 卓をまたいで続くのは SAN だけ。幸運・HP・MP は今の値として見せない。
     * SAN の max は入力できる上限。そのキャラの上限は 99 − クトゥルフ神話（src/lib/system-rules.ts の sanMax）
     */
    stats: [
      { key: "san", label: "SAN", max: 99, carry: true },
      { key: "luck", label: "幸運", max: 99 },
    ],
    growthLabel: "成長ロール",
    skills: [
      "目星",
      "聞き耳",
      "図書館",
      "心理学",
      "回避",
      "闘争",
      "追跡",
      "応急手当",
      "精神分析",
      "母国語",
      "コンピューター",
      "隠れる",
      "天文学",
    ],
  },
  coc6: {
    id: "coc6",
    name: "クトゥルフ神話TRPG 6版",
    short: "クトゥルフ神話TRPG 6版",
    color: "#4e5b7c",
    emoji: "CoC6",
    bcdiceId: "Cthulhu",
    keywords: ["CoC"],
    roles: { GM: "KP" },
    stats: [{ key: "san", label: "SAN", max: 99, carry: true }],
    growthLabel: "成長ロール",
    skills: [
      "目星",
      "聞き耳",
      "図書館",
      "心理学",
      "回避",
      "こぶし",
      "追跡",
      "応急手当",
      "精神分析",
      "母国語",
    ],
  },
  emoklore: {
    id: "emoklore",
    name: "エモクロアTRPG",
    short: "エモクロアTRPG",
    color: "#854c68",
    emoji: "エモ",
    bcdiceId: "Emoklore",
    /* 共鳴は卓ごとに決め直すので引き継がない（今の値として見せない） */
    stats: [{ key: "von", label: "共鳴", max: 10 }],
    growthLabel: "修得",
    skills: ["神術", "魔術", "近接", "弓術", "知識", "交渉", "運動", "感知"],
  },
  sw25: {
    id: "sw25",
    name: "ソード・ワールド2.5",
    short: "ソード・ワールド2.5",
    color: "#a85224",
    emoji: "SW",
    bcdiceId: "SwordWorld2.5",
    keywords: ["SW"],
    roles: { ENEMY: "魔物" },
    /* 冒険者レベル・経験点・名誉点は続く。HP・MP は卓ごとに戻る */
    stats: [
      { key: "lv", label: "冒険者レベル", carry: true },
      { key: "exp", label: "経験点", carry: true },
      { key: "honor", label: "名誉点", carry: true },
      { key: "hp", label: "HP" },
    ],
    growthLabel: "成長",
    skills: [
      "冒険者技能",
      "戦闘技能",
      "行使",
      "練技",
      "賦術",
      "射撃",
      "打撃",
      "回避",
      "生命抵抗",
      "精神抵抗",
    ],
  },
  /*
   * ここから下は BCDice の ID をそのまま卓譜の ID にしたもの（BCDice の一覧から選んだ記録と同じ ID なので移し替えが要らない）。
   * stats の key はキャラシの読み取り（src/lib/sheet-games/）が返す key と同じ。carry は卓をまたいで続く値だけ
   */
  "SwordWorld2.0": bcdiceDetailed("SwordWorld2.0", {
    color: "#9a5a2e",
    emoji: "SW",
    roles: { ENEMY: "魔物" },
    stats: [
      { key: "lv", label: "冒険者レベル", carry: true },
      { key: "exp", label: "経験点", carry: true },
      { key: "honor", label: "名誉点", carry: true },
      { key: "hp", label: "HP" },
    ],
    growthLabel: "成長",
    skills: ["冒険者技能", "戦闘技能", "命中", "回避", "生命抵抗", "精神抵抗"],
  }),
  DoubleCross: bcdiceDetailed("DoubleCross", {
    color: "#5e4f7c",
    emoji: "DX",
    roles: { ENEMY: "エネミー" },
    /* 侵蝕率は卓ごとに基本値から始まるので続く値にしない */
    stats: [
      { key: "exp", label: "経験点", carry: true },
      { key: "hp", label: "HP" },
    ],
    growthLabel: "経験点",
    skills: ["白兵", "回避", "射撃", "知覚", "RC", "意志", "交渉", "調達", "運転", "芸術", "知識", "情報"],
  }),
  ShinobiGami: bcdiceDetailed("ShinobiGami", {
    color: "#4f5f52",
    emoji: "忍",
    stats: [],
    growthLabel: "功績点",
    skills: [],
  }),
  Insane: bcdiceDetailed("Insane", {
    color: "#5c4a52",
    emoji: "狂",
    stats: [],
    growthLabel: "功績点",
    skills: [],
  }),
  Nechronica: bcdiceDetailed("Nechronica", {
    color: "#6a4d5e",
    emoji: "ネクロ",
    roles: { GM: "ネクロマンサー" },
    stats: [{ key: "favor", label: "寵愛点", carry: true }],
    growthLabel: "寵愛点",
    skills: [],
  }),
  Arianrhod: bcdiceDetailed("Arianrhod", {
    color: "#3f6a6e",
    emoji: "AR",
    roles: { ENEMY: "エネミー" },
    stats: [
      { key: "level", label: "レベル", carry: true },
      { key: "exp", label: "経験点", carry: true },
      { key: "hp", label: "HP" },
      { key: "mp", label: "MP" },
    ],
    growthLabel: "成長点",
    skills: [],
  }),
  LogHorizon: bcdiceDetailed("LogHorizon", {
    color: "#456a4a",
    emoji: "LH",
    roles: { ENEMY: "エネミー" },
    stats: [
      { key: "lv", label: "CR", carry: true },
      { key: "hp", label: "HP" },
    ],
    growthLabel: "成長",
    skills: [],
  }),
  Kamigakari: bcdiceDetailed("Kamigakari", {
    color: "#7a4a3a",
    emoji: "神",
    stats: [
      { key: "level", label: "レベル", carry: true },
      { key: "exp", label: "経験点", carry: true },
    ],
    growthLabel: "経験点",
    skills: [],
  }),
  NightWizard3rd: bcdiceDetailed("NightWizard3rd", {
    color: "#3e4e72",
    emoji: "NW",
    roles: { ENEMY: "エネミー" },
    stats: [{ key: "level", label: "CL", carry: true }],
    growthLabel: "経験点",
    skills: [],
  }),
  GoblinSlayer: bcdiceDetailed("GoblinSlayer", {
    color: "#6b5a3a",
    emoji: "GS",
    stats: [
      { key: "level", label: "冒険者レベル", carry: true },
      { key: "exp", label: "経験点", carry: true },
      { key: "growth", label: "成長点", carry: true },
    ],
    growthLabel: "成長",
    skills: [],
  }),
  MagicaLogia: bcdiceDetailed("MagicaLogia", {
    color: "#4a4f78",
    emoji: "魔",
    /* 攻撃力・防御力・根源力・魔力は卓ごとに決め直す */
    stats: [{ key: "exp", label: "功績点", carry: true }],
    growthLabel: "功績点",
    skills: [],
  }),
  KillDeathBusiness: bcdiceDetailed("KillDeathBusiness", {
    color: "#7a3e44",
    emoji: "KDB",
    stats: [
      { key: "soul", label: "ソウル", carry: true },
      { key: "hellslug", label: "ヘルスラッグ", carry: true },
    ],
    growthLabel: "成長",
    skills: [],
  }),
  StellarKnights: bcdiceDetailed("StellarKnights", {
    color: "#566a8a",
    emoji: "銀剣",
    stats: [{ key: "medal", label: "勲章", carry: true }],
    growthLabel: "勲章",
    skills: [],
  }),
  Satasupe: bcdiceDetailed("Satasupe", {
    color: "#8a5a3e",
    emoji: "サタ",
    stats: [
      { key: "crime", label: "犯罪", carry: true },
      { key: "life", label: "生活", carry: true },
      { key: "love", label: "恋愛", carry: true },
      { key: "culture", label: "教養", carry: true },
      { key: "combat", label: "戦闘", carry: true },
      { key: "emotion", label: "性業値", carry: true },
      { key: "exp", label: "経験値", carry: true },
    ],
    growthLabel: "経験値",
    skills: [],
  }),
  FutariSousa: bcdiceDetailed("FutariSousa", {
    color: "#5a6a5e",
    emoji: "2S",
    stats: [],
    growthLabel: "記録",
    skills: [],
  }),
  GranCrest: bcdiceDetailed("GranCrest", {
    color: "#6e5a2e",
    emoji: "GC",
    stats: [
      { key: "level", label: "レベル", carry: true },
      { key: "hp", label: "HP" },
      { key: "mp", label: "MP" },
    ],
    growthLabel: "成長",
    skills: [],
  }),
  MamonoScramble: bcdiceDetailed("MamonoScramble", {
    color: "#5e5a7a",
    emoji: "MS",
    stats: [{ key: "level", label: "強度", carry: true }],
    growthLabel: "成長",
    skills: [],
  }),
  KizunaBullet: bcdiceDetailed("KizunaBullet", {
    color: "#6a4a4a",
    emoji: "KB",
    stats: [],
    growthLabel: "成長",
    skills: [],
  }),
  madamis: {
    id: "madamis",
    name: "マーダーミステリー",
    short: "マーダーミステリー",
    color: "#5c554e",
    emoji: "MM",
    stats: [],
    growthLabel: "体験",
    skills: [],
  },
  general: {
    id: "general",
    name: "汎用・その他",
    short: "汎用・その他",
    color: "#6b5d50",
    emoji: "汎用",
    bcdiceId: "DiceBot",
    stats: [],
    growthLabel: "記録",
    skills: [],
  },
};

/**
 * BCDice の一覧から作るシステムの、役割の呼び方（P8: システムの言葉）。分かっているものだけ書く。
 * 書かないシステムは GM / PL で、エネミーの役割を出さない
 */
const BCDICE_ROLES: Record<string, Partial<Record<RoleKey, string>>> = {
  PulpCthulhu: { GM: "KP" },
  Nechronica: { GM: "ネクロマンサー" },
  DoubleCross: { ENEMY: "エネミー" },
  Arianrhod: { ENEMY: "エネミー" },
  LogHorizon: { ENEMY: "エネミー" },
  "SwordWorld2.0": { ENEMY: "魔物" },
};

// SysBadge の点の色。暖色の紙に載せて区別できる、彩度を抑えた色
const GENERIC_COLORS = [
  "#6b5d50",
  "#7a5a43",
  "#5d6b58",
  "#56657a",
  "#7a5566",
  "#6f6845",
  "#4f6a6a",
  "#7d4f3c",
];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return GENERIC_COLORS[Math.abs(h) % GENERIC_COLORS.length]!;
}

/** BCDice の一覧にあって、能力値・技能の定義を持たないシステム */
function genericSystemDef(b: BcdiceSystem): SystemDef {
  return {
    id: b.id,
    name: b.name,
    short: b.name,
    color: colorFor(b.id),
    emoji: "TRPG",
    stats: [],
    growthLabel: "記録",
    skills: [],
    bcdiceId: b.id,
    keywords: [b.id, b.sortKey],
    roles: BCDICE_ROLES[b.id],
    generic: true,
  };
}

/** 国際化版（韓国語・中国語・英語の版）。日本語の版と見分けるため、選ぶときは別の見出しにまとめる */
export function isInternationalSystem(sys: SystemDef): boolean {
  const b = sys.bcdiceId ? BCDICE_BY_ID.get(sys.bcdiceId) : undefined;
  return Boolean(b && b.sortKey.startsWith("国際化:"));
}

const BCDICE_BY_ID = new Map(BCDICE_SYSTEMS.map((b) => [b.id, b]));
const DETAILED_BCDICE_IDS = new Set(Object.values(DETAILED_SYSTEMS).map((s) => s.bcdiceId));

for (const sys of Object.values(DETAILED_SYSTEMS)) {
  const b = sys.bcdiceId ? BCDICE_BY_ID.get(sys.bcdiceId) : undefined;
  if (b) sys.keywords = [...(sys.keywords ?? []), b.id, b.name, b.sortKey];
}

/** システム ID → 定義。詳しい定義を先に、BCDice の一覧（読みの順）をそのあとに並べる */
export const SYSTEMS: Record<string, SystemDef> = {
  ...DETAILED_SYSTEMS,
  ...Object.fromEntries(
    BCDICE_SYSTEMS.filter((b) => !DETAILED_BCDICE_IDS.has(b.id)).map((b) => [b.id, genericSystemDef(b)]),
  ),
};

export const SYSTEM_LIST = Object.values(SYSTEMS);

/** 能力値・技能まで持つシステムの ID */
export const DETAILED_SYSTEM_IDS: readonly string[] = Object.keys(DETAILED_SYSTEMS);

/** 卓をまたいで続く値（キャラクターの「今」として見せるもの） */
export function carriedStats(sys: SystemDef | undefined) {
  return (sys?.stats ?? []).filter((s) => s.carry);
}

/**
 * ログのロール形式・テキストからシステムを自動推定する。
 */
export function inferSystem(channels: Channel[]): { id: string } | null {
  let coc = 0;
  let emo = 0;
  let sw = 0;
  channels.forEach((c) =>
    c.msgs.forEach((m) => {
      const t = `${m.roll?.cmd ?? ""} ${m.roll?.skill ?? ""} ${m.text ?? ""}`;
      if (/CC<=|CBR|SANチェック|SAN ?\d*D\d/.test(t)) coc++;
      if (/結合|自分:不可能|神術|修得/.test(t)) emo++;
      if (/2D6/.test(t)) sw++;
    }),
  );
  if (emo > 0 && emo >= coc) return { id: "emoklore" };
  if (coc > 0) return { id: "coc7" };
  if (sw > 0) return { id: "sw25" };
  return null;
}
