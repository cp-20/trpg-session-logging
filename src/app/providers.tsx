"use client";
/**
 * 画面全体の土台。記録はブラウザ（とログイン時はクラウド）にあるので、
 * サーバーでは描画せず、ブラウザに載ってから描画する（描画結果の食い違いを起こさない）。
 */
import { useEffect, useState, type ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ThemeSync } from "../screens/Settings";
import { WorkspaceProvider } from "../workspace";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

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

export function Providers({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return (
    <ErrorBoundary>
      <ThemeSync />
      <DevReviewOverlay />
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </ErrorBoundary>
  );
}
