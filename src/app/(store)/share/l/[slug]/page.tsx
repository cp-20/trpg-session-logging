import ShareLog from "../../../../../screens/ShareLog";
import { sharedLogPage } from "../../../../../server/shared-pages";

/**
 * 誰にでも見せてよい記録は、題名・OG 画像のためにサーバーが読んだもの（同じ描画の中で 1 回）を渡し、ブラウザで読み直さない。
 * 待たずに渡す（HTML はすぐ返り、記録は届きしだい流れる）
 */
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  const initial = params
    .then(({ slug }) => sharedLogPage(slug))
    .then((page) => (page.status === "public" ? page.data : null));
  return <ShareLog initial={initial} />;
}
