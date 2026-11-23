import { characterCard } from "../../../../../lib/og-card";
import { OG_SIZE, renderOgCard } from "../../../../../server/og-image";
import { sharedCharacterPage } from "../../../../../server/shared-pages";

export const alt = "卓譜で共有されたキャラクター";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const page = await sharedCharacterPage((await params).id);
  return renderOgCard(
    page.status === "public" ? characterCard(page.data) : { kind: "generic", heading: "キャラクター" },
  );
}
