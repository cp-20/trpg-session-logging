/**
 * POST /api/feedback: 本物の Request で呼び、状態・本文・見出しを確かめる。
 * Discord への送信は fetch を差し替え、送り元ごとの回数制限はモジュールごとに持つので、テストごとに読み直す。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOOK = "https://discord.test/hook";

async function loadPost() {
  vi.resetModules();
  return (await import("./route")).POST;
}

const send = (post: (req: Request) => Promise<Response>, body: unknown, ip = "203.0.113.1") =>
  post(
    new Request("https://takufu.test/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const valid = { kind: "idea", body: "ダイスの色を変えたい" };
let webhook: ReturnType<typeof vi.fn>;

beforeEach(() => {
  webhook = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", webhook);
  vi.stubEnv("DISCORD_FEEDBACK_WEBHOOK_URL", HOOK);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("POST /api/feedback", () => {
  it("正しい内容なら 200 と ok を返し、使い回させない", async () => {
    const POST = await loadPost();

    const res = await send(POST, valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("正しい内容なら、環境変数の送り先に届ける", async () => {
    const POST = await loadPost();

    await send(POST, valid);

    expect(webhook).toHaveBeenCalledWith(HOOK, expect.objectContaining({ method: "POST" }));
  });

  it("JSON として読めない本文なら 400 を返す", async () => {
    const POST = await loadPost();

    const res = await send(POST, "{bad json");

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "リクエスト形式が正しくありません。" });
  });

  it("内容が空なら 400 と理由を返す", async () => {
    const POST = await loadPost();

    const res = await send(POST, { kind: "idea", body: "  " });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "内容を書いてください。" });
  });

  it("送り先が設定されていなければ 503 を返す", async () => {
    vi.stubEnv("DISCORD_FEEDBACK_WEBHOOK_URL", "");
    const POST = await loadPost();

    const res = await send(POST, valid);

    expect(res.status).toBe(503);
  });

  it("送り先が失敗したら 502 を返し、送り先の URL は本文に出さない", async () => {
    webhook.mockResolvedValue(new Response("no", { status: 500 }));
    const POST = await loadPost();

    const res = await send(POST, valid);

    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(HOOK);
  });
});

describe("POST /api/feedback の回数制限", () => {
  it("同じ送り元から 10 分に 5 件までは受け付ける", async () => {
    const POST = await loadPost();

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await send(POST, valid)).status);

    expect(statuses).toEqual([200, 200, 200, 200, 200]);
  });

  it("同じ送り元から 10 分に 6 件目は 429 を返し、送らない", async () => {
    const POST = await loadPost();
    for (let i = 0; i < 5; i++) await send(POST, valid);
    webhook.mockClear();

    const res = await send(POST, valid);

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false });
    expect(webhook).not.toHaveBeenCalled();
  });

  it("ほかの送り元は、別の送り元が上限に達していても受け付ける", async () => {
    const POST = await loadPost();
    for (let i = 0; i < 5; i++) await send(POST, valid, "203.0.113.1");

    const res = await send(POST, valid, "198.51.100.7");

    expect(res.status).toBe(200);
  });

  it("x-forwarded-for の先頭の値を送り元として数える", async () => {
    const POST = await loadPost();
    for (let i = 0; i < 5; i++) await send(POST, valid, "203.0.113.1");

    const res = await send(POST, valid, " 203.0.113.1 , 10.0.0.1");

    expect(res.status).toBe(429);
  });

  it("読めない本文の送信も回数に数える", async () => {
    const POST = await loadPost();
    for (let i = 0; i < 5; i++) await send(POST, "{bad json");

    const res = await send(POST, valid);

    expect(res.status).toBe(429);
  });

  it("上限に達しても、10 分経てばまた受け付ける", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T00:00:00Z"));
    const POST = await loadPost();
    for (let i = 0; i < 5; i++) await send(POST, valid);

    vi.setSystemTime(new Date("2026-11-26T00:10:00Z"));
    const res = await send(POST, valid);

    expect(res.status).toBe(200);
  });

  it("上限に達したら、10 分経つ 1 ミリ秒前まではまだ断る", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T00:00:00Z"));
    const POST = await loadPost();
    for (let i = 0; i < 5; i++) await send(POST, valid);

    vi.setSystemTime(new Date("2026-11-26T00:09:59.999Z"));
    const res = await send(POST, valid);

    expect(res.status).toBe(429);
  });
});
