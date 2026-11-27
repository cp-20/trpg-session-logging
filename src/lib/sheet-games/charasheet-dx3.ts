/**
 * キャラクター保管所（charasheet.vampire-blood.net）のダブルクロス The 3rd Edition（game: "dx3"）。
 * 区分の id とラベルはキャラクターシート倉庫の読み取り（sheet-sources.ts の soukoDx3）に合わせる。
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

/** 技能欄の並び（保管所の行順）。能力値ごとに 3 つずつ */
const DX3_SKILL_ROWS: [string, string][] = [
  ["白兵", "肉体"],
  ["回避", "肉体"],
  ["運転", "肉体"],
  ["射撃", "感覚"],
  ["知覚", "感覚"],
  ["芸術", "感覚"],
  ["RC", "精神"],
  ["意志", "精神"],
  ["知識", "精神"],
  ["交渉", "社会"],
  ["調達", "社会"],
  ["情報", "社会"],
];
/** 追加行の選択肢（skill_id の 1〜4） */
const DX3_EXTRA_KINDS: [string, string][] = [
  ["運転", "肉体"],
  ["芸術", "感覚"],
  ["知識", "精神"],
  ["情報", "社会"],
];
/** 名前なしでも並ぶ 4 技能（運転・芸術・知識・情報）。習得していなければ載せない */
const DX3_NAMED_ONLY = new Set(["運転", "芸術", "知識", "情報"]);

function skillEntries(r: Rec): (SheetEntry | null)[] {
  const tokugi = arr(r.skill_tokugi);
  const sonota = arr(r.skill_sonota);
  const memo = arr(r.skill_memo);
  const kinds = arr(r.skill_id);
  const level = (i: number) => (numOf(tokugi[i]) ?? 0) + (numOf(sonota[i]) ?? 0);
  const out: (SheetEntry | null)[] = [];
  DX3_SKILL_ROWS.forEach(([label, group], i) => {
    if (tokugi[i] === undefined) return;
    const lv = level(i);
    if (DX3_NAMED_ONLY.has(label) && lv === 0) return;
    out.push(entry(label, lv, { group }));
  });
  for (let i = DX3_SKILL_ROWS.length; i < tokugi.length; i++) {
    const kind = DX3_EXTRA_KINDS[(numOf(kinds[i - DX3_SKILL_ROWS.length]) ?? 0) - 1];
    const lv = level(i);
    if (!kind || lv === 0) continue;
    const name = textOf(memo[i]);
    out.push(entry(name ? `${kind[0]}：${name}` : kind[0], lv, { group: kind[1] }));
  }
  return out;
}

/** エフェクトの 1 行（タイミング・判定・対象・射程・侵蝕を補足にする） */
function effectList(r: Rec, prefix: "effect" | "easyeffect"): SheetEntry[] {
  const names = arr(r[`${prefix}_name`]);
  const lvs = arr(r[`${prefix}_lv`]);
  const keys = ["timing", "hantei", "taisho", "range", "cost"];
  return compact(
    names.map((n, i) => {
      const name = textOf(n);
      if (!name) return null;
      const note = compact(
        keys.map((k) => {
          const t = textOf(arr(r[`${prefix}_${k}`])[i]);
          return t && t !== "-" ? t : undefined;
        }),
      ).join("　");
      return listEntry(name, lvs[i], { note: note || undefined });
    }),
  );
}

const LOIS_TYPES: Record<string, string> = { "1": "D", "2": "S" };

function loisList(r: Rec): SheetEntry[] {
  const types = arr(r.roice_type);
  const pos = arr(r.roice_pos);
  const neg = arr(r.roice_neg);
  return compact(
    arr(r.roice_name).map((n, i) => {
      const name = textOf(n);
      if (!name) return null;
      const note = compact([textOf(pos[i]), textOf(neg[i])]).join("　");
      return listEntry(name, LOIS_TYPES[textOf(types[i]) ?? ""] ?? "", { note: note || undefined });
    }),
  );
}

function lifepathList(r: Rec): SheetEntry[] {
  const rows: [string, string][] = [
    ["出自", "shutuji"],
    ["経験", "keiken"],
    ["邂逅", "kaikou"],
    ["覚醒", "birth"],
    ["衝動", "think"],
  ];
  return compact(
    rows.map(([label, key]) => {
      const name = textOf(r[`${key}_name`]);
      return name ? listEntry(label, name, { note: textOf(r[`${key}_sonota`]) }) : null;
    }),
  );
}

export function dx3FromCharasheet(root: unknown): GameSheetParts {
  const r: Rec = typeof root === "object" && root !== null && !Array.isArray(root) ? (root as Rec) : {};
  const syndromes = compact([1, 2, 3].map((n) => textOf(r[`class${n}_name`]))).join("／");
  const dLois = loisList(r)
    .filter((e) => e.value === "D")
    .map((e) => e.label)
    .join("／");
  const hp = numOf(r.NP5);
  const exp = numOf(r.seichoten_left);
  const moveBattle = numOf(r.NP8);
  const stats: Record<string, number> = {};
  if (hp !== undefined) stats.hp = hp;
  // 続く値は経験点の合計（初期の経験点を含む。ゆとシートの expTotal と同じ）
  const expTotal = (numOf(r.sum_seichoten_default) ?? 0) + (numOf(r.exp_his_sum) ?? 0);
  if (numOf(r.exp_his_sum) !== undefined && numOf(r.sum_seichoten_default) !== undefined)
    stats.exp = expTotal;
  return {
    systemLabel: "ダブルクロス The 3rd Edition",
    profile: [
      entry("コードネーム", r.pc_codename),
      entry("カヴァー", r.cover_name),
      entry("ワークス", r.works_name),
      entry("シンドローム", syndromes),
      entry("Dロイス", dLois),
      entry("年齢", r.age),
      entry("性別", r.sex),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("肉体", r.NP1),
        entry("感覚", r.NP2),
        entry("精神", r.NP3),
        entry("社会", r.NP4),
      ]),
      section("resources", "副能力値", "resources", [
        entry("HP", r.NP5),
        entry("侵蝕率基本値", r.NP6),
        entry("行動値", r.NP7),
        entry("戦闘移動", moveBattle),
        entry("全力移動", moveBattle !== undefined ? moveBattle * 2 : undefined),
        entry("初期財産ポイント", r.money_point),
        entry("獲得経験点", r.exp_his_sum),
        entry("残り経験点", exp !== undefined && numOf(r.exp_his_sum) !== undefined ? exp : undefined),
      ]),
      section("skills", "技能", "skills", skillEntries(r)),
      section("arts", "エフェクト", "levels", effectList(r, "effect")),
      section("easy-effects", "イージーエフェクト", "levels", effectList(r, "easyeffect")),
      section("lois", "ロイス", "list", loisList(r)),
      section("lifepath", "ライフパス", "list", lifepathList(r)),
      textSection("memo", "メモ", r.pc_making_memo),
    ],
    stats,
  };
}
