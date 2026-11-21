import dns from "node:dns/promises";
import {
  isPrivateOrReservedIp,
  parseExternalResponse,
  parseExternalUrl,
  type ExternalImportPayload,
} from "./external-sync";

export interface ExternalImportDeps {
  lookupAll?: (hostname: string) => Promise<{ address: string }[]>;
  fetchFn?: typeof fetch;
  now?: () => Date;
  maxBytes?: number;
  timeoutMs?: number;
}

export type ExternalImportServerResponse =
  | ({ ok: true; fetchedAt: string } & ExternalImportPayload)
  | { ok: false; status: number; error: string };

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

async function defaultLookupAll(hostname: string): Promise<{ address: string }[]> {
  return dns.lookup(hostname, { all: true });
}

async function assertSafePublicHost(
  hostname: string,
  lookupAll: (h: string) => Promise<{ address: string }[]>,
): Promise<boolean> {
  const records = await lookupAll(hostname);
  if (!records || records.length === 0) return false;
  return records.every((r) => Boolean(r.address) && !isPrivateOrReservedIp(r.address));
}

async function readResponseWithLimit(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error("BODY_TOO_LARGE");
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

async function fetchSafeExternalUrl(
  initialUrl: string,
  lookupAll: (h: string) => Promise<{ address: string }[]>,
  fetchFn: typeof fetch,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ ok: true; body: string; contentType: string } | { ok: false; status: number; error: string }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      return { ok: false, status: 400, error: "URL の形式が正しくありません。" };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, status: 400, error: "https:// の URL のみ読み込めます。" };
    }

    let safeHost = false;
    try {
      safeHost = await assertSafePublicHost(parsed.hostname, lookupAll);
    } catch {
      return { ok: false, status: 502, error: "外部サービスの名前解決に失敗しました。" };
    }
    if (!safeHost) {
      return { ok: false, status: 400, error: "この接続先アドレスは許可されていません。" };
    }

    let res: Response;
    try {
      res = await fetchFn(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "TakufuImporter/1.0 (+https://takufu.app)",
          Accept: "application/json, text/html, text/plain, */*",
        },
      });
    } catch (cause) {
      const isAbort =
        cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
      return {
        ok: false,
        status: isAbort ? 504 : 502,
        error: isAbort
          ? "外部サービスの応答がタイムアウトしました。時間をおいて再度お試しください。"
          : "外部サービスへ接続できませんでした。",
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, status: 502, error: "外部サービスからのリダイレクト先が不明です。" };
      }
      let resolved: URL;
      try {
        resolved = new URL(location, currentUrl);
      } catch {
        return { ok: false, status: 502, error: "外部サービスからのリダイレクト先が不正です。" };
      }
      const allowedRedirect = parseExternalUrl(resolved.toString());
      if (!allowedRedirect.ok) {
        return { ok: false, status: 400, error: "対応外の外部 URL へのリダイレクトは拒否されました。" };
      }
      currentUrl = resolved.toString();
      continue;
    }

    if (res.status === 404 || res.status === 403 || res.status === 401) {
      return {
        ok: false,
        status: 422,
        error: "ページが非公開または見つかりません。公開設定と URL を確認してください。",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        error: `外部サービスからエラーが返されました（HTTP ${res.status}）。`,
      };
    }

    try {
      const body = await readResponseWithLimit(res, maxBytes);
      return { ok: true, body, contentType: res.headers.get("content-type") ?? "" };
    } catch (cause) {
      if (cause instanceof Error && cause.message === "BODY_TOO_LARGE") {
        return { ok: false, status: 413, error: "取得したデータサイズが大きすぎます。" };
      }
      return { ok: false, status: 502, error: "外部データの読み取りに失敗しました。" };
    }
  }

  return { ok: false, status: 502, error: "リダイレクト回数が上限を超えました。" };
}

export async function handleExternalImport(
  rawBody: unknown,
  deps: ExternalImportDeps = {},
): Promise<ExternalImportServerResponse> {
  const lookupAll = deps.lookupAll ?? defaultLookupAll;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? (() => new Date());
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const urlValue =
    rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
      ? (rawBody as { url?: unknown }).url
      : undefined;
  if (typeof urlValue !== "string") {
    return { ok: false, status: 400, error: "外部サービスの URL を指定してください。" };
  }

  const parsedUrl = parseExternalUrl(urlValue);
  if (!parsedUrl.ok) {
    return { ok: false, status: 400, error: parsedUrl.error };
  }

  let lastFailure: { status: number; error: string } = {
    status: 422,
    error: "データ形式を読み取れませんでした。",
  };

  for (const targetUrl of parsedUrl.fetchUrls) {
    const fetched = await fetchSafeExternalUrl(targetUrl, lookupAll, fetchFn, maxBytes, timeoutMs);
    if (!fetched.ok) {
      lastFailure = { status: fetched.status, error: fetched.error };
      continue;
    }
    const payload = parseExternalResponse(
      parsedUrl.provider,
      fetched.body,
      fetched.contentType,
      parsedUrl.displayUrl,
    );
    if (payload) {
      return {
        ok: true,
        fetchedAt: now().toISOString(),
        ...payload,
      };
    }
    lastFailure = {
      status: 422,
      error: "ページの情報を読み取れませんでした。非公開設定や URL をお確かめください。",
    };
  }

  return { ok: false, status: lastFailure.status, error: lastFailure.error };
}
