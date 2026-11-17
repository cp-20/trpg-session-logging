"use client";
import type { ReactNode } from "react";
import { Shell } from "../../components/shell";
import SignIn from "../../screens/SignIn";
import { useStore } from "../../store";

/** サインイン（またはデモ開始）前はサインイン画面を出す。共有ページはこの外にある */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { state } = useStore();
  if (!state.entered) return <SignIn />;
  return <Shell>{children}</Shell>;
}
