import { describe, expect, it } from "vitest";
import { MAX_SIGNATURE_SKEW_SECONDS, verifyDiscordSignature } from "./verify";

const hex = (b: ArrayBuffer) => Buffer.from(b).toString("hex");

async function keypair() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const sign = async (timestamp: string, body: string) =>
    hex(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(timestamp + body)));
  return { publicKey, sign };
}

describe("verifyDiscordSignature", () => {
  const now = 1_800_000_000;
  const ts = String(now);
  const body = JSON.stringify({ type: 1 });

  it("正しい鍵で署名した要求を通す", async () => {
    const { publicKey, sign } = await keypair();
    const signature = await sign(ts, body);
    expect(await verifyDiscordSignature({ publicKey, signature, timestamp: ts, body, nowSeconds: now })).toBe(
      true,
    );
  });

  it("本文・時刻を変えた要求、別の鍵の署名を拒む", async () => {
    const { publicKey, sign } = await keypair();
    const other = await keypair();
    const signature = await sign(ts, body);
    expect(
      await verifyDiscordSignature({
        publicKey,
        signature,
        timestamp: ts,
        body: body + " ",
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      await verifyDiscordSignature({
        publicKey,
        signature,
        timestamp: String(now + 1),
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      await verifyDiscordSignature({
        publicKey: other.publicKey,
        signature,
        timestamp: ts,
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
  });

  it("古い時刻（再送）を拒む", async () => {
    const { publicKey, sign } = await keypair();
    const old = String(now - MAX_SIGNATURE_SKEW_SECONDS - 1);
    const signature = await sign(old, body);
    expect(
      await verifyDiscordSignature({ publicKey, signature, timestamp: old, body, nowSeconds: now }),
    ).toBe(false);
  });

  it("壊れた値（ヘッダーなし・16 進でない・長さ違い）を拒む", async () => {
    const { publicKey, sign } = await keypair();
    const signature = await sign(ts, body);
    const base = { publicKey, signature, timestamp: ts, body, nowSeconds: now };
    expect(await verifyDiscordSignature({ ...base, signature: null })).toBe(false);
    expect(await verifyDiscordSignature({ ...base, timestamp: null })).toBe(false);
    expect(await verifyDiscordSignature({ ...base, timestamp: "abc" })).toBe(false);
    expect(await verifyDiscordSignature({ ...base, signature: "zz" + signature.slice(2) })).toBe(false);
    expect(await verifyDiscordSignature({ ...base, signature: signature.slice(0, 64) })).toBe(false);
    expect(await verifyDiscordSignature({ ...base, publicKey: "00" })).toBe(false);
    expect(await verifyDiscordSignature({ ...base, publicKey: "" })).toBe(false);
  });
});
