import type { Metadata } from "next";
import Landing from "../screens/Landing";

/** 検索・SNS に出る LP の題名と説明（OG 画像はこの階層の opengraph-image.png） */
const TITLE = "卓譜 | TRPG のセッション記録をリンクひとつに";
const DESCRIPTION =
  "CCFOLIA やユドナリウムのログを入れるだけで、ダイス・秘匿タブ・録画・感想・継続探索者の歩みが 1 ページにまとまります。未通過の人には伏せたまま渡せる、無料・広告なしの Web アプリ。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "卓譜", type: "website", locale: "ja_JP" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default Landing;
