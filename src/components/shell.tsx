import type { ComponentType, SVGProps } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { download, todayStr } from "../lib/time";
import { useStore } from "../store";
import {
  IconAlert,
  IconBooks,
  IconCalendar,
  IconIdBadge,
  IconListDetails,
  IconPlus,
  IconSettings,
  IconUsersGroup,
} from "./icons";
import { LogoMark, cx } from "./ui";
import { Avatar } from "./identity";

type NavItem = { to: string; label: string; short: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

/** 主要な行き先。デスクトップはサイドバー、モバイルは下部タブで同じ並びを使う */
const NAV: NavItem[] = [
  { to: "/sessions", label: "セッション", short: "記録", Icon: IconListDetails },
  { to: "/calendar", label: "カレンダー", short: "予定", Icon: IconCalendar },
  { to: "/tables", label: "卓", short: "卓", Icon: IconUsersGroup },
  { to: "/characters", label: "キャラクター", short: "キャラ", Icon: IconIdBadge },
  { to: "/scenarios", label: "シナリオ", short: "シナリオ", Icon: IconBooks },
];

function useActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (to: string) => pathname === to || pathname.startsWith(`${to}/`);
}

function SaveBanners() {
  const { saveError, dataCorrupt, otherTabUpdated, retrySave } = useStore();
  const banners: { text: string; kind: "warning" | "error" }[] = [];
  if (otherTabUpdated) {
    banners.push({
      text: "別のタブでデータが更新されました。このタブでの変更は保存されていません。",
      kind: "warning",
    });
  }
  if (saveError) banners.push({ text: saveError, kind: "error" });
  if (dataCorrupt) {
    banners.push({
      text: "保存した記録を読み込めませんでした。元の記録を保護するため、今はサンプルを表示しています。",
      kind: "error",
    });
  }
  if (banners.length === 0) return null;
  return (
    <div className="space-y-2 mb-6">
      {banners.map((b, i) => (
        <div
          key={i}
          role="alert"
          className={cx(
            "flex flex-wrap items-center gap-3 rounded-box border px-4 py-3 text-sm",
            b.kind === "error"
              ? "border-error/40 bg-error/10 text-base-content"
              : "border-warning/40 bg-warning/10 text-base-content",
          )}
        >
          <IconAlert
            width={18}
            height={18}
            className={cx("flex-none", b.kind === "error" ? "text-error" : "text-warning")}
          />
          <span className="grow min-w-0">{b.text}</span>
          {saveError && (
            <button className="btn btn-sm" onClick={retrySave}>
              もう一度保存
            </button>
          )}
          {dataCorrupt && (
            <button
              className="btn btn-sm"
              onClick={() =>
                download(`takufu-backup-${todayStr()}.json`, localStorage.getItem("takufu-state-v4") ?? "")
              }
            >
              元の記録をダウンロード
            </button>
          )}
          {b.kind === "warning" && (
            <button className="btn btn-sm" onClick={() => location.reload()}>
              再読み込み
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function OnboardingBanner() {
  const { state, update } = useStore();
  if (state.prefs?.onboardingDone) return null;
  return (
    <section
      aria-label="はじめに"
      className="mb-8 rounded-box border border-base-300 bg-base-100 p-5 flex flex-col gap-4 sm:flex-row sm:items-center"
    >
      <div className="flex-1 min-w-0">
        <h2 className="font-bold">卓譜へようこそ</h2>
        <p className="text-sm text-ink2 leading-relaxed mt-1">
          プロフィールと記録は、はじめは一緒に遊んだ人に見える設定です。設定からいつでも変えられます。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Link to="/upload" className="btn btn-sm btn-primary">
          最初のセッションを記録
        </Link>
        <Link to="/settings" className="btn btn-sm">
          公開設定
        </Link>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          onClick={() =>
            update((s) => {
              s.prefs.onboardingDone = true;
            })
          }
        >
          閉じる
        </button>
      </div>
    </section>
  );
}

function SyncStatus() {
  const { authUser, cloudStatus } = useStore();
  if (!authUser) return null;
  const text =
    cloudStatus === "saving"
      ? "保存中…"
      : cloudStatus === "error"
        ? "未同期の記録があります"
        : cloudStatus === "saved"
          ? "保存済み"
          : "";
  if (!text) return null;
  return (
    <p
      className={cx("text-xs px-3 pb-2", cloudStatus === "error" ? "text-error" : "text-ink2")}
      role="status"
    >
      {text}
    </p>
  );
}

function Sidebar() {
  const { state, authUser } = useStore();
  const isActive = useActive();
  const me = state.users[state.me]!;
  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-60 shrink-0 flex-col border-r border-base-300 bg-base-100 px-3 py-5">
      <Link to="/sessions" className="flex items-center gap-2 px-3 pb-5" aria-label="卓譜 ホーム">
        <LogoMark size={24} className="text-primary" />
        <span className="text-lg font-bold tracking-tight">卓譜</span>
        {!authUser && (
          <span className="ml-auto rounded-md bg-base-200 px-2 py-0.5 text-xs text-ink2">デモ</span>
        )}
      </Link>

      <Link to="/upload" className="btn btn-primary w-full mb-5">
        <IconPlus width={18} height={18} /> セッションを記録
      </Link>

      <nav aria-label="メイン" className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, Icon }) => {
          const active = isActive(to);
          return (
            <Link
              key={to}
              to={to as never}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 h-10 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-bold"
                  : "text-base-content/75 font-medium hover:bg-base-200 hover:text-base-content",
              )}
            >
              <Icon width={20} height={20} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-base-300 pt-3">
        <SyncStatus />
        <div className="flex items-center gap-1">
          <Link
            to={`/users/${state.me}` as never}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-base-200"
          >
            <Avatar u={me} size={32} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold">{me.name}</span>
              <span className="text-xs text-ink2">マイページ</span>
            </span>
          </Link>
          <Link
            to="/settings"
            aria-label="設定"
            className={cx(
              "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-base-200",
              isActive("/settings") ? "text-primary" : "text-ink2",
            )}
          >
            <IconSettings width={20} height={20} />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { state, authUser } = useStore();
  const me = state.users[state.me]!;
  return (
    <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-base-300 bg-base-100/95 px-4 backdrop-blur">
      <Link to="/sessions" className="flex items-center gap-2" aria-label="卓譜 ホーム">
        <LogoMark size={22} className="text-primary" />
        <span className="text-base font-bold tracking-tight">卓譜</span>
      </Link>
      {!authUser && <span className="rounded-md bg-base-200 px-2 py-0.5 text-xs text-ink2">デモ</span>}
      <Link to="/upload" className="btn btn-primary btn-sm ml-auto">
        <IconPlus width={16} height={16} /> 記録
      </Link>
      <Link
        to="/settings"
        aria-label="設定とアカウント"
        className="flex size-10 items-center justify-center rounded-full"
      >
        <Avatar u={me} size={30} />
      </Link>
    </header>
  );
}

function MobileTabBar() {
  const isActive = useActive();
  return (
    <nav
      aria-label="メイン"
      className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-base-300 bg-base-100/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map(({ to, short, Icon }) => {
          const active = isActive(to);
          return (
            <li key={to}>
              <Link
                to={to as never}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-xs transition-colors",
                  active ? "text-primary font-bold" : "text-base-content/60 font-medium",
                )}
              >
                <Icon width={22} height={22} />
                {short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Shell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:pb-16">
          <SaveBanners />
          <OnboardingBanner />
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
