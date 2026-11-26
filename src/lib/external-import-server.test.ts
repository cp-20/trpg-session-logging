/**
 * handleExternalImport の送り先の検査（SSRF 対策）と、createTokenCache の期限の扱い。
 * 通信・名前解決・時刻はすべて差し替える。route.integration.test.ts と重ならないところを確かめる。
 */
import { describe, expect, it, vi } from "vitest";
import { createTokenCache, handleExternalImport } from "./external-import-server";

const SHEET_URL = "https://charasheet.vampire-blood.net/123";
const sheetJson = () => Response.json({ pc_name: "灯台守", SAN_Left: "60" });
const publicLookup = () => vi.fn(async () => [{ address: "93.184.216.34" }]);

describe("handleExternalImport: 取得する前に断る URL", () => {
  it.each([
    ["http の URL", "http://charasheet.vampire-blood.net/123"],
    ["ftp の URL", "ftp://charasheet.vampire-blood.net/123"],
    ["file の URL", "file:///etc/passwd"],
    ["認証情報付きの URL", "https://user:pass@charasheet.vampire-blood.net/123"],
    ["ユーザー名だけ付いた URL", "https://user@charasheet.vampire-blood.net/123"],
    ["標準外のポート", "https://charasheet.vampire-blood.net:8443/123"],
    ["IPv4 のアドレスそのもの", "https://127.0.0.1/123"],
    ["クラウドのメタデータのアドレス", "https://169.254.169.254/latest/meta-data"],
    ["IPv6 のアドレスそのもの", "https://[::1]/123"],
    ["IPv4 を埋め込んだ IPv6", "https://[::ffff:127.0.0.1]/123"],
    ["整数で書いたアドレス", "https://2130706433/123"],
    ["localhost", "https://localhost/123"],
    [".local の名前", "https://printer.local/123"],
    ["対応していないサイト", "https://example.com/123"],
  ])("%s なら 400 を返し、名前解決も取得もしない", async (_label, url) => {
    const lookupAll = publicLookup();
    const fetchFn = vi.fn(async () => sheetJson());

    const res = await handleExternalImport({ url }, { lookupAll, fetchFn });

    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(lookupAll).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["空の文字列", { url: "" }],
    ["空白だけ", { url: "   " }],
    ["url のない本文", {}],
    ["文字列の本文", "https://charasheet.vampire-blood.net/123"],
  ])("%s なら 400 を返し、取得しない", async (_label, body) => {
    const fetchFn = vi.fn(async () => sheetJson());

    const res = await handleExternalImport(body, { lookupAll: publicLookup(), fetchFn });

    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("既定のポート 443 を書いた URL は、ポートなしと同じく取り込む", async () => {
    const fetchFn = vi.fn(async () => sheetJson());

    const res = await handleExternalImport(
      { url: "https://charasheet.vampire-blood.net:443/123" },
      { lookupAll: publicLookup(), fetchFn },
    );

    expect(res).toMatchObject({ ok: true, kind: "character" });
  });
});

describe("handleExternalImport: 名前解決の結果で断る", () => {
  it.each([
    ["10.0.0.0/8", "10.1.2.3"],
    ["172.16.0.0/12 の先頭", "172.16.0.1"],
    ["172.16.0.0/12 の末尾", "172.31.255.255"],
    ["192.168.0.0/16", "192.168.1.1"],
    ["CGNAT 100.64.0.0/10", "100.64.0.1"],
    ["0.0.0.0", "0.0.0.0"],
    ["マルチキャスト", "224.0.0.1"],
    ["IPv6 のループバック", "::1"],
    ["IPv6 の未指定アドレス", "::"],
    ["IPv4 射影の IPv6（ドット表記）", "::ffff:127.0.0.1"],
    ["IPv4 射影の IPv6（16 進表記）", "::ffff:a9fe:a9fe"],
    ["IPv6 のリンクローカル", "fe80::1"],
    ["IPv6 のリンクローカル（ゾーン付き）", "fe80::1%eth0"],
    ["IPv6 のユニークローカル", "fd12:3456::1"],
    ["形の崩れたアドレス", "not-an-ip"],
  ])("%s に解決されたら 400 を返し、取得しない", async (_label, address) => {
    const fetchFn = vi.fn(async () => sheetJson());

    const res = await handleExternalImport(
      { url: SHEET_URL },
      { lookupAll: async () => [{ address }], fetchFn },
    );

    expect(res).toMatchObject({ ok: false, status: 400, error: "この接続先アドレスは許可されていません。" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["172.15.255.255（172.16/12 の手前）", "172.15.255.255"],
    ["172.32.0.0（172.16/12 の直後）", "172.32.0.0"],
    ["100.63.255.255（CGNAT の手前）", "100.63.255.255"],
    ["公開の IPv6", "2606:4700::1111"],
  ])("公開のアドレス %s に解決されたら取り込む", async (_label, address) => {
    const fetchFn = vi.fn(async () => sheetJson());

    const res = await handleExternalImport(
      { url: SHEET_URL },
      { lookupAll: async () => [{ address }], fetchFn },
    );

    expect(res).toMatchObject({ ok: true, kind: "character" });
  });

  // 不具合: isPrivateOrReservedIp（external-sync.ts）は NAT64 の 64:ff9b::/96 に埋め込まれた IPv4 を見ないので、
  // NAT64 のある網では 64:ff9b::a00:1（= 10.0.0.1）経由で内側に届いてしまう。IPv4 射影と同じく中の IPv4 で判定すべき。
  it.fails("NAT64 の形で内側の IPv4 を埋め込んだアドレスに解決されたら 400 を返す", async () => {
    const fetchFn = vi.fn(async () => sheetJson());

    const res = await handleExternalImport(
      { url: SHEET_URL },
      { lookupAll: async () => [{ address: "64:ff9b::a00:1" }], fetchFn },
    );

    expect(res).toMatchObject({ ok: false, status: 400 });
  });
});

describe("handleExternalImport: 転送先の検査", () => {
  const redirectTo = (location: string) => {
    const fetchFn = vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("https://charasheet.vampire-blood.net/123")
        ? new Response(null, { status: 302, headers: { Location: location } })
        : sheetJson(),
    );
    return fetchFn;
  };

  it("対応するサイトへの転送でも、転送先が内側のアドレスに解決されたら 400 を返し、転送先を取得しない", async () => {
    const fetchFn = redirectTo("https://yutorize.work/ytsheet/sw2.5/?id=abc");
    const lookupAll = async (host: string) => [
      { address: host === "yutorize.work" ? "10.0.0.5" : "93.184.216.34" },
    ];

    const res = await handleExternalImport({ url: SHEET_URL }, { lookupAll, fetchFn });

    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["http への格下げ", "http://charasheet.vampire-blood.net/456.js"],
    ["認証情報付きの URL", "https://a:b@charasheet.vampire-blood.net/456.js"],
    ["標準外のポート", "https://charasheet.vampire-blood.net:8080/456.js"],
    ["IP アドレスそのもの", "https://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost/456.js"],
  ])("%s への転送なら 400 を返し、転送先を取得しない", async (_label, location) => {
    const fetchFn = redirectTo(location);

    const res = await handleExternalImport({ url: SHEET_URL }, { lookupAll: publicLookup(), fetchFn });

    expect(res).toMatchObject({ ok: false, status: 400 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("転送を 3 回までなら追って取り込む", async () => {
    let hop = 0;
    const fetchFn = vi.fn(async () =>
      ++hop <= 3
        ? new Response(null, { status: 302, headers: { Location: `/${100 + hop}.js` } })
        : sheetJson(),
    );

    const res = await handleExternalImport({ url: SHEET_URL }, { lookupAll: publicLookup(), fetchFn });

    expect(res).toMatchObject({ ok: true, kind: "character" });
  });
});

describe("handleExternalImport: 時刻と上限", () => {
  it("取り込んだ時刻には、差し替えた時計の今を入れる", async () => {
    const now = () => new Date("2026-11-26T09:30:00.000Z");

    const res = await handleExternalImport(
      { url: SHEET_URL },
      { lookupAll: publicLookup(), fetchFn: async () => sheetJson(), now },
    );

    expect(res).toMatchObject({ ok: true, fetchedAt: "2026-11-26T09:30:00.000Z" });
  });

  it("応答が上限より 1 バイト大きければ 413 を返す", async () => {
    const body = JSON.stringify({ pc_name: "灯台守" });
    const size = new TextEncoder().encode(body).byteLength;

    const res = await handleExternalImport(
      { url: SHEET_URL },
      { lookupAll: publicLookup(), fetchFn: async () => new Response(body), maxBytes: size - 1 },
    );

    expect(res).toMatchObject({ ok: false, status: 413 });
  });

  it("応答が時間の上限までに返らなければ 504 を返す", async () => {
    // 取得側は中止の合図が来るまで待ち続ける（時間の上限が取得に渡っていることを確かめる）
    const hanging = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });

    const res = await handleExternalImport(
      { url: SHEET_URL },
      { lookupAll: publicLookup(), fetchFn: hanging as typeof fetch, timeoutMs: 1 },
    );

    expect(res).toMatchObject({ ok: false, status: 504 });
  });
});

describe("createTokenCache", () => {
  const at = (iso: string) => new Date(iso);
  const issuer = (...tokens: string[]) => {
    let i = 0;
    return vi.fn(async () => ({ token: tokens[i++] ?? "extra", expiresInSec: 3600 }));
  };

  it("期限の 5 分前より前なら、受け取った鍵を使い回す", async () => {
    const cache = createTokenCache();
    const issue = issuer("first", "second");
    await cache.get(at("2026-11-26T00:00:00Z"), issue);

    const token = await cache.get(at("2026-11-26T00:54:59.999Z"), issue);

    expect(token).toBe("first");
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("期限の 5 分前ちょうどになったら取り直す", async () => {
    const cache = createTokenCache();
    const issue = issuer("first", "second");
    await cache.get(at("2026-11-26T00:00:00Z"), issue);

    const token = await cache.get(at("2026-11-26T00:55:00Z"), issue);

    expect(token).toBe("second");
  });

  it("同時に頼まれたら、受け取りは 1 回にまとめて同じ鍵を返す", async () => {
    const cache = createTokenCache();
    const issue = issuer("first", "second");
    const now = at("2026-11-26T00:00:00Z");

    const tokens = await Promise.all([cache.get(now, issue), cache.get(now, issue)]);

    expect(tokens).toEqual(["first", "first"]);
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("受け取りに失敗したら null を返し、次に頼まれたときに取り直す", async () => {
    const cache = createTokenCache();
    const now = at("2026-11-26T00:00:00Z");
    await expect(cache.get(now, async () => null)).resolves.toBeNull();

    const token = await cache.get(now, issuer("retry"));

    expect(token).toBe("retry");
  });

  it("受け取りが例外で終わっても、次に頼まれたときに取り直す", async () => {
    const cache = createTokenCache();
    const now = at("2026-11-26T00:00:00Z");
    await expect(
      cache.get(now, async () => {
        throw new Error("network");
      }),
    ).rejects.toThrow("network");

    const token = await cache.get(now, issuer("retry"));

    expect(token).toBe("retry");
  });

  it("捨てたあとは、期限内でも取り直す", async () => {
    const cache = createTokenCache();
    const issue = issuer("first", "second");
    const now = at("2026-11-26T00:00:00Z");
    await cache.get(now, issue);

    cache.clear();
    const token = await cache.get(now, issue);

    expect(token).toBe("second");
  });
});
