import type { Metadata } from "next";
import { cardDescription, type OgCard } from "../lib/og-card";

/**
 * 共有ページの題名・説明。読めないとき（参加者だけ・無い）は中身に触れない一般の題名にする。
 * openGraph はルートの layout の値を丸ごと置き換えるので、siteName などもここで書き直す。
 */
export function shareMetadata(card: OgCard | null, fallback: string): Metadata {
  const name = card?.kind === "session" ? card.title : card?.kind === "character" ? card.name : fallback;
  const title = `${name} | 卓譜`;
  const description = card ? cardDescription(card) : "卓譜で共有された TRPG の記録";
  return {
    title,
    description,
    openGraph: { title, description, siteName: "卓譜", type: "article", locale: "ja_JP" },
    twitter: { card: "summary_large_image", title, description },
  };
}
