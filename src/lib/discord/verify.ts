/**
 * Discord の Interactions Endpoint に届いた要求の署名を確かめる（Ed25519、WebCrypto）。
 * 署名は `X-Signature-Timestamp` + 本文（生のまま）に対するもの。古い時刻の要求は再送攻撃として拒む。
 */

/** 署名の時刻がこれより古い・新しい要求は受け付けない（秒） */
export const MAX_SIGNATURE_SKEW_SECONDS = 5 * 60;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importPublicKey(publicKeyHex: string): Promise<CryptoKey> | null {
  const raw = hexToBytes(publicKeyHex);
  if (!raw || raw.length !== 32) return null;
  let key = keyCache.get(publicKeyHex);
  if (!key) {
    key = crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, ["verify"]);
    keyCache.set(publicKeyHex, key);
  }
  return key;
}

export async function verifyDiscordSignature(input: {
  publicKey: string;
  signature: string | null;
  timestamp: string | null;
  body: string;
  nowSeconds?: number;
}): Promise<boolean> {
  const { publicKey, signature, timestamp, body } = input;
  if (!publicKey || !signature || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > MAX_SIGNATURE_SKEW_SECONDS) return false;
  const sig = hexToBytes(signature);
  if (!sig || sig.length !== 64) return false;
  const key = importPublicKey(publicKey);
  if (!key) return false;
  try {
    return await crypto.subtle.verify("Ed25519", await key, sig, new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}
