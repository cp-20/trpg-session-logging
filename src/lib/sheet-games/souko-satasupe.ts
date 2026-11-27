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
import type { SkillTable } from "../skill-tables";

/** キャラクターシート倉庫のサタスペ（/satasupe/）。公開 JSON（/satasupe/display?ajax=1&key=…）を読む */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * 趣味表（列 = 1 回目のサイコロ、行 = 2 回目のサイコロ）。倉庫の編集画面（/satasupe/js/satasupe.js の HOBBY_NAMES）を写した。
 * 習得特技は learned[].id = "hobby.{1 回目}_{2 回目}"（どちらも 1 始まり）。
 */
export const SATASUPE_HOBBIES: SkillTable = [
  ["サブカル系", ["イベント", "アブノーマル", "カワイイ", "トンデモ", "マニア", "ヲタク"]],
  ["アート系", ["音楽", "好きなタグ", "トレンド", "読書", "パフォーマンス", "美術"]],
  ["マジメ系", ["アラサガシ", "おせっかい", "好きなタグ", "家事", "ガリ勉", "健康"]],
  ["休日系", ["アウトドア", "工作", "スポーツ", "同一のタグ", "ハイソ", "旅行"]],
  ["イヤシ系", ["育成", "サビシガリヤ", "ヒマツブシ", "宗教", "同一のタグ", "ワビサビ"]],
  ["風俗系", ["アダルト", "飲食", "ギャンブル", "ゴシップ", "ファッション", "ハプニング"]],
];

/** 習得特技（趣味表の番号から名前に直す）。表にない番号・重複は読まない */
function learnedHobbies(raw: unknown): SheetEntry[] {
  const out: SheetEntry[] = [];
  for (const l of arr(raw)) {
    const m = textOf(rec(l)?.id)?.match(/^hobby\.(\d+)_(\d+)$/);
    if (!m) continue;
    const [group, names] = SATASUPE_HOBBIES[Number(m[1]) - 1] ?? [];
    const label = names?.[Number(m[2]) - 1];
    if (!group || !label || out.some((e) => e.label === label && e.group === group)) continue;
    out.push({ label, value: "習得", group });
  }
  return out;
}

/** 改行を空白にして 1 行にする（カルマ名の「(S5終了時)\nペテン師」など） */
function oneLine(v: unknown): string | undefined {
  return textOf(textOf(v)?.replace(/\s*\n\s*/g, " "));
}

/** 長い感想は最初の行だけ */
function firstLine(v: unknown): string | undefined {
  return textOf(textOf(v)?.split("\n")[0]);
}

/** カルマの 異能／代償 1 つぶん（名前（使用・対象・判定）効果） */
function karmaPart(label: string, part: Rec | undefined): string | undefined {
  const name = oneLine(part?.name);
  if (!part || !name) return undefined;
  const detail = compact([textOf(part.use), textOf(part.target), textOf(part.judge)]).join("・");
  return compact([`${label}：${name}${detail ? `（${detail}）` : ""}`, oneLine(part.effect)]).join(" ");
}

function namedRows(
  raw: unknown,
  nameKey: string,
  build: (r: Rec) => { value?: unknown; note?: (string | undefined)[] },
): SheetEntry[] {
  return compact(
    arr(raw).map((x) => {
      const r = rec(x);
      const name = oneLine(r?.[nameKey]);
      if (!r || !name) return null;
      const { value, note } = build(r);
      const joined = compact(note ?? []).join("　");
      return listEntry(name, value, { note: joined || undefined });
    }),
  );
}

export function readSoukoSatasupe(root: Rec): GameSheetParts {
  const base = rec(root.base) ?? {};
  const abl = rec(base.abl) ?? {};
  const gift = rec(base.gift) ?? {};
  const power = rec(base.power) ?? {};
  const exp = rec(base.exp) ?? {};
  const cond = rec(root.cond) ?? {};
  const home = rec(root.home) ?? {};
  const val = (r: Rec, key: string): unknown => rec(r[key])?.value;

  const crime = numOf(val(abl, "crime"));
  const life = numOf(val(abl, "life"));
  const love = numOf(val(abl, "love"));
  const culture = numOf(val(abl, "culture"));
  const combat = numOf(val(abl, "combat"));
  const emotion = numOf(base.emotion);
  const expRemain = numOf(exp.remain);

  const karma = compact(
    arr(root.karma).map((x) => {
      const r = rec(x);
      const name = oneLine(r?.name);
      if (!r || !name) return null;
      const note = compact([karmaPart("異能", rec(r.talent)), karmaPart("代償", rec(r.price))]).join("　");
      return listEntry(name, "", { note: note || undefined });
    }),
  );

  const num = (key: string, v: number | undefined): Record<string, number> =>
    v !== undefined ? { [key]: v } : {};

  return {
    systemLabel: "サタスペ",
    profile: [
      entry("表の顔", base.surface),
      entry("チーム", base.team),
      entry("盟約", base.alliance),
      entry("階級", base.hierarchy),
      entry("故郷", base.homeland),
      entry("外見", base.style),
      entry("年齢", base.age),
      entry("性別", base.sex),
      entry("好", base.likes),
      entry("嫌", base.dislikes),
      entry("好みのタイプ", base.favorites),
      entry("好きな映画", base.movie),
      entry("言語", base.langueges),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("犯罪", crime),
        entry("生活", life),
        entry("恋愛", love),
        entry("教養", culture),
        entry("戦闘", combat),
      ]),
      section("gift", "天分値", "abilities", [
        entry("肉体", val(gift, "body")),
        entry("精神", val(gift, "mind")),
      ]),
      section("power", "戦闘力", "resources", [
        entry("反応力", power.initiative),
        entry("攻撃力", power.attack),
        entry("破壊力", power.destroy),
        entry("戦闘力", val(power, "total")),
      ]),
      section("resources", "状態", "resources", [
        entry("性業値", emotion),
        entry("肉体点", val(cond, "body")),
        entry("精神点", val(cond, "mental")),
        entry("サイフ", val(cond, "wallet")),
        entry("SAN", val(cond, "san")),
        entry("クトゥルフ神話知識", val(cond, "cthulhu")),
        entry("トラウマ", val(cond, "trauma")),
        entry("中毒", val(cond, "addiction")),
        entry("トリコ", val(cond, "prisoner")),
      ]),
      section("exp", "経験値", "resources", [
        entry("獲得", exp.total),
        entry("使用", exp.use),
        entry("維持合計", exp.waste),
        entry("残り", expRemain),
      ]),
      section("skills", "習得特技", "skills", learnedHobbies(root.learned)),
      section("karma", "カルマ", "list", karma),
      section(
        "weapons",
        "武器",
        "list",
        namedRows(root.weapons, "name", (r) => ({
          value: r.damage,
          note: [
            textOf(r.aim) && `命中：${textOf(r.aim)}`,
            textOf(r.range) && `射程：${textOf(r.range)}`,
            textOf(r.notes),
            textOf(r.place) && `保管：${textOf(r.place)}`,
          ].map((s) => s || undefined),
        })),
      ),
      section(
        "outfits",
        "一般装備",
        "list",
        namedRows(root.outfits, "name", (r) => ({
          value: r.use,
          note: [oneLine(r.effect), textOf(r.notes), textOf(r.place) && `保管：${textOf(r.place)}`].map(
            (s) => s || undefined,
          ),
        })),
      ),
      section(
        "vehicles",
        "乗物",
        "list",
        namedRows(root.vehicles, "name", (r) => ({
          value: r.speed,
          note: [
            textOf(r.frame) && `車体：${textOf(r.frame)}`,
            textOf(r.burden) && `荷物：${textOf(r.burden)}`,
            textOf(r.notes),
          ].map((s) => s || undefined),
        })),
      ),
      section("home", "アジト", "list", [
        entry("場所", home.place),
        entry("快適度", home.comfortable),
        entry("セキュリティ", home.security),
      ]),
      section(
        "history",
        "セッション履歴",
        "list",
        namedRows(root.history, "name", (r) => ({
          value: r.exp,
          note: [
            textOf(r.dd) && `DD：${textOf(r.dd)}`,
            textOf(r.speakeasy) && `カルマ：${textOf(r.speakeasy)}`,
            textOf(r.date),
            firstLine(r.comment),
          ].map((s) => s || undefined),
        })),
      ),
      textSection("memo", "メモ", base.memo),
    ],
    stats: {
      ...num("crime", crime),
      ...num("life", life),
      ...num("love", love),
      ...num("culture", culture),
      ...num("combat", combat),
      ...num("emotion", emotion),
      ...num("exp", expRemain),
    },
  };
}
