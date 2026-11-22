import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LOLIPOP! Deploy Now はサーバー動作に standalone 出力を要求する
  output: "standalone",
  // 別の開発サーバー（pnpm run test:e2e:discord）が同じフォルダーで動けるよう、出力先を差し替えられる
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
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

export default nextConfig;
