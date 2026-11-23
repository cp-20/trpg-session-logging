import type { Metadata } from "next";
import type { ReactNode } from "react";
import { shareMetadata } from "../../../../../server/share-metadata";
import { sessionCard } from "../../../../../lib/og-card";
import { sharedLogPage } from "../../../../../server/shared-pages";

/** SNS・Discord に貼ったときの題名と説明。画像は同じ階層の opengraph-image.tsx */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const page = await sharedLogPage((await params).slug);
  return shareMetadata(
    page.status === "public" ? sessionCard(page.data) : null,
    "共有されたセッションの記録",
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
