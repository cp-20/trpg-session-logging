"use client";
/**
 * 記録を使う画面（アプリ本体・共有ページ・ログイン・サンプル開始）の土台。記録はブラウザ
 * （とログイン時はクラウド）にあるので、サーバーでは描画せず、ブラウザに載ってから描画する。
 * providers.tsx と分けているのは、LP などの公開ページの JS に記録と Firebase を載せないため。
 */
import { useSyncExternalStore, type ReactNode } from "react";
import { preconnect } from "react-dom";
import { WorkspaceProvider } from "../workspace";
import { PageLoading } from "../components/ui";

const noopSubscribe = () => () => {};

/** サーバー（と hydration 中）は false、ブラウザに載った後は true */
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * 記録を開くときに必ず話す相手（ログインの確認・トークンの更新・Firestore）へ、JS を読み終える前から接続を始めておく。
 * サーバーの描画で <head> に入る
 */
function preconnectFirebase() {
  if (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" || !process.env.NEXT_PUBLIC_FIREBASE_API_KEY)
    return;
  for (const origin of [
    "https://firestore.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
  ])
    preconnect(origin, { crossOrigin: "anonymous" });
}

export function StoreProviders({ children }: { children: ReactNode }) {
  preconnectFirebase();
  const mounted = useMounted();
  // サーバーの HTML にも読み込み中の印を入れておく（JS が載るまで真っ白にしない）
  if (!mounted)
    return (
      <main>
        <PageLoading full label="記録を読み込んでいます" />
      </main>
    );
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
