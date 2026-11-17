/**
 * 卓譜のデザインシステム。画面はここの部品と DESIGN.md の CSS クラスだけで組み立てる。
 * 人・キャラクター・発言者の表示は ./identity.tsx。
 */
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { getJapaneseHolidayName } from "../lib/holidays";
import { todayStr } from "../lib/format";
import type { Scope, SystemDef } from "../types";
import {
  IconBooks,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconDots,
  IconFilter,
  IconLink,
  IconLock,
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
}: {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cx("relative inline-block", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={cx(
          "btn w-full justify-between gap-2 font-medium normal-case",
          size === "sm" ? "btn-sm min-h-9 px-3 text-sm" : "min-h-10 h-10 px-3.5 text-sm",
        )}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) setOpen((prev) => !prev);
        }}
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <IconChevronDown
          width={16}
          height={16}
          className={cx("opacity-60 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="menu bg-base-100 border border-base-300 rounded-box shadow-lg absolute left-0 mt-1 p-1.5 z-[75] max-h-64 overflow-y-auto overflow-x-hidden min-w-full w-max max-w-xs flex-nowrap"
        >
          {options.map((opt, idx) => {
            const active = opt.value === value;
            return (
              <li key={`${opt.value}-${idx}`} role="option" aria-selected={active} className="w-full min-w-0">
                <button
                  type="button"
                  className={cx(
                    "w-full text-left flex items-center justify-between gap-2 text-sm py-2 px-3 rounded-lg min-w-0",
                    active ? "bg-primary/15 text-primary font-semibold" : "hover:bg-base-200/80",
                  )}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(opt.value);
                    setOpen(false);
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
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && boxRef.current) {
        const focusables = boxRef.current.querySelectorAll<HTMLElement>(
          'button, input, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      const first = boxRef.current?.querySelector<HTMLElement>(
        "input, textarea, button:not([aria-label='閉じる'])",
      );
      first?.focus();
    }, 30);
    return () => {
      window.removeEventListener("keydown", h);
      clearTimeout(t);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[80] bg-black/50 overflow-y-auto sm:p-4 flex items-end sm:block"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cx(
          "bg-base-100 border border-base-300 shadow-xl w-full rounded-t-2xl sm:rounded-box sm:mx-auto sm:my-[8vh] max-h-[92vh] sm:max-h-none overflow-y-auto sm:overflow-visible",
          wide ? "max-w-2xl" : "max-w-xl",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-4 pb-3 border-b border-base-300">
          <h2 className="text-base sm:text-lg font-bold">{title}</h2>
          <button type="button" className="icon-btn -mr-2" onClick={onClose} aria-label="閉じる">
            <IconX width={20} height={20} strokeWidth={2.2} />
          </button>
        </div>
        <div className="px-5 sm:px-6 py-5">{children}</div>
        {foot && (
          <div
            className="sticky bottom-0 flex flex-wrap justify-end gap-2 px-5 sm:px-6 py-3.5 border-t border-base-300 bg-base-100 sm:rounded-b-box"
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
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  noMargin?: boolean;
}) {
  return (
    <label
      className={cx("form-control w-full flex-col gap-1.5", !noMargin && "mt-4")}
      style={{ display: "flex" }}
    >
      <span className="label-text text-sm font-semibold text-base-content/90">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink2 leading-5">{hint}</span>}
    </label>
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
}: {
  title: ReactNode;
  /** タイトル直下のメタ情報。複数要素は .meta の子として並べる */
  sub?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** タイトル左に置く画像など */
  lead?: ReactNode;
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {back && (
        <Link
          className="-ml-1.5 mb-2 inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-sm font-medium text-ink2 transition-colors hover:text-base-content"
          to={back.to as never}
        >
          <IconChevronLeft width={16} height={16} aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {lead}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-[1.75rem]">{title}</h1>
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
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex max-w-full rounded-lg bg-base-200 p-0.5 border border-base-300"
    >
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            className={cx(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 font-semibold transition-colors disabled:opacity-40",
              size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
              active
                ? "bg-base-100 text-base-content shadow-sm ring-1 ring-base-300"
                : "text-base-content/65 hover:text-base-content",
            )}
            onClick={() => onChange(o.v)}
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
}: {
  date: string;
  days?: number;
  showMonth?: boolean;
  muted?: boolean;
}) {
  const [, m, d] = date.split("-").map(Number);
  const wd = WEEKDAYS[new Date(`${date}T00:00:00+09:00`).getDay()];
  return (
    <div className={cx("w-12 shrink-0 text-center leading-tight tabular-nums", muted && "opacity-60")}>
      {showMonth && <div className="text-xs text-ink2">{m}月</div>}
      <div className="text-xl font-bold">{d}</div>
      <div className={cx("text-xs", days > 1 ? "text-ink2" : weekdayTone(date))}>
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
          <input
            type="date"
            aria-label={`実施日 ${i + 1}`}
            className={cx("input input-bordered w-full max-w-56", size === "sm" && "input-sm")}
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
  const close = () => setOpen(false);
  useDismiss(open, close, ref);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-square"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconDots width={18} height={18} />
      </button>
      {open && (
        <div
          role="menu"
          className={cx(
            "absolute z-50 mt-1 w-max min-w-44 max-w-xs rounded-box border border-base-300 bg-base-100 p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((it) => (
            <button
              key={it.label}
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
  delay = 600,
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
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cx(
            "pointer-events-none absolute top-full z-50",
            align === "right" ? "right-0" : "left-0",
            " mt-1.5 block w-max max-w-72 rounded-box border border-base-300 bg-base-100 px-3.5 py-3 text-left text-sm shadow-lg",
          )}
        >
          {card}
        </span>
      )}
    </span>
  );
}
