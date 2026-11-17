import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import "../styles.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "卓譜",
  description: "TRPGのセッションログ・探索者・卓の記録を管理する卓譜。",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23302822'/%3E%3Ccircle cx='22' cy='24' r='7' fill='%23e07850'/%3E%3Ccircle cx='42' cy='24' r='7' fill='%23e07850'/%3E%3Ccircle cx='32' cy='44' r='7' fill='%23dfa84e'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** 描画前にテーマを決めて、ちらつきを防ぐ */
const THEME_SCRIPT = `try{var m=localStorage.getItem("takufu-theme")||"system";var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"takufuDark":"takufu")}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" data-theme="takufu" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
