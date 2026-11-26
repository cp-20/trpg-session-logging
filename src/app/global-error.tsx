"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "../styles.css";

/** ルートの layout ごと落ちたとき。html と body から自前で出す */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error("[app] fatal error", error);
  }, [error]);
  return (
    <html lang="ja" data-theme="takufu">
      <body>
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="surface w-full max-w-md px-6 py-10 text-center">
            <h1 className="text-lg font-bold">卓譜を表示できませんでした</h1>
            <p className="mt-2 text-sm text-ink2">記録は消えていません。もう一度読み込んでください。</p>
            <button type="button" className="btn btn-primary mt-6" onClick={reset}>
              もう一度読み込む
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
