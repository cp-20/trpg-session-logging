import { ShareChar } from "../../../../../screens/ShareLog";
import { sharedCharacterPage } from "../../../../../server/shared-pages";

/**
 * 共有中のキャラクターは、題名・OG 画像のためにサーバーが読んだもの（同じ描画の中で 1 回）を渡し、ブラウザで読み直さない。
 * 待たずに渡す（HTML はすぐ返り、中身は届きしだい流れる）
 */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const initial = params
    .then(({ id }) => sharedCharacterPage(id))
    .then((page) => (page.status === "public" ? page.data : null));
  return <ShareChar initial={initial} />;
}
