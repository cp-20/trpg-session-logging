/** 本番の URL。OG 画像・robots・sitemap の絶対 URL に使う */
export const SITE_URL = (process.env.SITE_URL ?? "https://takufu.app").replace(/\/$/, "");

/** 検索に載せてよいページ。ほかは next.config.ts で noindex にする */
export const PUBLIC_PAGES = ["/", "/terms", "/privacy", "/licenses"] as const;
