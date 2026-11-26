/**
 * Sentry（エラーの記録）の共通の設定。ブラウザ・サーバー・edge の init で同じものを使う。
 * DSN がなければ何も送らない（テスト・E2E・DSN を置いていない開発環境）。
 * 送るのは例外・性能の計測・サーバーの警告とエラーの記録と、そのときのページの URL・ブラウザの種類まで。
 * IP・Cookie・入力の中身などは送らない（sendDefaultPii: false）。画面の録画（Session Replay）は使わない。
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  const development = process.env.NODE_ENV !== "production";
  return {
    dsn,
    enabled: Boolean(dsn),
    // デプロイしたコミット（scripts/ops.ts deploy が .env.production に書く）。どのデプロイで起きたかを分ける
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || (development ? "development" : "production"),
    sendDefaultPii: false,
    // 開発ではすべて、本番は 1 割だけ性能を計測する（無料枠の使い方を見て調整する）
    tracesSampleRate: development ? 1 : 0.1,
    enableLogs: true,
  };
}
