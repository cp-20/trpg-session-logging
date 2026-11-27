/**
 * ゆとシートⅡ（/ytsheet/vc/）のヴィジランテ・コードを読む。
 * 能力値（バイタリティ・テクニック・クレバー・カリスマ）、HP・スタミナ、戦闘値、特技・アイテム・グッズを読む。
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

function numbered(r: Rec, prefix: string, suffix = "Name"): number[] {
  const re = new RegExp(`^${prefix}(\\d+)${suffix}$`);
  const out: number[] = [];
  for (const k of Object.keys(r)) {
    const m = k.match(re);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

function asRec(root: unknown): Rec {
  return root && typeof root === "object" && !Array.isArray(root) ? (root as Rec) : {};
}

/** 戦闘値の並び（キーの末尾 → 名前）。命中値・詠唱値・回避値・攻撃値・意志値・物防値・魔防値・行動値・耐久値 */
const BATTLE: [key: string, label: string][] = [
  ["Acc", "命中値"],
  ["Spl", "詠唱値"],
  ["Eva", "回避値"],
  ["Atk", "攻撃値"],
  ["Det", "意志値"],
  ["Def", "物防値"],
  ["Mdf", "魔防値"],
  ["Ini", "行動値"],
  ["Str", "耐久値"],
];

/** 装備欄（武器・頭・胴など）。名前と、値のある戦闘値を補足にする */
const EQUIPMENT: [id: string, place: string][] = [
  ["Weapon", "武器"],
  ["Head", "頭"],
  ["Body", "胴"],
  ["Race", "種族特性"],
];

function equipmentEntries(r: Rec): (SheetEntry | null)[] {
  return EQUIPMENT.map(([id, place]) => {
    const name = ytText(r[`battle${id}Name`]);
    if (!name) return null;
    const stats = BATTLE.flatMap(([k, label]) => {
      const n = numOf(r[`battle${id}${k}`]);
      return n ? [`${label}${n > 0 ? "+" : ""}${n}`] : [];
    });
    return listEntry(name, "", { note: [place, ...stats].join("　") });
  });
}

/** アクセサリ（battleAcc{N}Name） */
function accessoryEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "battleAcc").map((n) => {
    const p = `battleAcc${n}`;
    const name = ytText(r[`${p}Name`]);
    if (!name) return null;
    const stats = BATTLE.flatMap(([k, label]) => {
      const v = numOf(r[`${p}${k}`]);
      return v ? [`${label}${v > 0 ? "+" : ""}${v}`] : [];
    });
    return listEntry(name, "", { note: ["アクセサリ", ...stats].join("　") });
  });
}

/** ゆとシートⅡのヴィジランテ・コード（JSON のルート）を読む */
export function readYtsheetVc(root: unknown): GameSheetParts {
  const r = asRec(root);
  const level = numOf(r.level);
  const hp = numOf(r.hpMax);
  const stamina = numOf(r.staminaMax);
  const stats: Record<string, number> = {};
  if (level !== undefined) stats.level = level;
  if (hp !== undefined) stats.hp = hp;
  if (stamina !== undefined) stats.stamina = stamina;
  const half = numOf(r.staminaHalf);
  const styles = compact([r.style1, r.style2, r.style3].map((s) => textOf(s)));
  return {
    systemLabel: "ヴィジランテ・コード",
    profile: [
      entry("種族", r.race),
      entry("クラス", r.class),
      entry("スタイル", styles.join("／")),
      entry("性別", r.gender),
      entry("年齢", r.age),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("バイタリティ", r.vitality),
        entry("テクニック", r.technic),
        entry("クレバー", r.clever),
        entry("カリスマ", r.carisma),
      ]),
      section("resources", "副能力値", "resources", [
        entry("キャラクターレベル", level),
        entry("HP", hp),
        entry("スタミナ", stamina, { note: half !== undefined ? `半分${half}` : undefined }),
      ]),
      section(
        "battle",
        "戦闘値",
        "resources",
        BATTLE.map(([k, label]) => entry(label, r[`battleTotal${k}`])),
      ),
      section("equipment", "装備", "list", [...equipmentEntries(r), ...accessoryEntries(r)]),
      section(
        "specialities",
        "特技",
        "list",
        numbered(r, "speciality").map((n) =>
          listEntry(ytText(r[`speciality${n}Name`]) ?? "", "", { note: ytText(r[`speciality${n}Note`]) }),
        ),
      ),
      section(
        "items",
        "アイテム",
        "list",
        numbered(r, "item").map((n) => {
          const p = `item${n}`;
          return listEntry(ytText(r[`${p}Name`]) ?? "", r[`${p}Lv`], {
            note: compact([textOf(r[`${p}Type`]), ytText(r[`${p}Note`])]).join("　") || undefined,
          });
        }),
      ),
      section(
        "goods",
        "グッズ",
        "list",
        numbered(r, "goods").map((n) => {
          const p = `goods${n}`;
          return listEntry(ytText(r[`${p}Name`]) ?? "", "", {
            note: compact([textOf(r[`${p}Type`]), ytText(r[`${p}Note`])]).join("　") || undefined,
          });
        }),
      ),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
