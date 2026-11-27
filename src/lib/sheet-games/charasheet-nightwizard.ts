import { entry, listEntry, numOf, section, textOf, textSection, type GameSheetParts } from "../sheet";

/**
 * キャラクター保管所のナイトウィザード The 3rd Edition（game: "nw3"）のシートを読む。
 * 能力値は NP1..10、戦闘値・攻防値は BSUM1..8（武器・防具を含む総計）に入っている。
 */
/** NP1..10 の並び */
const ABILITY_LABELS = ["筋力", "器用", "感覚", "理知", "意思", "幸運", "耐久", "魔法", "内包", "CF"];
/** BSUM1..8 / arms_status1..8 の並び（戦闘値と攻防値） */
const BATTLE_LABELS = ["行動", "命中", "魔導", "回避", "物攻", "物防", "魔攻", "魔防"];
/** 防具・装身具の欄（ea_<key>_*） */
const WEAR_SLOTS: [key: string, label: string][] = [
  ["head", "頭部"],
  ["all", "上半身"],
  ["inner", "衣服"],
  ["shoulder", "肩"],
  ["gauntlet", "篭手"],
  ["other", "その他"],
];

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** 戦闘値の補足（0 や空は落とす）。「命中+2 物防+1」 */
function statusNote(get: (n: number) => unknown, extra: unknown): string | undefined {
  const parts: string[] = [];
  BATTLE_LABELS.forEach((label, i) => {
    const v = numOf(get(i + 1));
    if (v) parts.push(`${label}${v > 0 ? "+" : ""}${v}`);
  });
  const t = textOf(extra);
  if (t) parts.push(t);
  return parts.length ? parts.join(" ") : undefined;
}

export function nightWizardFromCharasheet(root: unknown): GameSheetParts {
  const r: Record<string, unknown> =
    root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>) : {};

  const effects = arr(r.effect_name).map((n, i) => {
    const label = textOf(n);
    if (!label) return null;
    const lv = numOf(arr(r.effect_lv)[i]);
    const parts = [
      ["タイミング", arr(r.effect_timing)[i]],
      ["判定", arr(r.effect_hantei)[i]],
      ["対象", arr(r.effect_taisho)[i]],
      ["射程", arr(r.effect_range)[i]],
      ["代償", arr(r.effect_cost)[i]],
      ["", arr(r.effect_memo)[i]],
    ].flatMap(([l, v]) => {
      const t = textOf(v);
      return t ? [l ? `${l} ${t}` : t] : [];
    });
    return listEntry(label, lv !== undefined ? `SL${lv}` : "", {
      group: textOf(arr(r.effect_shozoku)[i]),
      note: parts.length ? parts.join(" / ") : undefined,
    });
  });

  const weapons = arr(r.arms_name).map((n, i) => {
    const label = textOf(n);
    if (!label) return null;
    return listEntry(label, "武器", {
      note: statusNote(
        (k) => arr(r[`arms_status${k}`])[i],
        [arr(r.arms_range)[i], arr(r.arms_sonota)[i]].map(textOf).filter(Boolean).join(" "),
      ),
    });
  });
  const wearables = WEAR_SLOTS.map(([key, slot]) => {
    const label = textOf(r[`ea_${key}_name`]);
    if (!label) return null;
    return listEntry(label, slot, {
      note: statusNote((k) => r[`ea_${key}_status${k}`], r[`ea_${key}_sonota`]),
    });
  });

  const items = arr(r.item_name).map((n, i) => {
    const label = textOf(n);
    return label ? listEntry(label, arr(r.item_num)[i], { note: textOf(arr(r.item_memo)[i]) }) : null;
  });

  const lifepath = (
    [
      ["ワークス", "works_name", "works_sonota"],
      ["出自", "shutuji_name", "shutuji_sonota"],
      ["目的", "mokuteki_name", "mokuteki_sonota"],
      ["邂逅", "kaikou_name", "kaikou_sonota"],
      ["印象", "keiken_name", "keiken_sonota"],
    ] as const
  ).map(([label, name, memo]) => {
    const value = textOf(r[name]);
    return value ? listEntry(label, value, { note: textOf(r[memo]) }) : null;
  });

  const attribute = [textOf(r.main_attribute_name), textOf(r.sub_attribute_name)].filter(Boolean).join("/");

  const stats: Record<string, number> = {};
  const level = numOf(r.level);
  const money = numOf(r.money);
  if (level !== undefined) stats.level = level;
  if (money !== undefined) stats.money = money;

  return {
    systemLabel: "ナイトウィザード The 3rd Edition",
    profile: [
      entry("クラス1", r.class1_name),
      entry("クラス2", r.class2_name),
      entry("属性", attribute),
      entry("二つ名", r.pc_codename),
      entry("種族", r.shuzoku),
      entry("年齢", r.age),
      entry("性別", r.sex),
    ],
    sections: [
      section("levels", "キャラクターレベル", "levels", [entry("CL", r.level)]),
      section(
        "abilities",
        "能力値",
        "abilities",
        ABILITY_LABELS.map((l, i) => entry(l, r[`NP${i + 1}`])),
      ),
      section(
        "battle",
        "戦闘値・攻防値",
        "abilities",
        BATTLE_LABELS.map((l, i) => entry(l, r[`BSUM${i + 1}`])),
      ),
      section("resources", "所持・上限", "resources", [
        entry("重量上限", r.max_weight),
        entry("記憶上限", r.max_memory),
        entry("所持金", r.money),
      ]),
      section("effects", "特技", "list", effects),
      section("equipment", "武器・防具", "list", [...weapons, ...wearables]),
      section("items", "所持品", "list", items),
      section("lifepath", "ライフパス", "list", lifepath),
      textSection("memo", "メモ", r.pc_making_memo),
    ],
    stats,
  };
}
