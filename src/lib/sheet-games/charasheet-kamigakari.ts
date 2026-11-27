import { entry, listEntry, numOf, section, textOf, textSection, type GameSheetParts } from "../sheet";

/**
 * キャラクター保管所の神我狩（game: "kmgkr"）のシートを読む。
 * 保管所の JSON は <id>.js。値は文字列で、表の列ごとに NB1..（判定値）・NP1..（戦闘能力値）の
 * ような連番キーに入っている。
 */
/** 判定値（NB1..5）の並び */
const JUDGE_LABELS = ["体力", "敏捷", "知性", "精神", "幸運"];
/** 戦闘能力値（NP1..9）の並び */
const COMBAT_LABELS = ["命中", "回避", "発動", "抵抗", "看破", "物D", "魔D", "行動", "生命"];

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** 「ラベル 値」を空白で連ねた補足（値が空の項目は落とす） */
function note(...pairs: [label: string, raw: unknown][]): string | undefined {
  const parts = pairs.flatMap(([label, raw]) => {
    const t = textOf(raw);
    return t ? [label ? `${label} ${t}` : t] : [];
  });
  return parts.length ? parts.join(" / ") : undefined;
}

/** 区切り行（「━━常備━━」）は所持品ではない */
function isSeparator(label: string): boolean {
  return /^[━─=＝-]{2,}/.test(label);
}

export function kamigakariFromCharasheet(root: unknown): GameSheetParts {
  const r: Record<string, unknown> =
    root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>) : {};

  const talents = arr(r.skill_name).map((n, i) => {
    const label = textOf(n);
    if (!label) return null;
    return listEntry(label, arr(r.skill_timing)[i], {
      group: textOf(arr(r.skill_shozoku)[i]),
      note: note(
        ["距離", arr(r.skill_range)[i]],
        ["対象", arr(r.skill_taisho)[i]],
        ["コスト", arr(r.skill_cost)[i]],
        ["制限", arr(r.skill_limit)[i]],
        ["", arr(r.skill_memo)[i]],
      ),
    });
  });

  const weapons = arr(r.arms_name).map((n, i) => {
    const label = textOf(n);
    if (!label) return null;
    return listEntry(label, arr(r.arms_range)[i], {
      note: note(
        ["対象", arr(r.arms_target)[i]],
        ["命中", arr(r.arms_hit)[i]],
        ["ダメージ", arr(r.arms_damage)[i]],
        ["回避", arr(r.arms_kaihi)[i]],
        ["装甲", arr(r.arms_def)[i]],
        ["結界", arr(r.arms_mdef)[i]],
        ["行動", arr(r.arms_act)[i]],
        ["", arr(r.arms_memo)[i]],
      ),
    });
  });
  const wearables = (["armor", "acce1", "acce2"] as const).map((p) => {
    const label = textOf(r[`${p}_name`]);
    if (!label) return null;
    return listEntry(label, p === "armor" ? "防具" : "装飾品", {
      note: note(
        ["回避", r[`${p}_kaihi`]],
        ["装甲", r[`${p}_def`]],
        ["結界", r[`${p}_mdef`]],
        ["行動", r[`${p}_act`]],
        ["", r[`${p}_memo`]],
      ),
    });
  });

  const items = arr(r.item_name).map((n, i) => {
    const label = textOf(n);
    if (!label || isSeparator(label)) return null;
    return listEntry(label, arr(r.item_num)[i], { note: textOf(arr(r.item_memo)[i]) });
  });

  const lifepath = (
    [
      ["経緯", "shutuji_name", "shutuji_memo"],
      ["霊紋の位置", "kyougu_name", "kyougu_memo"],
      ["霊紋の形", "shape_name", "shape_memo"],
      ["目的", "unmei_name", "unmei_memo"],
    ] as const
  ).map(([label, name, memo]) => {
    const value = textOf(r[name]);
    return value ? listEntry(label, value, { note: textOf(r[memo]) }) : null;
  });

  const connections = arr(r.cone_name).map((n, i) => {
    const label = textOf(n);
    return label ? listEntry(label, arr(r.cone_kankei)[i]) : null;
  });

  const combat = COMBAT_LABELS.map((label, i) => {
    // 回避は防具などを含めた合計（kaihi）が別にある
    if (label === "回避") return entry(label, r.kaihi ?? r.NP2);
    if (label === "行動" || label === "生命") return null;
    return entry(label, r[`NP${i + 1}`]);
  });

  const stats: Record<string, number> = {};
  const exp = numOf(r.exp_his_sum);
  const level = numOf(r.Level);
  const money = numOf(r.money);
  if (exp !== undefined) stats.exp = exp;
  if (level !== undefined) stats.level = level;
  if (money !== undefined) stats.money = money;

  return {
    systemLabel: "神我狩",
    profile: [
      entry("種族", r.manual_shuzoku),
      entry("メイン称号", r.main_class),
      entry("サブ称号", r.support_class),
      entry("組織", r.shuzoku),
      entry("年齢", r.age),
      entry("性別", r.sex),
      entry("種別", r.pc_shubetu),
    ],
    sections: [
      section("levels", "レベル", "levels", [
        entry("キャラクターレベル", r.Level),
        entry("初期レベル", r.Start_Level),
      ]),
      section(
        "abilities",
        "判定値",
        "abilities",
        JUDGE_LABELS.map((l, i) => entry(l, r[`NB${i + 1}`])),
      ),
      section("combat", "戦闘能力値", "abilities", combat),
      section("resources", "生命力・行動値", "resources", [
        entry("生命力", r.NP9),
        entry("行動値", r.act ?? r.NP8),
        entry("移動力", r.ido),
        entry("全力移動", r.zenryoku_ido),
        entry("装甲", r.def),
        entry("結界", r.mdef),
        entry("経験点", r.exp_his_sum),
        entry("所持金", r.money),
      ]),
      section("talents", "特性とタレント", "list", talents),
      section("equipment", "武器・防具", "list", [...weapons, ...wearables]),
      section("items", "所持品", "list", items),
      section("lifepath", "ライフパス", "list", lifepath),
      section("connections", "コネクション", "list", connections),
      textSection("memo", "メモ", r.pc_making_memo),
    ],
    stats,
  };
}
