import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/site";

/** 検索に載せるのは紹介と規約のページだけ。共有ページなどは X-Robots-Tag: noindex（next.config.ts）で外す */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
