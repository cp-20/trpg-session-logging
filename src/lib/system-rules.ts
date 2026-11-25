/**
 * キャラシの値から決まる、システムごとの値。どれも純粋関数（入力させず、キャラシから導く。P2）。
 */
import type { GrowthRecord } from "../types";
import type { CharacterSheet, SheetEntry } from "./sheet";

export function isCoc(systemId: string | undefined): boolean {
  return systemId === "coc6" || systemId === "coc7";
}

/* ---------- クトゥルフ神話TRPG ---------- */

/** 技能名の「クトゥルフ神話」か。括弧書き・「技能」・空白・全角半角・英語表記の違いを吸収する */
export function isMythosSkill(label: string): boolean {
  const t = label
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[([【].*$/, "")
    .replace(/[\s・:_-]+/g, "")
    .replace(/(?:技能|知識|skill|%)+$/, "");
  return /^(?:クトゥルフ神話|クトゥルー神話|クトゥルフの神話|cthulhumythos)$/.test(t);
}

/** キャラシの技能から読むクトゥルフ神話。書かれていなければ undefined（0 と決めつけない） */
export function cthulhuMythos(sheet: CharacterSheet | undefined): number | undefined {
  const hit = sheet?.sections
    .filter((s) => s.kind === "skills")
    .flatMap((s) => s.entries)
    .find((e) => isMythosSkill(e.label) && typeof e.value === "number");
  return hit ? Math.max(0, hit.value as number) : undefined;
}

/** キャラシ、なければ最後に記録した成長から分かるクトゥルフ神話 */
export function knownMythos(c: {
  sheet?: CharacterSheet;
  growth?: Pick<GrowthRecord, "skill" | "date" | "to">[];
}): number | undefined {
  const fromSheet = cthulhuMythos(c.sheet);
  if (fromSheet != null) return fromSheet;
  const last = (c.growth ?? [])
    .filter((g) => isMythosSkill(g.skill))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  return last ? Math.max(0, last.to) : undefined;
}

/**
 * SAN の上限。6 版・7 版とも 99 − クトゥルフ神話。
 * クトゥルフ神話が分からなければキャラシの書いた上限、それもなければ undefined（99 と言い切らない）
 */
export function sanMax(mythos: number | undefined, written?: number): number | undefined {
  return mythos != null ? Math.max(0, 99 - mythos) : written;
}

/** キャラシの SAN の上限を、同じキャラシのクトゥルフ神話にそろえる */
export function withSanMax(sheet: CharacterSheet, systemId: string): CharacterSheet {
  if (!isCoc(systemId)) return sheet;
  const mythos = cthulhuMythos(sheet);
  if (mythos == null) return sheet;
  return {
    ...sheet,
    sections: sheet.sections.map((s) =>
      s.kind === "resources"
        ? {
            ...s,
            entries: s.entries.map((e) => (e.label === "SAN" ? { ...e, max: sanMax(mythos, e.max) } : e)),
          }
        : s,
    ),
  };
}

/** 7 版の成功の段階（ハード = 半分、イクストリーム = 5 分の 1。端数切り捨て） */
export function coc7Levels(value: number): { hard: number; extreme: number } {
  return { hard: Math.floor(value / 2), extreme: Math.floor(value / 5) };
}

/* 6 版で能力値×5 と同じ値を持つ副能力値 */
const COC6_ROLL_OF: Record<string, string> = { INT: "アイデア", POW: "幸運", EDU: "知識" };

/** 6 版の能力値ロール（×5）。同じ値の副能力値（アイデアなど）がキャラシにあれば重ねて出さない（P3） */
export function coc6AbilityRoll(e: SheetEntry, sheet: CharacterSheet): number | undefined {
  if (typeof e.value !== "number") return undefined;
  const same = COC6_ROLL_OF[e.label];
  if (same && sheet.sections.some((s) => s.kind === "resources" && s.entries.some((x) => x.label === same))) {
    return undefined;
  }
  return e.value * 5;
}

/* ---------- ソード・ワールド ---------- */

/** 能力値ボーナス（能力値 ÷ 6、端数切り捨て）。増減ではなく判定に足す値なので +3 と書く */
export function swBonusText(value: number): string {
  return `+${Math.floor(value / 6)}`;
}
