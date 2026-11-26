/**
 * Sentry（エラーの記録）の共通の設定。DSN がなければ何も送らない（開発・テスト・E2E）。
 * 送るのは例外と、その時のページの URL・ブラウザの種類まで。IP・Cookie・入力の中身などは送らない（sendDefaultPii: false）。
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "production",
    sendDefaultPii: false,
    // 無料枠に収まるよう、性能の計測はごく一部だけ
    tracesSampleRate: 0.02,
  };
}
