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
import { MAGICALOGIA_SKILLS } from "./skill-table-magicalogia";

/** キャラクターシート倉庫のマギカロギア（/mglg/）。公開 JSON（/mglg/display?ajax=1&key=…）を読む */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 習得特技（learned[].id = "skills.row{行}.name{列}"）。表にない番号・重複は読まない */
export function soukoLearnedSkills(root: Rec, table: SkillTable): SheetEntry[] {
  const out: SheetEntry[] = [];
  for (const l of arr(root.learned)) {
    const m = textOf(rec(l)?.id)?.match(/^skills\.row(\d+)\.name(\d+)$/);
    if (!m) continue;
    const [group, names] = table[Number(m[2])] ?? [];
    const label = names?.[Number(m[1])];
    if (!group || !label || out.some((e) => e.label === label)) continue;
    out.push({ label, value: "習得", group });
  }
  return out;
}

/** 領域の値（DOMAIN_VALUE の並び。旧データの "a" は 星） */
const DOMAIN_NAMES: Record<string, string> = {
  a: "星",
  af: "星",
  ab: "獣",
  bc: "力",
  cd: "歌",
  de: "夢",
  e: "闇",
};

/** 「名前\nふりがな」の名前の側 */
function firstLine(v: unknown): string | undefined {
  return textOf(textOf(v)?.split("\n")[0]);
}

export function readSoukoMglg(root: Rec): GameSheetParts {
  const base = rec(root.base) ?? {};
  const magic = rec(root.magic) ?? {};
  const level = numOf(base.level);
  const domain = DOMAIN_NAMES[textOf(base.domain) ?? ""];
  const attack = numOf(base.attack);
  const defense = numOf(base.defense);
  const source = numOf(base.source);
  const magicNow = numOf(magic.value);
  const exp = textOf(base.exp);
  const expNum = numOf(base.exp);

  const library = compact(
    arr(root.library).map((x) => {
      const r = rec(x);
      const name = firstLine(r?.name);
      if (!r || !name) return null;
      const ruby = textOf(textOf(r.name)?.split("\n").slice(1).join(" "));
      const note = compact([
        ruby,
        textOf(r.skill) && `指定特技：${textOf(r.skill)}`,
        textOf(r.target) && `目標：${textOf(r.target)}`,
        textOf(r.cost) && `コスト：${textOf(r.cost)}`,
        numOf(rec(r.charge)?.value) !== undefined && `チャージ：${numOf(rec(r.charge)?.value)}`,
        textOf(r.effect),
      ]).join("　");
      return listEntry(name, r.type, { note: note || undefined });
    }),
  );

  const anchors = compact(
    arr(root.anchor).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const note = compact([textOf(r.attribute), textOf(r.memo)]).join("　");
      return listEntry(name, r.destiny, { note: note || undefined });
    }),
  );

  const duty = compact(
    arr(root.duty).map((x) => {
      const r = rec(x);
      const anchor = textOf(r?.anchor);
      return r && anchor ? listEntry(anchor, "", { note: textOf(r.notes) }) : null;
    }),
  );

  const trueform = rec(root.trueform) ?? {};
  const trueName = textOf(trueform.name);

  return {
    systemLabel: "マギカロギア",
    profile: [
      entry("魔法名", firstLine(base.magicname)),
      entry("表の顔", base.cover),
      entry("かりそめの名前", base.covername),
      entry("階梯", level !== undefined ? `第${level}階梯` : undefined, { note: textOf(base.levelname) }),
      entry("領域", domain),
      entry("経歴/機関", base.career),
      entry("信条", base.belief),
      entry("功績点", exp),
      entry("魂の特技", rec(root.soul)?.skill),
      entry("年齢", base.age),
      entry("性別", base.sex),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("攻撃力", attack),
        entry("防御力", defense),
        entry("根源力", source),
      ]),
      section("resources", "魔力", "resources", [
        entry("魔力", magicNow, { max: numOf(magic.max) }),
        entry("一時的魔力", magic.temp),
      ]),
      section("skills", "習得特技", "skills", soukoLearnedSkills(root, MAGICALOGIA_SKILLS)),
      section("library", "蔵書", "list", library),
      section("anchors", "アンカー", "list", anchors),
      section("duty", "義務", "list", duty),
      section(
        "trueform",
        "真の姿",
        "list",
        trueName
          ? [
              listEntry(trueName, trueform.effect, {
                note: textOf(trueform.notes),
              }),
            ]
          : [],
      ),
      textSection("memo", "設定", base.memo),
    ],
    stats: {
      ...(attack !== undefined ? { attack } : {}),
      ...(defense !== undefined ? { defense } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(magicNow !== undefined ? { magic: magicNow } : {}),
      ...(expNum !== undefined ? { exp: expNum } : {}),
    },
  };
}
