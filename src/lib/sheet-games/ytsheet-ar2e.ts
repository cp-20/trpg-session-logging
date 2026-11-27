/**
 * ゆとシートⅡ（/ytsheet/ar2e/）のアリアンロッド RPG 2E を読む。
 * 能力値・戦闘値・スキル・装備・縁故・誓約はシートに保存された値をそのまま読む（再計算しない）。
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

function numbered(r: Rec, prefix: string): number[] {
  const re = new RegExp(`^${prefix}(\\d+)Name$`);
  const out: number[] = [];
  for (const k of Object.keys(r)) {
    const m = k.match(re);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

const ABILITIES: [key: string, label: string][] = [
  ["Str", "筋力"],
  ["Dex", "器用"],
  ["Agi", "敏捷"],
  ["Int", "知力"],
  ["Sen", "感知"],
  ["Mnd", "精神"],
  ["Luk", "幸運"],
];

/** スキルの取得元（skillNType）。クラス名ならそのまま */
const SKILL_TYPE: Record<string, string> = {
  general: "一般",
  race: "種族",
  style: "流派",
  faith: "天恵",
  geis: "誓約",
  add: "他スキル",
};

/** 装備品の欄（右手・左手・頭部・胴部・補助防具・装身具） */
const ARMAMENTS: [id: string, label: string][] = [
  ["HandR", "右手"],
  ["HandL", "左手"],
  ["Head", "頭部"],
  ["Body", "胴部"],
  ["Sub", "補助防具"],
  ["Other", "装身具"],
];

function firstNum(r: Rec, ...keys: string[]): number | undefined {
  for (const k of keys) {
    const n = numOf(r[k]);
    if (n !== undefined) return n;
  }
  return undefined;
}

function skillEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "skill").map((n) => {
    const p = `skill${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const type = textOf(r[`${p}Type`]);
    const cost = meaningful(r[`${p}Cost`]);
    const note = compact([
      meaningful(r[`${p}Timing`]),
      meaningful(r[`${p}Roll`]),
      meaningful(r[`${p}Target`]),
      meaningful(r[`${p}Range`]),
      cost ? `コスト${cost}` : undefined,
      meaningful(r[`${p}Reqd`]),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, r[`${p}Lv`], {
      group: type ? (SKILL_TYPE[type] ?? type) : undefined,
      note: note || undefined,
    });
  });
}

function armamentEntries(r: Rec): (SheetEntry | null)[] {
  return ARMAMENTS.map(([id, place]) => {
    const p = `armament${id}`;
    const name = meaningful(r[`${p}Name`]);
    if (!name) return null;
    const stat = (key: string, label: string) => {
      const v = textOf(r[`${p}${key}`]);
      return v && v !== "0" ? `${label}${v}` : undefined;
    };
    const type = textOf(r[`${p}Type`]);
    const note = compact([
      place,
      type && type !== "防具" && type !== "装身具" ? type : undefined,
      stat("Acc", "命中"),
      stat("Atk", "攻撃力"),
      stat("Eva", "回避"),
      stat("Def", "物理防御力"),
      stat("MDef", "魔法防御力"),
      stat("Ini", "行動"),
      stat("Move", "移動"),
      meaningful(r[`${p}Range`]),
      stat("Weight", "重量"),
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

/** ゆとシートⅡのアリアンロッド 2E（JSON のルート）を読む */
export function readYtsheetAr2e(root: unknown): GameSheetParts {
  const r: Rec = root && typeof root === "object" && !Array.isArray(root) ? (root as Rec) : {};
  const race = r.race === "free" ? textOf(r.raceFree) : textOf(r.race);
  const level = numOf(r.level);
  const gold = firstNum(r, "moneyTotal", "money");
  const stats: Record<string, number> = {};
  if (level !== undefined) stats.level = level;
  if (gold !== undefined) stats.gold = gold;
  const fateLimit = numOf(r.fateLimit);
  return {
    systemLabel: "アリアンロッドRPG 2E",
    profile: [
      entry("種族", race),
      entry("性別", r.gender),
      entry("年齢", r.age),
      entry("信仰", r.faith),
      entry("出自", r.lifepathOrigin, { note: ytText(r.lifepathOriginNote) }),
      entry("境遇", r.lifepathExperience, { note: ytText(r.lifepathExperienceNote) }),
      entry("目的", r.lifepathMotive, { note: ytText(r.lifepathMotiveNote) }),
    ],
    sections: [
      section("levels", "クラス", "levels", [
        entry("キャラクターレベル", level),
        entry("メインクラス", r.classMain),
        entry("サポートクラス", r.classSupport),
        entry("称号クラス", r.classTitle),
      ]),
      section(
        "abilities",
        "能力値",
        "abilities",
        ABILITIES.map(([k, label]) =>
          entry(label, r[`stt${k}Total`], {
            note: numOf(r[`stt${k}Base`]) !== undefined ? `基本値${numOf(r[`stt${k}Base`])}` : undefined,
          }),
        ),
      ),
      section("resources", "副能力値", "resources", [
        entry("HP", r.hpTotal),
        entry("MP", r.mpTotal),
        entry("フェイト", r.fateTotal, {
          note: fateLimit !== undefined ? `使用上限${fateLimit}` : undefined,
        }),
        entry("行動値", r.battleTotalIni),
        entry("移動力", r.battleTotalMove),
        entry("ゴールド", gold),
      ]),
      section("combat", "戦闘", "resources", [
        entry("命中判定", firstNum(r, "battleTotalAcc", "battleTotalAccR", "battleTotalAccL")),
        entry("攻撃力", firstNum(r, "battleTotalAtk", "battleTotalAtkR", "battleTotalAtkL")),
        entry("回避判定", r.battleTotalEva),
        entry("物理防御力", r.battleTotalDef),
        entry("魔法防御力", r.battleTotalMDef),
      ]),
      section("skills", "スキル", "levels", skillEntries(r)),
      section("armaments", "装備", "list", armamentEntries(r)),
      section(
        "connections",
        "縁故",
        "list",
        numbered(r, "connection").map((n) =>
          listEntry(ytText(r[`connection${n}Name`]) ?? "", ytText(r[`connection${n}Relation`]), {
            note: ytText(r[`connection${n}Note`]),
          }),
        ),
      ),
      section(
        "geises",
        "誓約",
        "list",
        numbered(r, "geis").map((n) => {
          const cost = numOf(r[`geis${n}Cost`]);
          const note = compact([
            cost !== undefined ? `成長点${cost}` : undefined,
            ytText(r[`geis${n}Note`]),
          ]).join("　");
          return listEntry(ytText(r[`geis${n}Name`]) ?? "", "", { note: note || undefined });
        }),
      ),
      textSection("items", "所持品", ytText(r.items)),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
