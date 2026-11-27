/**
 * キャラクター保管所（charasheet.vampire-blood.net）のアリアンロッド 2E（game: "ara2"）。
 * JSON は <id>.js。能力値は NK（能力基本値）・NB（能力ボーナス）・NP（修正込みの能力値、HP、MP）に
 * 連番で入っている（1 筋力 2 器用 3 敏捷 4 知力 5 感知 6 精神 7 幸運 8 HP 9 MP）。
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

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

const ABILITIES = ["筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"];

/** タイミング・判定・対象・射程・コストと効果。「-」と空は落とす */
function skillNote(fields: unknown[], memo: unknown): string | undefined {
  const head = compact(
    fields.map((f) => {
      const t = textOf(f);
      return t && t !== "-" ? t : undefined;
    }),
  ).join("　");
  const m = textOf(memo);
  const text = [head, m].filter(Boolean).join("：");
  return text || undefined;
}

/** 配列で持つスキル欄（skill_ / ippanskill_）。「＜パッシブ＞」のような見出し行は読まない */
function skillRows(r: Rec, prefix: string): SheetEntry[] {
  const at = (key: string, i: number) => arr(r[`${prefix}_${key}`])[i];
  return compact(
    arr(r[`${prefix}_name`]).map((n, i) => {
      const name = textOf(n);
      if (!name || /^＜.*＞$/.test(name)) return null;
      return listEntry(name, at("lv", i), {
        group: textOf(at("shozoku", i)),
        note: skillNote(
          ["timing", "hantei", "taisho", "range", "cost", "page"].map((k) => at(k, i)),
          at("memo", i),
        ),
      });
    }),
  );
}

/** 種族スキル・メインクラスのスキル（単独の欄） */
function singleSkill(r: Rec, prefix: string, lv?: unknown): SheetEntry | null {
  const name = textOf(r[`${prefix}_name`]);
  if (!name) return null;
  return listEntry(name, lv, {
    group: textOf(r[`${prefix}_shozoku`]),
    note: skillNote(
      ["timing", "hantei", "taisho", "range", "cost", "page"].map((k) => r[`${prefix}_${k}`]),
      r[`${prefix}_memo`],
    ),
  });
}

const EQUIP_SLOTS: [string, string][] = [
  ["IR", "右手"],
  ["IL", "左手"],
  ["IH", "頭"],
  ["IB", "胴"],
  ["IS", "補助"],
  ["IA", "装飾"],
];

export function arianrhod2eFromCharasheet(root: unknown): GameSheetParts {
  const r: Rec = typeof root === "object" && root !== null && !Array.isArray(root) ? (root as Rec) : {};
  const level = numOf(r.V_level) ?? numOf(r.SL_level) ?? numOf(r.now_level);
  const fate = numOf(r.V_fate) ?? numOf(r.SL_fate);
  const hp = numOf(r.NP8);
  const mp = numOf(r.NP9);
  const hasExp = (numOf(r.exp_his_sum) ?? 0) > 0;
  const exp = hasExp ? numOf(r.exp_his_sum) : undefined;
  const expLeft = hasExp ? numOf(r.seichoten_left) : undefined;
  const gold = numOf(r.money);
  const stats: Record<string, number> = {};
  for (const [k, v] of [
    ["hp", hp],
    ["mp", mp],
    ["fate", fate],
    ["level", level],
    ["exp", exp],
    ["gold", gold],
  ] as const) {
    if (v !== undefined) stats[k] = v;
  }

  /** 命中・攻撃力は右・左・合計に分かれる（BSUM1R / 1L / 1T）。ほかは BSUM3〜7 */
  const battle = (key: string) =>
    numOf(r[`BSUM${key}T`]) ?? numOf(r[`BSUM${key}R`]) ?? numOf(r[`BSUM${key}`]);
  const meichuDice = numOf(r.dice_meichu);
  const kaihiDice = numOf(r.dice_kaihi);

  return {
    systemLabel: "アリアンロッド 2E",
    profile: [
      entry("種族", r.shuzoku),
      entry("メインクラス", r.main_class),
      entry("サポートクラス", r.support_class),
      entry("年齢", r.age),
      entry("性別", r.sex),
      entry("身長", r.pc_height),
    ],
    sections: [
      section(
        "abilities",
        "能力値",
        "abilities",
        ABILITIES.map((label, i) => {
          const base = textOf(r[`NK${i + 1}`]);
          const bonus = textOf(r[`NB${i + 1}`]);
          const note = compact([
            base ? `基本値 ${base}` : undefined,
            bonus ? `ボーナス ${bonus}` : undefined,
          ]).join("　");
          return entry(label, r[`NP${i + 1}`], { note: note || undefined });
        }),
      ),
      section("resources", "副能力値", "resources", [
        entry("レベル", level),
        entry("HP", hp),
        entry("MP", mp),
        entry("フェイト", fate),
        entry("命中判定", battle("1"), {
          note: meichuDice !== undefined ? `${meichuDice}D` : undefined,
        }),
        entry("攻撃力", battle("2")),
        entry("回避判定", battle("3"), {
          note: kaihiDice !== undefined ? `${kaihiDice}D` : undefined,
        }),
        entry("物理防御", battle("4")),
        entry("魔法防御", battle("5")),
        entry("行動値", battle("6")),
        entry("移動力", battle("7"), { note: "m" }),
        entry("所持金", gold, { note: "G" }),
        entry("獲得経験点", exp),
        entry("残り経験点", expLeft),
        entry("成長点", r.seicho_point),
      ]),
      section("skills", "スキル", "list", [
        singleSkill(r, "shuzoku_skill"),
        singleSkill(r, "m_cls_skill", r.mcls_skill_lv),
        ...skillRows(r, "skill"),
      ]),
      section("general-skills", "一般スキル", "list", skillRows(r, "ippanskill")),
      section(
        "equipment",
        "装備",
        "list",
        EQUIP_SLOTS.map(([key, label]) => {
          const name = textOf(r[`${key}_name`]);
          return name ? listEntry(label, name, { note: textOf(r[`${key}_memo`]) }) : null;
        }),
      ),
      textSection("memo", "メモ", r.pc_making_memo),
    ],
    stats,
  };
}
