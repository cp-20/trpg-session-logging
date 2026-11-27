import { useState, type ReactNode } from "react";
import { cx } from "./ui";
import {
  groupSkills,
  isGrownSkill,
  splitSkills,
  type CharacterSheet,
  type SheetEntry,
  type SheetSection,
} from "../lib/sheet";
import { INSANE_SKILLS, SHINOBIGAMI_SKILLS, type SkillTable } from "../lib/skill-tables";
import { MAGICALOGIA_SKILLS } from "../lib/sheet-games/skill-table-magicalogia";
import { KILLDEATH_SKILLS } from "../lib/sheet-games/souko-helltv";
import { SATASUPE_HOBBIES } from "../lib/sheet-games/souko-satasupe";
import { FUTARISOUSA_SKILLS } from "../lib/sheet-games/souko-2s";
import {
  coc6AbilityRoll,
  coc7Levels,
  cthulhuMythos,
  isCoc,
  isMythosSkill,
  swBonusText,
  withSanMax,
} from "../lib/system-rules";

/**
 * キャラシ（汎用形式）の見せ方。データはシステムに依存しない区分の並びで、
 * ここでシステムごとの並べ方（主な値・能力値から決まる値・技能の形・最初に見せる範囲）だけを決める。
 */
interface SheetLayout {
  /** 卓の最中に何度も見る値（HP・SAN など）。大きく先頭に出す */
  vitals: string[];
  /** 能力値の列数 */
  abilityCols: string;
  /** 能力値から決まる、判定で使う値（キャラシに書かれていればそれ） */
  abilityNote?: (e: SheetEntry, sheet: CharacterSheet) => string | undefined;
  /** 能力値より判定で使う値（ボーナス）を先に読むシステム */
  noteFirst?: boolean;
  /** 技能の見せ方: 百分率（バー付き）・段階（●●○）・素の値 */
  skillMode: "percent" | "rank" | "plain";
  /** 能力値・技能の値に添える、成功の段階ごとの値 */
  levels?: (value: number) => { label: string; value: number }[];
  /** 技能を能力値の下に並べる（技能の分類 = 能力値の名前） */
  skillsByAbility?: boolean;
  /** 決まった特技表の上に、習得した特技を示す */
  skillTable?: SkillTable;
  /** 特技表の行の見出し。2〜12 は 2D6 の出目（シノビガミなど）、1〜6 は 1D6（サタスペの趣味表）、none は出目で引かない表 */
  skillTableRows?: "2d6" | "d6" | "none";
  /** 区分の並び順（ここに無い区分は後ろに元の順で並ぶ） */
  order: string[];
  /** 一覧・本文のうち、最初から見せる区分（ほかは開閉） */
  open?: string[];
}

const COC: SheetLayout = {
  vitals: ["HP", "MP", "SAN", "幸運"],
  abilityCols: "grid-cols-4 [@container_(min-width:48rem)]:grid-cols-8",
  skillMode: "percent",
  order: ["resources", "abilities", "skills"],
};

const SW: SheetLayout = {
  vitals: ["HP", "MP"],
  abilityCols: "grid-cols-3 [@container_(min-width:30rem)]:grid-cols-6",
  abilityNote: (e) => (typeof e.value === "number" ? swBonusText(e.value) : undefined),
  noteFirst: true,
  skillMode: "plain",
  order: ["resources", "levels", "abilities", "skills", "feats"],
  open: ["feats"],
};

const SHEET_LAYOUTS: Record<string, SheetLayout> = {
  coc6: {
    ...COC,
    vitals: ["HP", "MP", "SAN"],
    abilityNote: (e, sheet) => {
      const roll = coc6AbilityRoll(e, sheet);
      return roll === undefined ? undefined : `×5 ${roll}`;
    },
  },
  coc7: {
    ...COC,
    levels: (value) => {
      const { hard, extreme } = coc7Levels(value);
      return [
        { label: "ハード", value: hard },
        { label: "イクストリーム", value: extreme },
      ];
    },
  },
  emoklore: {
    vitals: ["HP", "MP", "共鳴"],
    abilityCols: "grid-cols-4 [@container_(min-width:48rem)]:grid-cols-8",
    skillMode: "rank",
    order: ["resources", "abilities", "skills", "emotions"],
    open: ["emotions"],
  },
  sw25: SW,
  "SwordWorld2.0": SW,
  DoubleCross: {
    vitals: ["HP", "侵蝕率基本値", "行動値"],
    abilityCols: "grid-cols-2 [@container_(min-width:30rem)]:grid-cols-4",
    skillMode: "plain",
    skillsByAbility: true,
    order: ["resources", "abilities", "skills", "arts", "lois"],
    open: ["lois"],
  },
  ShinobiGami: {
    vitals: [],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    skillTable: SHINOBIGAMI_SKILLS,
    order: ["skills", "abilities-list"],
    open: ["abilities-list"],
  },
  Insane: {
    vitals: ["生命力", "正気度"],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    skillTable: INSANE_SKILLS,
    order: ["resources", "skills", "abilities-list"],
    open: ["abilities-list"],
  },
  LogHorizon: {
    vitals: ["HP"],
    abilityCols: "grid-cols-4",
    skillMode: "plain",
    order: ["resources", "abilities", "skills"],
  },
  Arianrhod: {
    vitals: ["HP", "MP", "フェイト"],
    abilityCols: "grid-cols-4 [@container_(min-width:40rem)]:grid-cols-7",
    skillMode: "plain",
    order: ["levels", "abilities", "resources", "combat", "skills"],
    open: ["skills"],
  },
  GoblinSlayer: {
    vitals: ["生命", "生命力", "呪文回数"],
    abilityCols: "grid-cols-4 [@container_(min-width:40rem)]:grid-cols-7",
    skillMode: "plain",
    order: ["levels", "abilities", "abilities2", "resources", "skills", "spells", "arts"],
    open: ["skills", "spells"],
  },
  Kamigakari: {
    vitals: ["生命力", "行動値", "移動力"],
    abilityCols: "grid-cols-3 [@container_(min-width:40rem)]:grid-cols-5",
    skillMode: "plain",
    order: ["levels", "abilities", "combat", "resources", "talents"],
    open: ["talents"],
  },
  Nechronica: {
    vitals: ["行動値"],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    order: ["resources", "parts", "maneuvers", "roices", "carma", "kakera"],
    open: ["parts", "roices"],
  },
  NightWizard3rd: {
    vitals: [],
    abilityCols: "grid-cols-3 [@container_(min-width:40rem)]:grid-cols-5",
    skillMode: "plain",
    order: ["levels", "abilities", "battle", "resources", "effects"],
    open: ["effects"],
  },
  MagicaLogia: {
    vitals: [],
    abilityCols: "grid-cols-2 [@container_(min-width:30rem)]:grid-cols-4",
    skillMode: "plain",
    skillTable: MAGICALOGIA_SKILLS,
    order: ["abilities", "resources", "skills", "library", "anchors", "duty", "trueform"],
    open: ["library", "anchors"],
  },
  KillDeathBusiness: {
    vitals: ["ソウル"],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    skillTable: KILLDEATH_SKILLS,
    order: ["resources", "skills", "abilities-list", "hellcyber", "relations", "subplot", "seasons"],
    open: ["abilities-list"],
  },
  StellarKnights: {
    vitals: ["耐久力", "防御力"],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    order: ["resources", "skills", "sheath", "partner-bringer", "partner-sheath"],
    open: ["skills"],
  },
  Satasupe: {
    vitals: [],
    abilityCols: "grid-cols-3 [@container_(min-width:40rem)]:grid-cols-5",
    skillMode: "plain",
    skillTable: SATASUPE_HOBBIES,
    skillTableRows: "d6",
    order: ["abilities", "gift", "power", "resources", "exp", "skills", "karma"],
    open: ["karma"],
  },
  FutariSousa: {
    vitals: [],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    skillTable: FUTARISOUSA_SKILLS,
    skillTableRows: "none",
    order: ["resources", "skills", "quirks", "actions"],
    open: ["quirks"],
  },
  GranCrest: {
    vitals: ["HP", "MP"],
    abilityCols: "grid-cols-3 [@container_(min-width:40rem)]:grid-cols-6",
    skillMode: "plain",
    skillsByAbility: true,
    order: ["abilities", "resources", "skills", "classAbilities", "worksAbilities", "magic"],
    open: ["classAbilities"],
  },
  MamonoScramble: {
    vitals: ["耐久値"],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    order: ["abilities", "resources", "attributes", "magi"],
    open: ["attributes"],
  },
  KizunaBullet: {
    vitals: ["耐久値"],
    abilityCols: "grid-cols-3",
    skillMode: "plain",
    order: ["resources", "kizuna", "kizuato", "shougou", "partners"],
    open: ["kizuna"],
  },
};
const GENERIC: SheetLayout = {
  vitals: [],
  abilityCols: "grid-cols-3 [@container_(min-width:30rem)]:grid-cols-4",
  skillMode: "plain",
  order: ["levels", "abilities", "resources", "skills"],
};

/* 卓譜のシステムと結び付かない取り込み（systemId が汎用）は、キャラシの書いたシステム名で見せ方を選ぶ */
const LAYOUT_BY_LABEL: Record<string, SheetLayout> = {
  "ソード・ワールド2.0": SW,
  ブラッドパス: {
    vitals: ["耐久値"],
    abilityCols: "grid-cols-2",
    skillMode: "plain",
    order: ["abilities", "resources", "bloodarts", "arts", "partners"],
    open: ["bloodarts", "arts"],
  },
  "ヴィジランテ・コード": {
    vitals: [],
    abilityCols: "grid-cols-2 [@container_(min-width:30rem)]:grid-cols-4",
    skillMode: "plain",
    order: ["abilities", "resources", "battle", "equipment", "specialities"],
    open: ["specialities"],
  },
};

function sheetLayoutFor(systemId: string, sheet: CharacterSheet): SheetLayout {
  return SHEET_LAYOUTS[systemId] ?? LAYOUT_BY_LABEL[sheet.systemLabel ?? ""] ?? GENERIC;
}

function orderedSections(sheet: CharacterSheet, layout: SheetLayout): SheetSection[] {
  const rank = (s: SheetSection) => {
    const i = layout.order.indexOf(s.id);
    return i === -1 ? layout.order.length : i;
  };
  return sheet.sections
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map((x) => x.s);
}

/** 技能を能力値の下に置けるか（どの技能の分類も能力値の名前） */
function canNestSkills(sheet: CharacterSheet, layout: SheetLayout): boolean {
  if (!layout.skillsByAbility) return false;
  const abilities = new Set(
    sheet.sections.filter((s) => s.kind === "abilities").flatMap((s) => s.entries.map((e) => e.label)),
  );
  const skills = sheet.sections.filter((s) => s.kind === "skills").flatMap((s) => s.entries);
  return abilities.size > 0 && skills.every((e) => e.group && abilities.has(e.group));
}

/** キャラシ全体（閲覧専用）。面（.surface）1 枚の中に区分を区切り線で並べる */
export function SheetView({
  sheet: raw,
  systemId,
  busy = false,
  compact = false,
}: {
  sheet: CharacterSheet;
  systemId: string;
  /** 更新中。古い内容を薄くして、置き換わることを示す */
  busy?: boolean;
  /** 取り込み前の確認用。能力値と伸ばした技能だけを見せる */
  compact?: boolean;
}) {
  const sheet = withSanMax(raw, systemId);
  const layout = sheetLayoutFor(systemId, sheet);
  const [more, setMore] = useState(false);
  const isCore = (s: SheetSection) =>
    s.kind === "abilities" ||
    s.kind === "resources" ||
    s.kind === "levels" ||
    s.kind === "skills" ||
    (!compact && Boolean(layout.open?.includes(s.id)));
  const nested = canNestSkills(sheet, layout);
  const ordered = orderedSections(sheet, layout).filter((s) => !(nested && s.kind === "skills"));
  /* 所持品・経歴などは長くなるので、最初は卓で見るものだけを見せる */
  const extra = compact ? [] : ordered.filter((s) => !isCore(s));
  const sections = [...ordered.filter(isCore), ...(more ? extra : [])];
  const profile = sheet.profile.filter((e) => e.label !== "職業");
  return (
    <div
      className={cx("surface divide-y divide-base-300 transition-opacity", busy && "opacity-60")}
      aria-busy={busy || undefined}
    >
      {!compact && (profile.length > 0 || sheet.systemLabel) && (
        <div className="meta px-4 py-3 sm:px-5" data-user-content>
          {sheet.systemLabel && <span className="font-medium text-base-content">{sheet.systemLabel}</span>}
          {profile.map((e) => (
            <span key={e.label}>
              {e.label} <span className="text-base-content">{e.value}</span>
            </span>
          ))}
        </div>
      )}
      {sections.map((s) => {
        /* HP・SAN のように名前で分かる値だけの区分に、見出しは付けない */
        const selfLabelled = s.kind === "resources" && s.entries.some((e) => layout.vitals.includes(e.label));
        return (
          <div key={s.id} className="px-4 py-4 sm:px-5">
            {!selfLabelled && <h3 className="eyebrow mb-3">{s.title}</h3>}
            <div className="[container-type:inline-size]">
              <SectionBody
                section={s}
                sheet={sheet}
                systemId={systemId}
                layout={layout}
                nested={nested}
                compact={compact}
              />
            </div>
          </div>
        );
      })}
      {extra.length > 0 && (
        <div className="px-4 py-2.5 sm:px-5">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            {more ? "たたむ" : `${extra.map((s) => s.title).join("・")}を見る`}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionBody({
  section,
  sheet,
  systemId,
  layout,
  nested,
  compact,
}: {
  section: SheetSection;
  sheet: CharacterSheet;
  systemId: string;
  layout: SheetLayout;
  nested: boolean;
  compact: boolean;
}) {
  switch (section.kind) {
    case "abilities":
      return <AbilityGrid entries={section.entries} sheet={sheet} layout={layout} nested={nested} />;
    case "resources":
      return <Resources entries={section.entries} sheet={sheet} systemId={systemId} layout={layout} />;
    case "levels":
      /* エフェクト・特技のように補足を持つものは、名前つきの行で補足まで見せる */
      return section.entries.some((e) => e.note) ? (
        <NamedList entries={section.entries} />
      ) : (
        <LevelList entries={section.entries} />
      );
    case "skills":
      return layout.skillTable ? (
        <SkillTableView
          entries={section.entries}
          table={layout.skillTable}
          rowsLabel={layout.skillTableRows}
        />
      ) : (
        <SkillList
          entries={
            mythosBesideSan(sheet, systemId) === undefined
              ? section.entries
              : section.entries.filter((e) => !isMythosSkill(e.label))
          }
          layout={layout}
          compact={compact}
        />
      );
    case "list":
      return <NamedList entries={section.entries} />;
    case "text":
      return <LongText text={section.text ?? ""} />;
  }
}

function AbilityGrid({
  entries,
  sheet,
  layout,
  nested,
}: {
  entries: SheetEntry[];
  sheet: CharacterSheet;
  layout: SheetLayout;
  nested: boolean;
}) {
  const skills = nested ? sheet.sections.filter((s) => s.kind === "skills").flatMap((s) => s.entries) : [];
  return (
    <dl className={cx("grid gap-y-3", nested ? "gap-x-8" : "gap-x-4", layout.abilityCols)}>
      {entries.map((e) => {
        const note = e.note ?? layout.abilityNote?.(e, sheet);
        const levels = typeof e.value === "number" ? layout.levels?.(e.value) : undefined;
        const own = skills.filter((x) => x.group === e.label);
        return (
          <div key={e.label} className="min-w-0">
            <dt className="truncate text-xs font-medium text-ink2">{e.label}</dt>
            <dd className="tabular-nums">
              {layout.noteFirst && note ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="text-xl font-bold leading-tight">{note}</span>
                  <span className="text-sm text-ink2">{e.value}</span>
                </span>
              ) : (
                <>
                  <span className="block text-xl font-bold leading-tight">{e.value}</span>
                  {levels && <Levels levels={levels} />}
                  {note && <span className="block whitespace-nowrap text-xs text-ink2">{note}</span>}
                </>
              )}
              {own.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-sm" data-user-content>
                  {own.map((x) => (
                    <li key={x.label} className="flex items-baseline justify-between gap-2">
                      <span className={cx("min-w-0 break-words", x.value === 0 && "text-ink2")}>
                        {x.label}
                      </span>
                      <span className={cx(x.value === 0 ? "text-ink2" : "font-bold")}>{x.value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** SAN の横に添えるクトゥルフ神話。添えたときは技能の一覧に重ねて出さない（P3） */
function mythosBesideSan(sheet: CharacterSheet, systemId: string): number | undefined {
  if (!isCoc(systemId)) return undefined;
  const hasSan = sheet.sections.some(
    (s) => s.kind === "resources" && s.entries.some((e) => e.label === "SAN"),
  );
  return hasSan ? cthulhuMythos(sheet) || undefined : undefined;
}

/** 副能力値。何度も見る値（HP・SAN など）を大きく、ほかを小さく下に並べる */
function Resources({
  entries,
  sheet,
  systemId,
  layout,
}: {
  entries: SheetEntry[];
  sheet: CharacterSheet;
  systemId: string;
  layout: SheetLayout;
}) {
  const vitals = layout.vitals.flatMap((l) => entries.find((e) => e.label === l) ?? []);
  const others = entries.filter((e) => !vitals.includes(e));
  const mythos = mythosBesideSan(sheet, systemId);
  return (
    <div className="space-y-4">
      {vitals.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-3 [@container_(min-width:30rem)]:gap-x-10">
          {vitals.map((e) => (
            <Vital key={e.label} e={e}>
              {e.label === "SAN" && mythos !== undefined ? (
                <span className="whitespace-nowrap">
                  クトゥルフ神話 <b className="text-base-content">{mythos}</b>
                </span>
              ) : undefined}
            </Vital>
          ))}
        </dl>
      )}
      {others.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-2">
          {others.map((e) => (
            <div key={e.label} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="text-xs font-medium text-ink2">{e.label}</dt>
              <dd className="text-base font-bold tabular-nums">
                {e.value}
                {e.max != null && <span className="ml-1 text-xs font-medium text-ink2">/ {e.max}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** 主な値 1 つ。上限のあるものは残りの割合をバーで見せる */
function Vital({ e, children }: { e: SheetEntry; children?: ReactNode }) {
  const pct =
    e.max && typeof e.value === "number" ? Math.max(0, Math.min(100, (e.value / e.max) * 100)) : null;
  return (
    <div className={cx("min-w-0", pct !== null && "w-28")}>
      <dt className="text-xs font-medium text-ink2">{e.label}</dt>
      <dd>
        <span className="text-2xl font-bold leading-tight tabular-nums">{e.value}</span>
        {e.max != null && (
          <span className="ml-1.5 text-xs font-medium text-ink2 tabular-nums">/ {e.max}</span>
        )}
        {pct !== null && (
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-base-200" aria-hidden>
            <span
              className={cx("block h-full rounded-full", pct < 30 ? "bg-error/80" : "bg-primary/75")}
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
        {children && <span className="mt-1 block text-xs text-ink2 tabular-nums">{children}</span>}
      </dd>
    </div>
  );
}

function LevelList({ entries }: { entries: SheetEntry[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 [@container_(min-width:30rem)]:grid-cols-3">
      {entries.map((e) => (
        <div
          key={e.label}
          className="flex items-baseline justify-between gap-2 border-b border-base-300 pb-1"
        >
          <dt className="truncate text-sm">{e.label}</dt>
          <dd className="text-base font-bold tabular-nums">{e.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RankDots({ value, max }: { value: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`レベル${value}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cx("size-2 rounded-full", i < value ? "bg-base-content" : "bg-base-300")}
          aria-hidden
        />
      ))}
    </span>
  );
}

/** 成功の段階ごとの値（7 版のハード・イクストリーム） */
function Levels({
  levels,
  column = false,
}: {
  levels: { label: string; value: number }[];
  /** 行をまたいで桁をそろえる（技能の一覧） */
  column?: boolean;
}) {
  return (
    <span className="flex gap-2 text-xs text-ink2">
      {levels.map((l) => (
        <span key={l.label} className={cx(column && "min-w-4 text-right")}>
          <span className="sr-only">{l.label} </span>
          {l.value}
        </span>
      ))}
    </span>
  );
}

function SkillRow({ e, layout }: { e: SheetEntry; layout: SheetLayout }) {
  const grown = isGrownSkill(e);
  const num = typeof e.value === "number" ? e.value : null;
  /* 高い順に並ぶ、伸ばした技能だけバーで比べられるようにする */
  const pct =
    layout.skillMode === "percent" && grown && num !== null ? Math.max(0, Math.min(100, num)) : null;
  const levels = num !== null ? layout.levels?.(num) : undefined;
  return (
    <li className="min-w-0 py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("min-w-0 break-words text-sm", grown ? "font-medium" : "text-ink2")}>
          {e.label}
          {e.note && <span className="ml-1.5 text-xs font-normal text-ink2">{e.note}</span>}
        </span>
        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
          {layout.skillMode === "rank" && e.rank && <RankDots value={e.rank.value} max={e.rank.max} />}
          <span className={cx("min-w-6 text-right", grown ? "text-base font-bold" : "text-sm text-ink2")}>
            {e.value}
          </span>
          {levels && <Levels levels={levels} column />}
        </span>
      </div>
      {pct !== null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-base-200" aria-hidden>
          <div className="h-full rounded-full bg-base-content/70" style={{ width: `${pct}%` }} />
        </div>
      )}
    </li>
  );
}

function SkillRows({ entries, layout }: { entries: SheetEntry[]; layout: SheetLayout }) {
  return (
    <ul
      className="grid gap-x-8 [@container_(min-width:30rem)]:grid-cols-2 [@container_(min-width:48rem)]:grid-cols-3"
      data-user-content
    >
      {entries.map((e) => (
        <SkillRow key={e.label} e={e} layout={layout} />
      ))}
    </ul>
  );
}

/** 技能。伸ばした技能を高い順に見せ、残りは分類ごとに開閉にしまう */
function SkillList({
  entries,
  layout,
  compact,
}: {
  entries: SheetEntry[];
  layout: SheetLayout;
  compact: boolean;
}) {
  const [all, setAll] = useState(false);
  const { main, rest } = splitSkills(entries);
  const groups = groupSkills(rest);
  return (
    <>
      <SkillRows entries={compact ? main.slice(0, 12) : main} layout={layout} />
      {all && (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.group || "_"}>
              {g.group && <h4 className="mb-1 text-xs font-medium text-ink2">{g.group}</h4>}
              <SkillRows entries={g.entries} layout={layout} />
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && !compact && (
        <button
          type="button"
          className="btn btn-quiet btn-sm mt-3"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
        >
          {all ? "たたむ" : "ほかの技能を見る"}
        </button>
      )}
    </>
  );
}

/**
 * 特技表（列 = 分野、行 = 2〜12）。判定は表の上の距離で決まるので、表を丸ごと出して習得した特技を示す。
 * 表を丸ごと載せるのは運営者の判断（2026-11-27。TRPGライツ事務局のガイドラインの表の転載の項を確かめたうえで）
 */
function SkillTableView({
  entries,
  table,
  rowsLabel = "2d6",
}: {
  entries: SheetEntry[];
  table: SkillTable;
  rowsLabel?: SheetLayout["skillTableRows"];
}) {
  const learned = new Set(entries.map((e) => e.label));
  const rows = table[0]?.[1].length ?? 0;
  /* 分野ごとの習得（表が入らない幅） */
  const byField = table
    .map(([field, names]) => ({ field, names: names.filter((n) => learned.has(n)) }))
    .filter((f) => f.names.length > 0);
  return (
    <>
      <dl className="space-y-1.5 text-sm [@container_(min-width:30rem)]:hidden">
        {byField.map((f) => (
          <div key={f.field} className="flex gap-3">
            <dt className="w-12 shrink-0 text-ink2">{f.field}</dt>
            <dd className="flex min-w-0 flex-wrap gap-x-4 font-medium">
              {f.names.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <table className="hidden w-full table-fixed border-separate border-spacing-x-0.5 border-spacing-y-0 text-xs [@container_(min-width:30rem)]:table">
        <thead>
          <tr>
            <td className="w-7 !border-0 !p-0" />
            {table.map(([field]) => (
              <th
                key={field}
                scope="col"
                className="!border-0 !px-0.5 !pb-1 !pt-0 !text-center !text-xs font-bold"
              >
                {field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <th
                scope="row"
                className="!border-0 !py-1 !pl-0 !pr-1 !text-right !text-xs font-normal tabular-nums text-ink2"
              >
                {rowsLabel === "none" ? "" : rowsLabel === "d6" ? i + 1 : i + 2}
              </th>
              {table.map(([field, names]) => {
                const name = names[i] ?? "";
                const has = learned.has(name);
                return (
                  <td
                    key={field}
                    className={cx(
                      "rounded !border-0 !px-0.5 !py-1 !text-center !text-xs",
                      has ? "bg-base-300 font-bold text-base-content" : "text-ink2",
                    )}
                  >
                    {name}
                    {has && <span className="sr-only">（習得）</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** 名前つきの行。分類（ネクロニカのパーツの部位・呪文の系統など）があれば、分類ごとに見出しを付けて並べる */
function NamedList({ entries }: { entries: SheetEntry[] }) {
  const groups: { group: string; items: SheetEntry[] }[] = [];
  for (const e of entries) {
    const g = e.group ?? "";
    const last = groups.at(-1);
    if (last && last.group === g) last.items.push(e);
    else groups.push({ group: g, items: [e] });
  }
  if (groups.length <= 1) return <NamedRows entries={entries} />;
  return (
    <div className="space-y-3">
      {groups.map((g, i) => (
        <div key={`${g.group}-${i}`}>
          {g.group && <div className="mb-1 text-xs font-bold text-ink2">{g.group}</div>}
          <NamedRows entries={g.items} />
        </div>
      ))}
    </div>
  );
}

function NamedRows({ entries }: { entries: SheetEntry[] }) {
  return (
    <ul className="space-y-1.5 text-sm" data-user-content>
      {entries.map((e, i) => (
        <li key={`${e.label}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{e.label}</span>
          {e.value !== "" && <span className="tabular-nums text-ink2">{e.value}</span>}
          {e.note && <span className="w-full whitespace-pre-wrap text-xs text-ink2 sm:w-auto">{e.note}</span>}
        </li>
      ))}
    </ul>
  );
}

function LongText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 240 || text.split("\n").length > 6;
  return (
    <>
      <p
        data-user-content
        className={cx("whitespace-pre-wrap text-sm leading-relaxed", long && !open && "line-clamp-6")}
      >
        {text}
      </p>
      {long && (
        <button type="button" className="btn btn-quiet btn-sm mt-2" onClick={() => setOpen((v) => !v)}>
          {open ? "たたむ" : "続きを読む"}
        </button>
      )}
    </>
  );
}
