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
import type { SkillTable } from "../skill-tables";
import { soukoLearnedSkills } from "./souko-mglg";

/** キャラクターシート倉庫のキルデスビジネス（/helltv/）。公開 JSON（/helltv/display?ajax=1&key=…）を読む */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * キルデスビジネスの特技表（列 = 分野、行 = 2〜12）。倉庫の編集画面（/helltv/js/helltv.js の SKILLS）が持つ表を写した。
 * 習得特技は skills.row{行}.name{列}。
 */
export const KILLDEATH_SKILLS: SkillTable = [
  [
    "職業",
    ["無職", "芸術家", "研究者", "家事手伝い", "学生", "悪漢", "労働者", "探偵", "大物", "医師", "公務員"],
  ],
  ["動作", ["叫ぶ", "閃く", "斬る", "振る", "投げる", "殴る", "蹴る", "跳ぶ", "撃つ", "掴む", "待つ"]],
  [
    "小道具",
    ["ピアス", "髪飾り", "銃", "ネックレス", "ベルト", "眼鏡", "帽子", "時計", "剣", "リング", "タトゥー"],
  ],
  [
    "衣装",
    [
      "ネイキッド",
      "アウトドア",
      "エスニック",
      "ヒップホップ",
      "ミリタリー",
      "フォーマル",
      "トラッド",
      "ゴシック",
      "パンク",
      "メタル",
      "アイドル",
    ],
  ],
  ["情動", ["愛", "喜び", "期待", "焦り", "自負", "怒り", "悲しみ", "嫉妬", "恐怖", "恥", "嫌悪"]],
  ["願望", ["死", "復讐", "勝利", "支配", "獲得", "繁栄", "強化", "安全", "健康", "長寿", "生"]],
];

/** アビリティ欄は上から リスク 7〜1 の固定 7 行（編集画面の INIT_DATA） */
const ABILITY_RISKS = [7, 6, 5, 4, 3, 2, 1];

/** 長いテーマ文は最初の行だけ */
function firstLine(v: unknown): string | undefined {
  return textOf(textOf(v)?.split("\n")[0]);
}

export function readSoukoHelltv(root: Rec): GameSheetParts {
  const base = rec(root.base) ?? {};
  const soul = numOf(base.soul);
  const hellslug = numOf(base.hellslug);
  const charge = numOf(rec(root.charge)?.level);
  const block = numOf(rec(root.block)?.level);
  const deathcount = numOf(rec(root.deathcount)?.level);

  const abilities = compact(
    arr(root.ability).map((x, i) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const risk = ABILITY_RISKS[i];
      const note = compact([
        risk !== undefined && `リスク${risk}`,
        textOf(r.targetSkill) && `指定特技：${textOf(r.targetSkill)}`,
        textOf(r.effect),
      ]).join("　");
      return listEntry(name, r.level, { note: note || undefined });
    }),
  );

  const hellcyber = compact(
    arr(root.hellcyber).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      return r && name ? listEntry(name, r.effect) : null;
    }),
  );

  const relations = compact(
    arr(root.relations).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const note = compact([textOf(r.attribute), textOf(r.notes)]).join("　");
      return listEntry(name, r.depth, { note: note || undefined });
    }),
  );

  const sub = rec(root.subplot) ?? {};
  const subName = textOf(sub.name);
  const subplot = subName
    ? [
        listEntry(subName, "", {
          note:
            compact([textOf(sub.conditions), textOf(sub.reward) && `報酬：${textOf(sub.reward)}`]).join(
              "　",
            ) || undefined,
        }),
      ]
    : [];

  const seasons = compact(
    arr(root.season).map((x) => {
      const r = rec(x);
      const no = textOf(r?.no);
      if (!r || !no) return null;
      const count = numOf(r.count);
      return listEntry(`シーズン${no}`, count !== undefined ? `${count}話` : "", {
        note: firstLine(r.theme),
      });
    }),
  );

  return {
    systemLabel: "キルデスビジネス",
    profile: [
      entry("キャラ属性", base.attribute),
      entry("戦闘スタイル", base.battlestyle),
      entry("願い事", base.wish),
      entry("年齢", base.age),
      entry("性別", base.sex),
    ],
    sections: [
      section("resources", "ステータス", "resources", [
        entry("ソウル", soul),
        entry("ヘルスラッグ", hellslug),
        entry("チャージ", charge, { max: 3 }),
        entry("ブロック", block, { max: 3 }),
        entry("死亡回数", deathcount, { max: 6 }),
      ]),
      section("skills", "習得特技", "skills", soukoLearnedSkills(root, KILLDEATH_SKILLS)),
      section("abilities-list", "アビリティ", "list", abilities),
      section("hellcyber", "ヘルサイバー", "list", hellcyber),
      section("relations", "関係", "list", relations),
      section("subplot", "サブプロット", "list", subplot),
      section("seasons", "シーズン", "list", seasons),
      textSection("memo", "設定", base.memo),
    ],
    stats: {
      ...(soul !== undefined ? { soul } : {}),
      ...(hellslug !== undefined ? { hellslug } : {}),
      ...(charge !== undefined ? { charge } : {}),
      ...(block !== undefined ? { block } : {}),
      ...(deathcount !== undefined ? { deathcount } : {}),
    },
  };
}
