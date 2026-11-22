"use client";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Shell } from "../../../components/shell";
import { DiscordSync } from "../../../components/discord";
import { usePathname, useNavigate, useSearchString } from "../../../lib/router";
import { useStore } from "../../../store";

/**
 * ログイン（またはサンプル開始）前は /signin に送り、戻り先を next に付ける。共有ページはこの外にある。
 * ログインした人がまだユーザー ID を決めていなければ、はじめの設定（/welcome）に送る（P15）
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { state, authUser } = useStore();
  const pathname = usePathname();
  const search = useSearchString();
  const nav = useNavigate();
  const needsWelcome = Boolean(authUser) && state.entered && !state.users[state.me]?.handle;
  useEffect(() => {
    if (!state.entered) nav({ to: "/signin", search: { next: `${pathname}${search}` }, replace: true });
    else if (needsWelcome) nav({ to: "/welcome", search: { next: `${pathname}${search}` }, replace: true });
  }, [state.entered, needsWelcome, pathname, search, nav]);
  if (!state.entered || needsWelcome) return null;
  return (
    <Shell>
      {children}
      <DiscordSync />
    </Shell>
  );
}
