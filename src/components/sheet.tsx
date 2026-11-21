import { useState } from "react";
import { cx } from "./ui";
import {
  groupSkills,
  isGrownSkill,
  type CharacterSheet,
  type SheetEntry,
  type SheetSection,
} from "../lib/sheet";

/**
 * キャラシ（汎用形式）の見せ方。データはシステムに依存しない区分の並びで、
 * ここでシステムごとの並べ方（列数・技能の見せ方・最初に見せる範囲）だけを決める。
 */
interface SheetLayout {
  /** 能力値の列数（モバイル / sm 以上） */
  abilityCols: string;
  /** 技能の見せ方: 百分率（バー付き）・段階（●●○）・素の値 */
  skillMode: "percent" | "rank" | "plain";
  /** 区分の並び順（ここに無い区分は後ろに元の順で並ぶ） */
  order: string[];
}

const COC: SheetLayout = {
  abilityCols: "grid-cols-4",
  skillMode: "percent",
  order: ["abilities", "resources", "skills"],
};

const SHEET_LAYOUTS: Record<string, SheetLayout> = {
  coc6: COC,
  coc7: COC,
  emoklore: { abilityCols: "grid-cols-4", skillMode: "rank", order: ["abilities", "resources", "skills"] },
  sw25: {
    abilityCols: "grid-cols-3 sm:grid-cols-6",
    skillMode: "plain",
    order: ["levels", "abilities", "resources", "feats"],
  },
};
const GENERIC: SheetLayout = {
  abilityCols: "grid-cols-3 sm:grid-cols-4",
  skillMode: "plain",
  order: ["levels", "abilities", "resources", "skills"],
};

export function sheetLayoutFor(systemId: string): SheetLayout {
  return SHEET_LAYOUTS[systemId] ?? GENERIC;
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

/** キャラシ全体。面（.surface）1 枚の中に区分を区切り線で並べる */
export function SheetView({
  sheet,
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
  const layout = sheetLayoutFor(systemId);
  const [more, setMore] = useState(false);
  const isCore = (s: SheetSection) =>
    s.kind === "abilities" || s.kind === "resources" || s.kind === "levels" || s.kind === "skills";
  const ordered = orderedSections(sheet, layout);
  /* 所持品・経歴などは長くなるので、最初は能力値と技能だけを見せる */
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
      {sections.map((s) => (
        <div key={s.id} className="px-4 py-4 sm:px-5">
          <h3 className="eyebrow mb-3">{s.title}</h3>
          <SectionBody section={s} layout={layout} compact={compact} />
        </div>
      ))}
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
  layout,
  compact,
}: {
  section: SheetSection;
  layout: SheetLayout;
  compact: boolean;
}) {
  switch (section.kind) {
    case "abilities":
      return <AbilityGrid entries={section.entries} cols={layout.abilityCols} />;
    case "resources":
      return <ResourceRow entries={section.entries} />;
    case "levels":
      return <LevelList entries={section.entries} />;
    case "skills":
      return <SkillList entries={section.entries} mode={layout.skillMode} compact={compact} />;
    case "list":
      return <NamedList entries={section.entries} />;
    case "text":
      return <LongText text={section.text ?? ""} />;
  }
}

function AbilityGrid({ entries, cols }: { entries: SheetEntry[]; cols: string }) {
  return (
    <dl className={cx("grid gap-x-4 gap-y-3", cols)}>
      {entries.map((e) => (
        <div key={e.label} className="min-w-0">
          <dt className="truncate text-xs font-medium text-ink2">{e.label}</dt>
          <dd className="text-xl font-bold leading-tight tabular-nums">
            {e.value}
            {e.note && <span className="ml-1 text-xs font-medium text-ink2">{e.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ResourceRow({ entries }: { entries: SheetEntry[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-3">
      {entries.map((e) => (
        <div key={e.label} className="min-w-0">
          <dt className="text-xs font-medium text-ink2">{e.label}</dt>
          <dd className="text-lg font-bold leading-tight tabular-nums">
            {e.value}
            {e.max != null && <span className="ml-1 text-xs font-medium text-ink2">/ {e.max}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function LevelList({ entries }: { entries: SheetEntry[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
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

function SkillRow({ e, mode }: { e: SheetEntry; mode: SheetLayout["skillMode"] }) {
  const grown = isGrownSkill(e);
  const pct = mode === "percent" && typeof e.value === "number" ? Math.max(0, Math.min(100, e.value)) : null;
  return (
    <li className="min-w-0 py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("min-w-0 truncate text-sm", grown ? "font-medium" : "text-ink2")}>
          {e.label}
          {e.note && <span className="ml-1.5 text-xs text-ink2">{e.note}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 tabular-nums">
          {mode === "rank" && e.rank && <RankDots value={e.rank.value} max={e.rank.max} />}
          <span className={cx(grown ? "text-base font-bold" : "text-sm text-ink2")}>{e.value}</span>
        </span>
      </div>
      {pct !== null && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-base-200" aria-hidden>
          <div
            className={cx("h-full rounded-full", grown ? "bg-base-content/70" : "bg-base-300")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </li>
  );
}

/** 技能。最初は伸ばした技能だけを見せ、残りは「すべての技能」で開く */
function SkillList({
  entries,
  mode,
  compact,
}: {
  entries: SheetEntry[];
  mode: SheetLayout["skillMode"];
  compact: boolean;
}) {
  const [all, setAll] = useState(false);
  const grownCount = entries.filter(isGrownSkill).length;
  /* 伸ばした印が 1 つも無いサイトでは、全部を見せる */
  const filterable = grownCount > 0 && grownCount < entries.length;
  const shown = filterable && !all ? entries.filter(isGrownSkill) : entries;
  const groups = groupSkills(compact ? shown.slice(0, 12) : shown);
  return (
    <>
      <div className="space-y-4" data-user-content>
        {groups.map((g) => (
          <div key={g.group || "_"}>
            {g.group && groups.length > 1 && <h4 className="mb-1 text-xs text-ink2">{g.group}</h4>}
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {g.entries.map((e) => (
                <SkillRow key={e.label} e={e} mode={mode} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {filterable && !compact && (
        <button type="button" className="btn btn-quiet btn-sm mt-3" onClick={() => setAll((v) => !v)}>
          {all ? "伸ばした技能だけを見る" : `すべての技能を見る（${entries.length}）`}
        </button>
      )}
    </>
  );
}

function NamedList({ entries }: { entries: SheetEntry[] }) {
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
