/**
 * ゆとシートⅡ（/ytsheet/gs/）のゴブリンスレイヤーTRPG を読む。
 * 能力値（第一・第二）、状態、職業と各基準値、冒険者技能・一般技能・呪文・武技、装備、経験点・成長点を読む。
 */
import {
  compact,
  entry,
  listEntry,
  numOf,
  section,
  textOf,
  textSection,
  type SheetEntry,
  type GameSheetParts,
} from "../sheet";

type Rec = Record<string, unknown>;

function ytText(v: unknown): string | undefined {
  return textOf(v)
    ?.replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function numbered(r: Rec, prefix: string): number[] {
  const re = new RegExp(`^${prefix}(\\d+)Name$`);
  const out: number[] = [];
  for (const k of Object.keys(r)) {
    const m = k.match(re);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

/** 職業（キー上の略号・名前） */
const CLASSES: [id: string, name: string][] = [
  ["Fig", "戦士"],
  ["Mon", "武道家"],
  ["Ran", "野伏"],
  ["Sco", "斥候"],
  ["Sor", "魔術師"],
  ["Pri", "神官"],
  ["Dra", "竜司祭"],
  ["Sha", "精霊使い"],
  ["Nec", "死人占い師"],
];

/** 第一能力値（体力点・魂魄点・技量点・知力点） */
const ABILITY1: [key: string, label: string][] = [
  ["Str", "体力点"],
  ["Psy", "魂魄点"],
  ["Tec", "技量点"],
  ["Int", "知力点"],
];
/** 第二能力値（集中度・持久度・反射度） */
const ABILITY2: [key: string, label: string][] = [
  ["Foc", "集中度"],
  ["Edu", "持久度"],
  ["Ref", "反射度"],
];

const HIT_KINDS: [key: string, label: string][] = [
  ["Melee", "近接"],
  ["Throwing", "投擲"],
  ["Projectile", "弩弓"],
];

function levelByClass(r: Rec): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, name] of CLASSES) {
    const lv = numOf(r[`lv${id}`]);
    if (lv) out.set(name, lv);
  }
  return out;
}

function classEntries(r: Rec): (SheetEntry | null)[] {
  return CLASSES.map(([id, name]) => {
    const lv = numOf(r[`lv${id}`]);
    if (!lv) return null;
    const faith = name === "神官" ? textOf(r.faith) : undefined;
    return entry(faith ? `${name}（${faith}）` : name, lv);
  });
}

/** 威力（武器の威力 + 判定に使う職業のレベル + 修正）を表示と同じ書き方で */
function powerText(r: Rec, p: string, levels: Map<string, number>): string | undefined {
  const base = textOf(r[`${p}Power`]);
  if (!base) return undefined;
  const cls = textOf(r[`${p}Class`]);
  const lv = cls ? levels.get(cls) : undefined;
  const mod = numOf(r[`${p}PowerMod`]);
  const add = (n: number | undefined) => (n ? (n > 0 ? `+${n}` : `${n}`) : "");
  return `${base}${add(lv)}${add(mod)}`;
}

function weaponEntries(r: Rec): (SheetEntry | null)[] {
  const levels = levelByClass(r);
  return numbered(r, "weapon").map((n) => {
    const p = `weapon${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const hit = textOf(r[`${p}HitTotal`]);
    const power = powerText(r, p, levels);
    const note = compact([
      textOf(r[`${p}Type`]),
      textOf(r[`${p}Weight`]),
      compact([textOf(r[`${p}Usage`]), textOf(r[`${p}Attr`])]).join("／") || undefined,
      hit ? `命中${hit}` : undefined,
      power ? `威力${power}` : undefined,
      textOf(r[`${p}Range`]),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function armorEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "armor").map((n) => {
    const p = `armor${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const material = textOf(r[`${p}Material`]);
    const type = textOf(r[`${p}Type`]);
    const num = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v ? `${label}${v}` : undefined;
    };
    const note = compact([
      type ? `${type}${material ? `（${material}）` : ""}` : undefined,
      textOf(r[`${p}Weight`]),
      num("DodgeTotal", "回避基準値"),
      num("Armor", "装甲値"),
      textOf(r[`${p}Stealth`]) ? `隠密${textOf(r[`${p}Stealth`])}` : undefined,
      num("MoveTotal", "移動力"),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function shieldEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "shield").map((n) => {
    const p = `shield${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const material = textOf(r[`${p}Material`]);
    const type = textOf(r[`${p}Type`]);
    const num = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v ? `${label}${v}` : undefined;
    };
    const note = compact([
      type ? `${type}${material ? `（${material}）` : ""}` : undefined,
      textOf(r[`${p}Weight`]),
      num("BlockTotal", "盾受け基準値"),
      num("ArmorTotal", "盾受け値"),
      textOf(r[`${p}Stealth`]) ? `隠密${textOf(r[`${p}Stealth`])}` : undefined,
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

/** 冒険者技能・一般技能（名称・習得段階・効果・参照） */
function skillEntries(r: Rec, prefix: string): (SheetEntry | null)[] {
  return numbered(r, prefix).map((n) => {
    const p = `${prefix}${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const page = textOf(r[`${p}Page`]);
    const note = compact([ytText(r[`${p}Note`]), page ? `（${page}）` : undefined]).join("");
    return listEntry(name, r[`${p}Grade`], { note: note || undefined });
  });
}

function spellEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "spell").map((n) => {
    const p = `spell${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const type = textOf(r[`${p}Type`]);
    const attr = textOf(r[`${p}Attr`]);
    const dfclt = textOf(r[`${p}Dfclt`]);
    const note = compact([
      textOf(r[`${p}System`]),
      type ? `${type}${attr ? `（${attr}）` : ""}` : undefined,
      dfclt ? `難易度${dfclt}` : undefined,
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function artEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "arts").map((n) => {
    const p = `arts${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const note = compact([
      textOf(r[`${p}Weapon`]),
      textOf(r[`${p}Skill`]),
      textOf(r[`${p}Cost`]),
      textOf(r[`${p}Terms`]),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

/** 命中基準値（職業ごとに 近接・投擲・弩弓）。値のあるものだけ */
function hitScoreEntries(r: Rec): (SheetEntry | null)[] {
  return CLASSES.flatMap(([id, name]) =>
    HIT_KINDS.map(([kind, label]) => entry(`${name}：${label}`, r[`hitScore${id}${kind}`])),
  );
}

/** 呪文行使基準値（呪文使いの職業ごと） */
function spellCastEntries(r: Rec): (SheetEntry | null)[] {
  return CLASSES.map(([id, name]) => entry(`${name}の呪文行使基準値`, r[`spellCast${id}`]));
}

/** ゆとシートⅡのゴブリンスレイヤーTRPG（JSON のルート）を読む */
export function readYtsheetGs(root: unknown): GameSheetParts {
  const r: Rec = root && typeof root === "object" && !Array.isArray(root) ? (root as Rec) : {};
  const raceFree = textOf(r.raceFree);
  const raceBase = textOf(r.race);
  const race = raceFree ? (raceBase ? `${raceFree}（${raceBase}）` : raceFree) : raceBase;
  const career = compact([r.careerOrigin, r.careerGenesis, r.careerEncounter].map((v) => textOf(v)));
  const level = numOf(r.level);
  const exp = numOf(r.expTotal);
  const adp = numOf(r.adpTotal) ?? numOf(r.growPointTotal);
  const stats: Record<string, number> = {};
  if (level !== undefined) stats.level = level;
  if (exp !== undefined) stats.exp = exp;
  if (adp !== undefined) stats.growth = adp;
  const bonus = textOf(r.ability1Bonus);
  return {
    systemLabel: "ゴブリンスレイヤーTRPG",
    profile: [
      entry("種族", race),
      entry("性別", r.gender),
      entry("年齢", r.age),
      entry("等級", r.rank),
      entry("信仰", r.faith),
      entry("出自／来歴／邂逅", career.join("／")),
    ],
    sections: [
      section("levels", "職業", "levels", [entry("冒険者レベル", level), ...classEntries(r)]),
      section(
        "abilities",
        "第一能力値",
        "abilities",
        ABILITY1.map(([k, label]) =>
          entry(label, r[`ability1${k}`], { note: bonus === k ? "ボーナス" : undefined }),
        ),
      ),
      section(
        "abilities2",
        "第二能力値",
        "abilities",
        ABILITY2.map(([k, label]) => entry(label, r[`ability2${k}`])),
      ),
      section("resources", "状態", "resources", [
        entry("生命力", r.statusLife),
        entry("移動力", r.statusMove),
        entry("呪文使用回数", r.statusSpell),
        entry("呪文抵抗基準値", r.statusResist),
        entry("経験点", exp),
        entry("成長点", adp),
        entry("冒険回数", r.adventures),
        entry("達成数", r.completed),
      ]),
      section("hitscores", "命中基準値", "resources", [...hitScoreEntries(r), ...spellCastEntries(r)]),
      section("skills", "冒険者技能", "list", skillEntries(r, "skill")),
      section("generalSkills", "一般技能", "list", skillEntries(r, "generalSkill")),
      section("spells", "呪文", "list", spellEntries(r)),
      section("arts", "武技", "list", artEntries(r)),
      section("weapons", "武器", "list", weaponEntries(r)),
      section("armors", "鎧", "list", armorEntries(r)),
      section("shields", "盾", "list", shieldEntries(r)),
      textSection("items", "所持品", ytText(r.items)),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
