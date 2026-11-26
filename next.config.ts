import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * すべての応答に付ける安全のためのヘッダー。
 * script-src は絞らない（描画前のテーマ判定や Next.js の埋め込みスクリプトに nonce が要り、全ページが動的描画になるため）。
 * そのかわり、よそのページへの埋め込み・base の差し替え・plugin・よそへのフォーム送信を止める。
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Google・X のログインはポップアップで開くので、開いた窓との行き来だけは残す
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** 検索に載せないページ（共有・招待・プロフィール・お試し）。robots.txt で止めると noindex も読まれないので、ヘッダーで外す */
const NOINDEX_PATHS = ["/share/:path*", "/join/:path*", "/invite/:path*", "/users/:path*", "/demo"];

const nextConfig: NextConfig = {
  // LOLIPOP! Deploy Now はサーバー動作に standalone 出力を要求する
  output: "standalone",
  // 別の開発サーバー（pnpm run test:e2e:discord）が同じフォルダーで動けるよう、出力先を差し替えられる
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  poweredByHeader: false,
  // 静的なページの HTML を CDN（Deploy Now の CloudFront）が持つ時間の上限。既定の 1 年だと、デプロイ後も
  // 古い HTML（もう無い JS を指す）が配られ続ける。src/app/layout.tsx の revalidate と組で、遅くとも 10 分で入れ替わる
  expireTime: 600,
  // 開発サーバーを 127.0.0.1 で開いたときの HMR を許可する（E2E・レビューで使う）
  allowedDevOrigins: ["127.0.0.1"],
  typescript: {
    tsconfigPath: "tsconfig.next.json",
    // pnpm run check で事前に tsc --noEmit を実行済みのときだけ重複検査を省く
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "1",
  },
  // LP の書体はファイル名に中身のハッシュがあるので、ずっとキャッシュしてよい。立ち絵などはしばらくだけ
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...NOINDEX_PATHS.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex" }] })),
      {
        source: "/fonts/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/lp/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
  experimental: {
    // CI（Deploy Now など .next/cache を引き継がない環境）ではビルド用キャッシュの書き出しを省く
    turbopackFileSystemCacheForBuild: process.env.CI !== "true",
    optimizePackageImports: ["zod", "react-hook-form", "firebase/auth", "firebase/firestore"],
  },
};

// Sentry: ソースマップは SENTRY_AUTH_TOKEN があるビルド（本番）でだけ送り、配る JS からは消す
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  telemetry: false,
  // 依存先（Firestore など）をビルド時に書き換える計測は使わない（Firestore lite で書き換えに失敗する）
  buildTimeInstrumentation: false,
});
