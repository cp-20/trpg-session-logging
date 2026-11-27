import { entry, listEntry, numOf, section, textOf, textSection, type GameSheetParts } from "../sheet";
import type { SheetEntry } from "../sheet";

/**
 * キャラクター保管所の永い後日談のネクロニカ（game: "nechro"）のシートを読む。
 * マニューバは Power_* の配列で 1 行 1 マニューバ。部位（Power_hantei）で
 * ポジション・クラスのマニューバ（1〜3）と、パーツ（頭・腕・胴・脚 = 4〜7）に分かれる。
 */
/** Power_hantei（部位）。1〜3 はパーツではなく、ポジション・クラス由来のマニューバ */
const MANEUVER_GROUPS: Record<string, string> = { "1": "ポジション", "2": "メインクラス", "3": "サブクラス" };
const PART_GROUPS: Record<string, string> = { "4": "頭", "5": "腕", "6": "胴", "7": "脚" };
/** Power_Type（カテゴリ） */
const CATEGORIES: Record<string, string> = {
  "1": "通常技",
  "2": "必殺技",
  "3": "行動値増加",
  "4": "補助",
  "5": "妨害",
  "6": "防御/生贄",
  "7": "移動",
};
/** Power_timing（タイミング） */
const TIMINGS: Record<string, string> = {
  "0": "オート",
  "1": "アクション",
  "2": "ジャッジ",
  "3": "ダメージ",
  "4": "ラピッド",
};

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function key(v: unknown): string {
  return textOf(v) ?? "";
}

function note(...pairs: [label: string, raw: unknown][]): string | undefined {
  const parts = pairs.flatMap(([label, raw]) => {
    const t = textOf(raw);
    return t ? [label ? `${label} ${t}` : t] : [];
  });
  return parts.length ? parts.join(" / ") : undefined;
}

/** チェックボックスの値（空・0 は未チェック） */
function checked(v: unknown): boolean {
  const t = textOf(v);
  return t !== undefined && t !== "0";
}

export function nechronicaFromCharasheet(root: unknown): GameSheetParts {
  const r: Record<string, unknown> =
    root && typeof root === "object" && !Array.isArray(root) ? (root as Record<string, unknown>) : {};

  const maneuvers: (SheetEntry | null)[] = [];
  const parts: (SheetEntry | null)[] = [];
  arr(r.Power_name).forEach((n, i) => {
    const label = textOf(n);
    if (!label) return;
    const area = key(arr(r.Power_hantei)[i]);
    const e = listEntry(label, TIMINGS[key(arr(r.Power_timing)[i])] ?? "", {
      group: MANEUVER_GROUPS[area] ?? PART_GROUPS[area],
      note: note(
        ["", CATEGORIES[key(arr(r.Power_Type)[i])]],
        ["コスト", arr(r.Power_cost)[i]],
        ["射程", arr(r.Power_range)[i]],
        ["", arr(r.Power_memo)[i]],
        ["取得先", arr(r.Power_shozoku)[i]],
        ["", checked(arr(r.Power_Lost)[i]) ? "損傷" : undefined],
        ["", checked(arr(r.Power_Used)[i]) ? "使用済" : undefined],
      ),
    });
    if (area in PART_GROUPS) parts.push(e);
    else maneuvers.push(e);
  });

  const roices = arr(r.roice_name).map((n, i) => {
    const label = textOf(n);
    if (!label) return null;
    const madness = key(arr(r.roice_damage)[i]);
    return listEntry(label, arr(r.roice_pos)[i], {
      note: note(
        ["狂気度", madness === "4" ? "発狂" : madness],
        ["発狂", arr(r.roice_neg)[i]],
        ["発狂効果", arr(r.roice_break)[i]],
        ["", arr(r.roice_memo)[i]],
      ),
    });
  });

  const carma = arr(r.carma_name).map((n, i) => {
    const label = textOf(n);
    if (!label) return null;
    return listEntry(label, checked(arr(r.carma_completed)[i]) ? "達成" : "", {
      note: textOf(arr(r.carma_memo)[i]),
    });
  });

  const fragments = arr(r.kakera_name).map((n, i) => {
    const label = textOf(n);
    return label ? listEntry(label, "", { note: textOf(arr(r.kakera_memo)[i]) }) : null;
  });

  const stats: Record<string, number> = {};
  const favor = numOf(r.exp_his_sum);
  if (favor !== undefined) stats.favor = favor;

  return {
    systemLabel: "永い後日談のネクロニカ",
    profile: [
      entry("ポジション", r.Position_Name),
      entry("メインクラス", r.MCLS_Name),
      entry("サブクラス", r.SCLS_Name),
      entry("種族", r.shuzoku),
      entry("享年", r.age),
      entry("初期配置", r.sex),
      entry("暗示", r.pc_carma),
    ],
    sections: [
      section("resources", "行動値・強化", "resources", [
        entry("行動値", r.Act_Total),
        entry("武装", r.NP1),
        entry("変異", r.NP2),
        entry("改造", r.NP3),
        entry("寵愛点", r.exp_his_sum),
      ]),
      section("parts", "パーツ", "list", parts),
      section("maneuvers", "ポジション・クラスのマニューバ", "list", maneuvers),
      section("roices", "未練", "list", roices),
      section("carma", "カルマ", "list", carma),
      section("kakera", "記憶のカケラ", "list", fragments),
      textSection("memo", "メモ", r.pc_making_memo),
    ],
    stats,
  };
}
