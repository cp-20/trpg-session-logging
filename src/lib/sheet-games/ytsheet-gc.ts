/**
 * ゆとシートⅡ（/ytsheet/gc/）のグランクレストRPG を読む。
 * 六つの能力値（筋力・反射・感覚・知力・精神・共感）と判定値、HP・MP・行動値・移動力・天運、技能レベル、
 * クラス特技・ワークス特技・魔法、装備、部隊、絆を読む。
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

/** 「―」だけの欄は空として扱う */
function meaningful(v: unknown): string | undefined {
  const t = ytText(v);
  return t && !/^[―－-]+$/.test(t) ? t : undefined;
}

function numbered(r: Rec, prefix: string, suffix = "Name"): number[] {
  const re = new RegExp(`^${prefix}(\\d+)${suffix}$`);
  const out: number[] = [];
  for (const k of Object.keys(r)) {
    const m = k.match(re);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

/** 能力値（キー・名前）。技能もこの六つに分かれる */
const ABILITIES: [key: string, label: string][] = [
  ["Str", "筋力"],
  ["Ref", "反射"],
  ["Per", "感覚"],
  ["Int", "知力"],
  ["Mnd", "精神"],
  ["Emp", "共感"],
];

/** 技能。「芸術:」のように分野を後ろに書く技能は、分野（…LabelBranch）をつなげる */
function skillEntries(r: Rec): (SheetEntry | null)[] {
  return ABILITIES.flatMap(([stt, group]) =>
    numbered(r, `skill${stt}`, "Label").map((n) => {
      const label = textOf(r[`skill${stt}${n}Label`]);
      if (!label) return null;
      const branch = textOf(r[`skill${stt}${n}LabelBranch`]);
      return entry(branch ? `${label}${branch}` : label.replace(/[:：]$/, ""), r[`skill${stt}${n}Lv`], {
        group,
      });
    }),
  );
}

/** クラス特技・ワークス特技・魔法の 1 行 */
function abilityEntries(r: Rec, prefix: string): (SheetEntry | null)[] {
  return numbered(r, prefix).map((n) => {
    const p = `${prefix}${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const cost = meaningful(r[`${p}Cost`]);
    const dfclty = meaningful(r[`${p}Dfclty`]);
    const mc = meaningful(r[`${p}MC`]);
    const note = compact([
      meaningful(r[`${p}Type`]),
      meaningful(r[`${p}Duration`]),
      meaningful(r[`${p}Timing`]),
      meaningful(r[`${p}Check`]),
      meaningful(r[`${p}Target`]),
      meaningful(r[`${p}Range`]),
      dfclty ? `目標値${dfclty}` : undefined,
      cost ? `コスト${cost}` : undefined,
      mc ? `MC：${mc}` : undefined,
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, r[`${p}Lv`], { note: note || undefined });
  });
}

const SLOTS: [id: string, label: string][] = [
  ["Main", "メイン"],
  ["Sub", "サブ"],
  ["Other", "その他"],
];

function weaponEntries(r: Rec): (SheetEntry | null)[] {
  return SLOTS.map(([id, slot]) => {
    const p = `weapon${id}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const num = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v ? `${label}${v}` : undefined;
    };
    const note = compact([
      slot,
      meaningful(r[`${p}Type`]),
      meaningful(r[`${p}Skill`]),
      num("Acc", "命中"),
      num("Atk", "攻撃力"),
      num("Guard", "ガード"),
      num("Init", "行動"),
      num("Move", "移動"),
      meaningful(r[`${p}Range`]),
      num("Weight", "重量"),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function armorEntries(r: Rec): (SheetEntry | null)[] {
  return SLOTS.map(([id, slot]) => {
    const p = `armor${id}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const def = [
      ["Weapon", "武器"],
      ["Fire", "炎熱"],
      ["Shock", "衝撃"],
      ["Internal", "体内"],
    ].flatMap(([k, label]) => (textOf(r[`${p}Def${k}`]) ? [`${label}${textOf(r[`${p}Def${k}`])}`] : []));
    const num = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v ? `${label}${v}` : undefined;
    };
    const note = compact([
      slot,
      meaningful(r[`${p}Type`]),
      def.length ? `防御力 ${def.join("/")}` : undefined,
      num("Eva", "回避"),
      num("Init", "行動"),
      num("Move", "移動"),
      num("Weight", "重量"),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function vehicleEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "vehicle").map((n) => {
    const p = `vehicle${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const num = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v ? `${label}${v}` : undefined;
    };
    const note = compact([
      num("Atk", "攻撃"),
      num("Acc", "命中"),
      num("Eva", "回避"),
      num("Init", "行動"),
      num("Move", "移動"),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

/** 部隊（forceN）。名前の欄はなく、種別（歩兵など）を名前にする */
function forceEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "force", "Type").map((n) => {
    const p = `force${n}`;
    const type = ytText(r[`${p}Type`]);
    if (!type) return null;
    const num = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v ? `${label}${v}` : undefined;
    };
    const def = [
      ["Weapon", "武器"],
      ["Fire", "炎熱"],
      ["Shock", "衝撃"],
    ].flatMap(([k, label]) => (textOf(r[`${p}Def${k}`]) ? [`${label}${textOf(r[`${p}Def${k}`])}`] : []));
    const note = compact([
      num("Hp", "HP"),
      num("Atk", "攻撃"),
      num("Init", "行動"),
      num("Morale", "士気"),
      def.length ? `防御力 ${def.join("/")}` : undefined,
      ...ABILITIES.map(([k, label]) => num(k, label)),
    ]).join("　");
    return listEntry(type, r[`${p}Lv`], { note: note || undefined });
  });
}

/** ゆとシートⅡのグランクレストRPG（JSON のルート）を読む */
export function readYtsheetGc(root: unknown): GameSheetParts {
  const r: Rec = root && typeof root === "object" && !Array.isArray(root) ? (root as Rec) : {};
  const level = numOf(r.level);
  const hp = numOf(r.sttHpTotal);
  const mp = numOf(r.sttMpTotal);
  const fate = numOf(r.sttFateTotal);
  const stats: Record<string, number> = {};
  if (level !== undefined) stats.level = level;
  if (hp !== undefined) stats.hp = hp;
  if (mp !== undefined) stats.mp = mp;
  if (fate !== undefined) stats.fate = fate;
  const countryName = textOf(r.country);
  return {
    systemLabel: "グランクレストRPG",
    profile: [
      entry("クラス", r.class),
      entry("ワークス", r.works),
      entry("スタイル", r.style),
      entry("性別", r.gender),
      entry("年齢", r.age),
      entry("所属国家", countryName),
    ],
    sections: [
      section(
        "abilities",
        "能力値",
        "abilities",
        ABILITIES.map(([k, label]) =>
          entry(label, r[`stt${k}Total`], {
            note:
              numOf(r[`stt${k}CheckTotal`]) !== undefined
                ? `判定値${numOf(r[`stt${k}CheckTotal`])}`
                : undefined,
          }),
        ),
      ),
      section("resources", "副能力値", "resources", [
        entry("レベル", level),
        entry("HP", hp),
        entry("MP", mp),
        entry("行動値", r.sttInitTotal),
        entry("移動力", r.sttMoveTotal),
        entry("所持可能重量", r.sttMaxWeight),
        entry("天運", fate),
      ]),
      section("skills", "技能", "skills", skillEntries(r)),
      section("classAbilities", "クラス特技", "list", abilityEntries(r, "classAbility")),
      section("worksAbilities", "ワークス特技", "list", abilityEntries(r, "worksAbility")),
      section("magic", "魔法", "list", abilityEntries(r, "magic")),
      section("weapons", "武器", "list", weaponEntries(r)),
      section("armors", "防具", "list", armorEntries(r)),
      section("vehicles", "乗騎", "list", vehicleEntries(r)),
      section("forces", "部隊", "list", forceEntries(r)),
      section(
        "bonds",
        "絆",
        "list",
        numbered(r, "bond").map((n) => {
          const p = `bond${n}`;
          const emotion = compact([textOf(r[`${p}EmotionMain`]), textOf(r[`${p}EmotionSub`])]).join("／");
          return listEntry(ytText(r[`${p}Name`]) ?? "", ytText(r[`${p}Relation`]), {
            note: emotion || undefined,
          });
        }),
      ),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
