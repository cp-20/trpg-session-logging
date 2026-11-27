/**
 * ゆとシートⅡ（/ytsheet/kiz/）のキズナバレットを読む。
 * 種別（ハウンド／オーナー）・ネガイ（表／裏）・耐久値・作戦力・キズナ・キズアト・傷号・パートナーを読む。
 */
import {
  compact,
  entry,
  listEntry,
  numOf,
  section,
  textOf,
  textSection,
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

const HOUND_TYPE_LABELS = { background: "遭遇", backgroundOwner: "経緯" } as const;

/** ゆとシートⅡのキズナバレット（JSON のルート）を読む */
export function readYtsheetKiz(root: unknown): GameSheetParts {
  const r = asRec(root);
  const owner = textOf(r.class) === "オーナー";
  const endurance = numOf(r.endurance);
  const operation = numOf(r.operation);
  const stats: Record<string, number> = {};
  if (endurance !== undefined) stats.endurance = endurance;
  if (operation !== undefined) stats.operation = operation;
  const kizuna = numbered(r, "kizuna").map((n) => {
    const p = `kizuna${n}`;
    const state = compact([r[`${p}Hibi`] ? "ヒビ" : undefined, r[`${p}Ware`] ? "ワレ" : undefined]).join(
      "／",
    );
    return listEntry(ytText(r[`${p}Name`]) ?? "", state, { note: ytText(r[`${p}Note`]) });
  });
  const kizuato = numbered(r, "kizuato").map((n) => {
    const p = `kizuato${n}`;
    const name = stripRuby(r[`${p}Name`]);
    if (!name) return null;
    const drama = compact([
      meaningful(r[`${p}DramaHitogara`]),
      meaningful(r[`${p}DramaTiming`]),
      meaningful(r[`${p}DramaTarget`]),
      meaningful(r[`${p}DramaLimited`]),
      ytText(r[`${p}DramaNote`]),
    ]).join(" ");
    const battle = compact([
      meaningful(r[`${p}BattleTiming`]),
      meaningful(r[`${p}BattleTarget`]),
      meaningful(r[`${p}BattleCost`]),
      meaningful(r[`${p}BattleLimited`]),
      ytText(r[`${p}BattleNote`]),
    ]).join(" ");
    const note = compact([
      drama ? `ドラマ：${drama}` : undefined,
      battle ? `決戦：${battle}` : undefined,
    ]).join("　");
    return listEntry(name, "", { note: note || undefined });
  });
  const partners = numbered(r, "partner").map((n) => {
    const p = `partner${n}`;
    const negai = compact([meaningful(r[`${p}NegaiOutside`]), meaningful(r[`${p}NegaiInside`])]).join("／");
    const note = compact([
      compact([meaningful(r[`${p}Gender`]), meaningful(r[`${p}Age`])]).join(" ") || undefined,
      negai || undefined,
      meaningful(r[`${p}Release`]) ? `リリース：${meaningful(r[`${p}Release`])}` : undefined,
    ]).join("　");
    return listEntry(ytText(r[`${p}Name`]) ?? "", "", { note: note || undefined });
  });
  const negaiOut = textOf(r.negaiOutside);
  const negaiIn = textOf(r.negaiInside);
  return {
    systemLabel: "キズナバレット",
    profile: [
      entry("種別", r.class),
      entry(
        "ネガイ",
        compact([negaiOut ? `${negaiOut}（表）` : undefined, negaiIn ? `${negaiIn}（裏）` : undefined]).join(
          "／",
        ),
      ),
      entry("性別", r.gender),
      entry("年齢", r.age),
      entry("過去", r.past),
      entry(owner ? HOUND_TYPE_LABELS.backgroundOwner : HOUND_TYPE_LABELS.background, r.background),
      entry("喪失", r.missing),
      entry("所属", r.belong),
      entry("おもな武器", r.weapon),
    ],
    sections: [
      section("resources", "副能力値", "resources", [entry("耐久値", endurance), entry("作戦力", operation)]),
      section("kizuna", "キズナ", "list", kizuna),
      section("kizuato", "キズアト", "list", kizuato),
      section(
        "shougou",
        "傷号",
        "list",
        [1, 2, 3].map((n) => listEntry(ytText(r[`shougou${n}`]) ?? "", "")),
      ),
      section("partners", owner ? "パートナー" : "パートナー／アナザー", "list", partners),
      textSection("memo", "メモ", ytText(r.freeNote)),
    ],
    stats,
  };
}
