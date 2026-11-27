/**
 * ゆとシートⅡ（/ytsheet/blp/）のブラッドパスを読む。
 * ファクター（人間／吸血鬼）で能力値の名前が変わる（人間は【技】【情】、吸血鬼は【血】【想】）。
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

/** 「なし」や「―」だけの欄は空として扱う */
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

/** 血威・特技の 1 行。タイミング・対象・代償・条件・解説を補足にまとめる */
function artEntry(r: Rec, p: string, name: string | undefined, withCost: boolean): SheetEntry | null {
  if (!name) return null;
  const cost = withCost ? meaningful(r[`${p}Cost`]) : undefined;
  const limited = withCost ? meaningful(r[`${p}Limited`]) : undefined;
  const note = compact([
    meaningful(r[`${p}Timing`]),
    meaningful(r[`${p}Target`]),
    cost && cost !== "なし" ? `代償：${cost}` : undefined,
    limited && limited !== "なし" ? `条件：${limited}` : undefined,
    ytText(r[`${p}Note`]),
  ]).join("　");
  return listEntry(name, r[`${p}Lv`], { note: note || undefined });
}

/** ゆとシートⅡのブラッドパス（JSON のルート）を読む */
export function readYtsheetBlp(root: unknown): GameSheetParts {
  const r: Rec = root && typeof root === "object" && !Array.isArray(root) ? (root as Rec) : {};
  const factor = textOf(r.factor);
  const vampire = factor === "吸血鬼";
  const [main1, main2] = vampire ? ["血", "想"] : ["技", "情"];
  const level = numOf(r.level);
  const endurance = numOf(r.endurance);
  const initiative = numOf(r.initiative);
  const stats: Record<string, number> = {};
  if (level !== undefined) stats.level = level;
  if (endurance !== undefined) stats.endurance = endurance;
  if (initiative !== undefined) stats.initiative = initiative;
  const origin = compact([factor, textOf(r.factorCore), textOf(r.factorStyle)]).join("／");
  const age = textOf(r.age);
  const ageApp = textOf(r.ageApp);
  const scarName = textOf(r.scarName);
  const partners = numbered(r, "partner").map((n) => {
    const p = `partner${n}`;
    const note = compact([
      meaningful(r[`${p}Factor`]),
      compact([meaningful(r[`${p}Gender`]), meaningful(r[`${p}Age`])]).join(" ") || undefined,
      meaningful(r[`${p}Missing`]) ? `欠落：${meaningful(r[`${p}Missing`])}` : undefined,
    ])
      .filter((t) => t !== "／")
      .join("　");
    return listEntry(ytText(r[`${p}Name`]) ?? "", "", { note: note || undefined });
  });
  return {
    systemLabel: "ブラッドパス",
    profile: [
      entry("ファクター", origin),
      entry("性別", r.gender),
      entry("年齢", ageApp && age && ageApp !== age ? `${age}（外見${ageApp}）` : age),
      entry("所属", r.belong, { note: ytText(r.belongNote) }),
      entry("過去", r.past, { note: ytText(r.pastNote) }),
      entry("経緯", r.background, { note: ytText(r.backgroundNote) }),
      entry("喪失", r.missing, { note: ytText(r.missingNote) }),
      entry("外見的特徴", r.appearance, { note: ytText(r.appearanceNote) }),
      entry("住まい", r.dwelling, { note: ytText(r.dwellingNote) }),
      entry("使用武器", r.weapon, { note: ytText(r.weaponNote) }),
      entry("傷号", scarName, { note: ytText(r.scarNote) }),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [entry(main1, r.statusMain1), entry(main2, r.statusMain2)]),
      section("resources", "副能力値", "resources", [
        entry("練度", level),
        entry("耐久値", endurance),
        entry("先制値", initiative),
      ]),
      section(
        "bloodarts",
        "血威",
        "list",
        numbered(r, "bloodarts").map((n) =>
          artEntry(r, `bloodarts${n}`, ytText(r[`bloodarts${n}Name`]), false),
        ),
      ),
      section("arts", "特技", "list", [
        ...numbered(r, "arts").map((n) => artEntry(r, `arts${n}`, ytText(r[`arts${n}Name`]), true)),
        scarName ? artEntry(r, "artsS", `傷号特技（${scarName}）`, true) : null,
      ]),
      section("partners", "血契", "list", partners),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
