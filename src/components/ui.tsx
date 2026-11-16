import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Character, User, Provider } from "../types";
import { IconListDetails, IconGoogle, IconDiscord, IconBrandX, IconX, IconBooks, IconFilter, IconLock } from "./icons";
/* BOOTH / TALTO はアイコンセットに無いため、公式のアイコンアセット(64px)を同梱して使う */
import boothIconUrl from "../assets/booth-icon.png";
import taltoIconUrl from "../assets/talto-icon.png";

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(" ");

/* ---------- タグ ---------- */
const TAG_COLOR = {
  ok: "badge-success",
  warn: "badge-warning",
  danger: "badge-error",
  accent: "badge-primary",
  gray: "badge-ghost",
} as const;

export function Tag({
  v = "gray",
  children,
  title,
  onClick,
  className,
}: {
  v?: keyof typeof TAG_COLOR;
  children: ReactNode;
  title?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <span className={cx("badge badge-sm gap-1 font-semibold whitespace-nowrap", TAG_COLOR[v], className)} title={title} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      {children}
    </span>
  );
}

/* ---------- アバター ---------- */
export function Avatar({ u, size = 26 }: { u: User; size?: number }) {
  if (u.image) return <img src={u.image} alt={u.name} width={size} height={size} referrerPolicy="no-referrer" className="rounded-full object-cover shrink-0" />;
  return (
    <span
      className="inline-flex items-center justify-center font-extrabold text-white flex-none shrink-0"
      style={{ background: u.color, width: size, height: size, fontSize: size * 0.44, borderRadius: "50%" }}
      title={u.name}
    >
      {u.name[0]}
    </span>
  );
}

export function CharAvatar({ c, size = 40 }: { c: Character; size?: number }) {
  if (c.image) {
    return (
      <img
        src={c.image}
        alt={c.name}
        className="object-cover flex-none shrink-0"
        style={{ width: size, height: size, borderRadius: "9999px" }}
        title={c.name}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center font-extrabold text-white flex-none shrink-0"
      style={{ background: c.color, width: size, height: size, fontSize: size * 0.42, borderRadius: 9999 }}
      title={c.name}
    >
      {c.name.replace(/\s/g, "").slice(0, 1)}
    </span>
  );
}

/* ---------- システム略称バッジ(絵文字の代わり) ---------- */
export function SysBadge({ short, color, size = 18 }: { short: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center font-bold flex-none shrink-0"
      style={{ border: `1.5px solid ${color}`, color, width: size, height: size, fontSize: size * 0.42, borderRadius: 2, letterSpacing: "-0.02em" }}
      title={short}
    >
      {short.slice(0, 2)}
    </span>
  );
}

/* ---------- ブランドアイコン ---------- */
export function ProviderIcon({ provider, size = 18 }: { provider: Provider; size?: number }) {
  const glyph = Math.round(size * 0.58);
  /* ブランドごとに「背景チップ+白抜きグリフ」を1セットにして、
     ダーク/ライトどちらの背景でもコントラストが崩れないようにする */
  const chip = (bg: string, children: ReactNode, border?: string) => (
    <span
      className="inline-flex items-center justify-center flex-none shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: bg,
        border: border,
        overflow: "hidden",
      }}
    >
      {children}
    </span>
  );
  if (provider === "google") return chip("#ffffff", <IconGoogle width={glyph} height={glyph} />, "1px solid rgba(128,128,128,.3)");
  if (provider === "discord") return chip("#5865F2", <IconDiscord width={glyph} height={glyph} style={{ color: "#fff" }} />);
  /* X の黒チップは暗い背景でも輪郭が分かるよう薄いボーダーを添える */
  if (provider === "x") return chip("#000000", <IconBrandX width={glyph} height={glyph} style={{ color: "#fff" }} />, "1px solid rgba(128,128,128,.45)");
  /* BOOTH / TALTO: 公式アセットのブランド背景がそのまま円形チップになる。
     ベタ塗りなのでダーク/ライトどちらの背景でも十分なコントラストを保つ */
  if (provider === "booth")
    return <img src={boothIconUrl} alt="" width={size} height={size} className="object-cover flex-none shrink-0" style={{ borderRadius: "9999px" }} />;
  /* TALTO */
  return <img src={taltoIconUrl} alt="" width={size} height={size} className="object-cover flex-none shrink-0" style={{ borderRadius: "9999px" }} />;
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
  discord: "Discord",
  x: "X",
  booth: "BOOTH",
  talto: "TALTO",
};

/* ---------- スイッチ ---------- */
export function Toggle({ on, onChange, label, size }: { on: boolean; onChange: (v: boolean) => void; label?: string; size?: "sm" | "xs" }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink2 cursor-pointer flex-none">
      {label && <span>{label}</span>}
      <input type="checkbox" className={cx("toggle", size === "sm" && "toggle-sm")} checked={on} onChange={(e) => onChange(e.target.checked)} />
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
      // フォーカス閉じ込め
      if (e.key === "Tab" && boxRef.current) {
        const focusables = boxRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    // 初期フォーカスをモーダル内へ
    const t = setTimeout(() => {
      const first = boxRef.current?.querySelector<HTMLElement>("input, select, textarea, button:not([aria-label='閉じる'])");
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
      className="fixed inset-0 z-[80] bg-base-content/40 overflow-y-auto p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} className={cx("bg-base-100 rounded-box shadow-xl mx-auto my-[7vh] w-full", wide ? "max-w-2xl" : "max-w-xl")}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <b className="text-base font-display">{title}</b>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose} aria-label="閉じる">
            <IconX width={16} height={16} />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
        {foot && <div className="flex justify-end gap-2 px-5 py-3 border-t border-base-300">{foot}</div>}
      </div>
    </div>
  );
}

/* ---------- コピー ---------- */
export function CopyBox({ text, note }: { text: string; note?: string }) {
  return (
    <div className="flex gap-2 items-center bg-base-200/70 border border-dashed border-base-300 rounded-xl px-3 py-2 text-[12.5px]">
      <code className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{text}</code>
      <button className="btn btn-xs" onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}>
        コピー
      </button>
      {note && <span className="text-[11px] text-ink2">{note}</span>}
    </div>
  );
}

/* ---------- その他パーツ ---------- */
export function Progress({ v }: { v: number }) {
  return <progress className="progress progress-primary w-56 mx-auto my-4" value={Math.min(100, v)} max={100} />;
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="text-center py-10 px-4 text-ink2 text-[13.5px] leading-7">
      <div className="text-3xl mb-1">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

export function Stat({ b, s, accent }: { b: ReactNode; s: string; accent?: boolean }) {
  return (
    <div className={cx("card bg-base-100 border border-base-300 px-4 py-3", accent && "border-primary bg-primary/5")}>
      <div className="text-2xl font-extrabold leading-tight">{b}</div>
      <div className="text-[11px] text-ink2">{s}</div>
    </div>
  );
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
    <label className={cx("form-control w-full flex-col gap-1", !noMargin && "mt-2.5")} style={{ display: "flex" }}>
      <span className="label-text text-[11.5px] font-bold text-ink2">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink2 leading-5">{hint}</span>}
    </label>
  );
}

export function NotFound({ what }: { what: string }) {
  return (
    <div className="page">
      <Empty>この{what}は存在しないか、削除されました。</Empty>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  back,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {back && (
        <Link className="btn btn-ghost btn-xs px-0 mb-1" to={back.to}>
          ← {back.label}
        </Link>
      )}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {sub && <p className="text-[13px] text-ink2 mt-0.5">{sub}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: ReactNode; disabled?: boolean; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="join">
      {options.map((o) => (
        <button
          key={o.v}
          disabled={o.disabled}
          title={o.title}
          className={cx("join-item btn btn-sm border-base-300", o.v === value ? "btn-primary" : "bg-base-100")}
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 mt-7 mb-2.5 first:mt-4">
      <h2 className="font-display text-sm font-bold text-ink">{children}</h2>
      {right && <div className="flex-1 flex justify-end items-center gap-2">{right}</div>}
    </div>
  );
}

export function rollCls(result: string): "crit" | "fumble" | "san" | "" {
  if (/クリティカル/.test(result)) return "crit";
  if (/ファンブル/.test(result)) return "fumble";
  if (/SAN/.test(result)) return "san";
  return "";
}

/* ---------- 空状態(3種: 初回/絞り込み0件/権限) ---------- */

export function EmptyState({
  kind,
  icon,
  title,
  children,
  action,
}: {
  kind: "first" | "filtered" | "permission";
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const defaults = {
    first: { icon: <IconBooks width={24} height={24} className="opacity-40" />, title: "まだ何もありません" },
    filtered: { icon: <IconFilter width={24} height={24} className="opacity-40" />, title: "条件に一致しません" },
    permission: { icon: <IconLock width={24} height={24} className="opacity-40" />, title: "表示できるものがありません" },
  }[kind];
  return (
    <div className="text-center py-10 px-4">
      <div className="flex justify-center mb-2">{icon ?? defaults.icon}</div>
      {title !== undefined ? <b className="text-[13.5px] block">{title}</b> : <b className="text-[13.5px] block">{defaults.title}</b>}
      {children && <div className="text-[12.5px] text-ink2 mt-1 leading-6">{children}</div>}
      {action && <div className="mt-3 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

/* ---------- ロゴマーク(絵文字に依存しない譜面マーク) ---------- */

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d="M3 6h18M3 10.5h18M3 15h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" fill="none" />
      <circle cx="9" cy="14.2" r="2.5" fill="currentColor" />
      <path d="M11.5 14.2V5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11.5 5.5l5 1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="10" r="2.1" fill="currentColor" />
    </svg>
  );
}

