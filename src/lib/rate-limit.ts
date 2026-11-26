/**
 * 同じ送り元からの連投を抑える（サーバーのメモリ上。再起動で消え、サーバーが複数あればそれぞれで数える）。
 * 悪用をゼロにするものではなく、1 か所からの連打で外部サービスや Webhook を叩かせないための歯止め。
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

/** 送り元の IP。CDN（CloudFront）が付ける X-Forwarded-For の先頭を使う */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
