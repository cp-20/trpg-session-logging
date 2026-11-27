/**
 * /api/media-preview の中身。貼られた URL を、固定の問い合わせ先（src/lib/media-preview.ts）に組み直して引く。
 *
 * - 出るのは PREVIEW_UPSTREAM_HOSTS の https だけ。転送（3xx）は追わない
 * - 時間（既定 5 秒）と大きさ（既定 1MB）に上限。閲覧者のクッキー・IP・Referer は付けない
 * - 結果は 10 分だけ覚える（同じ投稿を見る人が続いても、相手のサービスを何度も叩かない）
 */
import {
  PREVIEW_UPSTREAM_HOSTS,
  parsePreviewResponse,
  previewTarget,
  type MediaPreview,
} from "./media-preview";
import { SITE_URL } from "./site";

export interface MediaPreviewDeps {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  now?: () => number;
  cache?: Map<string, { at: number; value: MediaPreview | null }>;
}

export type MediaPreviewResult =
  | { ok: true; preview: MediaPreview }
  | { ok: false; status: number; error: string };

const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const sharedCache = new Map<string, { at: number; value: MediaPreview | null }>();
const USER_AGENT = `TakufuPreview/1.0 (+${SITE_URL})`;

async function readLimited(res: Response, maxBytes: number): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

const NOT_FOUND: MediaPreviewResult = { ok: false, status: 404, error: "読み取れませんでした。" };

export async function handleMediaPreview(
  rawUrl: string | null,
  deps: MediaPreviewDeps = {},
): Promise<MediaPreviewResult> {
  const target = rawUrl && rawUrl.length <= 2048 ? previewTarget(rawUrl) : null;
  if (!target) return { ok: false, status: 400, error: "対応していない URL です。" };
  const upstream = new URL(target.fetchUrl);
  // 組み直した先が一覧の外なら出ない（previewTarget の誤りに備えた二重の歯止め）
  if (upstream.protocol !== "https:" || !PREVIEW_UPSTREAM_HOSTS.has(upstream.hostname)) {
    return { ok: false, status: 400, error: "対応していない URL です。" };
  }

  const now = deps.now ?? Date.now;
  const cache = deps.cache ?? sharedCache;
  const key = `${target.service}:${target.id}`;
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return hit.value ? { ok: true, preview: hit.value } : NOT_FOUND;

  const fetchFn = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(upstream.toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: AbortSignal.timeout(deps.timeoutMs ?? 5000),
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/xml, */*" },
    });
  } catch {
    return { ok: false, status: 504, error: "相手のサービスから応答がありませんでした。" };
  }
  // 転送は追わない（よそのホストへ向けられないように）
  if (res.status >= 300 && res.status < 400)
    return { ok: false, status: 502, error: "読み取れませんでした。" };
  let value: MediaPreview | null = null;
  if (res.ok) {
    const body = await readLimited(res, deps.maxBytes ?? 1_000_000).catch(() => null);
    if (body === null) return { ok: false, status: 502, error: "読み取れませんでした。" };
    value = parsePreviewResponse(target, body);
  } else if (res.status >= 500 || res.status === 429) {
    return { ok: false, status: 502, error: "相手のサービスが応答しませんでした。" };
  }
  // 見つからない・非公開のものも短く覚える
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: now(), value });
  return value ? { ok: true, preview: value } : NOT_FOUND;
}
