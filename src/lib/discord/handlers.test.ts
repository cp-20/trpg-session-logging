import { describe, expect, it, vi } from "vitest";
import { interactions, oauthCallback, oauthStart, table, type HandlerDeps } from "./handlers";
import { OAUTH_COOKIE } from "./links";
import { makeCtx } from "./testkit";

const hex = (b: ArrayBuffer) => Buffer.from(b).toString("hex");

async function signed(ctx: ReturnType<typeof makeCtx>, body: unknown) {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  ctx.ctx.config.publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  const text = JSON.stringify(body);
  const ts = String(Math.floor(ctx.clock.now / 1000));
  const sig = hex(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(ts + text)));
  return { text, ts, sig };
}

function deps(t: ReturnType<typeof makeCtx>, uid: string | null = "u_owner") {
  const after: (() => Promise<void>)[] = [];
  const d: HandlerDeps = { ctx: () => t.ctx, verifyUser: async () => uid, after: (w) => void after.push(w) };
  return { d, after };
}

describe("POST /api/discord/interactions", () => {
  it("署名を確かめ、PING に PONG を返す", async () => {
    const t = makeCtx();
    const { text, ts, sig } = await signed(t, { id: "1", application_id: "a", type: 1, token: "" });
    const req = (s: string) =>
      new Request("https://x/api/discord/interactions", {
        method: "POST",
        headers: { "X-Signature-Ed25519": s, "X-Signature-Timestamp": ts },
        body: text,
      });
    expect(await (await interactions(req(sig), deps(t).d)).json()).toEqual({ type: 1 });
    expect((await interactions(req("00".repeat(64)), deps(t).d)).status).toBe(401);
  });

  it("遅らせた返事の続きは、返事のあとで行う", async () => {
    const t = makeCtx();
    const { text, ts, sig } = await signed(t, {
      id: "1",
      application_id: "a",
      type: 2,
      token: "tok",
      guild_id: "g",
      channel_id: "c",
      member: { user: { id: "d" } },
      data: { name: "schedule" },
    });
    const { d, after } = deps(t);
    const res = await interactions(
      new Request("https://x", {
        method: "POST",
        headers: { "X-Signature-Ed25519": sig, "X-Signature-Timestamp": ts },
        body: text,
      }),
      d,
    );
    expect((await res.json()).type).toBe(5);
    expect(t.rest.calls).toHaveLength(0);
    await after[0]!();
    expect(t.rest.calls.map((c) => c.op)).toEqual(["editOriginal"]);
  });

  it("設定がなければ 503", async () => {
    const res = await interactions(new Request("https://x", { method: "POST", body: "{}" }), {
      ctx: () => null,
      verifyUser: async () => null,
      after: () => {},
    });
    expect(res.status).toBe(503);
  });
});

describe("利用者をつなぐ", () => {
  it("ログインしていなければ 401。始めると合言葉を HttpOnly の Cookie に置く", async () => {
    const t = makeCtx();
    expect((await oauthStart(new Request("https://x", { method: "POST" }), deps(t, null).d)).status).toBe(
      401,
    );
    const res = await oauthStart(new Request("https://x", { method: "POST" }), deps(t).d);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(new RegExp(`^${OAUTH_COOKIE}=token0+1;`));
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect((await res.json()).url).toContain("discord.com/oauth2/authorize");
  });

  it("戻り先は結果を付けて設定に送り、Cookie を消す", async () => {
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith("/users/@me")
        ? Response.json({ id: "123456789", username: "a" })
        : Response.json({ access_token: "at" }),
    );
    const t = makeCtx({ fetchFn });
    const start = await oauthStart(new Request("https://x", { method: "POST" }), deps(t).d);
    const state = /=([^;]+)/.exec(start.headers.get("set-cookie")!)![1];
    const res = await oauthCallback(
      new Request(`https://x/api/discord/oauth/callback?code=c&state=${state}`, {
        headers: { cookie: `${OAUTH_COOKIE}=${state}` },
      }),
      deps(t).d,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://takufu.test/settings?discord=linked");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    const forged = await oauthCallback(new Request(`https://x/cb?code=c&state=${state}`), deps(t).d);
    expect(forged.headers.get("location")).toBe("https://takufu.test/settings?discord=expired");
  });
});

describe("POST /api/discord/table", () => {
  it("形の正しくない要求は 400", async () => {
    const t = makeCtx();
    const res = await table(
      new Request("https://x", {
        method: "POST",
        body: JSON.stringify({ action: "link", code: "short", tableId: "t" }),
      }),
      deps(t).d,
    );
    expect(res.status).toBe(400);
  });

  it("つないでいない卓でも、ボットを入れる URL を返す", async () => {
    const t = makeCtx();
    const res = await table(
      new Request("https://x", { method: "POST", body: JSON.stringify({ action: "status", tableId: "t1" }) }),
      deps(t).d,
    );
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, linked: false });
    expect(body.installUrl).toContain("client_id=app1");
  });
});

describe("眠っていた間のお知らせを取り戻す（wake）", () => {
  it("署名の合った Discord の要求と、ログインした利用者の要求で起こす", async () => {
    const t = makeCtx();
    const wake = vi.fn();
    const { text, ts, sig } = await signed(t, { id: "1", application_id: "a", type: 1, token: "" });
    const req = (s: string) =>
      new Request("https://x", {
        method: "POST",
        headers: { "X-Signature-Ed25519": s, "X-Signature-Timestamp": ts },
        body: text,
      });
    await interactions(req("00".repeat(64)), { ...deps(t).d, wake });
    expect(wake).not.toHaveBeenCalled();
    await interactions(req(sig), { ...deps(t).d, wake });
    expect(wake).toHaveBeenCalledTimes(1);
    const status = () =>
      new Request("https://x", { method: "POST", body: JSON.stringify({ action: "status", tableId: "t1" }) });
    await table(status(), { ...deps(t, null).d, wake });
    expect(wake).toHaveBeenCalledTimes(1);
    await table(status(), { ...deps(t).d, wake });
    expect(wake).toHaveBeenCalledTimes(2);
  });
});
