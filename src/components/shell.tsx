import { useEffect, useMemo, useRef } from "react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { buildFeedIcs, publishFeed } from "../lib/calendar-feed";
import { Link, usePathname } from "../lib/router";
import { download, todayStr, sessionStart } from "../lib/time";
import { useStoreState, useSyncStatus } from "../store";
import {
  IconAlert,
  IconBooks,
  IconCalendar,
  IconHome,
  IconCharacter,
  IconListDetails,
  IconPlus,
  IconSettings,
  IconTable,
} from "./icons";
import { LogoMark, TableMark, cx } from "./ui";
import { Avatar, CharAvatar } from "./identity";
import { userHref } from "../lib/people";

type NavItem = { to: string; label: string; short: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

/** 主要な行き先。デスクトップはサイドバー、モバイルは下部タブで同じ並びを使う */
const NAV: NavItem[] = [
  { to: "/home", label: "ホーム", short: "ホーム", Icon: IconHome },
  { to: "/sessions", label: "セッション", short: "記録", Icon: IconListDetails },
  { to: "/calendar", label: "カレンダー", short: "予定", Icon: IconCalendar },
  { to: "/tables", label: "卓", short: "卓", Icon: IconTable },
  { to: "/characters", label: "キャラクター", short: "キャラ", Icon: IconCharacter },
  { to: "/scenarios", label: "シナリオ", short: "シナリオ", Icon: IconBooks },
];

function useActive() {
  const pathname = usePathname();
  return (to: string) => pathname === to || pathname.startsWith(`${to}/`);
}

function SaveBanners() {
  const { saveError, dataCorrupt, otherTabUpdated, retrySave } = useSyncStatus();
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
  // 本文の列（画面ごとに幅が違う）に合わせず、画面の枠（上部バー）に沿う帯にする（P13: 幅のずれたカードを本文の上に置かない）
  return (
    <div className="divide-y divide-base-300 border-b border-base-300">
      {banners.map((b, i) => (
        <div
          key={i}
          role="alert"
          className={cx(
            "flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-8",
            b.kind === "error" ? "bg-error/10 text-base-content" : "bg-warning/10 text-base-content",
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

function SyncStatus() {
  const { cloudStatus } = useSyncStatus();
  const { authUser } = useStoreState();
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

/** サイドバーの行。現在地は薄い主色の面と左端の短い印で示す */
function SideLink({
  to,
  active,
  className,
  children,
}: {
  to: string;
  active: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex items-center rounded-lg text-sm transition-colors",
        className,
        active
          ? "bg-primary/10 text-primary font-bold"
          : "text-base-content/75 font-medium hover:bg-base-200 hover:text-base-content",
      )}
    >
      {active && (
        <span
          data-nav-current-mark
          className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary"
          aria-hidden
        />
      )}
      {children}
    </Link>
  );
}

function Sidebar() {
  const { state, authUser } = useStoreState();
  const isActive = useActive();
  const me = state.users[state.me]!;

  const { quickTables, quickChars } = useMemo(() => {
    const latestByTable = new Map<string, number>();
    const latestByChar = new Map<string, number>();
    for (const l of Object.values(state.logs)) {
      if (l.tableId) {
        const prev = latestByTable.get(l.tableId) ?? 0;
        if (sessionStart(l) > prev) latestByTable.set(l.tableId, sessionStart(l));
      }
      const myCharIds = l.players[state.me]?.characterIds;
      if (myCharIds) {
        for (const cid of myCharIds) {
          const prev = latestByChar.get(cid) ?? 0;
          if (sessionStart(l) > prev) latestByChar.set(cid, sessionStart(l));
        }
      }
    }
    const tables = Object.values(state.tables)
      .filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me)
      .sort((a, b) => (latestByTable.get(b.id) ?? 0) - (latestByTable.get(a.id) ?? 0))
      .slice(0, 4);
    const chars = Object.values(state.characters)
      .filter((c) => c.ownerId === state.me)
      .sort((a, b) => {
        const diff = (latestByChar.get(b.id) ?? 0) - (latestByChar.get(a.id) ?? 0);
        if (diff !== 0) return diff;
        const da = a.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
        const db = b.sessions.reduce((m, s) => (s.date > m ? s.date : m), "");
        return db.localeCompare(da);
      })
      .slice(0, 4);
    return { quickTables: tables, quickChars: chars };
  }, [state.tables, state.characters, state.logs, state.me]);

  // 参加中の卓・自分のキャラは、それぞれの一覧の行のすぐ下に出す（見出しを添えなくても何の並びか分かる）
  const subNav: Record<string, { to: string; name: string; mark: ReactNode }[]> = {
    "/tables": quickTables.map((t) => ({
      to: `/tables/${t.id}`,
      name: t.name,
      mark: <TableMark table={t} size={20} />,
    })),
    "/characters": quickChars.map((c) => ({
      to: `/characters/${c.id}`,
      name: c.name,
      mark: <CharAvatar c={c} size={20} />,
    })),
  };

  return (
    <aside className="hidden lg:flex sticky top-0 h-screen w-60 shrink-0 flex-col border-r border-base-300 bg-base-100 px-3 py-5">
      <div className="flex items-center gap-2 px-3 pb-5 shrink-0">
        <Link to="/home" className="flex items-center gap-2" aria-label="卓譜 ホーム">
          <LogoMark size={24} className="text-primary" />
          <span className="text-lg font-bold tracking-tight">卓譜</span>
        </Link>
        {!authUser && (
          <span className="ml-auto rounded-md bg-base-200 px-2 py-0.5 text-xs text-ink2">サンプル</span>
        )}
      </div>

      <Link to="/upload" className="btn btn-primary w-full mb-5 shrink-0">
        <IconPlus width={18} height={18} /> セッションを記録
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <nav aria-label="メイン" className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, Icon }, idx) => {
            const children = subNav[to] ?? [];
            // 下に並べた卓・キャラを開いているときは、そちらだけを現在地にする（現在地は 1 つ）
            const active = isActive(to) && !children.some((c) => isActive(c.to));
            return (
              <div key={to}>
                {idx === 3 && <div className="my-2.5 border-t border-base-300/80" aria-hidden />}
                <SideLink to={to} active={active} className="gap-3 px-3 h-10">
                  <Icon width={20} height={20} className="shrink-0" />
                  {label}
                </SideLink>
                {children.length > 0 && (
                  <ul aria-label={label} className="mb-1 mt-0.5 flex flex-col gap-0.5">
                    {children.map((c) => (
                      <li key={c.to}>
                        {/* 印は上の行の文字（アイコン 20px + 間 12px）にそろえる */}
                        <SideLink to={c.to} active={isActive(c.to)} className="gap-2 pl-11 pr-2 h-9">
                          {c.mark}
                          <span className="truncate">{c.name}</span>
                        </SideLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="mt-3 shrink-0 border-t border-base-300 pt-3">
        <SyncStatus />
        <div className="flex items-center gap-1">
          <Link
            to={userHref(me)}
            className={cx(
              "flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-base-200",
              isActive(userHref(me)) && "bg-primary/10 text-primary",
            )}
          >
            <Avatar u={me} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{me.name}</span>
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
  const { state, authUser } = useStoreState();
  const me = state.users[state.me]!;
  return (
    <header className="lg:hidden sticky top-0 z-30 flex min-h-14 items-center gap-1.5 sm:gap-2 border-b border-base-300 bg-base-100/95 px-3 sm:px-4 backdrop-blur">
      <Link to="/home" className="flex min-w-0 items-center gap-2 shrink-0" aria-label="卓譜 ホーム">
        <LogoMark size={22} className="text-primary shrink-0" />
        <span className="text-base font-bold tracking-tight whitespace-nowrap">卓譜</span>
      </Link>
      {!authUser && (
        <span className="shrink-0 rounded-md bg-base-200 px-2 py-0.5 text-xs text-ink2 whitespace-nowrap">
          サンプル
        </span>
      )}
      <Link to="/upload" className="btn btn-primary btn-sm ml-auto shrink-0 whitespace-nowrap">
        <IconPlus width={16} height={16} /> 記録
      </Link>
      <Link
        to="/settings"
        aria-label="設定とアカウント"
        className="flex size-10 shrink-0 items-center justify-center rounded-full"
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
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {NAV.map(({ to, short, Icon }) => {
          const active = isActive(to);
          return (
            <li key={to} className="min-w-0">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1 text-xs transition-colors",
                  active ? "text-primary font-bold" : "text-ink2 font-medium",
                )}
              >
                {active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" aria-hidden />}
                <Icon width={22} height={22} className="shrink-0" />
                <span className="max-w-full truncate leading-tight">{short}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * カレンダー購読リンクを作ってあれば、確定した予定が変わるたびに配信用の文書を書き直す。
 * 生成時刻（DTSTAMP）だけの違いでは書き込まない。
 */
function CalendarFeedSync() {
  const { state, authUser } = useStoreState();
  const token = state.prefs.calendarFeedToken;
  const ics = useMemo(
    () => (authUser && token ? buildFeedIcs(state, todayStr()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- events / tables が変わったときだけ再生成する
    [authUser, token, state.events, state.tables],
  );
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!authUser || !token || !ics) return;
    const key = `${token}:${ics.replace(/^DTSTAMP:.*$/gm, "")}`;
    if (last.current === key) return;
    const t = window.setTimeout(() => {
      publishFeed(token, authUser.uid, ics)
        .then(() => {
          last.current = key;
        })
        .catch(() => {
          /* 次の変更で再試行する。購読側は前回の内容を表示し続ける */
        });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [authUser, token, ics]);
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div data-app-shell className="flex min-h-screen">
      <a href="#main-content" className="skip-link">
        メインコンテンツへ移動
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar />
        <SaveBanners />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pt-8 lg:pb-16"
        >
          {children}
        </main>
      </div>
      <MobileTabBar />
      <CalendarFeedSync />
    </div>
  );
}
