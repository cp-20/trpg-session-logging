/**
 * 卓譜の利用者の Firebase ID トークンを、firebase-admin を使わずに確かめる（/api/discord/* の Authorization: Bearer）。
 * Google が公開する securetoken の鍵（JWK）で RS256 の署名を確かめ、aud・iss・exp・iat・auth_time・sub を見る。
 * 鍵は Cache-Control の max-age のあいだ覚えておく。
 * エミュレーターのトークンは署名がない（alg: none）ので、NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true" のときだけ受け付ける。
 */

export const SECURETOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

/** iat・auth_time が少し未来でも受け付ける幅（サーバーの時計のずれ） */
const CLOCK_SKEW_S = 60;
/** 知らない kid が来たとき、鍵を取り直すのはこの間隔まで（鍵の入れ替えに追いつくため。叩かれても取りに行きすぎない） */
const MIN_REFETCH_MS = 60_000;
const DEFAULT_MAX_AGE_MS = 60 * 60_000;

interface Jwk extends JsonWebKey {
  kid?: string;
}

export interface IdTokenVerifierOptions {
  projectId: string;
  /** エミュレーターの署名のないトークンを受け付けるか */
  emulator?: boolean;
  fetchFn?: (url: string) => Promise<Response>;
  now?: () => number;
  jwksUrl?: string;
}

export interface VerifiedIdToken {
  uid: string;
  claims: Record<string, unknown>;
}

function b64urlBytes(part: string): Uint8Array<ArrayBuffer> {
  const bin = atob(
    part
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(part.length / 4) * 4, "="),
  );
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlBytes(part))) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function maxAgeMs(cacheControl: string | null): number {
  const m = /max-age=(\d+)/i.exec(cacheControl ?? "");
  return m ? Number(m[1]) * 1000 : DEFAULT_MAX_AGE_MS;
}

export function createIdTokenVerifier(opts: IdTokenVerifierOptions) {
  const fetchFn = opts.fetchFn ?? ((url: string) => fetch(url));
  const now = opts.now ?? (() => Date.now());
  const jwksUrl = opts.jwksUrl ?? SECURETOKEN_JWKS_URL;
  let keys: Map<string, Promise<CryptoKey>> = new Map();
  let expiresAt = 0;
  let fetchedAt = -Infinity;
  let inflight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    const res = await fetchFn(jwksUrl);
    if (!res.ok) throw new Error(`securetoken keys: ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const next = new Map<string, Promise<CryptoKey>>();
    for (const jwk of body.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      const { kid, ...key } = jwk;
      const imported = crypto.subtle.importKey(
        "jwk",
        { kty: key.kty, n: key.n, e: key.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      imported.catch(() => {});
      next.set(kid, imported);
    }
    keys = next;
    fetchedAt = now();
    expiresAt = fetchedAt + maxAgeMs(res.headers.get("cache-control"));
  }

  /** 一度に 1 回だけ取りに行く */
  function load(): Promise<void> {
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function keyFor(kid: string): Promise<CryptoKey | null> {
    if (now() >= expiresAt) await load();
    if (!keys.has(kid) && now() - fetchedAt >= MIN_REFETCH_MS) await load();
    const key = keys.get(kid);
    return key ? key.catch(() => null) : null;
  }

  function checkClaims(p: Record<string, unknown>): string | null {
    const t = Math.floor(now() / 1000);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const exp = num(p.exp);
    const iat = num(p.iat);
    const authTime = num(p.auth_time);
    if (p.aud !== opts.projectId) return null;
    if (p.iss !== `https://securetoken.google.com/${opts.projectId}`) return null;
    if (exp === null || exp <= t) return null;
    if (iat === null || iat > t + CLOCK_SKEW_S) return null;
    if (authTime === null || authTime > t + CLOCK_SKEW_S) return null;
    if (typeof p.sub !== "string" || p.sub.length === 0 || p.sub.length > 128) return null;
    return p.sub;
  }

  /** 正しいトークンなら uid。どこかがおかしければ null（理由は返さない） */
  return async function verify(token: string): Promise<VerifiedIdToken | null> {
    if (!opts.projectId) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts as [string, string, string];
    const header = b64urlJson(h);
    const payload = b64urlJson(p);
    if (!header || !payload) return null;
    if (header.alg === "none") {
      // Auth エミュレーターのトークン（署名は空）
      if (!opts.emulator) return null;
    } else {
      if (header.alg !== "RS256" || typeof header.kid !== "string" || !s) return null;
      let key: CryptoKey | null;
      try {
        key = await keyFor(header.kid);
      } catch {
        return null;
      }
      if (!key) return null;
      const ok = await crypto.subtle
        .verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`))
        .catch(() => false);
      if (!ok) return null;
    }
    const uid = checkClaims(payload);
    return uid ? { uid, claims: payload } : null;
  };
}
