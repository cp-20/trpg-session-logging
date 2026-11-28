"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Shell } from "../../../components/shell";
import { DiscordSync } from "../../../components/discord";
import { usePathname, useNavigate, useSearchString } from "../../../lib/router";
import { useStore } from "../../../store";

/**
 * ログイン（またはサンプル開始）前に開いたら /signin に送り、戻り先を next に付ける。共有ページはこの外にある。
 * 開いている間にやめた（サンプルを終える）ときは送らない: 行き先はやめる操作が決める
 * （ここでも送ると、その nav と競合してログイン画面に着いていた）。
 * ログインした人がまだユーザー ID を決めていなければ、はじめの設定（/welcome）に送る（P15）
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { state, authUser } = useStore();
  const pathname = usePathname();
  const search = useSearchString();
  const nav = useNavigate();
  const needsWelcome = Boolean(authUser) && state.entered && !state.users[state.me]?.handle;
  const openedBeforeEntering = useRef(!state.entered);
  useEffect(() => {
    if (!state.entered) {
      if (openedBeforeEntering.current)
        nav({ to: "/signin", search: { next: `${pathname}${search}` }, replace: true });
    } else if (needsWelcome) nav({ to: "/welcome", search: { next: `${pathname}${search}` }, replace: true });
  }, [state.entered, needsWelcome, pathname, search, nav]);
  if (!state.entered || needsWelcome) return null;
  return (
    <Shell>
      {children}
      <DiscordSync />
    </Shell>
  );
}
