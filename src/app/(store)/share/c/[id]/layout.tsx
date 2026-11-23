import type { Metadata } from "next";
import type { ReactNode } from "react";
import { shareMetadata } from "../../../../../server/share-metadata";
import { characterCard } from "../../../../../lib/og-card";
import { sharedCharacterPage } from "../../../../../server/shared-pages";

/** SNS・Discord に貼ったときの題名と説明。画像は同じ階層の opengraph-image.tsx */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const page = await sharedCharacterPage((await params).id);
  return shareMetadata(page.status === "public" ? characterCard(page.data) : null, "共有されたキャラクター");
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
