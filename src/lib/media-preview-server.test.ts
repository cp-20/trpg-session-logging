import { describe, expect, it } from "vitest";
import { handleMediaPreview } from "./media-preview-server";

const oembed = JSON.stringify({
  author_name: "みかん",
  author_url: "https://x.com/takufu_gm",
  html: '<blockquote><p lang="ja">卓報告です</p>&mdash; みかん</blockquote>',
});

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    return respond(url, init ?? {});
  }) as typeof fetch;
  return { fn, calls };
}

describe("handleMediaPreview", () => {
  it("固定の問い合わせ先にだけ、転送を追わず・素性を付けずに出る", async () => {
    const { fn, calls } = fakeFetch(() => new Response(oembed, { status: 200 }));
    const r = await handleMediaPreview("https://twitter.com/takufu_gm/status/1", {
      fetchFn: fn,
      cache: new Map(),
    });
    expect(r).toEqual({
      ok: true,
      preview: { service: "x", title: "卓報告です", author: "みかん @takufu_gm", excerpt: "卓報告です" },
    });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).hostname).toBe("publish.x.com");
    expect(calls[0]!.init.redirect).toBe("manual");
    expect(calls[0]!.init.credentials).toBe("omit");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("cookie");
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("x-forwarded-for");
  });

  it("対応外の URL は外へ出ない", async () => {
    const { fn, calls } = fakeFetch(() => new Response("{}"));
    for (const raw of [
      null,
      "https://evil.example/a",
      "http://x.com/a/status/1",
      `https://x.com/a/status/1?${"a".repeat(3000)}`,
    ]) {
      const r = await handleMediaPreview(raw, { fetchFn: fn, cache: new Map() });
      expect(r.ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it("転送は追わない", async () => {
    const { fn, calls } = fakeFetch(
      () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
    );
    const r = await handleMediaPreview("https://fusetter.com/tw/abc12", { fetchFn: fn, cache: new Map() });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(calls).toHaveLength(1);
  });

  it("大きすぎる応答は読まない", async () => {
    const big = new Response("x".repeat(2000), { status: 200 });
    const { fn } = fakeFetch(() => big);
    const r = await handleMediaPreview("https://fusetter.com/tw/abc12", {
      fetchFn: fn,
      maxBytes: 1000,
      cache: new Map(),
    });
    expect(r).toMatchObject({ ok: false, status: 502 });
  });

  it("時間切れは 504", async () => {
    const { fn } = fakeFetch((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
      });
    });
    const r = await handleMediaPreview("https://nico.ms/sm1", {
      fetchFn: fn,
      timeoutMs: 10,
      cache: new Map(),
    });
    expect(r).toMatchObject({ ok: false, status: 504 });
  });

  it("結果はしばらく覚え、見つからないものも覚える。相手の不調は覚えない", async () => {
    const cache = new Map();
    let t = 0;
    const { fn, calls } = fakeFetch((url) =>
      url.includes("status%2F1")
        ? new Response(oembed)
        : url.includes("status%2F2")
          ? new Response("", { status: 404 })
          : new Response("", { status: 503 }),
    );
    const deps = { fetchFn: fn, cache, now: () => t };
    await handleMediaPreview("https://x.com/a/status/1", deps);
    await handleMediaPreview("https://x.com/b/status/1", deps);
    expect(calls).toHaveLength(1);
    expect(await handleMediaPreview("https://x.com/a/status/2", deps)).toMatchObject({
      ok: false,
      status: 404,
    });
    await handleMediaPreview("https://x.com/a/status/2", deps);
    expect(calls).toHaveLength(2);
    expect(await handleMediaPreview("https://x.com/a/status/3", deps)).toMatchObject({
      ok: false,
      status: 502,
    });
    await handleMediaPreview("https://x.com/a/status/3", deps);
    expect(calls).toHaveLength(4);
    t = 11 * 60 * 1000;
    await handleMediaPreview("https://x.com/a/status/1", deps);
    expect(calls).toHaveLength(5);
  });
});

describe("YouTube の配信の開始時刻と長さ", () => {
  const watchHtml = (meta: string) =>
    `<html><body>${"x".repeat(50_000)}<meta itemprop="genre" content="Gaming">` +
    `<span itemprop="publication" itemscope itemtype="http://schema.org/BroadcastEvent">${meta}</span>` +
    `${"y".repeat(3000)}<script>${"z".repeat(500_000)}</script></body></html>`;
  const oembedYt = JSON.stringify({ title: "【CoC】深淵の呼び声", author_name: "みかん" });

  it("oEmbed の題名に、動画のページから読んだ開始時刻と長さを足す", async () => {
    const { fn, calls } = fakeFetch((url) =>
      url.includes("/oembed")
        ? new Response(oembedYt)
        : new Response(
            watchHtml(
              '<meta itemprop="isLiveBroadcast" content="True"><meta itemprop="startDate" content="2026-11-20T12:00:56+00:00"><meta itemprop="endDate" content="2026-11-20T15:00:56+00:00">',
            ),
          ),
    );
    const r = await handleMediaPreview("https://youtu.be/abcdefghijk", { fetchFn: fn, cache: new Map() });
    expect(r).toEqual({
      ok: true,
      preview: {
        service: "youtube",
        title: "【CoC】深淵の呼び声",
        author: "みかん",
        startedAt: Math.floor(Date.parse("2026-11-20T12:00:56Z") / 1000),
        durationSec: 3 * 3600,
      },
    });
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(["www.youtube.com", "www.youtube.com"]);
    expect(calls[1]!.url).toBe("https://www.youtube.com/watch?v=abcdefghijk");
    expect(calls[1]!.init.redirect).toBe("manual");
  });

  it("動画のページが読めなくても題名は返す", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("/oembed") ? new Response(oembedYt) : new Response("", { status: 500 }),
    );
    const r = await handleMediaPreview("https://youtu.be/abcdefghijk", { fetchFn: fn, cache: new Map() });
    expect(r).toEqual({
      ok: true,
      preview: { service: "youtube", title: "【CoC】深淵の呼び声", author: "みかん" },
    });
  });

  it("上限まで読んでも構造化データがなければ何も足さない", async () => {
    const { fn } = fakeFetch((url) =>
      url.includes("/oembed") ? new Response(oembedYt) : new Response("a".repeat(100_000)),
    );
    const r = await handleMediaPreview("https://youtu.be/abcdefghijk", {
      fetchFn: fn,
      cache: new Map(),
      timingMaxBytes: 10_000,
    });
    expect(r).toMatchObject({ ok: true, preview: { title: "【CoC】深淵の呼び声" } });
    expect((r as { preview: object }).preview).not.toHaveProperty("startedAt");
  });
});
