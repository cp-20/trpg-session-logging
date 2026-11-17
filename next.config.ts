import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LOLIPOP! Deploy Now はサーバー動作に standalone 出力を要求する
  output: "standalone",
  devIndicators: false,
  // 開発サーバーを 127.0.0.1 で開いたときの HMR を許可する（E2E・レビューで使う）
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
