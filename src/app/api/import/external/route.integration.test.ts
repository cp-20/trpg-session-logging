import dns from "node:dns/promises";
import { describe, expect, it, vi } from "vitest";
import { createTokenCache, handleExternalImport } from "../../../../lib/external-import-server";
import sheet7th from "../../../../lib/__fixtures__/iachara-7th.json";
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
        body: JSON.stringify({ url: "http://charasheet.vampire-blood.net/123" }),
      }),
    );
    expect(httpOnly.status).toBe(400);

    expect(await handleExternalImport(null, { lookupAll: publicDns })).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await handleExternalImport([{ url: "https://charasheet.vampire-blood.net/1" }], {
        lookupAll: publicDns,
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(await handleExternalImport({ url: 123 }, { lookupAll: publicDns })).toMatchObject({
      ok: false,
      status: 400,
    });

    const emptyDns = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      { lookupAll: async () => [] },
    );
    expect(emptyDns).toMatchObject({ ok: false, status: 400 });

    const blankAddrDns = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      { lookupAll: async () => [{ address: "" }] },
    );
    expect(blankAddrDns).toMatchObject({ ok: false, status: 400 });

    const dnsThrow = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      {
        lookupAll: async () => {
          throw new Error("ENOTFOUND");
        },
      },
    );
    expect(dnsThrow).toMatchObject({ ok: false, status: 502 });
    if (!dnsThrow.ok) expect(dnsThrow.error).toContain("名前解決");

    const mixedDns = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      { lookupAll: async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }] },
    );
    expect(mixedDns).toMatchObject({ ok: false, status: 400 });
    if (!mixedDns.ok) expect(mixedDns.error).toContain("許可されていません");

    const privateDns = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      { lookupAll: async () => [{ address: "127.0.0.1" }] },
    );
    expect(privateDns).toMatchObject({ ok: false, status: 400 });
    if (!privateDns.ok) expect(privateDns.error).toContain("許可されていません");

    const metadataDns = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      { lookupAll: async () => [{ address: "169.254.169.254" }] },
    );
    expect(metadataDns).toMatchObject({ ok: false, status: 400 });
  });

  it("許可されていないリダイレクト・欠落 Location・リダイレクト過多を拒否し、許可先への相対リダイレクトのみ通す", async () => {
    const disallowed = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () =>
          new Response(null, { status: 300, headers: { Location: "https://evil.example.com/secret" } }),
      },
    );
    expect(disallowed).toMatchObject({ ok: false, status: 400 });
    if (!disallowed.ok) expect(disallowed.error).toContain("拒否されました");

    const badRedirectLoc = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () => new Response(null, { status: 302, headers: { Location: "http://[invalid" } }),
      },
    );
    expect(badRedirectLoc).toMatchObject({ ok: false, status: 502 });
    if (!badRedirectLoc.ok) expect(badRedirectLoc.error).toContain("リダイレクト先が不正");

    // 300 未満ではない 299 や、Location がない non-redirect 400 (Location ヘッダ付き) の境界検証
    const r400WithLoc = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
      {
        lookupAll: publicDns,
        fetchFn: async () =>
          new Response("bad req", {
            status: 400,
            headers: { Location: "https://charasheet.vampire-blood.net/2.js" },
          }),
      },
    );
    expect(r400WithLoc).toMatchObject({ ok: false, status: 502 });

    const missingLoc = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () => new Response(null, { status: 301 }),
      },
    );
    expect(missingLoc).toMatchObject({ ok: false, status: 502 });
    if (!missingLoc.ok) expect(missingLoc.error).toContain("リダイレクト先が不明");

    let hops = 0;
    const tooMany = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
      {
        lookupAll: publicDns,
        fetchFn: async () => {
          hops++;
          return new Response(null, {
            status: 302,
            headers: { Location: "https://charasheet.vampire-blood.net/123.js" },
          });
        },
      },
    );
    expect(tooMany).toMatchObject({ ok: false, status: 502 });
    if (!tooMany.ok) expect(tooMany.error).toContain("上限を超えました");
    expect(hops).toBe(4);

    let step = 0;
    const relativeOk = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/123" },
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
            expect(String(input)).toBe("https://charasheet.vampire-blood.net/123.js");
            return new Response(null, { status: 302, headers: { Location: "/456.js" } });
          }
          expect(String(input)).toBe("https://charasheet.vampire-blood.net/456.js");
          return new Response(JSON.stringify({ pc_name: "移動後キャラ", SAN_Left: "60" }), { status: 200 });
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
        { url: "https://charasheet.vampire-blood.net/1" },
        { lookupAll: publicDns, fetchFn: async () => new Response("nope", { status }) },
      );
      expect(r).toMatchObject({ ok: false, status: 422 });
      if (!r.ok) expect(r.error).toContain("非公開");
    }

    const r400 = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response("bad req", { status: 400 }) },
    );
    expect(r400).toMatchObject({ ok: false, status: 502 });

    const r500 = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response("err", { status: 500 }) },
    );
    expect(r500).toMatchObject({ ok: false, status: 502 });
    if (!r500.ok) expect(r500.error).toContain("HTTP 500");

    const timeoutRes = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
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
      { url: "https://charasheet.vampire-blood.net/1" },
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
      { url: "https://charasheet.vampire-blood.net/1" },
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
      { url: "https://charasheet.vampire-blood.net/1" },
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
      { url: "https://charasheet.vampire-blood.net/1" },
      { lookupAll: publicDns, maxBytes: 100, fetchFn: async () => new Response(bigStream, { status: 200 }) },
    );
    expect(tooLarge).toMatchObject({ ok: false, status: 413 });
    if (!tooLarge.ok) expect(tooLarge.error).toContain("大きすぎます");

    // res.body が null (Response(null, { status: 200 })) でも res.text() フォールバックで動く
    const nullBodyRes = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response(null, { status: 200 }) },
    );
    expect(nullBodyRes).toMatchObject({ ok: false, status: 422 });
    if (!nullBodyRes.ok) expect(nullBodyRes.error).toContain("読み取れませんでした");

    // ストリーム分割でちょうど maxBytes 以内なら複数チャンク結合に成功する
    const validBytes = new TextEncoder().encode(JSON.stringify({ pc_name: "分割", SAN_Left: "55" }));
    const half = Math.floor(validBytes.length / 2);
    const chunkedOkStream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(validBytes.slice(0, half));
        ctrl.enqueue(validBytes.slice(half));
        ctrl.close();
      },
    });
    const chunkedRes = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
      {
        lookupAll: publicDns,
        maxBytes: validBytes.length,
        fetchFn: async () => new Response(chunkedOkStream, { status: 200 }),
      },
    );
    expect(chunkedRes.ok).toBe(true);

    // パース不能ボディ (422)
    const unparseable = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net/1" },
      { lookupAll: publicDns, fetchFn: async () => new Response("invalid body", { status: 200 }) },
    );
    expect(unparseable).toMatchObject({ ok: false, status: 422 });
    if (!unparseable.ok) expect(unparseable.error).toContain("読み取れませんでした");

    // 非オブジェクト入力・undefined 入力も 400
    for (const badInput of [undefined, "https://charasheet.vampire-blood.net/1"]) {
      const r = await handleExternalImport(badInput, { lookupAll: publicDns });
      expect(r).toMatchObject({ ok: false, status: 400 });
      if (!r.ok) expect(r.error).toContain("URL を指定");
    }

    // reader の empty value チャンク・releaseLock()・UTF-8 不正バイト列への耐性と defaultLookupAll (dns.lookup) 呼び出し
    let releaseOkCount = 0;
    const validBytesWithBadUtf8 = new TextEncoder().encode(
      JSON.stringify({ pc_name: "ストリーム", SAN_Left: "55", pc_making_memo: "A" }),
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
        { url: "https://charasheet.vampire-blood.net/1" },
        { fetchFn: async () => customReaderRes },
      );
      expect(lookupSpy).toHaveBeenCalledWith("charasheet.vampire-blood.net", { all: true });
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
      { url: "https://charasheet.vampire-blood.net/1" },
      { lookupAll: publicDns, maxBytes: 10, fetchFn: async () => oversizeCustomRes },
    );
    expect(releaseErrRes).toMatchObject({ ok: false, status: 413 });
    expect(releaseErrCount).toBe(1);
  });

  it("BOOTH .json 失敗時は HTML へフォールバックする", async () => {
    const res = await handleExternalImport(
      { url: "https://character-sheets.appspot.com/dx3/edit.html?key=ahVzfmNoYXJhY3Rlci1z" },
      {
        lookupAll: publicDns,
        now: () => new Date("2026-11-20T07:00:00.000Z"),
        fetchFn: async (input) => {
          expect(String(input)).toBe(
            "https://character-sheets.appspot.com/dx3/display?ajax=1&key=ahVzfmNoYXJhY3Rlci1z",
          );
          return new Response(JSON.stringify({ base: { name: "月城 朔", cover: "高校生" } }), {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        },
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === "character") {
      expect(res.fetchedAt).toBe("2026-11-20T07:00:00.000Z");
      expect(res.character).toMatchObject({ name: "月城 朔", systemId: "DoubleCross" });
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

  describe("いあきゃら（閲覧者用の鍵を受け取ってから API を読む）", () => {
    const GUEST = "https://apiv3.iachara.com/v3/auth/guestToken";
    const SIGN_IN_PREFIX = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=";
    const SHEET = "https://apiv3.iachara.com/v3/charasheet/3000000";

    function iacharaServer(sheetBody: () => Response) {
      const calls: { url: string; method: string; auth?: string; body?: string; ua?: string }[] = [];
      let idTokens = 0;
      const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        calls.push({
          url,
          method: init?.method ?? "GET",
          auth: headers.get("authorization") ?? undefined,
          body: typeof init?.body === "string" ? init.body : undefined,
          ua: headers.get("user-agent") ?? undefined,
        });
        if (url === GUEST) return Response.json({ token: "custom-token" });
        if (url.startsWith(SIGN_IN_PREFIX)) {
          idTokens++;
          return Response.json({ idToken: `id-${idTokens}`, expiresIn: "3600" });
        }
        if (url === SHEET) return sheetBody();
        throw new Error(`unexpected ${url}`);
      });
      return { fetchFn: fetchFn as unknown as typeof fetch, calls };
    }

    it("閲覧 URL から取り込み、鍵は期限まで使い回す（2 回目はシートを 1 回読むだけ）", async () => {
      const { fetchFn, calls } = iacharaServer(() => Response.json(sheet7th));
      const iacharaToken = createTokenCache();
      const deps = {
        lookupAll: publicDns,
        fetchFn,
        iacharaToken,
        now: () => new Date("2026-11-22T00:00:00.000Z"),
      };
      const res = await handleExternalImport({ url: "https://iachara.com/view/3000000" }, deps);
      expect(res).toMatchObject({
        ok: true,
        kind: "character",
        provider: "iachara",
        url: "https://iachara.com/view/3000000",
        fetchedAt: "2026-11-22T00:00:00.000Z",
      });
      if (res.ok && res.kind === "character") {
        expect(res.character).toMatchObject({ name: "白瀬 怜", systemId: "coc7", stats: { san: 85 } });
      }
      expect(calls.map((c) => [c.method, c.url.replace(/key=.*$/, "key=…")])).toEqual([
        ["POST", GUEST],
        ["POST", `${SIGN_IN_PREFIX}…`],
        ["GET", SHEET],
      ]);
      expect(JSON.parse(calls[1]!.body!)).toEqual({ token: "custom-token", returnSecureToken: true });
      expect(calls[2]!.auth).toBe("Bearer id-1");
      expect(calls.every((c) => c.ua?.startsWith("TakufuImporter/"))).toBe(true);

      calls.length = 0;
      await handleExternalImport({ url: "https://iachara.com/edit/3000000" }, deps);
      expect(calls.map((c) => c.url)).toEqual([SHEET]);
    });

    it("鍵が弾かれたら 1 度だけ取り直す", async () => {
      let sheetCalls = 0;
      const { fetchFn, calls } = iacharaServer(() =>
        ++sheetCalls === 1 ? new Response("", { status: 401 }) : Response.json(sheet7th),
      );
      const res = await handleExternalImport(
        { url: "https://iachara.com/view/3000000" },
        { lookupAll: publicDns, fetchFn, iacharaToken: createTokenCache() },
      );
      expect(res.ok).toBe(true);
      expect(calls.filter((c) => c.url === SHEET).map((c) => c.auth)).toEqual(["Bearer id-1", "Bearer id-2"]);
    });

    it("非公開・見つからないシートは理由を丁寧に返す", async () => {
      const priv = iacharaServer(() => Response.json({ success: false, data: { public: false } }));
      expect(
        await handleExternalImport(
          { url: "https://iachara.com/view/3000000" },
          { lookupAll: publicDns, fetchFn: priv.fetchFn, iacharaToken: createTokenCache() },
        ),
      ).toEqual({
        ok: false,
        status: 422,
        error: "このキャラクターシートは非公開です。いあきゃらで公開に設定してから、もう一度お試しください。",
      });
      const missing = iacharaServer(() =>
        Response.json({
          success: false,
          data: {},
          message: "正常にキャラクターシートを取得できませんでした。",
        }),
      );
      expect(
        await handleExternalImport(
          { url: "https://iachara.com/view/3000000" },
          { lookupAll: publicDns, fetchFn: missing.fetchFn, iacharaToken: createTokenCache() },
        ),
      ).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("見つかりませんでした") });
    });

    it("鍵の受け取りに失敗したらシートを読まずに断り、転送も追わない", async () => {
      const calls: string[] = [];
      const down = await handleExternalImport(
        { url: "https://iachara.com/view/3000000" },
        {
          lookupAll: publicDns,
          iacharaToken: createTokenCache(),
          fetchFn: async (input) => {
            calls.push(String(input));
            return new Response("", { status: 503 });
          },
        },
      );
      expect(down).toEqual({
        ok: false,
        status: 502,
        error: "いあきゃらに接続できませんでした。時間をおいて、もう一度お試しください。",
      });
      expect(calls).toEqual([GUEST]);

      const redirected = iacharaServer(
        () => new Response("", { status: 302, headers: { Location: "https://iachara.com/view/3000000" } }),
      );
      expect(
        await handleExternalImport(
          { url: "https://iachara.com/view/3000000" },
          { lookupAll: publicDns, fetchFn: redirected.fetchFn, iacharaToken: createTokenCache() },
        ),
      ).toMatchObject({ ok: false, status: 502 });
      expect(redirected.calls.filter((c) => c.url === SHEET)).toHaveLength(1);
    });

    it("API の接続先も名前解決の検査を通す", async () => {
      const { fetchFn, calls } = iacharaServer(() => Response.json(sheet7th));
      const res = await handleExternalImport(
        { url: "https://iachara.com/view/3000000" },
        {
          lookupAll: async (host) => [
            { address: host === "apiv3.iachara.com" ? "10.0.0.1" : "93.184.216.34" },
          ],
          fetchFn,
          iacharaToken: createTokenCache(),
        },
      );
      expect(res).toMatchObject({ ok: false, status: 502 });
      expect(calls).toHaveLength(0);
    });
  });
});
