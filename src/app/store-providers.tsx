"use client";
/**
 * 記録を使う画面（アプリ本体・共有ページ・ログイン・サンプル開始）の土台。記録はブラウザ
 * （とログイン時はクラウド）にあるので、サーバーでは描画せず、ブラウザに載ってから描画する。
 * providers.tsx と分けているのは、LP などの公開ページの JS に記録と Firebase を載せないため。
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { WorkspaceProvider } from "../workspace";

const noopSubscribe = () => () => {};

/** サーバー（と hydration 中）は false、ブラウザに載った後は true */
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

export function StoreProviders({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
