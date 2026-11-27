/**
 * キャラクターの画面に見せるステータス（閲覧専用）。
 * 元はキャラシ。卓をまたいで続く値（SAN など）だけはセッションの記録と比べた今の値に置き換えて、
 * 同じ値を画面の 2 か所に出さない（P3）。キャラシがなければ、記録から分かるもの（続く値・成長した技能）で作る。
 */
import type { Character } from "../types";
import { carriedValues } from "./character-growth";
import { buildSheet, section, type CharacterSheet, type SheetEntry, type SheetSection } from "./sheet";
import { cocSkillGroup, sheetFromStats } from "./sheet-sources";
import { isCoc } from "./system-rules";

/** 記録した成長から分かる技能の今の値 */
function grownSkills(c: Pick<Character, "growth" | "systemId">): SheetEntry[] {
  const out = new Map<string, SheetEntry>();
  for (const g of [...c.growth].sort((a, b) => a.date.localeCompare(b.date))) {
    const group = isCoc(c.systemId) ? cocSkillGroup(g.skill) : undefined;
    out.set(g.skill, { label: g.skill, value: g.to, grown: true, ...(group ? { group } : {}) });
  }
  return [...out.values()];
}

function sheetFromRecords(c: Pick<Character, "growth" | "systemId" | "stats">): CharacterSheet | undefined {
  /* 以前の取り込みで stats に入った能力値・技能。種類を見分けられるのは CoC だけ */
  const held = isCoc(c.systemId) ? sheetFromStats(c.stats, "text", c.systemId) : undefined;
  const of = (kind: SheetSection["kind"]) => held?.sections.find((s) => s.kind === kind)?.entries ?? [];
  const grown = grownSkills(c);
  const names = new Set(grown.map((e) => e.label));
  return buildSheet("text", {
    sections: [
      section("abilities", "能力値", "abilities", of("abilities")),
      section("skills", "技能", "skills", [...grown, ...of("skills").filter((e) => !names.has(e.label))]),
    ],
  });
}

export function statusSheet(
  c: Pick<Character, "systemId" | "sessions" | "stats" | "externalSync" | "sheet" | "growth">,
): CharacterSheet | undefined {
  const base = c.sheet ?? sheetFromRecords(c);
  const carried = carriedValues(c);
  if (carried.length === 0) return base;
  const left = new Map(carried.map((v) => [v.label, v]));
  const sections = (base?.sections ?? []).map((s) => {
    /* 続く値はシステムによって副能力値（SAN）にも能力値（サタスペの犯罪・生活…）にもある。書かれている所で今の値にする */
    if (s.kind !== "resources" && s.kind !== "levels" && s.kind !== "abilities") return s;
    return {
      ...s,
      entries: s.entries.map((e) => {
        const now = left.get(e.label);
        if (!now) return e;
        left.delete(e.label);
        return { ...e, value: now.value, ...(now.max != null ? { max: now.max } : {}) };
      }),
    };
  });
  /* キャラシに書かれていない続く値は副能力値に足す */
  const added = [...left.values()].map((v): SheetEntry => ({
    label: v.label,
    value: v.value,
    ...(v.max != null ? { max: v.max } : {}),
  }));
  if (added.length > 0) {
    const at = sections.findIndex((s) => s.kind === "resources");
    if (at >= 0) sections[at] = { ...sections[at]!, entries: [...sections[at]!.entries, ...added] };
    else sections.unshift(section("resources", "副能力値", "resources", added));
  }
  return base ? { ...base, sections } : buildSheet("text", { sections });
}
