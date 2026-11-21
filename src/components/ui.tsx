/**
 * 卓譜のデザインシステム。画面はここの部品と DESIGN.md の CSS クラスだけで組み立てる。
 * 人・キャラクター・発言者の表示は ./identity.tsx。
 */
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentPropsWithRef, ReactNode, Ref } from "react";
import { Link } from "../lib/router";
import { getJapaneseHolidayName } from "../lib/holidays";
import { fmtDelta, todayStr } from "../lib/format";
import { DICETOUS_COMMONS, LEGAL_LINKS, rightsNoticesFor } from "../lib/rights";
import type { Scope, SystemDef } from "../types";
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
export const SCOPE_META: Record<Scope, { label: string; hint: string; Icon: typeof IconLock }> = {
  members: { label: "メンバー限定", hint: "参加者と卓のメンバーだけが読めます", Icon: IconLock },
  passed: { label: "プレイした人", hint: "このシナリオを通過した人も読めます", Icon: IconUsers },
  public: { label: "公開", hint: "リンクを知っている人なら誰でも読めます", Icon: IconWorld },
};

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
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

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
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && boxRef.current) {
        const focusables = Array.from(
          boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.getClientRects().length > 0 || el === document.activeElement);
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
        } else {
          if (!active || active === last || !boxRef.current.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    if (boxRef.current && !boxRef.current.contains(document.activeElement)) {
      const firstBody = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      const fallback = boxRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (firstBody ?? fallback ?? boxRef.current).focus();
    }
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
      if (prevFocus && prevFocus.isConnected) {
        prevFocus.focus();
      }
    };
  }, []);

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
        className={cx("btn btn-sm shrink-0 w-28", copied && "text-success")}
        onClick={handleCopy}
        aria-live="polite"
      >
        {copied ? <IconCheck width={16} height={16} /> : <IconLink width={16} height={16} />}
        {copied ? "コピーした" : "コピー"}
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

export function rollCls(result: string): "crit" | "fumble" | "san" | "" {
  if (/クリティカル/.test(result)) return "crit";
  if (/ファンブル/.test(result)) return "fumble";
  if (/SAN/.test(result)) return "san";
  return "";
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

export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path
        d="M3 6h18M3 10.5h18M3 15h18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
        fill="none"
      />
      <circle cx="9" cy="14.2" r="2.5" fill="currentColor" />
      <path d="M11.5 14.2V5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.5 5.5l5 1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="10" r="2.1" fill="currentColor" />
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
 * 一覧の左に置く日付ブロック。月日を大きく、曜日（または日数）を小さく。
 * 月見出しの下に並べるときは showMonth={false}。
 */
export function DateBlock({
  date,
  days = 1,
  showMonth = true,
  muted,
  highlight,
}: {
  date: string;
  days?: number;
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
      <div className={cx("text-xs", days > 1 || muted ? "text-ink2" : weekdayTone(date))}>
        {days > 1 ? `${days}日間` : wd}
      </div>
    </div>
  );
}

/** 複数日の実施日入力 */
export function DateList({
  dates,
  setDates,
  size = "md",
}: {
  dates: string[];
  setDates: (d: string[]) => void;
  size?: "sm" | "md";
}) {
  function addDate() {
    const last = dates.at(-1) || todayStr();
    const base = new Date(last + "T00:00:00Z");
    base.setUTCDate(base.getUTCDate() + 1);
    setDates([...dates, base.toISOString().slice(0, 10)]);
  }
  return (
    <div className="space-y-2">
      {dates.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <DateInput
            aria-label={`実施日 ${i + 1}`}
            className="w-full max-w-56"
            size={size}
            value={d}
            onChange={(e) => setDates(dates.map((date, idx) => (idx === i ? e.target.value : date)))}
          />
          {dates.length > 1 && (
            <button
              type="button"
              className="icon-btn"
              aria-label={`実施日 ${i + 1} を削除`}
              onClick={() => setDates(dates.filter((_, idx) => idx !== i))}
            >
              <IconX width={16} height={16} />
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-quiet btn-sm" onClick={addDate}>
        <IconPlus width={14} height={14} /> 日を追加
      </button>
    </div>
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
 * 日付の入力。中身はブラウザの <input type="date">（キーボードで打てる・フォームの register がそのまま使える）。
 * マウスなどのポインタ端末では標準の暦の代わりに卓譜の暦（DatePickerPanel）を開く。タッチ端末では OS 標準の選択 UI を使う。
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
  const fine = useFinePointer();
  const inputRef = useInputRef(ref);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 開いているときは、開いた時点の値と、暦へフォーカスを移すか（ボタンから開いたとき）を持つ */
  const [open, setOpen] = useState<null | { focus: boolean; value: string }>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelId = useId();

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

  const openPicker = (focus: boolean) =>
    setOpen({ focus, value: (props.value as string | undefined) ?? inputRef.current?.value ?? "" });

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
      <input
        {...props}
        ref={inputRef}
        type="date"
        data-picker={fine ? "" : undefined}
        aria-invalid={invalid ? true : props["aria-invalid"]}
        className={cx(
          "input w-full tabular-nums",
          size === "sm" && "input-sm",
          fine && "pr-11",
          invalid && "input-error",
        )}
        onMouseDown={(e) => {
          props.onMouseDown?.(e);
          // 入力欄そのものを押しても暦を開く（フォーカスは入力欄に残し、キーボードでも打てる）
          if (fine && e.button === 0 && !props.disabled && !props.readOnly) openPicker(false);
        }}
      />
      {fine && (
        <button
          ref={buttonRef}
          type="button"
          tabIndex={-1}
          aria-label="カレンダーから選ぶ"
          aria-haspopup="dialog"
          aria-expanded={Boolean(open)}
          aria-controls={open ? panelId : undefined}
          disabled={props.disabled}
          className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ink2 transition-colors hover:bg-base-200 hover:text-base-content"
          onClick={() => (open ? setOpen(null) : openPicker(true))}
        >
          <IconCalendar width={16} height={16} />
        </button>
      )}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="日付を選ぶ"
          className="popover fixed z-[95] p-2"
          // 位置を測るまでは透明にしておく（visibility: hidden だと暦の日にフォーカスを移せない）
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, opacity: 0 }}
        >
          <DatePickerPanel
            value={open.value}
            autoFocus={open.focus}
            onClose={() => close(true)}
            onPick={(date) => {
              if (inputRef.current) setNativeValue(inputRef.current, date);
              close(false);
              inputRef.current?.focus();
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

/** 卓の印。卓名の頭文字を小さな角丸の面に載せる（サイドバーなど、顔の代わりに卓を見分ける） */
export function TableMark({ name, size = 20 }: { name: string; size?: number }) {
  const initial = Array.from(name.trim())[0] ?? "卓";
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-base-300 bg-base-200 font-bold leading-none text-ink2"
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.55)) }}
    >
      {initial}
    </span>
  );
}

/** 開始〜終了の時刻入力（日本時間。日付をまたぐときは 25:30 のように書く） */
export function TimeRange({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          aria-label="開始時刻（JST）"
          inputMode="numeric"
          className="input input-bordered w-24 text-center tabular-nums"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <span className="text-ink2">〜</span>
        <input
          aria-label="終了時刻（JST）"
          inputMode="numeric"
          className="input input-bordered w-24 text-center tabular-nums"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink2">日付をまたぐときは 25:30 のように書きます。</p>
    </div>
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
