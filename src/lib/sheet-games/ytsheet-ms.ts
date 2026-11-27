/**
 * ゆとシートⅡ（/ytsheet/ms/）のマモノスクランブルを読む。
 * 強度・耐久値・能力値（身体・異質・社会）・特性・マギと、分類名・根源・経緯などを読む。
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

/** 「|漢字《かんじ》」「｜漢字《かんじ》」のふりがな記法をふりがななしにする */
function stripRuby(v: unknown): string | undefined {
  return ytText(v)?.replace(/[|｜]([^|｜《》]+)《[^》]*》/g, "$1");
}

/** 「―」だけの欄は空として扱う */
function meaningful(v: unknown): string | undefined {
  const t = ytText(v);
  return t && !/^[―－-]+$/.test(t) ? t : undefined;
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

/** 特性（身体・異質・社会）。キーは attribute{種類}{N} */
const ATTRIBUTE_KINDS = ["Physical", "Special", "Social"] as const;

function attributeEntries(r: Rec): (SheetEntry | null)[] {
  return ATTRIBUTE_KINDS.flatMap((kind) =>
    numbered(r, `attribute${kind}`, "").map((n) => {
      const name = stripRuby(r[`attribute${kind}${n}`]);
      return name ? listEntry(`《${name}》`, "") : null;
    }),
  );
}

/** マギ。magi{N} がマギ名で、名前変更（magi{N}NC）があれば magi{N}Name が実際の名前 */
function magiEntries(r: Rec): (SheetEntry | null)[] {
  return numbered(r, "magi", "").map((n) => {
    const p = `magi${n}`;
    const base = ytText(r[p]);
    const renamed = r[`${p}NC`] ? ytText(r[`${p}Name`]) : undefined;
    const name = renamed ?? base;
    if (!name) return null;
    const note = compact([
      renamed && base ? `（${base}）` : undefined,
      meaningful(r[`${p}Timing`]),
      meaningful(r[`${p}Target`]),
      meaningful(r[`${p}Cond`]) && meaningful(r[`${p}Cond`]) !== "なし"
        ? `条件：${meaningful(r[`${p}Cond`])}`
        : undefined,
      ytText(r[`${p}Note`]),
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
}

/** ゆとシートⅡのマモノスクランブル（JSON のルート）を読む */
export function readYtsheetMs(root: unknown): GameSheetParts {
  const r = asRec(root);
  const level = numOf(r.level);
  const endurance = numOf(r.endurance);
  const stats: Record<string, number> = {};
  if (level !== undefined) stats.level = level;
  if (endurance !== undefined) stats.endurance = endurance;
  return {
    systemLabel: "マモノスクランブル",
    profile: [
      entry("分類名", stripRuby(r.taxa)),
      entry("出身地", r.home),
      entry("根源", r.origin),
      entry("経緯", r.background),
      entry("クランへの感情", r.clanEmotion),
      entry("住所", r.address),
      entry("所属クラン", r.clan),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("身体", r.statusPhysical),
        entry("異質", r.statusSpecial),
        entry("社会", r.statusSocial),
      ]),
      section("resources", "副能力値", "resources", [entry("強度", level), entry("耐久値", endurance)]),
      section("attributes", "特性", "list", attributeEntries(r)),
      section("magi", "マギ", "list", magiEntries(r)),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
