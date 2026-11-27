/**
 * キャラクター保管所（charasheet.vampire-blood.net）のゴブリンスレイヤーTRPG（game: "gobusla"）。
 * JSON は <id>.js。第 1 能力は NP1〜4（体力・魂魄・技量・知力）、第 2 能力は NP5〜7（集中・持久・反射）、
 * 生命・移動・呪文回数・呪文抵抗は NP8〜11。職業レベルは GLv1〜9。
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

/** 職業（GLv1〜9）。戦士系 4 つ、呪文使い系 5 つ */
const JOBS = ["戦士", "武道家", "野伏", "斥候", "魔術師", "神官", "竜司祭", "精霊使い", "死人占い師"];

/** 「□秘法」のような見出し行か（名前だけで他の欄が空） */
function isHeading(name: string): boolean {
  return name.startsWith("□");
}

function spellList(r: Rec): SheetEntry[] {
  const at = (key: string, i: number) => arr(r[`effect_${key}`])[i];
  let group: string | undefined;
  return compact(
    arr(r.effect_name).map((n, i) => {
      const name = textOf(n);
      if (!name) return null;
      if (isHeading(name)) {
        group = name.replace(/^□/, "").trim() || undefined;
        return null;
      }
      const note = compact(
        ["keitou", "zokusei", "taishou", "range"].map((k) => {
          const t = textOf(at(k, i));
          return t && t !== "-" ? t : undefined;
        }),
      ).join("　");
      return listEntry(name, at("nanido", i), { group, note: note || undefined });
    }),
  );
}

function skillList(r: Rec): SheetEntry[] {
  const at = (key: string, i: number) => arr(r[`ginou_${key}`])[i];
  return compact(
    arr(r.ginou_name).map((n, i) =>
      listEntry(textOf(n) ?? "", at("lv", i), {
        group: textOf(at("header", i)),
        note: textOf(at("memo", i)),
      }),
    ),
  );
}

function equipmentList(r: Rec): SheetEntry[] {
  const arms = arr(r.arms_name).map((n, i) => {
    const name = textOf(n);
    if (!name || name === "なし") return null;
    const at = (key: string) => arr(r[`arms_${key}`])[i];
    const hit = textOf(at("hit"));
    const note = compact([
      hit ? `命中 ${hit}` : undefined,
      textOf(at("yoho")),
      textOf(at("rank")),
      textOf(at("memo")),
    ]).join("　");
    return listEntry(name, at("iryoku"), { note: note || undefined });
  });
  const armor = textOf(r.armor_name);
  const bougo = textOf(r.armor_bougo);
  return compact([
    ...arms,
    armor ? listEntry(armor, "", { note: bougo ? `防護 ${bougo}` : undefined }) : null,
  ]);
}

function itemList(r: Rec): SheetEntry[] {
  const at = (key: string, i: number) => arr(r[`item_${key}`])[i];
  return compact(
    arr(r.item_name).map((n, i) => listEntry(textOf(n) ?? "", at("num", i), { note: textOf(at("memo", i)) })),
  );
}

export function goblinSlayerFromCharasheet(root: unknown): GameSheetParts {
  const r: Rec = typeof root === "object" && root !== null && !Array.isArray(root) ? (root as Rec) : {};
  const exp = numOf(r.now_exp);
  const gold = numOf(r.money);
  const growth = numOf(r.left_ap);
  const hp = numOf(r.NP8);
  const stats: Record<string, number> = {};
  for (const [k, v] of [
    ["hp", hp],
    ["exp", exp],
    ["gold", gold],
    ["growth", growth],
  ] as const) {
    if (v !== undefined) stats[k] = v;
  }
  return {
    systemLabel: "ゴブリンスレイヤーTRPG",
    profile: [
      entry("種族", r.shuzoku_name),
      entry("出自", r.shutuji_name),
      entry("来歴", r.raireki_name),
      entry("邂逅", r.kaikou_name),
      entry("年齢", r.age),
      entry("性別", r.sex),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("体力", r.NP1),
        entry("魂魄", r.NP2),
        entry("技量", r.NP3),
        entry("知力", r.NP4),
        entry("集中", r.NP5),
        entry("持久", r.NP6),
        entry("反射", r.NP7),
      ]),
      section("resources", "副能力値", "resources", [
        entry("冒険者レベル", r.lv),
        entry("生命", r.NP8),
        entry("移動", r.NP9),
        entry("移動（装備込み）", r.NP9pe),
        entry("呪文回数", r.NP10),
        entry("呪文抵抗", r.NP11),
        entry("回避", r.kaihi),
        entry("防護", r.bougo),
        entry("現在の経験点", exp),
        entry("成長点（残り）", growth),
        entry("所持金", gold),
      ]),
      section(
        "levels",
        "職業レベル",
        "levels",
        JOBS.map((job, i) => {
          const lv = numOf(r[`GLv${i + 1}`]) ?? 0;
          return lv > 0 ? entry(job, lv) : null;
        }),
      ),
      section("spells", "呪文", "list", spellList(r)),
      section("skills", "技能", "list", skillList(r)),
      section("equipment", "武器・防具", "list", equipmentList(r)),
      section("items", "所持品", "list", itemList(r)),
      textSection("memo", "メモ", r.pc_making_memo),
    ],
    stats,
  };
}
