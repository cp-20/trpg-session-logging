"use client";

import { useEffect } from "react";

/** 画面の描画中に投げられた例外。ルートの layout は残るので、テーマと書体はそのまま使える */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error", error);
  }, [error]);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="surface w-full max-w-md px-6 py-10 text-center">
        <h1 className="text-lg font-bold">画面を表示できませんでした</h1>
        <p className="mt-2 text-sm text-ink2">記録は消えていません。もう一度読み込んでください。</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={reset}>
            もう一度読み込む
          </button>
          <a href="/" className="btn">
            ホームへ
          </a>
        </div>
      </div>
    </main>
  );
}
