import type { MetadataRoute } from "next";

/** ホーム画面に追加したときの名前とアイコン（アイコンは scripts/gen-brand.ts が書き出す） */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "卓譜",
    short_name: "卓譜",
    description: "TRPGのセッションログ・探索者・卓の記録を管理する卓譜。",
    start_url: "/home",
    display: "standalone",
    background_color: "#f2ebe0",
    theme_color: "#f2ebe0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
