import dns from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { handleExternalImport } from "../../../../lib/external-import-server";
import { POST } from "./route";

describe("POST /api/import/external + handleExternalImport 結合テスト", () => {
  const publicDns = async () => [{ address: "93.184.216.34" }];

  it("route handler は不正 JSON・非 HTTPS・プライベート IP・DNS 未検出への SSRF を拒否する", async () => {
    const badJson = await POST(
      new Request("https://takufu.example/api/import/external", {
        method: "POST",
        body: "{bad json",
      }),
    );
    expect(badJson.status).toBe(400);

    const httpOnly = await POST(
      new Request("https://takufu.example/api/import/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "http://iachara.com/view/123" }),
      }),
    );
    expect(httpOnly.status).toBe(400);

    expect(await handleExternalImport(null, { lookupAll: publicDns })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await handleExternalImport([{ url: "https://iachara.com/view/1" }], { lookupAll: publicDns }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(await handleExternalImport({ url: 123 }, { lookupAll: publicDns })).toMatchObject({
      ok: false,
      status: 400,
    });

    const emptyDns = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      { lookupAll: async () => [] },
    );
    expect(emptyDns).toMatchObject({ ok: false, status: 400 });

    const blankAddrDns = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      { lookupAll: async () => [{ address: "" }] },
    );
    expect(blankAddrDns).toMatchObject({ ok: false, status: 400 });

    const dnsThrow = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      {
        lookupAll: async () => {
          throw new Error("ENOTFOUND");
        },
      },
    );
    expect(dnsThrow).toMatchObject({ ok: false, status: 502 });
    if (!dnsThrow.ok) expect(dnsThrow.error).toContain("名前解決");

    const mixedDns = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      { lookupAll: async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }] },
    );
    expect(mixedDns).toMatchObject({ ok: false, status: 400 });
    if (!mixedDns.ok) expect(mixedDns.error).toContain("許可されていません");

    const privateDns = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      { lookupAll: async () => [{ address: "127.0.0.1" }] },
    );
    expect(privateDns).toMatchObject({ ok: false, status: 400 });
    if (!privateDns.ok) expect(privateDns.error).toContain("許可されていません");

    const metadataDns = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      { lookupAll: async () => [{ address: "169.254.169.254" }] },
    );
    expect(metadataDns).toMatchObject({ ok: false, status: 400 });
  });

  it("許可されていないリダイレクト・欠落 Location・リダイレクト過多を拒否し、許可先への相対リダイレクトのみ通す", async () => {
    const disallowed = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () =>
          new Response(null, { status: 300, headers: { Location: "https://evil.example.com/secret" } }),
      },
    );
    expect(disallowed).toMatchObject({ ok: false, status: 400 });
    if (!disallowed.ok) expect(disallowed.error).toContain("拒否されました");

    const badRedirectLoc = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () => new Response(null, { status: 302, headers: { Location: "http://[invalid" } }),
      },
    );
    expect(badRedirectLoc).toMatchObject({ ok: false, status: 502 });
    if (!badRedirectLoc.ok) expect(badRedirectLoc.error).toContain("リダイレクト先が不正");

    // 300 未満ではない 299 や、Location がない non-redirect 400 (Location ヘッダ付き) の境界検証
    const r400WithLoc = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      {
        lookupAll: publicDns,
        fetchFn: async () =>
          new Response("bad req", { status: 400, headers: { Location: "https://iachara.com/view/2" } }),
      },
    );
    expect(r400WithLoc).toMatchObject({ ok: false, status: 502 });

    const missingLoc = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () => new Response(null, { status: 301 }),
      },
    );
    expect(missingLoc).toMatchObject({ ok: false, status: 502 });
    if (!missingLoc.ok) expect(missingLoc.error).toContain("リダイレクト先が不明");

    let hops = 0;
    const tooMany = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () => {
          hops++;
          return new Response(null, {
            status: 302,
            headers: { Location: "https://iachara.com/view/123" },
          });
        },
      },
    );
    expect(tooMany).toMatchObject({ ok: false, status: 502 });
    if (!tooMany.ok) expect(tooMany.error).toContain("上限を超えました");
    expect(hops).toBe(4);

    let step = 0;
    const relativeOk = await handleExternalImport(
      { url: "https://iachara.com/view/123" },
      {
        lookupAll: publicDns,
        fetchFn: async (input, init) => {
          step++;
          expect(init?.redirect).toBe("manual");
          expect(init?.headers).toMatchObject({
            "User-Agent": expect.stringContaining("TakufuImporter"),
            Accept: expect.stringContaining("application/json"),
          });
          if (step === 1) {
            expect(init?.method).toBe("GET");
            expect(String(input)).toBe("https://iachara.com/view/123");
            return new Response(null, { status: 302, headers: { Location: "/char/view/456" } });
          }
          expect(String(input)).toBe("https://iachara.com/char/view/456");
          return new Response(JSON.stringify({ data: { name: "移動後キャラ", san: 60 } }), { status: 200 });
        },
      },
    );
    expect(relativeOk.ok).toBe(true);
    if (relativeOk.ok && relativeOk.kind === "character") {
      expect(relativeOk.character.name).toBe("移動後キャラ");
    }
  });

  it("HTTP ステータスエラー・タイムアウト・ネットワーク失敗・サイズ超過・フォールバックを適切に処理する", async () => {
    for (const status of [401, 403, 404]) {
      const r = await handleExternalImport(
        { url: "https://iachara.com/view/1" },
        { lookupAll: publicDns, fetchFn: async () => new Response("nope", { status }) },
      );
      expect(r).toMatchObject({ ok: false, status: 422 });
      if (!r.ok) expect(r.error).toContain("非公開");
    }

    const r400 = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response("bad req", { status: 400 }) },
    );
    expect(r400).toMatchObject({ ok: false, status: 502 });

    const r500 = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response("err", { status: 500 }) },
    );
    expect(r500).toMatchObject({ ok: false, status: 502 });
    if (!r500.ok) expect(r500.error).toContain("HTTP 500");

    const timeoutRes = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      {
        lookupAll: publicDns,
        fetchFn: async () => {
          const e = new Error("timed out");
          e.name = "TimeoutError";
          throw e;
        },
      },
    );
    expect(timeoutRes).toMatchObject({ ok: false, status: 504 });
    if (!timeoutRes.ok) expect(timeoutRes.error).toContain("タイムアウト");

    const abortRes = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      {
        lookupAll: publicDns,
        fetchFn: async () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          throw e;
        },
      },
    );
    expect(abortRes).toMatchObject({ ok: false, status: 504 });
    if (!abortRes.ok) expect(abortRes.error).toContain("タイムアウト");

    const netErr = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      {
        lookupAll: publicDns,
        fetchFn: async () => {
          throw new Error("ECONNRESET");
        },
      },
    );
    expect(netErr).toMatchObject({ ok: false, status: 502 });
    if (!netErr.ok) expect(netErr.error).toContain("接続できませんでした");

    const streamReadErr = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      {
        lookupAll: publicDns,
        fetchFn: async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(ctrl) {
                ctrl.error(new Error("STREAM_BROKEN"));
              },
            }),
            { status: 200 },
          ),
      },
    );
    expect(streamReadErr).toMatchObject({ ok: false, status: 502 });
    if (!streamReadErr.ok) expect(streamReadErr.error).toContain("読み取りに失敗");

    // ストリーミングサイズ超過 (413)
    const bigStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new Uint8Array(60));
        ctrl.enqueue(new Uint8Array(60));
        ctrl.close();
      },
    });
    const tooLarge = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      { lookupAll: publicDns, maxBytes: 100, fetchFn: async () => new Response(bigStream, { status: 200 }) },
    );
    expect(tooLarge).toMatchObject({ ok: false, status: 413 });
    if (!tooLarge.ok) expect(tooLarge.error).toContain("大きすぎます");

    // res.body が null (Response(null, { status: 200 })) でも res.text() フォールバックで動く
    const nullBodyRes = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response(null, { status: 200 }) },
    );
    expect(nullBodyRes).toMatchObject({ ok: false, status: 422 });
    if (!nullBodyRes.ok) expect(nullBodyRes.error).toContain("読み取れませんでした");

    // ストリーム分割でちょうど maxBytes 以内なら複数チャンク結合に成功する
    const validBytes = new TextEncoder().encode(JSON.stringify({ data: { name: "分割", san: 55 } }));
    const half = Math.floor(validBytes.length / 2);
    const chunkedOkStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(validBytes.slice(0, half));
        ctrl.enqueue(validBytes.slice(half));
        ctrl.close();
      },
    });
    const chunkedRes = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      {
        lookupAll: publicDns,
        maxBytes: validBytes.length,
        fetchFn: async () => new Response(chunkedOkStream, { status: 200 }),
      },
    );
    expect(chunkedRes.ok).toBe(true);

    // パース不能ボディ (422)
    const unparseable = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response("invalid body", { status: 200 }) },
    );
    expect(unparseable).toMatchObject({ ok: false, status: 422 });
    if (!unparseable.ok) expect(unparseable.error).toContain("読み取れませんでした");

    // 非オブジェクト入力・undefined 入力も 400
    for (const badInput of [undefined, "https://iachara.com/view/1"]) {
      const r = await handleExternalImport(badInput, { lookupAll: publicDns });
      expect(r).toMatchObject({ ok: false, status: 400 });
      if (!r.ok) expect(r.error).toContain("URL を指定");
    }

    // reader の empty value チャンク・releaseLock()・UTF-8 不正バイト列への耐性と defaultLookupAll (dns.lookup) 呼び出し
    let releaseOkCount = 0;
    const validBytesWithBadUtf8 = new TextEncoder().encode(
      JSON.stringify({ data: { name: "ストリーム", san: 55, memo: "A" } }),
    );
    // 文字列値内の A (0x41) を不正 UTF-8 バイト 0xff へ置換しても置換文字として復号でき、JSON として有効
    const aIdx = validBytesWithBadUtf8.lastIndexOf(0x41);
    if (aIdx >= 0) validBytesWithBadUtf8[aIdx] = 0xff;
    const customReaderRes = {
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      body: {
        getReader() {
          let readStep = 0;
          return {
            async read() {
              readStep++;
              if (readStep === 1) return { done: false, value: undefined };
              if (readStep === 2) return { done: false, value: validBytesWithBadUtf8 };
              return { done: true, value: undefined };
            },
            releaseLock() {
              releaseOkCount++;
            },
          };
        },
      },
    } as unknown as Response;

    const lookupSpy = vi
      .spyOn(dns, "lookup")
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    try {
      const dnsDefaultRes = await handleExternalImport(
        { url: "https://iachara.com/view/1" },
        { fetchFn: async () => customReaderRes },
      );
      expect(lookupSpy).toHaveBeenCalledWith("iachara.com", { all: true });
      expect(releaseOkCount).toBe(1);
      expect(dnsDefaultRes.ok).toBe(true);
      if (dnsDefaultRes.ok && dnsDefaultRes.kind === "character") {
        expect(dnsDefaultRes.character.name).toBe("ストリーム");
        expect(dnsDefaultRes.character.memo).toBe("\uFFFD");
      }
    } finally {
      lookupSpy.mockRestore();
    }

    let releaseErrCount = 0;
    const oversizeCustomRes = {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: {
        getReader() {
          return {
            async read() {
              return { done: false, value: new Uint8Array(50) };
            },
            releaseLock() {
              releaseErrCount++;
            },
          };
        },
      },
    } as unknown as Response;
    const releaseErrRes = await handleExternalImport(
      { url: "https://iachara.com/view/1" },
      { lookupAll: publicDns, maxBytes: 10, fetchFn: async () => oversizeCustomRes },
    );
    expect(releaseErrRes).toMatchObject({ ok: false, status: 413 });
    expect(releaseErrCount).toBe(1);
  });

  it("いあきゃら HTML (__NEXT_DATA__) と BOOTH .json 失敗時の HTML フォールバックを処理する", async () => {
    const html = `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
      {
        props: {
          pageProps: {
            character: {
              name: "月城 朔",
              occupation: "民俗学者",
              system: "クトゥルフ7版",
              abilities: [
                { label: "STR", value: 55 },
                { label: "SAN", value: 62 },
                { label: "HP", value: 12 },
                { label: "MP", value: 14 },
              ],
              skills: [{ name: "図書館", total: 80 }],
              memo: "古い文献を集めている。",
            },
          },
        },
      },
    )}</script></body></html>`;

    const res = await handleExternalImport(
      { url: "https://iachara.com/view/987654" },
      {
        lookupAll: publicDns,
        now: () => new Date("2026-11-20T07:00:00.000Z"),
        fetchFn: async () => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }),
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === "character") {
      expect(res.fetchedAt).toBe("2026-11-20T07:00:00.000Z");
      expect(res.character.name).toBe("月城 朔");
      expect(res.character.stats).toMatchObject({ str: 55, san: 62, 図書館: 80 });
    }

    // BOOTH .json が 404 でも 2 番目の HTML URL へフォールバックして取得できる
    const boothFallback = await handleExternalImport(
      { url: "https://booth.pm/ja/items/555123" },
      {
        lookupAll: publicDns,
        fetchFn: async (input) => {
          if (String(input).endsWith(".json")) return new Response("not found", { status: 404 });
          return new Response(
            `<html><head><meta property="og:title" content="フォールバック作品 - 堂 - BOOTH"/></head></html>`,
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        },
      },
    );
    expect(boothFallback.ok).toBe(true);
    if (boothFallback.ok && boothFallback.kind === "scenario") {
      expect(boothFallback.scenario.title).toBe("フォールバック作品");
      expect(boothFallback.scenario.author).toBe("堂");
    }
  });
});
