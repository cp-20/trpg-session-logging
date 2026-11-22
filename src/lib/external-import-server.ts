import dns from "node:dns/promises";
import type { ExternalSyncProvider } from "../types";
import {
  IACHARA_API_ORIGIN,
  iacharaSheetError,
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
  /** いあきゃらの閲覧者用の鍵の置き場（テストで差し替える） */
  iacharaToken?: TokenCache;
}

export type ExternalImportServerResponse =
  | ({ ok: true; fetchedAt: string } & ExternalImportPayload)
  | { ok: false; status: number; error: string };

const USER_AGENT = "TakufuImporter/1.0 (+https://takufu.app)";
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

interface FetchContext {
  lookupAll: (h: string) => Promise<{ address: string }[]>;
  fetchFn: typeof fetch;
  maxBytes: number;
  timeoutMs: number;
  now: () => Date;
}

interface SafeRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** 転送を追うか。認証の見出しを付ける要求や POST は追わない（転送先に鍵を渡さない） */
  followRedirects?: boolean;
}

type SafeFetchResult =
  | { ok: true; body: string; contentType: string }
  | { ok: false; status: number; error: string; upstreamStatus?: number };

async function fetchSafeExternalUrl(req: SafeRequest, ctx: FetchContext): Promise<SafeFetchResult> {
  const { lookupAll, fetchFn, maxBytes, timeoutMs } = ctx;
  const followRedirects = req.followRedirects ?? true;
  let currentUrl = req.url;

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
        method: req.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/html, text/plain, */*",
          ...req.headers,
        },
        ...(req.body !== undefined ? { body: req.body } : {}),
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
      if (!followRedirects) {
        return { ok: false, status: 502, error: "外部サービスから想定外の転送が返されました。" };
      }
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
        upstreamStatus: res.status,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: 502,
        error: `外部サービスからエラーが返されました（HTTP ${res.status}）。`,
        upstreamStatus: res.status,
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

/* ================= サイトごとの取得手順 =================
 * 多くのサイトは公開 URL を 1 回 GET するだけ。認証の鍵が要るサイトや、取得できないときも 200 を返す
 * サイトはここに手順を足す。通信はすべて fetchSafeExternalUrl（名前解決の検査・大きさと時間の上限）を通す。
 */
interface FetchPlan {
  /** 本体を取る前に付ける見出し（認証など） */
  authorize?: (
    ctx: FetchContext,
    deps: ExternalImportDeps,
  ) => Promise<{ ok: true; headers: Record<string, string> } | { ok: false; status: number; error: string }>;
  /** 鍵が弾かれた（401）ときに捨てる。捨てたら 1 度だけ取り直す */
  dropAuthorization?: (deps: ExternalImportDeps) => void;
  /** 200 で返る取得失敗を本文から読む */
  bodyError?: (body: string) => string | undefined;
  /** 転送を追うか（既定は追う） */
  followRedirects?: boolean;
}

/** 期限つきの鍵を期限の少し前まで使い回す（同時の取得は 1 本にまとめる） */
export interface TokenCache {
  get: (
    now: Date,
    issue: () => Promise<{ token: string; expiresInSec: number } | null>,
  ) => Promise<string | null>;
  clear: () => void;
}

/** 期限のこの時間前には取り直す */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function createTokenCache(): TokenCache {
  let current: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string | null> | null = null;
  return {
    async get(now, issue) {
      if (current && now.getTime() < current.expiresAt - TOKEN_REFRESH_MARGIN_MS) return current.token;
      if (pending) return pending;
      const issuedAt = now.getTime();
      pending = issue()
        .then((r) => {
          current = r ? { token: r.token, expiresAt: issuedAt + r.expiresInSec * 1000 } : null;
          return r?.token ?? null;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    clear() {
      current = null;
    },
  };
}

/**
 * いあきゃら。閲覧ページ（iachara.com/view/{id}）と同じく、閲覧者用の匿名の鍵を受け取ってから API を読む。
 * 1. apiv3.iachara.com/v3/auth/guestToken で Firebase のカスタムトークンを受け取る
 * 2. Firebase Authentication で ID トークン（1 時間有効）に替える。鍵はいあきゃらのウェブ版に載っている公開の値
 * 3. /v3/charasheet/{id} を Bearer で読む（URL の解析は external-sync.ts）
 */
const IACHARA_FIREBASE_API_KEY = "AIzaSyBRP4ntIWd48qx6Liqk-1DnigSMM_xNLgs";
const IACHARA_CONNECT_ERROR = "いあきゃらに接続できませんでした。時間をおいて、もう一度お試しください。";
const defaultIacharaToken = createTokenCache();

async function issueIacharaGuestToken(
  ctx: FetchContext,
): Promise<{ ok: true; token: string; expiresInSec: number } | { ok: false; status: number; error: string }> {
  const custom = await fetchSafeExternalUrl(
    {
      url: `${IACHARA_API_ORIGIN}/v3/auth/guestToken`,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      followRedirects: false,
    },
    ctx,
  );
  if (!custom.ok)
    return custom.status === 504 ? custom : { ok: false, status: 502, error: IACHARA_CONNECT_ERROR };
  const customToken = jsonField(custom.body, "token");
  if (!customToken) return { ok: false, status: 502, error: IACHARA_CONNECT_ERROR };

  const signIn = await fetchSafeExternalUrl(
    {
      url: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${IACHARA_FIREBASE_API_KEY}`,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      followRedirects: false,
    },
    ctx,
  );
  if (!signIn.ok)
    return signIn.status === 504 ? signIn : { ok: false, status: 502, error: IACHARA_CONNECT_ERROR };
  const idToken = jsonField(signIn.body, "idToken");
  const expiresInSec = Number(jsonField(signIn.body, "expiresIn"));
  if (!idToken) return { ok: false, status: 502, error: IACHARA_CONNECT_ERROR };
  return {
    ok: true,
    token: idToken,
    expiresInSec: Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : 3600,
  };
}

function jsonField(body: string, key: string): string | undefined {
  try {
    const v = (JSON.parse(body) as Record<string, unknown> | null)?.[key];
    return typeof v === "string" && v ? v : undefined;
  } catch {
    return undefined;
  }
}

const FETCH_PLANS: Partial<Record<ExternalSyncProvider, FetchPlan>> = {
  iachara: {
    followRedirects: false,
    async authorize(ctx, deps) {
      const cache = deps.iacharaToken ?? defaultIacharaToken;
      let failure: { ok: false; status: number; error: string } | null = null;
      const token = await cache.get(ctx.now(), async () => {
        const r = await issueIacharaGuestToken(ctx);
        if (!r.ok) {
          failure = r;
          return null;
        }
        return r;
      });
      if (!token) return failure ?? { ok: false, status: 502, error: IACHARA_CONNECT_ERROR };
      return { ok: true, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } };
    },
    dropAuthorization(deps) {
      (deps.iacharaToken ?? defaultIacharaToken).clear();
    },
    bodyError: iacharaSheetError,
  },
};

export async function handleExternalImport(
  rawBody: unknown,
  deps: ExternalImportDeps = {},
): Promise<ExternalImportServerResponse> {
  const ctx: FetchContext = {
    lookupAll: deps.lookupAll ?? defaultLookupAll,
    fetchFn: deps.fetchFn ?? fetch,
    now: deps.now ?? (() => new Date()),
    maxBytes: deps.maxBytes ?? DEFAULT_MAX_BYTES,
    timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

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
  const plan: FetchPlan = FETCH_PLANS[parsedUrl.provider] ?? {};

  let lastFailure: { status: number; error: string } = {
    status: 422,
    error: "データ形式を読み取れませんでした。",
  };

  for (const targetUrl of parsedUrl.fetchUrls) {
    let fetched: SafeFetchResult | undefined;
    /* 鍵が古くて弾かれたら、1 度だけ取り直す */
    for (let attempt = 0; attempt < 2; attempt++) {
      let headers: Record<string, string> | undefined;
      if (plan.authorize) {
        const auth = await plan.authorize(ctx, deps);
        if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };
        headers = auth.headers;
      }
      fetched = await fetchSafeExternalUrl(
        { url: targetUrl, headers, followRedirects: plan.followRedirects },
        ctx,
      );
      if (!fetched.ok && fetched.upstreamStatus === 401 && plan.dropAuthorization && attempt === 0) {
        plan.dropAuthorization(deps);
        continue;
      }
      break;
    }
    if (!fetched || !fetched.ok) {
      if (fetched) lastFailure = { status: fetched.status, error: fetched.error };
      continue;
    }
    const bodyError = plan.bodyError?.(fetched.body);
    if (bodyError) {
      lastFailure = { status: 422, error: bodyError };
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
        fetchedAt: ctx.now().toISOString(),
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
