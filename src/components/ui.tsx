/**
 * 卓譜のデザインシステム。画面はここの部品と DESIGN.md の CSS クラスだけで組み立てる。
 * 人・キャラクター・発言者の表示は ./identity.tsx。
 */
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { ComponentPropsWithRef, CSSProperties, ReactNode, Ref } from "react";
import { Link } from "../lib/router";
import {
  MARK_BOARD,
  MARK_BOARD_OPACITY,
  MARK_BOARD_WIDTH,
  MARK_RADIUS,
  MARK_STONE,
  MARK_VIEWBOX,
} from "./brand";
import { getJapaneseHolidayName } from "../lib/holidays";
import { fmtDelta, todayStr } from "../lib/format";
import { fmtDateText, parseDateText, weekdaySuffix } from "../lib/date-text";
import {
  endFieldFor,
  nextSittingFields,
  normalizeEndTime,
  normalizeTime,
  type SittingFields,
} from "../lib/sittings";
import { DICETOUS_COMMONS, LEGAL_LINKS, rightsNoticesFor } from "../lib/rights";
import { identiconDataUri } from "../lib/identicon";
import { comboEntries, hasExactLabel } from "../lib/search-text";
import type { ComboEntry, SearchOption } from "../lib/search-text";
import type { ScoreMark } from "../lib/score-marks";
import type { Scope, SystemDef, Table } from "../types";
import {
  IconBooks,
  IconCalendar,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconFilter,
  IconLink,
  IconLock,
  IconMinus,
  IconPlus,
  IconUsers,
  IconWorld,
  IconX,
} from "./icons";

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(" ");

/* ---------- 状態バッジ（必要な箇所に限定して使用） ---------- */
const TAG_COLOR = {
  ok: "badge-success badge-outline",
  warn: "badge-warning badge-outline",
  danger: "badge-error badge-outline",
  accent: "badge-primary badge-outline",
  gray: "badge-ghost border-base-300",
} as const;

export function Tag({
  v = "gray",
  children,
  onClick,
  className,
}: {
  v?: keyof typeof TAG_COLOR;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cx("badge font-medium whitespace-nowrap", TAG_COLOR[v], className)}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {children}
    </span>
  );
}

/* ---------- システム名ラベル（色の点 + 正式名。枠や塗りで目立たせない） ---------- */
export function SysBadge({ sys }: { sys: SystemDef | undefined }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: sys?.color ?? "oklch(var(--bc) / 0.4)" }}
        aria-hidden
      />
      <span>{sys?.name ?? "汎用・その他"}</span>
    </span>
  );
}

/* ---------- 共有範囲ラベル ---------- */
export const SCOPE_META: Record<Scope, { label: string; hint: string; who: string; Icon: typeof IconLock }> =
  {
    members: {
      label: "メンバー限定",
      hint: "参加者と卓のメンバーだけが読めます",
      who: "参加者と卓のメンバー",
      Icon: IconLock,
    },
    passed: {
      label: "通過した人",
      hint: "このシナリオを通過した人も読めます",
      who: "＋このシナリオを通過した人",
      Icon: IconUsers,
    },
    public: {
      label: "公開",
      hint: "リンクを知っている人なら誰でも読めます",
      who: "リンクを知っている人",
      Icon: IconWorld,
    },
  };

/**
 * 共有範囲を選ぶ。3 つを「だれが読めるか」と並べて見比べられるようにし、説明の段落を足さない（P4）。
 * 狭い順に並べる（メンバー限定 ⊂ 通過した人 ⊂ 公開）。
 */
export function ScopePicker({
  value,
  onChange,
  ariaLabel = "共有範囲",
}: {
  value: Scope;
  onChange: (scope: Scope) => void;
  ariaLabel?: string;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid gap-2 sm:grid-cols-3">
      {(["members", "passed", "public"] as const).map((v) => {
        const M = SCOPE_META[v];
        const on = value === v;
        const descId = `${name}-${v}`;
        return (
          <label
            key={v}
            className={cx(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
              on
                ? "cursor-pointer border-primary bg-primary/5"
                : "cursor-pointer border-base-300 hover:bg-base-200/60",
            )}
          >
            <input
              type="radio"
              name={name}
              className="radio radio-primary radio-sm mt-0.5"
              checked={on}
              aria-labelledby={`${descId}-label`}
              aria-describedby={descId}
              onChange={() => onChange(v)}
            />
            <span className="min-w-0">
              <span id={`${descId}-label`} className="flex items-center gap-1.5 text-sm font-bold">
                <M.Icon width={15} height={15} className="shrink-0 text-ink2" aria-hidden />
                {M.label}
              </span>
              <span id={descId} className="mt-0.5 block text-xs text-ink2">
                {M.who}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function ScopeLabel({ scope, className }: { scope: Scope; className?: string }) {
  const m = SCOPE_META[scope];
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <m.Icon width={14} height={14} className="shrink-0 opacity-70" aria-hidden />
      {m.label}
    </span>
  );
}

/* ---------- daisyUI カスタム Select（OSネイティブ select を使わない） ---------- */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export function Select<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  className,
  size = "md",
  align = "left",
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();
  const nameId = useId();
  const valueId = useId();
  const selectedIdx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const current = options.find((o) => o.value === value) ?? options[0];

  const closeAndFocusTrigger = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const estimatedH = Math.min(options.length * 38 + 16, 256);
      const openUp = rect.bottom + estimatedH > window.innerHeight - 12 && rect.top > estimatedH;
      const maxLeft = Math.max(8, window.innerWidth - Math.max(rect.width, 180) - 8);
      const left =
        align === "right"
          ? Math.max(8, rect.right - Math.max(rect.width, 180))
          : Math.min(rect.left, maxLeft);
      setMenuStyle({
        top: openUp ? Math.max(8, rect.top - estimatedH - 4) : rect.bottom + 4,
        left,
        minWidth: rect.width,
      });
    };
    updatePosition();
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndFocusTrigger();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align, options.length]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIdx]?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIdx]);

  function openMenu(initialIdx: number) {
    if (disabled || options.length === 0) return;
    setActiveIdx(Math.max(0, Math.min(options.length - 1, initialIdx)));
    /* 位置は開いた後に測り直す。前回の位置を一瞬でも使わない */
    setMenuStyle(null);
    setOpen(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled || options.length === 0) return;
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        openMenu(selectedIdx);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(selectedIdx);
      } else if (e.key === "Home") {
        e.preventDefault();
        openMenu(0);
      } else if (e.key === "End") {
        e.preventDefault();
        openMenu(options.length - 1);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const chosen = options[activeIdx];
      if (chosen) onChange(chosen.value);
      closeAndFocusTrigger();
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const q = e.key.toLowerCase();
      const found = options.findIndex((o, idx) => idx > activeIdx && o.label.toLowerCase().startsWith(q));
      const wrapped = found >= 0 ? found : options.findIndex((o) => o.label.toLowerCase().startsWith(q));
      if (wrapped >= 0) setActiveIdx(wrapped);
    }
  }

  return (
    <div
      ref={wrapRef}
      className={cx("relative inline-block max-w-full", className)}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        // 見えている選択値も名前に含める（WCAG 2.5.3）。「システムで絞り込み すべてのシステム」と読まれる
        aria-labelledby={ariaLabel ? `${nameId} ${valueId}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && options[activeIdx] ? `${listboxId}-opt-${activeIdx}` : undefined}
        disabled={disabled}
        className={cx(
          "btn w-full justify-between gap-2 font-medium normal-case",
          size === "sm" ? "btn-sm min-h-9 px-3 text-sm" : "min-h-10 px-3.5 text-sm",
        )}
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu(selectedIdx);
        }}
      >
        {ariaLabel && (
          <span id={nameId} className="sr-only">
            {ariaLabel}
          </span>
        )}
        <span id={valueId} className="truncate">
          {current?.label ?? ""}
        </span>
        <IconChevronDown
          width={16}
          height={16}
          className={cx("opacity-60 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          style={
            menuStyle
              ? {
                  position: "fixed",
                  top: `${menuStyle.top}px`,
                  left: `${menuStyle.left}px`,
                  minWidth: `${menuStyle.minWidth}px`,
                }
              : undefined
          }
          className={cx(
            // daisyUI の .menu は使わない（ホバー色と枠のアニメーションが選択肢の表示と二重になる）
            "popover z-[90] flex max-h-64 w-max min-w-full max-w-[calc(100vw-1rem)] flex-col overflow-y-auto overflow-x-hidden p-1.5",
            !menuStyle && "absolute mt-1",
            !menuStyle && (align === "right" ? "right-0" : "left-0"),
          )}
        >
          {options.map((opt, idx) => {
            const active = opt.value === value;
            const highlighted = idx === activeIdx;
            return (
              <li
                key={`${opt.value}-${idx}`}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={active}
                className="w-full min-w-0"
              >
                <button
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  tabIndex={-1}
                  // ポインタとキーボードの位置は同じ「いまの候補」として、面の色だけで示す。
                  // 枠（ring）や transition は使わない。選択中は文字色と印で示す
                  className={cx(
                    "flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm",
                    highlighted && "bg-base-200",
                    active ? "font-bold text-primary" : "text-base-content",
                  )}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(opt.value);
                    closeAndFocusTrigger();
                  }}
                >
                  <span className="truncate min-w-0">{opt.label}</span>
                  {active && <IconCheck width={15} height={15} className="shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- Combobox / MultiCombobox（多い・増えうる選択肢） ---------- */
/**
 * 候補 1 件。`keywords` は表示しない別名・読み（検索だけに使う）、`group` は見出し、`hint` は右に添える補足。
 * 絞り込みは src/lib/search-text.ts（全角半角・大文字小文字・ひらがなカタカナを区別しない）
 */
export type ComboboxOption<T extends string = string> = SearchOption<T>;

/** 一度に描く候補の数。これを超えた分は「ほか N 件」とだけ出し、入力で絞らせる */
const COMBOBOX_LIMIT = 50;

/** 入力欄の下（入らなければ上）に浮かぶ層の位置。document.body に出すので fixed で置く */
function useAnchoredPopover(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  // 描く前に測る（前に開いたときの位置を一瞬でも出さない）
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vw = window.innerWidth;
      // ソフトウェアキーボードが出ているときは見えている高さで決める
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const below = vh - rect.bottom - 12;
      const above = rect.top - 12;
      const openUp = below < 200 && above > below;
      const width = Math.min(Math.max(rect.width, 240), vw - 16);
      const left = Math.max(8, Math.min(rect.left, vw - width - 8));
      const maxHeight = Math.max(140, Math.min(320, openUp ? above : below));
      setPos(
        openUp
          ? { left, width, maxHeight, bottom: window.innerHeight - rect.top + 4 }
          : { left, width, maxHeight, top: rect.bottom + 4 },
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);
  return pos;
}

/** 入力から候補の並び（見出し・「追加」行を含む）を作る。Combobox と MultiCombobox で共通（中身は src/lib/search-text.ts） */
function useComboEntries<T extends string>(args: Parameters<typeof comboEntries<T>>[0]) {
  const { options, query, pinned, pinnedLabel, allLabel, canCreate, limit } = args;
  return useMemo(
    () => comboEntries({ options, query, pinned, pinnedLabel, allLabel, canCreate, limit }),
    [options, query, pinned, pinnedLabel, allLabel, canCreate, limit],
  );
}

/** 浮かぶ候補の一覧。見出しごとに role=group でまとめ、いまの候補は地の色だけで示す（ring・遷移なし） */
function ComboListbox<T extends string>({
  id,
  label,
  entries,
  hidden,
  activeIdx,
  isSelected,
  onHover,
  onChoose,
  pos,
  emptyText,
}: {
  id: string;
  label?: string;
  entries: ComboEntry<T>[];
  hidden: number;
  activeIdx: number;
  isSelected: (value: T) => boolean;
  onHover: (idx: number) => void;
  onChoose: (entry: ComboEntry<T>) => void;
  pos: ReturnType<typeof useAnchoredPopover>;
  emptyText: string;
}) {
  if (typeof document === "undefined") return null;
  const sections: { title?: string; items: { entry: ComboEntry<T>; idx: number }[] }[] = [];
  entries.forEach((entry, idx) => {
    const last = sections[sections.length - 1];
    if (last && last.title === entry.section) last.items.push({ entry, idx });
    else sections.push({ title: entry.section, items: [{ entry, idx }] });
  });
  const renderEntry = ({ entry, idx }: { entry: ComboEntry<T>; idx: number }) => {
    const highlighted = idx === activeIdx;
    const selected = entry.kind === "option" && isSelected(entry.option.value);
    return (
      <div
        key={entry.kind === "option" ? `o-${entry.option.value}-${idx}` : "create"}
        id={`${id}-o${idx}`}
        role="option"
        aria-selected={selected}
        className={cx(
          "flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm",
          highlighted && "bg-base-200",
          selected ? "font-bold text-primary" : "text-base-content",
        )}
        onMouseMove={() => {
          if (!highlighted) onHover(idx);
        }}
        onClick={() => onChoose(entry)}
      >
        {entry.kind === "create" ? (
          <span className="flex min-w-0 items-center gap-2">
            <IconPlus width={16} height={16} strokeWidth={2.2} className="shrink-0 text-ink2" aria-hidden />
            <span className="truncate">「{entry.text}」を追加</span>
          </span>
        ) : (
          <>
            <span className="min-w-0 truncate">{entry.option.label}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {entry.option.hint && (
                <span className="text-xs font-normal text-ink2">{entry.option.hint}</span>
              )}
              {selected && <IconCheck width={15} height={15} className="text-primary" aria-hidden />}
            </span>
          </>
        )}
      </div>
    );
  };
  return createPortal(
    <div
      className="popover fixed z-[90] flex flex-col overflow-hidden p-1.5"
      style={
        pos
          ? { left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }
          : { visibility: "hidden" }
      }
      // 押しても入力欄からフォーカスを動かさない（閉じずに選べる）
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        id={id}
        role="listbox"
        aria-label={label}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {sections.map((section, sIdx) =>
          section.title ? (
            <div key={`${section.title}-${sIdx}`} role="group" aria-labelledby={`${id}-g${sIdx}`}>
              <div
                id={`${id}-g${sIdx}`}
                role="presentation"
                className="px-3 pb-1 pt-2 text-xs font-medium text-ink2"
              >
                {section.title}
              </div>
              {section.items.map(renderEntry)}
            </div>
          ) : (
            section.items.map(renderEntry)
          ),
        )}
      </div>
      {entries.length === 0 && <p className="px-3 py-2 text-sm text-ink2">{emptyText}</p>}
      {hidden > 0 && <p className="shrink-0 px-3 pb-1 pt-2 text-xs text-ink2">ほか {hidden} 件</p>}
    </div>,
    document.body,
  );
}

/** IME で変換中のキー操作か（変換の確定の Enter で候補を選ばない） */
const isComposingKey = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;

/** 開いている一覧の上下移動（端で反対へ回る）と Home / End */
function nextActive(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * 1 つを選ぶ、検索できる選択欄（WAI-ARIA 1.2 combobox + listbox）。
 * 多い・増えうる選択肢（システム・技能・シナリオ・人・キャラクター・卓）に使う。少なく決まったものは Select、見比べる少数は Seg。
 *
 * - 入力欄が role=combobox、候補は document.body に出す listbox。フォーカスは入力欄に置いたまま aria-activedescendant で候補を示す
 * - ↑↓ で移動（端で回る）、Home / End で先頭・末尾、Enter で選ぶ、Escape で閉じて入力を戻す、Tab は選ばずに閉じる
 * - IME の変換中は絞り込まず、変換確定の Enter で選ばない
 * - `pinned` は入力が空のときだけ先頭に出す（最近使ったものなど）。`onCreate` を渡すと、名前の一致がないとき「追加」を出す
 */
export function Combobox<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  pinned,
  pinnedLabel = "最近使ったもの",
  allLabel = "すべて",
  onCreate,
  emptyText = "見つかりません",
  size = "md",
  className,
  disabled,
  id,
  limit = COMBOBOX_LIMIT,
  invalid,
  onQueryChange,
}: {
  value: T;
  options: readonly ComboboxOption<T>[];
  onChange: (value: T) => void;
  /** 打った言葉（候補をサーバーで探すとき。閉じると空に戻る） */
  onQueryChange?: (query: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  pinned?: readonly T[];
  pinnedLabel?: string;
  /** pinned があるとき、残りの候補の見出し */
  allLabel?: string;
  onCreate?: (text: string) => void;
  emptyText?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  id?: string;
  limit?: number;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** 開いている間に打った文字。null は「まだ何も打っていない」 */
  const [editing, setEditing] = useState<string | null>(null);
  /** 絞り込みに使う文字（IME の変換中は前の値のまま） */
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(-1);
  const composingRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selected = options.find((o) => o.value === value);
  const { entries, hidden } = useComboEntries({
    options,
    query,
    pinned,
    pinnedLabel,
    allLabel,
    canCreate: Boolean(onCreate),
    limit,
  });
  const pos = useAnchoredPopover(open, wrapRef);
  useEffect(() => {
    onQueryChange?.(query);
  }, [query, onQueryChange]);

  useEffect(() => {
    if (!open || activeIdx < 0) return;
    document.getElementById(`${listboxId}-o${activeIdx}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIdx, listboxId]);

  function openList() {
    if (disabled || open) return;
    // 閉じている間の並びは入力が空のときのもの。選んでいるものを最初のいまの候補にする
    const idx = entries.findIndex((e) => e.kind === "option" && e.option.value === value);
    setActiveIdx(idx >= 0 ? idx : entries.length > 0 ? 0 : -1);
    setEditing(null);
    setQuery("");
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditing(null);
    setQuery("");
    setActiveIdx(-1);
  }

  function choose(entry: ComboEntry<T>) {
    if (entry.kind === "create") onCreate?.(entry.text);
    else onChange(entry.option.value);
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled || isComposingKey(e)) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    const moved = nextActive(e.key, activeIdx, entries.length);
    if (e.key === "ArrowDown" && e.altKey) return;
    if (moved !== null) {
      e.preventDefault();
      setActiveIdx(moved);
    } else if (e.key === "Enter") {
      const entry = entries[activeIdx];
      e.preventDefault();
      if (entry) choose(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Modal の Escape（window で受ける）まで届けない。閉じるのは一覧だけ
      e.nativeEvent.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  }

  const inputValue = open ? (editing ?? "") : (selected?.label ?? "");

  return (
    <div
      ref={wrapRef}
      className={cx(
        // 中の開閉ボタン（32px）に .input の上下の余白が足されて、隣の Select・入力欄より高くなっていた（42/46px）。
        // 上下の余白は持たず、高さは min-h でそろえて中身は中央に置く
        "input input-bordered relative flex max-w-full items-center gap-1 !py-0 pr-1",
        size === "sm" ? "input-sm min-h-9 pl-3" : "min-h-10 pl-3.5",
        invalid && "input-error",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
          openList();
        }
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIdx >= 0 ? `${listboxId}-o${activeIdx}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        // 開いている間は、いま選んでいるものを薄く見せたまま新しく探せるようにする
        placeholder={open ? (selected?.label ?? placeholder) : placeholder}
        className="min-w-0 flex-1 truncate bg-transparent text-sm"
        value={inputValue}
        onClick={() => (open ? undefined : openList())}
        onChange={(e) => {
          const next = e.target.value;
          if (!open) setOpen(true);
          setEditing(next);
          if (!composingRef.current) {
            setQuery(next);
            setActiveIdx(0);
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          setQuery(e.currentTarget.value);
          setActiveIdx(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={close}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? "候補を閉じる" : "候補を開く"}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink2"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) close();
          else {
            inputRef.current?.focus();
            openList();
          }
        }}
      >
        <IconChevronDown
          width={16}
          height={16}
          className={cx("opacity-70", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ComboListbox
          id={listboxId}
          label={ariaLabel}
          entries={entries}
          hidden={hidden}
          activeIdx={activeIdx}
          isSelected={(v) => v === value}
          onHover={setActiveIdx}
          onChoose={choose}
          pos={pos}
          emptyText={emptyText}
        />
      )}
    </div>
  );
}

/**
 * 複数を選ぶ、検索できる入力欄（Notion の multi-select のような形）。タグ・キーワードなどに使う。カンマ区切りの文字入力は使わない。
 *
 * - 選んだものは欄の中に薄い面の札（token）で並ぶ。札ごとの × と、空の入力欄での Backspace で外せる
 * - 空の入力欄で ← を押すと札へ移り、← → で札の間を動き、Backspace / Delete で外す。→ で入力欄に戻る
 * - 候補の操作は Combobox と同じ（↑↓・Home / End・Enter・Escape・Tab、IME の変換中は選ばない）。選んでも一覧は閉じない
 * - `creatable` なら一致しない名前を「追加」できる。追加・削除は読み上げで知らせる
 */
export function MultiCombobox({
  values,
  options,
  onChange,
  ariaLabel,
  placeholder,
  creatable = true,
  emptyText = "見つかりません",
  size = "md",
  className,
  disabled,
  id,
  limit = COMBOBOX_LIMIT,
}: {
  values: readonly string[];
  options: readonly ComboboxOption[];
  onChange: (values: string[]) => void;
  ariaLabel: string;
  placeholder?: string;
  creatable?: boolean;
  emptyText?: string;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  id?: string;
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [announce, setAnnounce] = useState("");
  const composingRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const chosen = useMemo(() => new Set(values), [values]);
  // 選んだものは候補から外す。名前の一致の判定には選んだものも含める（同じタグを 2 回足さない）
  const remaining = useMemo(() => options.filter((o) => !chosen.has(o.value)), [options, chosen]);
  const { entries: rawEntries, hidden } = useComboEntries({
    options: remaining,
    query,
    pinnedLabel: "",
    allLabel: "",
    canCreate: creatable,
    limit,
  });
  const entries = rawEntries.filter(
    (e) =>
      e.kind !== "create" ||
      !hasExactLabel(
        values.map((v) => ({ label: labelOf(v) })),
        e.text,
      ),
  );
  const pos = useAnchoredPopover(open, wrapRef);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${listboxId}-o${activeIdx}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeIdx, listboxId]);

  function add(entry: ComboEntry<string>) {
    const value = entry.kind === "create" ? entry.text.trim() : entry.option.value;
    if (!value || chosen.has(value)) return;
    onChange([...values, value]);
    setAnnounce(`「${entry.kind === "create" ? value : entry.option.label}」を追加しました`);
    setText("");
    setQuery("");
    setActiveIdx(0);
  }

  function remove(idx: number, focusAfter: "input" | "token" = "input") {
    const v = values[idx];
    if (v === undefined) return;
    onChange(values.filter((_, i) => i !== idx));
    setAnnounce(`「${labelOf(v)}」を外しました`);
    requestAnimationFrame(() => {
      const prev = idx - 1;
      if (focusAfter === "token" && prev >= 0) tokenRefs.current[prev]?.focus();
      else inputRef.current?.focus();
    });
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled || isComposingKey(e)) return;
    const caretAtStart = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0;
    if (e.key === "Backspace" && text === "" && values.length > 0) {
      e.preventDefault();
      remove(values.length - 1);
      return;
    }
    if (e.key === "ArrowLeft" && caretAtStart && values.length > 0) {
      e.preventDefault();
      setOpen(false);
      tokenRefs.current[values.length - 1]?.focus();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
        setActiveIdx(0);
      }
      return;
    }
    const moved = nextActive(e.key, activeIdx, entries.length);
    if (moved !== null) {
      e.preventDefault();
      setActiveIdx(moved);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[activeIdx];
      if (entry) add(entry);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.nativeEvent.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  function handleTokenKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      tokenRefs.current[Math.max(0, idx - 1)]?.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (idx + 1 < values.length) tokenRefs.current[idx + 1]?.focus();
      else inputRef.current?.focus();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      remove(idx, e.key === "Backspace" ? "token" : "input");
    } else if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }

  return (
    <div
      ref={wrapRef}
      className={cx(
        "input input-bordered flex max-w-full flex-wrap items-center gap-1.5",
        size === "sm" ? "input-sm min-h-9 px-1.5 py-1" : "min-h-10 px-1.5 py-1.5",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
      onMouseDown={(e) => {
        // 札の間の余白を押しても入力欄に入る
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
          setOpen(true);
        }
      }}
    >
      {values.length > 0 && (
        <ul role="list" aria-label={`選んだ${ariaLabel}`} className="contents">
          {values.map((v, idx) => (
            <li
              key={v}
              className="inline-flex h-7 max-w-full items-center gap-0.5 rounded-md bg-base-200 pl-2 pr-0.5 text-sm text-base-content"
            >
              <span className="min-w-0 truncate">{labelOf(v)}</span>
              <button
                ref={(el) => {
                  tokenRefs.current[idx] = el;
                }}
                type="button"
                tabIndex={-1}
                aria-label={`${labelOf(v)}を外す`}
                className="flex size-6 shrink-0 items-center justify-center rounded text-ink2 hover:bg-base-300 hover:text-base-content"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => remove(idx)}
                onKeyDown={(e) => handleTokenKeyDown(e, idx)}
              >
                <IconX width={14} height={14} strokeWidth={2.2} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && entries[activeIdx] ? `${listboxId}-o${activeIdx}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={values.length === 0 ? placeholder : undefined}
        className="h-7 min-w-[6rem] flex-1 bg-transparent px-1.5 text-sm"
        value={text}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          setOpen(true);
          if (!composingRef.current) {
            setQuery(next);
            setActiveIdx(0);
          }
        }}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          setQuery(e.currentTarget.value);
          setActiveIdx(0);
        }}
        onKeyDown={handleInputKeyDown}
        onBlur={() => {
          setOpen(false);
          setText("");
          setQuery("");
        }}
      />
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
      {open && (
        <ComboListbox
          id={listboxId}
          label={ariaLabel}
          entries={entries}
          hidden={hidden}
          activeIdx={activeIdx}
          isSelected={() => false}
          onHover={setActiveIdx}
          onChoose={add}
          pos={pos}
          emptyText={creatable ? "名前を入力して追加" : emptyText}
        />
      )}
    </div>
  );
}

/* ---------- 完了のモーダル ---------- */
const DIALOG_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * モーダルの振る舞い（Modal・CompletionModal で共通）: Escape で閉じる、Tab を中に閉じ込める、背面のスクロールを止める、
 * 開いたら initialFocus の中の最初の操作へ、閉じたら開く前の要素へフォーカスを戻す
 */
/** 開いているダイアログの重なり。キー操作（Esc・Tab）はいちばん上のダイアログだけが受ける */
const openDialogs: object[] = [];

function useModalDialog(
  boxRef: React.RefObject<HTMLDivElement | null>,
  initialFocusRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const self = {};
    openDialogs.push(self);
    const h = (e: KeyboardEvent) => {
      if (openDialogs.at(-1) !== self) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && boxRef.current) {
        const focusables = Array.from(boxRef.current.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE)).filter(
          (el) => el.getClientRects().length > 0 || el === document.activeElement,
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (!active || active === first || !boxRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !boxRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    if (boxRef.current && !boxRef.current.contains(document.activeElement)) {
      const preferred = initialFocusRef.current?.querySelector<HTMLElement>(DIALOG_FOCUSABLE);
      const fallback = boxRef.current.querySelector<HTMLElement>(DIALOG_FOCUSABLE);
      (preferred ?? fallback ?? boxRef.current).focus();
    }
    return () => {
      window.removeEventListener("keydown", h);
      openDialogs.splice(openDialogs.indexOf(self), 1);
      if (openDialogs.length === 0) document.body.style.overflow = "";
      if (prevFocus && prevFocus.isConnected) prevFocus.focus();
    };
    // 開いたときに 1 回だけ。onClose は ref で最新を読む
  }, [boxRef, initialFocusRef]);
}

/**
 * 完了の印（既定）。円とチェックを線で描き切る。CompletionModal の stamp を渡さないときに出る
 */
export function DoneMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className="done-mark text-primary"
      aria-hidden
      fill="none"
    >
      <circle
        cx="32"
        cy="32"
        r="28"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="3"
        className="done-ring"
      />
      <path
        d="M20 33 L28.5 41 L45 24"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="done-check"
      />
    </svg>
  );
}

/**
 * 記録の完了の演出: その回が 1 枚の譜になる。3 本の段が左から引かれ、ダイスの点が時間の順に置かれ、
 * 最後に終止線が入る（朱はクリティカル、白抜きはファンブル）。点は scoreMarks（src/lib/score-marks.ts）で作る
 */
export function ScoreInscription({ marks, width = 240 }: { marks: readonly ScoreMark[]; width?: number }) {
  const lanes = [20, 38, 56] as const;
  const [x0, x1] = [12, 212];
  return (
    <svg
      viewBox="0 0 240 76"
      width={width}
      height={(width * 76) / 240}
      aria-hidden
      className="score-inscription"
    >
      {lanes.map((y) => (
        <path key={y} d={`M${x0} ${y} H226`} pathLength={1} className="score-line" />
      ))}
      {marks.map((m, i) => (
        <circle
          key={i}
          cx={x0 + 6 + m.x * (x1 - x0 - 6)}
          cy={lanes[m.lane]}
          r={m.tone === "plain" ? 3.4 : 4.8}
          className={cx("score-mark", m.tone === "crit" && "is-crit", m.tone === "fumble" && "is-fumble")}
          style={{ "--x": m.x } as CSSProperties}
        />
      ))}
      <g className="score-end">
        <path d="M222 12 V64" strokeWidth="1.5" />
        <path d="M229 12 V64" strokeWidth="4.5" />
      </g>
    </svg>
  );
}

export interface CompletionAction {
  label: string;
  /** ラベルの前に置くアイコン（16px） */
  icon?: ReactNode;
  /** 行き先。あればリンクにする */
  to?: string;
  onClick?: () => void;
}

/**
 * 大事な操作の完了（P11）。区切って、短い動きで「済んだ」を伝え、次の行動を主 1 つと副に絞る。
 * モーダルが開き切ってから印（既定は DoneMark、記録は ScoreInscription）が描かれる。reduced-motion では動かない。
 * 開くと主操作にフォーカスするので、Enter でそのまま次へ進める。
 *
 * @example
 * <CompletionModal title="セッションを記録しました" primary={{ label: "セッションを見る", to: `/sessions/${id}` }}
 *   secondary={[{ label: "共有する", onClick: share }]} onClose={close}>
 *   <SessionSummary … />
 * </CompletionModal>
 */
export function CompletionModal({
  title,
  children,
  primary,
  secondary = [],
  onClose,
  stamp,
}: {
  title: ReactNode;
  /** 何が残ったかの要約（1〜2 行、または小さな行の並び） */
  children?: ReactNode;
  primary: CompletionAction;
  secondary?: readonly CompletionAction[];
  onClose: () => void;
  /** 既定の印（DoneMark）の代わりに出すもの。<ScoreInscription marks={…} /> など */
  stamp?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useModalDialog(boxRef, actionsRef, onClose);
  // 押すと表示が変わる操作（「コピーしました」）でもフォーカスを失わないよう、key は並びの位置にする
  const renderAction = (a: CompletionAction, cls: string, key: number) =>
    a.to ? (
      <Link key={key} to={a.to} className={cls} onClick={a.onClick}>
        {a.icon}
        {a.label}
      </Link>
    ) : (
      <button key={key} type="button" className={cls} onClick={a.onClick}>
        {a.icon}
        {a.label}
      </button>
    );
  return (
    <div
      role="presentation"
      className="motion-fade fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? descId : undefined}
        tabIndex={-1}
        data-completion
        className="motion-pop relative flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-2xl border border-base-300 bg-base-100 sm:rounded-box"
      >
        <button
          type="button"
          className="icon-btn absolute right-2 top-2"
          onClick={onClose}
          aria-label="閉じる"
        >
          <IconX width={20} height={20} strokeWidth={2.2} />
        </button>
        <div className="flex flex-col items-center px-6 pt-9 text-center">
          <span className="completion-mark">{stamp ?? <DoneMark />}</span>
          <h2 id={titleId} className="mt-5 text-lg font-bold sm:text-xl">
            {title}
          </h2>
          {children && (
            <div id={descId} className="mt-2 w-full text-sm text-ink2">
              {children}
            </div>
          )}
        </div>
        <div
          ref={actionsRef}
          className="flex flex-col gap-2 px-6 pt-6"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          {renderAction(primary, "btn btn-primary w-full", -1)}
          {secondary.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {secondary.map((a, i) => renderAction(a, "btn btn-quiet", i))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- スイッチ ---------- */
/** スイッチ。表示ラベルがないときは label が aria-label になる */
export function Toggle({
  on,
  onChange,
  label,
  showLabel = false,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const input = (
    <input
      type="checkbox"
      className="toggle toggle-primary"
      aria-label={showLabel ? undefined : label}
      checked={on}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
  if (!showLabel) return input;
  return (
    <label className="flex flex-none cursor-pointer items-center gap-2 text-sm text-ink2">
      <span>{label}</span>
      {input}
    </label>
  );
}

/* ---------- モーダル ---------- */

export function Modal({
  title,
  onClose,
  children,
  wide,
  foot,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  foot?: ReactNode;
  label?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalDialog(boxRef, bodyRef, onClose);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[80] bg-black/50 sm:p-4 flex items-end sm:items-center sm:justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "bg-base-100 border border-base-300 w-full rounded-t-2xl sm:rounded-box max-h-[90dvh] flex flex-col",
          wide ? "max-w-2xl" : "max-w-xl",
        )}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-6 pt-4 pb-3 border-b border-base-300">
          <h2 id={titleId} className="text-base sm:text-lg font-bold min-w-0 break-words">
            {title}
          </h2>
          <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="閉じる">
            <IconX width={20} height={20} strokeWidth={2.2} />
          </button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {children}
        </div>
        {foot && (
          <div
            className="shrink-0 flex flex-wrap justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-base-300 bg-base-100 sm:rounded-b-box"
            style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
          >
            {foot}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- コピーボックス ---------- */
export function CopyBox({ text, note }: { text: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function handleCopy() {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex gap-2 items-center bg-base-200/70 border border-base-300 rounded-lg pl-3.5 pr-1.5 py-1.5 text-sm">
      <code className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-ink2">{text}</code>
      <button
        type="button"
        className={cx("btn btn-sm shrink-0 w-36", copied && "text-success")}
        onClick={handleCopy}
        aria-live="polite"
      >
        {copied ? <IconCheck width={16} height={16} /> : <IconLink width={16} height={16} />}
        {copied ? "コピーしました" : "コピー"}
      </button>
      {note && <span className="text-xs text-ink2">{note}</span>}
    </div>
  );
}

/* ---------- インライン状態バッジ ---------- */
/**
 * 操作した場所に出す状態表示。成功は画面の変化そのもので伝えるため、
 * 「〜しました」のような成功通知はここでは出せない（tone に ok がない）。
 */
export function InlineNotice({ text, tone }: { text: string | null; tone: "pending" | "error" }) {
  if (!text) return null;
  return (
    <span
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cx(
        "inline-flex items-center gap-1.5 text-sm",
        tone === "error" ? "text-error" : "text-ink2",
      )}
    >
      {tone === "pending" && <span className="loading loading-spinner loading-xs" aria-hidden />}
      <span>{text}</span>
    </span>
  );
}

/** 入力欄の直下に出す検証エラー */
export function FieldError({ text, id }: { text: string | null | undefined; id?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm text-error">
      {text}
    </p>
  );
}

/* ---------- 共通レイアウトパーツ ---------- */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm leading-7 text-ink2">{children}</p>;
}

export function Field({
  label,
  hint,
  children,
  noMargin,
  group,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  noMargin?: boolean;
  /**
   * 中身がボタンの並び（Seg など）のとき。<label> で包むと最初のボタンがラベル全体の文字を名前に取ってしまうので、
   * <div> で包み、ラベルは aria-labelledby だけで結ぶ
   */
  group?: boolean;
}) {
  const labelId = useId();
  const hintId = useId();
  const ref = useRef<HTMLElement>(null);
  // <label> で包むと Chrome は入力値までラベル名に含める（「表示名 みかん」と読まれる）。
  // 中の最初の入力要素にラベル文言だけを名前として、ヒントを説明として結び付ける
  useEffect(() => {
    const control = ref.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea, select, button[aria-haspopup], [role=combobox], [role=radiogroup], [role=listbox]",
    );
    if (!control) return;
    if (!control.hasAttribute("aria-labelledby") && !control.hasAttribute("aria-label")) {
      if (control.tagName === "BUTTON") {
        // 選択式のボタンは見えている選択値も名前に残す（ラベル + 自身の内容）
        if (!control.id) control.id = `${labelId}-control`;
        control.setAttribute("aria-labelledby", `${labelId} ${control.id}`);
      } else {
        control.setAttribute("aria-labelledby", labelId);
      }
    }
    if (hint) {
      const described = control.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
      if (!described.includes(hintId)) {
        control.setAttribute("aria-describedby", [...described, hintId].join(" ").trim());
      }
    }
  }, [labelId, hintId, hint]);
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper
      ref={ref as Ref<HTMLLabelElement & HTMLDivElement>}
      className={cx("form-control w-full flex-col gap-1.5", !noMargin && "mt-4")}
      style={{ display: "flex" }}
    >
      <span id={labelId} className="label-text text-sm font-semibold text-base-content/90">
        {label}
      </span>
      {children}
      {hint && (
        <span id={hintId} className="text-xs text-ink2 leading-5">
          {hint}
        </span>
      )}
    </Wrapper>
  );
}

export function NotFound({ what }: { what: string }) {
  return (
    <div className="surface">
      <EmptyState kind="permission" title={`この${what}は見つかりません`}>
        削除されたか、閲覧できる範囲の外にあります。
      </EmptyState>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  back,
  actions,
  lead,
  eyebrow,
}: {
  title: ReactNode;
  /** タイトル直下のメタ情報。複数要素は .meta の子として並べる */
  sub?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** タイトル左に置く画像など */
  lead?: ReactNode;
  /** タイトル上の分類ラベル */
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {back && (
        <Link
          className="-ml-1.5 mb-2 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-sm font-medium text-ink2 transition-colors hover:text-base-content"
          to={back.to}
        >
          <IconChevronLeft width={16} height={16} aria-hidden />
          {back.label}
        </Link>
      )}
      {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {lead}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-snug tracking-[-0.02em] sm:text-[1.75rem]">{title}</h1>
            {sub && <div className="mt-1.5 text-sm leading-relaxed text-ink2">{sub}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:pt-1">{actions}</div>}
      </div>
    </header>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "md",
}: {
  value: T;
  options: { v: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
  size?: "sm" | "md";
}) {
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIdx = options.findIndex((o) => o.v === value);
  const focusTargetIdx = activeIdx >= 0 ? activeIdx : 0;

  function moveFocus(currentIdx: number, step: number) {
    const enabledIndices = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabledIndices.length === 0) return;
    const pos = enabledIndices.indexOf(currentIdx);
    const nextPos = pos < 0 ? 0 : (pos + step + enabledIndices.length) % enabledIndices.length;
    const targetIdx = enabledIndices[nextPos]!;
    const target = options[targetIdx]!;
    onChange(target.v);
    requestAnimationFrame(() => btnRefs.current[targetIdx]?.focus());
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx(
        "inline-flex max-w-full flex-wrap sm:flex-nowrap overflow-x-auto rounded-lg border border-base-300 bg-base-200 p-[3px]",
        size === "sm" ? "min-h-9" : "min-h-10",
      )}
    >
      {options.map((o, idx) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={idx === focusTargetIdx ? 0 : -1}
            disabled={o.disabled}
            className={cx(
              "inline-flex min-h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 font-semibold transition-colors disabled:opacity-40",
              size === "sm" ? "text-xs" : "text-sm",
              active
                ? "bg-base-100 text-base-content ring-1 ring-base-300"
                : "text-base-content/65 hover:text-base-content",
            )}
            onClick={() => onChange(o.v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                moveFocus(idx, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                moveFocus(idx, -1);
              } else if (e.key === "Home") {
                e.preventDefault();
                const first = options.findIndex((x) => !x.disabled);
                if (first >= 0) {
                  onChange(options[first]!.v);
                  requestAnimationFrame(() => btnRefs.current[first]?.focus());
                }
              } else if (e.key === "End") {
                e.preventDefault();
                let last = -1;
                for (let i = options.length - 1; i >= 0; i--) {
                  if (!options[i]!.disabled) {
                    last = i;
                    break;
                  }
                }
                if (last >= 0) {
                  onChange(options[last]!.v);
                  requestAnimationFrame(() => btnRefs.current[last]?.focus());
                }
              }
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
  sub,
}: {
  children: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="mt-10 mb-3 flex items-end gap-3 first:mt-0">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold sm:text-lg">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink2">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** 空・絞り込み結果なし・権限なし・読み込み失敗などの状態。面の中に置くか、単独で置く */
export function EmptyState({
  kind = "first",
  icon,
  title,
  children,
  action,
}: {
  kind?: "first" | "filtered" | "permission";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const defaults = {
    first: { icon: <IconBooks width={28} height={28} />, title: "まだ記録がありません" },
    filtered: { icon: <IconFilter width={28} height={28} />, title: "条件に一致するものがありません" },
    permission: { icon: <IconLock width={28} height={28} />, title: "表示できるものがありません" },
  }[kind];
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="text-ink3">{icon ?? defaults.icon}</div>
      <h2 className="mt-3 font-bold">{title ?? defaults.title}</h2>
      {children && <div className="mt-1.5 max-w-md text-sm leading-relaxed text-ink2">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/**
 * TRPG システムの権利表記。`systemIds` を渡せばそのシステムの分だけ、省けばすべて出す。
 * 文言は src/lib/rights.ts（権利者の表示例のまま）。面は持たないので、置く側の面や余白に合わせる。
 */
export function RightsNotice({
  systemIds,
  className,
}: {
  systemIds?: Iterable<string | undefined>;
  className?: string;
}) {
  const notices = rightsNoticesFor(systemIds);
  if (notices.length === 0) return null;
  return (
    <section aria-label="権利表記" className={cx("space-y-4 text-xs leading-relaxed text-ink2", className)}>
      {notices.map((n) => (
        <div key={n.id} className="min-w-0 break-words">
          <h3 className="mb-1 font-bold text-base-content">{n.title}</h3>
          {n.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {n.id === "emoklore" && (
            <div className="mt-2 space-y-1">
              <img
                src={DICETOUS_COMMONS.image}
                width={DICETOUS_COMMONS.imageWidth}
                height={DICETOUS_COMMONS.imageHeight}
                alt={`ダイスタス・コモンズ ${DICETOUS_COMMONS.text}`}
                className="h-auto w-full max-w-[390px]"
                loading="lazy"
              />
              <p>{DICETOUS_COMMONS.text}</p>
              <p>
                {DICETOUS_COMMONS.contactLabel}:{" "}
                <Link
                  to={DICETOUS_COMMONS.contactUrl}
                  className="underline underline-offset-2 hover:text-base-content"
                >
                  ご意見フォーム
                </Link>
              </p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

/** ライセンス・利用規約・プライバシーポリシーへのリンク。公開ページのフッターに置く */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="規約とライセンス" className={cx("flex flex-wrap gap-x-4 gap-y-1", className)}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.to} to={l.to} className="underline-offset-2 hover:text-base-content hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * 卓譜のブランドマーク（盤と一手。形は brand.ts）。地は文字色（currentColor）で塗り、盤と駒は `on` の色で抜く。
 * 既定の `on` は面の色なので、テーマが変わっても穴が開いて見える。UI のアイコンではないので `data-brand` を付ける
 */
export function LogoMark({
  size = 22,
  className,
  on = "oklch(var(--b1))",
}: {
  size?: number;
  className?: string;
  on?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      width={size}
      height={size}
      className={className}
      data-brand
      aria-hidden
    >
      <rect width={MARK_VIEWBOX} height={MARK_VIEWBOX} rx={MARK_RADIUS} fill="currentColor" />
      <path
        d={MARK_BOARD}
        fill="none"
        stroke={on}
        strokeOpacity={MARK_BOARD_OPACITY}
        strokeWidth={MARK_BOARD_WIDTH}
        strokeLinejoin="round"
      />
      <circle cx={MARK_STONE.cx} cy={MARK_STONE.cy} r={MARK_STONE.r} fill={on} />
    </svg>
  );
}

/* ============================================================
 * 以下、画面横断で使う部品
 * ============================================================ */

/** 面の中の見出し（面の外の見出しは SectionTitle） */
export function PanelHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold">{title}</h3>
        {sub && <p className="mt-0.5 text-sm leading-relaxed text-ink2">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** .list の1行: 左に名前と説明、右に操作。設定・一覧の行で共通 */
export function SettingRow({
  icon,
  title,
  desc,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {icon && <span className="shrink-0">{icon}</span>}
        <div className="min-w-0">
          <div className="text-sm font-bold">{title}</div>
          {desc && <p className="mt-0.5 text-sm leading-relaxed text-ink2">{desc}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** フォームの1行: 左に項目名、右に入力。スマホでは縦に積む */
export function FormRow({
  label,
  children,
  htmlFor,
}: {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5 py-3.5 first:pt-0 last:pb-0 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2 text-sm font-semibold text-ink2">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 日付の曜日色。日曜・祝日は赤、土曜は青 */
export function weekdayTone(date: string): "text-error" | "text-info" | "text-ink2" {
  const wd = new Date(`${date}T00:00:00+09:00`).getDay();
  if (wd === 0 || getJapaneseHolidayName(date)) return "text-error";
  return wd === 6 ? "text-info" : "text-ink2";
}

/**
 * 一覧の左に置く日付ブロック。月日を大きく、曜日（複数回に分けて遊んだセッションは回数）を小さく。
 * 月見出しの下に並べるときは showMonth={false}。
 */
export function DateBlock({
  date,
  times = 1,
  showMonth = true,
  muted,
  highlight,
}: {
  date: string;
  /** 集まりの回数（2 回以上なら曜日の代わりに「2回」） */
  times?: number;
  showMonth?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  const [, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(`${date}T00:00:00+09:00`).getDay()];
  return (
    // 過ぎた日は透明度ではなく色で控えめにする（透明度だと小さい文字がコントラスト不足になる）
    <div className="w-12 shrink-0 text-center leading-tight tabular-nums">
      {showMonth && <div className="text-xs text-ink2">{m}月</div>}
      <div className={cx("text-xl font-bold", muted ? "text-ink2" : highlight && "text-primary")}>{d}</div>
      <div className={cx("text-xs", times > 1 || muted ? "text-ink2" : weekdayTone(date))}>
        {times > 1 ? `${times}回` : wd}
      </div>
    </div>
  );
}

/**
 * 遊んだ日時（集まり）の入力。1 行が 1 回で、日付・開始・終了を入れる。
 * 日をまたぐ終了は 24 を足して書く（25:00）。01:00 と打っても開始より前なら欄を離れたときに 25:00 にそろえる。
 */
export function SittingsInput({
  rows,
  onChange,
  invalidIndex,
  size = "md",
}: {
  rows: SittingFields[];
  onChange: (rows: SittingFields[]) => void;
  /** 問題のある行（枠を赤くする） */
  invalidIndex?: number | null;
  size?: "sm" | "md";
}) {
  const many = rows.length > 1;
  const set = (i: number, patch: Partial<SittingFields>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const label = many ? `${i + 1}回目の` : "";
          const bad = invalidIndex === i;
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <DateInput
                aria-label={`${label}日付`}
                className="w-40"
                size={size}
                invalid={bad}
                value={r.date}
                onChange={(e) => set(i, { date: e.target.value })}
              />
              <span className="flex items-center gap-1.5">
                <TimeInput
                  ariaLabel={`${label}開始時刻`}
                  size={size}
                  invalid={bad}
                  value={r.start}
                  onChange={(v) => set(i, { start: v })}
                />
                <span className="text-ink2" aria-hidden>
                  〜
                </span>
                <TimeInput
                  ariaLabel={`${label}終了時刻`}
                  late
                  size={size}
                  invalid={bad}
                  value={r.end}
                  onChange={(v) => set(i, { end: v })}
                  onCommit={(v) => set(i, { end: endFieldFor(r.start, v) })}
                />
              </span>
              {many && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${i + 1}回目を外す`}
                  onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                >
                  <IconX width={16} height={16} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => onChange([...rows, nextSittingFields(rows, todayStr())])}
      >
        <IconPlus width={14} height={14} /> 日時を追加
      </button>
    </div>
  );
}

/**
 * 時刻（HH:MM、0〜23 時。終了は late で 47 時まで）の入力。打ちかけの値はそのまま持ち、
 * 欄を離れたときに 09:05 の形にそろえる（onCommit があればそろえた値をそこへ渡す）
 */
function TimeInput({
  value,
  onChange,
  onCommit,
  late,
  ariaLabel,
  invalid,
  size = "md",
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
  late?: boolean;
  ariaLabel: string;
  invalid?: boolean;
  size?: "sm" | "md";
}) {
  const normalize = late ? normalizeEndTime : normalizeTime;
  const unreadable = value.trim() !== "" && !normalize(value);
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      autoComplete="off"
      placeholder="21:00"
      aria-invalid={invalid || unreadable || undefined}
      className={cx(
        "input w-[4.75rem] text-center tabular-nums",
        size === "sm" && "input-sm",
        (invalid || unreadable) && "input-error",
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const t = normalize(value);
        if (!t) return;
        if (onCommit) onCommit(t);
        else if (t !== value) onChange(t);
      }}
    />
  );
}

/* ---------- 日付・数値の入力 ---------- */

/** 細かく指し示せるポインタ（マウス・トラックパッド）がある端末か。タッチ端末ではブラウザ標準の入力を使う */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(pointer: fine)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(pointer: fine)").matches,
    () => false,
  );
}

/**
 * 入力欄に値を入れ、利用者が入力したときと同じ input イベントを出す。
 * React の onChange も react-hook-form の register もそのまま受け取れる。
 */
function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 外から渡された ref（react-hook-form の register など）にも、部品内と同じ入力欄を渡す */
function useInputRef(outer: Ref<HTMLInputElement> | undefined) {
  const inner = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(outer, () => inner.current!, []);
  return inner;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};
const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return ymd(y!, m!, d! + n);
};
const VALID_YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 月の暦。DateInput のポップオーバーの中身 */
function DatePickerPanel({
  value,
  onPick,
  onClose,
  autoFocus,
}: {
  value: string;
  onPick: (date: string) => void;
  onClose: () => void;
  autoFocus: boolean;
}) {
  const today = todayStr();
  const initial = VALID_YMD.test(value) ? value : today;
  const [focusDate, setFocusDate] = useState(initial);
  const [y, m] = focusDate.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(autoFocus);

  useEffect(() => {
    if (!shouldFocus.current) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate]);

  const move = (next: string) => {
    shouldFocus.current = true;
    setFocusDate(next);
  };
  const shiftMonth = (delta: number) => {
    const [, , d] = focusDate.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m - 1 + delta + 1, 0)).getUTCDate();
    setFocusDate(ymd(y, m + delta, Math.min(d!, lastDay)));
  };

  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ymd(y, m, i + 1)),
  ];

  return (
    <div className="w-[19.5rem] max-w-full">
      <div className="mb-1 flex items-center gap-1">
        <button type="button" className="icon-btn" aria-label="前の月" onClick={() => shiftMonth(-1)}>
          <IconChevronLeft width={18} height={18} />
        </button>
        <div className="flex-1 text-center text-sm font-bold tabular-nums" aria-live="polite">
          {y}年{m}月
        </div>
        <button type="button" className="icon-btn" aria-label="次の月" onClick={() => shiftMonth(1)}>
          <IconChevronRight width={18} height={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-medium" aria-hidden>
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cx("py-1", i === 0 ? "text-error" : i === 6 ? "text-info" : "text-ink2")}>
            {w}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        role="group"
        aria-label={`${y}年${m}月`}
        className="grid grid-cols-7 gap-0.5"
        onKeyDown={(e) => {
          const step: Record<string, number> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
          };
          if (e.key in step) {
            e.preventDefault();
            move(addDays(focusDate, step[e.key]!));
          } else if (e.key === "PageUp" || e.key === "PageDown") {
            e.preventDefault();
            shouldFocus.current = true;
            shiftMonth(e.key === "PageUp" ? -1 : 1);
          } else if (e.key === "Home" || e.key === "End") {
            e.preventDefault();
            const wd = new Date(`${focusDate}T00:00:00Z`).getUTCDay();
            move(addDays(focusDate, e.key === "Home" ? -wd : 6 - wd));
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} aria-hidden />;
          const selected = date === value;
          const isToday = date === today;
          const day = Number(date.slice(8));
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              tabIndex={date === focusDate ? 0 : -1}
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={`${m}月${day}日（${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}）`}
              className={cx(
                "flex h-9 items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                selected
                  ? "bg-primary font-bold text-primary-content"
                  : cx(
                      "hover:bg-base-200",
                      weekdayTone(date) === "text-ink2" ? "text-base-content" : weekdayTone(date),
                    ),
                isToday && !selected && "font-bold underline decoration-2 underline-offset-4",
              )}
              onClick={() => onPick(date)}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end border-t border-base-300 pt-2">
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onPick(today)}>
          今日
        </button>
      </div>
    </div>
  );
}

/**
 * 日付の入力。画面では YYYY/MM/DD で見せ・打て、値（value・onChange・register）は YYYY-MM-DD で受け渡す。
 * ブラウザの <input type="date"> は端末の言語設定で表示が変わる（英語環境では MM/DD/YYYY）ので使わない。
 * 右の暦ボタン（マウスでは入力欄を押しても）で卓譜の暦（DatePickerPanel）を開く。
 * className は外枠（幅）に付く。入力欄の見た目は size / invalid で選ぶ。
 */
export function DateInput({
  className,
  size = "md",
  invalid,
  ref,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "type" | "size"> & {
  size?: "sm" | "md";
  invalid?: boolean;
}) {
  const {
    id,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    placeholder,
    disabled,
    readOnly,
    autoFocus,
    onBlur,
    onFocus,
    onKeyDown,
    onMouseDown,
    ...valueProps
  } = props;
  const fine = useFinePointer();
  /** 値（YYYY-MM-DD）を持つ隠れた入力欄。name・value・onChange・register の ref はこちらに付く */
  const inputRef = useInputRef(ref);
  const textRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialIso = String(props.value ?? props.defaultValue ?? "");
  const [text, setText] = useState(() => fmtDateText(initialIso));
  const [touched, setTouched] = useState(false);
  const lastIso = useRef(initialIso);
  /** 開いているときは、開いた時点の値と、暦へフォーカスを移すか（ボタンから開いたとき）を持つ */
  const [open, setOpen] = useState<null | { focus: boolean; value: string }>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelId = useId();

  // 外から値が変わったとき（親の state・フォームの reset）に表示を合わせる。reset は隠れた欄の値を
  // 直接書き換えるので、描くたびに見比べる（同じなら何もしないので描き直しは続かない）
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const iso = props.value !== undefined ? String(props.value ?? "") : (inputRef.current?.value ?? "");
    if (iso !== lastIso.current) {
      lastIso.current = iso;
      setText(fmtDateText(iso));
    }
  });

  const commit = (iso: string) => {
    lastIso.current = iso;
    if (inputRef.current && inputRef.current.value !== iso) setNativeValue(inputRef.current, iso);
  };

  const close = useCallback((refocus: boolean) => {
    setOpen(null);
    if (refocus) requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (!r) return;
      const panelW = panelRef.current?.offsetWidth ?? 336;
      const panelH = panelRef.current?.offsetHeight ?? 360;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
      const below = r.bottom + 4;
      const top = below + panelH > window.innerHeight - 8 && r.top > panelH ? r.top - panelH - 4 : below;
      setPos({ top, left });
    };
    place();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const openPicker = (focus: boolean) => setOpen({ focus, value: parseDateText(text) ?? lastIso.current });
  const unreadable = touched && text.trim() !== "" && !parseDateText(text);
  // 打った日付のすぐ後ろに曜日（祝日なら「・祝」）を添える。暦を開かなくても曜日が分かるように
  const typedIso = parseDateText(text);
  const weekday = typedIso ? weekdaySuffix(typedIso, getJapaneseHolidayName) : "";

  return (
    <div
      ref={wrapRef}
      className={cx("relative", className)}
      onKeyDown={(e) => {
        // 暦だけを閉じる。Modal の中でも Escape でモーダルごと閉じない
        if (open && e.key === "Escape") {
          e.stopPropagation();
          close(open.focus);
        }
      }}
    >
      <input {...valueProps} ref={inputRef} type="text" hidden tabIndex={-1} aria-hidden />
      <input
        ref={textRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || unreadable ? true : ariaInvalid}
        placeholder={placeholder ?? "YYYY/MM/DD"}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        value={text}
        className={cx(
          "input w-full pr-11 tabular-nums",
          size === "sm" && "input-sm",
          (invalid || unreadable) && "input-error",
        )}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setTouched(false);
          const iso = parseDateText(v);
          if (iso) commit(iso);
          else if (!v.trim()) commit("");
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          setTouched(true);
          const iso = parseDateText(text);
          if (iso) setText(fmtDateText(iso));
          onBlur?.(e);
        }}
        onMouseDown={(e) => {
          onMouseDown?.(e);
          // 入力欄そのものを押しても暦を開く（フォーカスは入力欄に残し、キーボードでも打てる）
          if (fine && e.button === 0 && !disabled && !readOnly) openPicker(false);
        }}
      />
      {weekday && (
        // 入力欄と同じ左の余白・文字で、打った文字の幅だけ空けて曜日を置く（読み上げは日付の後に続ける）
        <span
          aria-hidden
          className={cx(
            "input pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre tabular-nums",
            size === "sm" && "input-sm",
          )}
          // 入力欄と同じ余白・文字にするため .input を借りる。面と枠は styles.css の .input が後勝ちするので直に消す
          style={{ background: "transparent", borderColor: "transparent", outline: "none" }}
        >
          <span className="invisible">{text.trim()}</span>
          <span className={cx("ml-1", weekdayTone(typedIso!))}>{weekday}</span>
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        tabIndex={-1}
        aria-label="カレンダーから選ぶ"
        aria-haspopup="dialog"
        aria-expanded={Boolean(open)}
        aria-controls={open ? panelId : undefined}
        disabled={disabled || readOnly}
        className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink2 transition-colors hover:bg-base-200 hover:text-base-content"
        onClick={() => (open ? setOpen(null) : openPicker(true))}
      >
        <IconCalendar width={16} height={16} />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="日付を選ぶ"
          className="popover motion-pop fixed z-[95] p-2"
          // 位置を測るまでは透明にしておく（visibility: hidden だと暦の日にフォーカスを移せない）
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, opacity: 0 }}
        >
          <DatePickerPanel
            value={open.value}
            autoFocus={open.focus}
            onClose={() => close(true)}
            onPick={(date) => {
              setText(fmtDateText(date));
              setTouched(false);
              commit(date);
              close(false);
              textRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 数値の入力。ブラウザ標準の上下ボタンは出さず（styles.css）、ポインタ端末では右に −/＋ を置く。
 * キーボードでは ↑↓ で増減できる。className は外枠（幅）に付く。
 */
export function NumberInput({
  className,
  size = "md",
  invalid,
  ref,
  ...props
}: Omit<ComponentPropsWithRef<"input">, "type" | "size"> & {
  size?: "sm" | "md";
  invalid?: boolean;
}) {
  const inputRef = useInputRef(ref);
  const label = typeof props["aria-label"] === "string" ? props["aria-label"] : "値";
  const step = (dir: 1 | -1) => {
    const el = inputRef.current;
    if (!el || el.disabled || el.readOnly) return;
    if (el.value === "") setNativeValue(el, String(el.min !== "" ? el.min : 0));
    else {
      const before = el.value;
      if (dir > 0) el.stepUp();
      else el.stepDown();
      const next = el.value;
      el.value = before;
      setNativeValue(el, next);
    }
  };
  const stepBtn =
    "inline-flex size-7 items-center justify-center rounded-md text-ink2 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-40";
  return (
    <div className={cx("relative", className)}>
      <input
        inputMode="numeric"
        {...props}
        ref={inputRef}
        type="number"
        aria-invalid={invalid ? true : props["aria-invalid"]}
        className={cx(
          "input w-full pr-[4.25rem] tabular-nums",
          size === "sm" && "input-sm",
          invalid && "input-error",
        )}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label}を減らす`}
          disabled={props.disabled}
          className={stepBtn}
          onClick={() => step(-1)}
        >
          <IconMinus width={14} height={14} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${label}を増やす`}
          disabled={props.disabled}
          className={stepBtn}
          onClick={() => step(1)}
        >
          <IconPlus width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * 能力値の変化「SAN 50→47 (−3)」。増減は括弧付き（fmtDelta）で、減りは赤・増えは緑。
 * 変化がなければ増減を省く（showZero で「(±0)」を出す）。
 */
export function StatChange({
  label,
  before,
  after,
  showZero,
  className,
}: {
  label?: ReactNode;
  before: number;
  after: number;
  showZero?: boolean;
  className?: string;
}) {
  const diff = after - before;
  return (
    <span className={cx("whitespace-nowrap tabular-nums", className)}>
      {label != null && <span className="text-ink2">{label} </span>}
      {before}→{after}
      {(diff !== 0 || showZero) && (
        <span
          className={cx(
            "ml-1 font-medium",
            diff < 0 ? "text-error" : diff > 0 ? "text-success" : "text-ink2",
          )}
        >
          {fmtDelta(diff)}
        </span>
      )}
    </span>
  );
}

/**
 * 卓の印（サイドバーなど、顔の代わりに卓を見分ける）。
 * 卓の画像があればそれを、なければ卓 ID から作った角印（和柄とダイスの目）を出す。頭文字は使わない
 */
export function TableMark({ table, size = 20 }: { table: Pick<Table, "id" | "image">; size?: number }) {
  return (
    <img
      src={table.image || identiconDataUri(table.id, "table")}
      alt=""
      aria-hidden
      width={size}
      height={size}
      decoding="async"
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-md object-cover"
      style={{ width: size, height: size }}
    />
  );
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

/** 「…」メニュー。普段使わない操作（削除・書き出しなど）をしまう */
export function Menu({
  label,
  items,
  align = "right",
}: {
  label: string;
  items: { label: string; icon?: ReactNode; danger?: boolean; onSelect: () => void }[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const close = () => setOpen(false);
  useDismiss(open, close, ref);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => itemRefs.current[0]?.focus());
  }, [open]);

  function focusAt(index: number) {
    if (items.length === 0) return;
    const target = ((index % items.length) + items.length) % items.length;
    itemRefs.current[target]?.focus();
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-square"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <IconDots width={18} height={18} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={cx(
            "popover absolute z-50 mt-1 w-max min-w-44 max-w-[calc(100vw-1rem)] p-1",
            align === "right" ? "right-0" : "left-0",
          )}
          onKeyDown={(e) => {
            const currentIdx = itemRefs.current.findIndex((el) => el === document.activeElement);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              focusAt(currentIdx + 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusAt(currentIdx <= 0 ? items.length - 1 : currentIdx - 1);
            } else if (e.key === "Home") {
              e.preventDefault();
              focusAt(0);
            } else if (e.key === "End") {
              e.preventDefault();
              focusAt(items.length - 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              requestAnimationFrame(() => triggerRef.current?.focus());
            } else if (e.key === "Tab") {
              setOpen(false);
            }
          }}
        >
          {items.map((it, idx) => (
            <button
              key={it.label}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              role="menuitem"
              type="button"
              className={cx(
                "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-base-200",
                it.danger && "text-error",
              )}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ポインタを少し留めたときだけ出る補足カード。
 * うっかり通過しただけでは出ないよう、出すまでに待ち時間を置く。
 * キーボードではフォーカスで出る。タッチ端末ではタップがそのまま本来の操作になる。
 */
export function HoverCard({
  children,
  card,
  delay = 800,
  align = "left",
  className,
}: {
  children: ReactNode;
  card: ReactNode;
  delay?: number;
  /** 画面の右寄りに置くときは right にして、カードが画面外へはみ出さないようにする */
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const id = useId();
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clear();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <span
      className={cx("relative", className)}
      aria-describedby={open ? id : undefined}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clear();
        timer.current = window.setTimeout(() => setOpen(true), delay);
      }}
      onPointerLeave={() => {
        clear();
        setOpen(false);
      }}
      onPointerDown={() => {
        clear();
        setOpen(false);
      }}
      onClick={() => {
        clear();
        setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cx(
            "pointer-events-none absolute top-full z-50",
            align === "right" ? "right-0" : "left-0",
            "popover mt-1.5 block w-max max-w-72 px-3.5 py-3 text-left text-sm",
          )}
        >
          {card}
        </span>
      )}
    </span>
  );
}

/**
 * ワークスペース画面用の 2 カラム分割。モバイルでは main → aside の順に縦積み。
 * asideTop はデスクトップでは右列の先頭に、モバイルでは main より前に出す（ホームの「次の予定」など、
 * 幅は要らないが最初に見せたいもの）。右列が短く余白が余るときに、左列から移して釣り合いを取る。
 */
export function SplitLayout({
  main,
  aside,
  asideTop,
  asideWidth = "md",
  stickyAside = false,
  className,
}: {
  main: ReactNode;
  aside: ReactNode;
  asideTop?: ReactNode;
  asideWidth?: "sm" | "md" | "lg";
  stickyAside?: boolean;
  className?: string;
}) {
  const cols =
    asideWidth === "sm"
      ? "lg:grid-cols-[minmax(0,1fr)_min(19rem,36%)]"
      : asideWidth === "lg"
        ? "lg:grid-cols-[minmax(0,1fr)_min(24rem,42%)]"
        : "lg:grid-cols-[minmax(0,1fr)_min(21rem,40%)]";
  if (asideTop) {
    // モバイルでは aside を display: contents にして、asideTop → main → aside の順に並べ替える
    return (
      <div className={cx("grid grid-cols-1 items-start gap-8", cols, className)}>
        <div className="order-2 min-w-0 lg:order-none">{main}</div>
        <aside className={cx("contents lg:block lg:min-w-0", stickyAside && "lg:sticky lg:top-6")}>
          <div className="order-1 min-w-0 lg:order-none">{asideTop}</div>
          {aside && <div className="order-3 min-w-0 lg:order-none lg:mt-8">{aside}</div>}
        </aside>
      </div>
    );
  }
  return (
    <div className={cx("grid grid-cols-1 items-start gap-6 lg:gap-8", cols, className)}>
      <div className="min-w-0">{main}</div>
      <aside className={cx("min-w-0", stickyAside && "lg:sticky lg:top-6")}>{aside}</aside>
    </div>
  );
}

/** キャラクターの現在能力値を、上限があれば静かな横ゲージ付きで表示する */
export function StatBar({ label, value, max }: { label: string; value: number | undefined; max?: number }) {
  const pct = max && value != null ? Math.max(0, Math.min(100, (value / max) * 100)) : null;
  const low = pct !== null && pct < 30;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 tabular-nums">
        <dt className="eyebrow">{label}</dt>
        <dd className="text-lg font-bold leading-none">
          {value ?? "-"}
          {max != null && <span className="ml-1 text-xs font-medium text-ink3">/ {max}</span>}
        </dd>
      </div>
      {pct !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-base-200" aria-hidden>
          <div
            className={cx("h-full rounded-full transition-all", low ? "bg-error/80" : "bg-primary/75")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 一覧の表示件数。`resetOn` の値（検索語・絞り込み・表示中の ID など）が変わったら最初の件数に戻る。
 * 件数をどの条件で数えたかを一緒に持ち、描画中に比べるので、Effect で戻すときの余分な再描画が起きない。
 */
export function useVisibleCount(initial: number, resetOn: readonly unknown[]) {
  const key = JSON.stringify(resetOn);
  const [tagged, setTagged] = useState({ key, count: initial });
  const count = tagged.key === key ? tagged.count : initial;
  const setCount = useCallback(
    (next: number | ((n: number) => number)) =>
      setTagged((t) => {
        const base = t.key === key ? t.count : initial;
        return { key, count: typeof next === "function" ? next(base) : next };
      }),
    [key, initial],
  );
  return [count, setCount] as const;
}

/** 大量の一覧を段階的に表示するための読み込み送り */
export function LoadMore({
  shown,
  total,
  step = 20,
  onMore,
  label = "さらに表示",
}: {
  shown: number;
  total: number;
  step?: number;
  onMore: () => void;
  label?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    onMoreRef.current = onMore;
  }, [onMore]);

  useEffect(() => {
    if (shown >= total || typeof IntersectionObserver === "undefined") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onMoreRef.current();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, total]);

  if (shown >= total) return null;
  const nextCount = Math.min(step, total - shown);
  return (
    <div ref={sentinelRef} className="mt-4 flex items-center justify-center gap-3">
      <button type="button" className="btn btn-quiet btn-sm" onClick={onMore}>
        {label}（あと {nextCount} 件 / 残り {total - shown} 件）
      </button>
    </div>
  );
}
