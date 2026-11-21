"use client";
/**
 * 画面全体の土台。
 * - BaseProviders: すべての画面。テーマとエラー表示だけで、記録は読まない（LP・規約などはサーバーで描画される）。
 * - StoreProviders（store-providers.tsx。別のファイルにして、公開ページの JS に記録と Firebase を載せない）: 記録を使う画面（アプリ本体・共有ページ・ログイン・サンプル開始）。記録はブラウザ
 *   （とログイン時はクラウド）にあるので、サーバーでは描画せず、ブラウザに載ってから描画する。
 */
import { useEffect, type ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ThemeSync } from "../components/ThemeSync";

/** 開発中だけ、画面上でコメントを残すレビュー機能（live-ui-review）を読み込む */
function DevReviewOverlay() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const params = new URLSearchParams(location.search);
    if (params.get("review") === "0") localStorage.removeItem("takufu-live-review");
    if (params.get("review") === "1") localStorage.setItem("takufu-live-review", "1");
    if (localStorage.getItem("takufu-live-review") !== "1") return;
    if (document.querySelector("script[data-live-review]")) return;
    const s = document.createElement("script");
    s.src = "http://127.0.0.1:4319/overlay.js";
    s.dataset.liveReview = "1";
    document.body.appendChild(s);
  }, []);
  return null;
}

export function BaseProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeSync />
      <DevReviewOverlay />
      {children}
    </ErrorBoundary>
  );
}
