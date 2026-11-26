import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/noto-sans-jp";
import "../styles.css";
import { BaseProviders } from "./providers";
import { SITE_URL } from "../lib/site";

/**
 * 静的なページも 5 分ごとに作り直す扱いにする。これで HTML の Cache-Control が
 * s-maxage=300, stale-while-revalidate=300（next.config.ts の expireTime）になり、CDN が古い HTML を持ち続けない
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "卓譜",
  description: "TRPGのセッションログ・探索者・卓の記録を管理する卓譜。",
  // アイコン・OG 画像はこの階層の icon.svg / favicon.ico / apple-icon.png / opengraph-image.png（scripts/gen-brand.ts が書き出す）
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: "卓譜", type: "website", locale: "ja_JP" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2ebe0" },
    { media: "(prefers-color-scheme: dark)", color: "#161311" },
  ],
};

/** 描画前にテーマを決めて、ちらつきを防ぐ */
const THEME_SCRIPT = `try{var m=localStorage.getItem("takufu-theme")||"system";var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"takufuDark":"takufu")}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" data-theme="takufu" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <BaseProviders>{children}</BaseProviders>
      </body>
    </html>
  );
}
