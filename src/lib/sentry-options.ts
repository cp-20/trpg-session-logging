/**
 * Sentry（エラーの記録）の共通の設定。ブラウザ・サーバー・edge の init で同じものを使う。
 * DSN がなければ何も送らない（テスト・E2E・DSN を置いていない開発環境）。
 * 送るのは例外・性能の計測・サーバーの警告とエラーの記録と、そのときのページ（鍵になる部分を伏せた URL）・ブラウザの種類まで。
 * 利用者の情報・IP・Cookie・ヘッダー・本文・問い合わせは集めない（dataCollection と src/lib/sentry-scrub.ts）。
 * IP は Sentry の側でも保存しない設定にしてある（プロジェクト cp20/takufu の Prevent Storing of IP Addresses）。
 * 画面の録画（Session Replay）は使わない。
 */
import type { init } from "@sentry/nextjs";
import { scrubEvent, scrubSpan, scrubText } from "./sentry-scrub";

type Options = NonNullable<Parameters<typeof init>[0]>;

export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const development = process.env.NODE_ENV !== "production";
  return {
    dsn,
    enabled: Boolean(dsn),
    // デプロイしたコミット（scripts/ops.ts deploy が .env.production に書く）。どのデプロイで起きたかを分ける
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || (development ? "development" : "production"),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
    },
    beforeSend: (event) => scrubEvent(event),
    // 性能の計測は span ごとに送られる（v11 の既定）。beforeSendTransaction はもう呼ばれないので、span の側で伏せる
    beforeSendSpan: (span) => scrubSpan(span),
    beforeSendLog: (log) => ({ ...log, message: scrubText(String(log.message)) }),
    beforeBreadcrumb: (crumb) => {
      if (crumb.message) crumb.message = scrubText(crumb.message);
      for (const key of ["url", "to", "from"]) {
        const value = crumb.data?.[key];
        if (typeof value === "string") crumb.data![key] = scrubText(value);
      }
      return crumb;
    },
    // 開発ではすべて、本番は 1 割だけ性能を計測する（無料枠の使い方を見て調整する）
    tracesSampleRate: development ? 1 : 0.1,
  } satisfies Options;
}
