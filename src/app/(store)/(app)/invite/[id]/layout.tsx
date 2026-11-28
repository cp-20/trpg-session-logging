import type { ReactNode } from "react";

/**
 * 中身はブラウザの記録から描くので、サーバーが返すのはどの id でも同じ空の殻。
 * 空の一覧を返して静的な扱い（開かれた id ごとに作り置き）にし、一覧のリンクの先読みで殻まで読ませる。
 * 動的なままだと、開くたびにサーバーの応答を待ってから画面が切り替わる
 */
export function generateStaticParams() {
  return [];
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
