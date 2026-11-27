/**
 * ゆとシートⅡ（/ytsheet/dx3rd/）のダブルクロス The 3rd Edition を読む。
 * 区分の id・見出しは倉庫の読み方（soukoDx3）と揃える（abilities / resources / skills / arts / lois / memo）。
 * 値はシートの JSON に入っているものだけを読み、足りないものは推測しない。
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

/** ゆとシートの文章（&lt;br&gt; などで保存されている）を平文にする */
function ytText(v: unknown): string | undefined {
  return textOf(v)
    ?.replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** 「|漢字《かんじ》」のふりがな記法をふりがななしにする */
function stripRuby(v: unknown): string | undefined {
  const t = ytText(v);
  return t?.replace(/\|([^|《》]+)《[^》]*》/g, "$1");
}

/** 「―」だけの欄は空として扱う */
function meaningful(v: unknown): string | undefined {
  const t = ytText(v);
  return t && !/^[―－-]+$/.test(t) ? t : undefined;
}

/** `{prefix}{N}Name` のキーから番号を拾う（番号順） */
function indices(r: Rec, prefix: string): number[] {
  const re = new RegExp(`^${prefix}(\\d+)Name$`);
  const out: number[] = [];
  for (const k of Object.keys(r)) {
    const m = k.match(re);
    if (m) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

const SKILLS: [key: string, label: string, group: string][] = [
  ["Melee", "白兵", "肉体"],
  ["Dodge", "回避", "肉体"],
  ["Ranged", "射撃", "感覚"],
  ["Percept", "知覚", "感覚"],
  ["RC", "RC", "精神"],
  ["Will", "意志", "精神"],
  ["Negotiate", "交渉", "社会"],
  ["Procure", "調達", "社会"],
];

/** 追加の技能（運転・芸術・知識・情報）。名前の欄に入っている */
const EXTRA_SKILLS: [prefix: string, kind: string, group: string][] = [
  ["skillRide", "運転", "肉体"],
  ["skillArt", "芸術", "感覚"],
  ["skillKnow", "知識", "精神"],
  ["skillInfo", "情報", "社会"],
];

/** 技能レベル（合計があれば合計） */
function skillLevel(r: Rec, key: string): number | undefined {
  return numOf(r[`skillTotal${key}`]) ?? numOf(r[`skill${key}`]);
}

function skillEntries(r: Rec): (SheetEntry | null)[] {
  const out: (SheetEntry | null)[] = SKILLS.map(([key, label, group]) =>
    entry(label, skillLevel(r, key), { group }),
  );
  for (const [prefix, kind, group] of EXTRA_SKILLS) {
    for (const n of indices(r, prefix)) {
      const rest = textOf(r[`${prefix}${n}Name`])?.replace(new RegExp(`^${kind}\\s*[:：]?\\s*`), "");
      const lv = numOf(r[`skillTotal${prefix.slice(5)}${n}`]) ?? numOf(r[`${prefix}${n}`]);
      out.push(entry(rest ? `${kind}：${rest}` : kind, lv, { group }));
    }
  }
  return out;
}

const EFFECT_TYPE: Record<string, string> = {
  auto: "自動取得",
  "auto-dlois": "Dロイスで自動取得",
  easy: "イージー",
};

function effectEntries(r: Rec): (SheetEntry | null)[] {
  return indices(r, "effect").map((n) => {
    const p = `effect${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const type = textOf(r[`${p}Type`]);
    const enc = meaningful(r[`${p}Encroach`]);
    const note = compact([
      meaningful(r[`${p}Timing`]),
      meaningful(r[`${p}Skill`]),
      meaningful(r[`${p}Dfclty`]),
      meaningful(r[`${p}Target`]),
      meaningful(r[`${p}Range`]),
      enc ? `侵蝕${enc}` : undefined,
      meaningful(r[`${p}Restrict`]),
      type ? EFFECT_TYPE[type] : undefined,
    ]).join("　");
    const lv = numOf(r[`${p}Lv`]);
    return listEntry(name, lv ?? (type === "easy" ? "イージー" : ""), { note: note || undefined });
  });
}

function loisEntries(r: Rec): (SheetEntry | null)[] {
  return indices(r, "lois").map((n) => {
    const p = `lois${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const posi = textOf(r[`${p}EmoPosi`]);
    const nega = textOf(r[`${p}EmoNega`]);
    const emotion = [
      posi ? `${r[`${p}EmoPosiCheck`] ? "◎" : ""}${posi}` : undefined,
      nega ? `${r[`${p}EmoNegaCheck`] ? "◎" : ""}${nega}` : undefined,
    ]
      .filter(Boolean)
      .join("／");
    const note = compact([meaningful(r[`${p}Relation`]), emotion || undefined, ytText(r[`${p}Note`])]).join(
      "　",
    );
    return listEntry(name, r[`${p}State`], { note: note || undefined });
  });
}

function comboEntries(r: Rec): (SheetEntry | null)[] {
  return indices(r, "combo").map((n) => {
    const p = `combo${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const enc = meaningful(r[`${p}Encroach`]);
    const variants = [1, 2, 3, 4, 5, 6].flatMap((m) => {
      const dice = textOf(r[`${p}Dice${m}`]);
      const atk = textOf(r[`${p}Atk${m}`]);
      if (!dice && !atk) return [];
      return [
        compact([
          textOf(r[`${p}Condition${m}`]),
          dice ? `ダイス${dice}` : undefined,
          textOf(r[`${p}Crit${m}`]) ? `C値${textOf(r[`${p}Crit${m}`])}` : undefined,
          textOf(r[`${p}Fixed${m}`]) ? `達成値修正${textOf(r[`${p}Fixed${m}`])}` : undefined,
          atk ? `攻撃力${atk}` : undefined,
        ]).join(" "),
      ];
    });
    const note = compact([
      meaningful(r[`${p}Combo`]),
      meaningful(r[`${p}Timing`]),
      meaningful(r[`${p}Skill`]),
      meaningful(r[`${p}Dfclty`]),
      meaningful(r[`${p}Target`]),
      meaningful(r[`${p}Range`]),
      enc ? `侵蝕${enc}` : undefined,
      ...variants,
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function weaponEntries(r: Rec): (SheetEntry | null)[] {
  return indices(r, "weapon").map((n) => {
    const p = `weapon${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const note = compact([
      meaningful(r[`${p}Type`]),
      meaningful(r[`${p}Skill`]),
      textOf(r[`${p}Acc`]) ? `命中${textOf(r[`${p}Acc`])}` : undefined,
      textOf(r[`${p}Atk`]) ? `攻撃力${textOf(r[`${p}Atk`])}` : undefined,
      textOf(r[`${p}Guard`]) ? `ガード${textOf(r[`${p}Guard`])}` : undefined,
      meaningful(r[`${p}Range`]),
      textOf(r[`${p}Stock`]) ? `常備化${textOf(r[`${p}Stock`])}` : undefined,
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function armorEntries(r: Rec): (SheetEntry | null)[] {
  return indices(r, "armor").map((n) => {
    const p = `armor${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const note = compact([
      meaningful(r[`${p}Type`]),
      textOf(r[`${p}Armor`]) ? `装甲${textOf(r[`${p}Armor`])}` : undefined,
      meaningful(r[`${p}Dodge`]) ? `ドッジ${textOf(r[`${p}Dodge`])}` : undefined,
      meaningful(r[`${p}Initiative`]) ? `行動${textOf(r[`${p}Initiative`])}` : undefined,
      textOf(r[`${p}Stock`]) ? `常備化${textOf(r[`${p}Stock`])}` : undefined,
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

function itemEntries(r: Rec): (SheetEntry | null)[] {
  return indices(r, "item").map((n) => {
    const p = `item${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const note = compact([meaningful(r[`${p}Type`]), meaningful(r[`${p}Skill`]), ytText(r[`${p}Note`])]).join(
      "　",
    );
    const exp = numOf(r[`${p}Exp`]);
    return listEntry(name, "", {
      note: [exp !== undefined ? `経験点${exp}` : "", note].filter(Boolean).join("　") || undefined,
    });
  });
}

const LIFEPATHS: [key: string, label: string, encroach: boolean][] = [
  ["Origin", "出自", false],
  ["Experience", "経験", false],
  ["Encounter", "邂逅", false],
  ["Awaken", "覚醒", true],
  ["Impulse", "衝動", true],
];

function lifepathEntries(r: Rec): (SheetEntry | null)[] {
  return LIFEPATHS.map(([key, label, hasEnc]) => {
    const enc = hasEnc ? numOf(r[`lifepath${key}Encroach`]) : undefined;
    const note = compact([
      ytText(r[`lifepath${key}Note`]),
      enc !== undefined ? `侵蝕${enc}` : undefined,
    ]).join("　");
    return entry(label, r[`lifepath${key}`], { note: note || undefined });
  });
}

/** ゆとシートⅡのダブルクロス 3rd（JSON のルート）を読む */
export function readYtsheetDx3rd(root: unknown): GameSheetParts {
  const r: Rec = root && typeof root === "object" && !Array.isArray(root) ? (root as Rec) : {};
  const syndromes = compact([r.syndrome1, r.syndrome2, r.syndrome3].map((s) => textOf(s))).join("／");
  const hp = numOf(r.maxHpTotal);
  const exp = numOf(r.expTotal);
  const stats: Record<string, number> = {};
  if (hp !== undefined) stats.hp = hp;
  if (exp !== undefined) stats.exp = exp;
  return {
    systemLabel: "ダブルクロス The 3rd Edition",
    profile: [
      entry("カヴァー", r.cover),
      entry("ワークス", r.works),
      entry("シンドローム", syndromes),
      entry("年齢", r.age),
      entry("性別", r.gender),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("肉体", r.sttTotalBody),
        entry("感覚", r.sttTotalSense),
        entry("精神", r.sttTotalMind),
        entry("社会", r.sttTotalSocial),
      ]),
      section("resources", "副能力値", "resources", [
        entry("HP", hp),
        entry("侵蝕率基本値", r.baseEncroach),
        entry("行動値", r.initiativeTotal),
        entry("戦闘移動", r.moveTotal),
        entry("全力移動", r.dashTotal),
        entry("常備化ポイント", r.stockTotal),
        entry("財産ポイント", r.savingTotal),
        entry("経験点", exp),
      ]),
      section("skills", "技能", "skills", skillEntries(r)),
      section("arts", "エフェクト", "levels", effectEntries(r)),
      section("combos", "コンボ", "list", comboEntries(r)),
      section("lois", "ロイス", "list", loisEntries(r)),
      section("lifepath", "ライフパス", "list", lifepathEntries(r)),
      section("weapons", "武器", "list", weaponEntries(r)),
      section("armors", "防具", "list", armorEntries(r)),
      section("items", "アイテム", "list", itemEntries(r)),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
