"use client";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Shell } from "../../../components/shell";
import { usePathname, useNavigate, useSearchString } from "../../../lib/router";
import { useStore } from "../../../store";

/** ログイン（またはサンプル開始）前は /signin に送り、戻り先を next に付ける。共有ページはこの外にある */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { state } = useStore();
  const pathname = usePathname();
  const search = useSearchString();
  const nav = useNavigate();
  useEffect(() => {
    if (!state.entered) nav({ to: "/signin", search: { next: `${pathname}${search}` }, replace: true });
  }, [state.entered, pathname, search, nav]);
  if (!state.entered) return null;
  return <Shell>{children}</Shell>;
}
