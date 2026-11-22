import { beforeAll, describe, expect, it } from "vitest";
import { createIdTokenVerifier } from "./id-token";

const PROJECT = "takufu-app";
const NOW = Date.parse("2026-11-22T12:00:00Z");
const T = Math.floor(NOW / 1000);

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

let keyPair: CryptoKeyPair;
let otherPair: CryptoKeyPair;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const params = {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  };
  keyPair = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
  otherPair = (await crypto.subtle.generateKey(params, true, ["sign", "verify"])) as CryptoKeyPair;
  publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
});

const claims = (over: Record<string, unknown> = {}) => ({
  iss: `https://securetoken.google.com/${PROJECT}`,
  aud: PROJECT,
  sub: "u_alice",
  user_id: "u_alice",
  iat: T - 10,
  auth_time: T - 100,
  exp: T + 3000,
  ...over,
});

async function sign(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "k1", typ: "JWT" },
  key: CryptoKey = keyPair.privateKey,
): Promise<string> {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input)),
  );
  return `${input}.${b64url(sig)}`;
}

function setup(opts: { emulator?: boolean; maxAge?: number } = {}) {
  const clock = { now: NOW };
  const fetches: string[] = [];
  const verify = createIdTokenVerifier({
    projectId: PROJECT,
    emulator: opts.emulator,
    now: () => clock.now,
    fetchFn: async (url) => {
      fetches.push(url);
      return new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: "k1", alg: "RS256", use: "sig" }] }), {
        headers: { "Cache-Control": `public, max-age=${opts.maxAge ?? 3600}, must-revalidate` },
      });
    },
  });
  return { verify, clock, fetches };
}

describe("Firebase ID トークンを確かめる", () => {
  it("正しい署名と中身なら uid を返す", async () => {
    const { verify } = setup();
    expect((await verify(await sign(claims())))?.uid).toBe("u_alice");
  });

  it("宛先・発行元・期限・発行時刻・ログイン時刻・利用者が違えば断る", async () => {
    const { verify } = setup();
    for (const over of [
      { aud: "other-project" },
      { iss: "https://securetoken.google.com/other-project" },
      { exp: T },
      { exp: T - 1 },
      { iat: T + 3600 },
      { auth_time: T + 3600 },
      { auth_time: undefined },
      { sub: "" },
      { sub: 42 },
      { sub: "x".repeat(129) },
    ])
      expect(await verify(await sign(claims(over))), JSON.stringify(over)).toBeNull();
  });

  it("別の鍵の署名・知らない kid・書き換えた中身・RS256 以外は断る", async () => {
    const { verify } = setup();
    expect(await verify(await sign(claims(), undefined, otherPair.privateKey))).toBeNull();
    expect(await verify(await sign(claims(), { alg: "RS256", kid: "nope" }))).toBeNull();
    const good = await sign(claims());
    const [h, , s] = good.split(".");
    expect(await verify(`${h}.${b64url(JSON.stringify(claims({ sub: "u_mallory" })))}.${s}`)).toBeNull();
    expect(await verify(await sign(claims(), { alg: "HS256", kid: "k1" }))).toBeNull();
    expect(await verify("not-a-jwt")).toBeNull();
    expect(await verify("a.b.c")).toBeNull();
  });

  it("署名のないトークンは、エミュレーターのときだけ受け付ける", async () => {
    const unsigned = `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(claims()))}.`;
    expect(await setup().verify(unsigned)).toBeNull();
    expect((await setup({ emulator: true }).verify(unsigned))?.uid).toBe("u_alice");
    // エミュレーターでも中身は確かめる
    const wrongAud = `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims({ aud: "x" })))}.`;
    expect(await setup({ emulator: true }).verify(wrongAud)).toBeNull();
  });

  it("鍵は max-age のあいだ覚え、過ぎたら取り直す。知らない kid で取りに行きすぎない", async () => {
    const { verify, clock, fetches } = setup({ maxAge: 600 });
    const token = await sign(claims());
    await Promise.all([verify(token), verify(token), verify(token)]);
    expect(fetches).toHaveLength(1);
    await verify(await sign(claims(), { alg: "RS256", kid: "rotated" }));
    await verify(await sign(claims(), { alg: "RS256", kid: "rotated" }));
    expect(fetches).toHaveLength(1);
    clock.now += 61_000;
    await verify(await sign(claims(), { alg: "RS256", kid: "rotated" }));
    expect(fetches).toHaveLength(2);
    clock.now += 600_000;
    expect((await verify(await sign(claims({ exp: T + 5000 }))))?.uid).toBe("u_alice");
    expect(fetches).toHaveLength(3);
  });

  it("鍵を取れなければ断る（例外にしない）", async () => {
    const verify = createIdTokenVerifier({
      projectId: PROJECT,
      now: () => NOW,
      fetchFn: async () => new Response("down", { status: 503 }),
    });
    expect(await verify(await sign(claims()))).toBeNull();
  });
});
