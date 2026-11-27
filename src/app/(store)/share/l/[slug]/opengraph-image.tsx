import { sessionCard } from "../../../../../lib/og-card";
import { OG_SIZE, renderOgCard } from "../../../../../server/og-image";
import { sharedLogPage } from "../../../../../server/shared-pages";

export const alt = "卓譜で共有されたセッションの記録";
export const size = OG_SIZE;
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const page = await sharedLogPage((await params).slug);
  return renderOgCard(
    page.status === "public"
      ? sessionCard(page.data)
      : {
          kind: "generic",
          heading:
            page.status !== "limited"
              ? "セッションの記録"
              : page.scope === "passed"
                ? "通過した人だけが読める記録"
                : "参加者だけが読める記録",
        },
  );
}
