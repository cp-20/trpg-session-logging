import { describe, expect, it } from "vitest";
import type { Character } from "../types";
import {
  computeExternalContentHash,
  decodeHtmlEntities,
  extractArchetypeFromMemo,
  isIpLiteral,
  isPrivateOrReservedIp,
  mergeExternalCharacterUpdate,
  parseBoothResponse,
  parseCharasheetResponse,
  parseExternalResponse,
  parseExternalUrl,
  parseTaltoResponse,
  parseYtsheetResponse,
  shouldAutoSync,
} from "./external-sync";

function baseCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "ch_base",
    ownerId: "u_mikan",
    name: "遠沢 澄花",
    systemId: "coc7",
    color: "#3f5e78",
    archetype: "探索者",
    bio: "初期プロフィール",
    tags: ["図書館"],
    stats: { san: 65, hp: 11, mp: 12 },
    sessions: [
      {
        logId: "s01",
        date: "2026-10-10",
        title: "廃校の十三時間目",
        delta: { san: { before: 70, after: 65 } },
        rolls: [],
        memo: "生還",
      },
    ],
    growth: [],
    share: {
      enabled: true,
      scope: "link",
      includeProfile: true,
      includeStats: true,
      includeGrowth: true,
      includeSessions: true,
    },
    ...overrides,
  };
}

describe("SSRF guard: isIpLiteral & isPrivateOrReservedIp", () => {
  it("IP リテラル（IPv4, 整数, 16進, IPv6, 括弧・ゾーンID付）を正確に識別する", () => {
    expect(isIpLiteral("127.0.0.1")).toBe(true);
    expect(isIpLiteral("8.8.8.8")).toBe(true);
    expect(isIpLiteral("2130706433")).toBe(true);
    expect(isIpLiteral("0x7f000001")).toBe(true);
    expect(isIpLiteral("[::1]")).toBe(true);
    expect(isIpLiteral("fe80::1%eth0")).toBe(true);
    expect(isIpLiteral("0x0a000001")).toBe(true);
    expect(isIpLiteral("127.0.0.1.example.com")).toBe(false);
    expect(isIpLiteral("2130706433.example")).toBe(false);
    expect(isIpLiteral("0x7f.example")).toBe(false);
    expect(isIpLiteral("1.2.3.4.5")).toBe(false);
    expect(isIpLiteral("iachara.com")).toBe(false);
    expect(isIpLiteral("foo.booth.pm")).toBe(false);
    expect(isIpLiteral("")).toBe(false);
  });

  it("プライベート・予約済み・リンクローカル・不正 IP を拒否し、公開 IP のみ許可する", () => {
    const privateOrReserved = [
      "",
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "127.255.255.254",
      "100.64.0.1",
      "100.127.255.254",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.254",
      "192.0.0.1",
      "192.0.2.1",
      "192.168.1.50",
      "198.18.0.1",
      "198.19.255.1",
      "198.51.100.5",
      "203.0.113.9",
      "224.0.0.1",
      "255.255.255.255",
      "999.0.0.1",
      "::",
      "::1",
      "[::1]",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:192.168.1.1",
      "fc00::1",
      "fd12:3456:789a::1",
      "fe80::1%lo0",
      "febf::1",
      "ff02::1",
      "invalid::ip::v6",
    ];
    for (const ip of privateOrReserved) {
      expect(isPrivateOrReservedIp(ip), `Expected private/reserved for ${ip}`).toBe(true);
    }

    const publicIps = [
      "93.184.216.34",
      "1.1.1.1",
      "1.64.0.1",
      "1.127.255.1",
      "1.254.0.1",
      "1.168.0.1",
      "1.18.0.1",
      "1.19.0.1",
      "1.51.100.1",
      "1.0.113.1",
      "1.0.2.1",
      "9.255.255.255",
      "11.0.0.1",
      "100.63.255.255",
      "100.128.0.0",
      "126.255.255.255",
      "128.0.0.1",
      "169.253.255.255",
      "169.255.0.0",
      "172.15.255.255",
      "172.32.0.0",
      "192.0.1.1",
      "192.0.3.1",
      "192.167.255.255",
      "192.169.0.1",
      "198.17.255.255",
      "198.20.0.0",
      "198.51.99.1",
      "203.0.112.1",
      "223.255.255.255",
      "2001:4860:4860::8888",
      "1:2:3:4:5:6::7",
      "0:0:0:0:0:0:0101:0202",
      "2001:0:0:0:0:ffff:127.0.0.1",
      "fbff::1",
      "fe00::1",
      "fe7f::1",
      "fec0::1",
      "0:0:0:0:0:ffff:93.184.216.34",
      "0:0:0:0:0:0:93.184.216.34",
      "::ffff:93.184.216.34",
    ];
    for (const ip of publicIps) {
      expect(isPrivateOrReservedIp(ip), `Expected public for ${ip}`).toBe(false);
    }

    const extraPrivateIps = [
      "0:0:0:0:0:0:0:0",
      "0:0:0:0:0:0:0:1",
      "0:0:0:0:0:ffff:10.0.0.1",
      "0:0:0:0:0:ffff:127.0.0.1",
      "[fe80::1]",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7::8",
      "1:2:3:4:5:6:7:8::",
      "zzzz::1",
      "1::2::3",
      "::127.0.0.1:99",
      "192.168.1",
      "256.1.1.1",
      "-1.1.1.1",
      "10.0.0.0.1",
      "fdff:ffff::1",
      "febf:ffff::1",
      "ff00::1",
    ];
    for (const ip of extraPrivateIps) {
      expect(isPrivateOrReservedIp(ip), `Expected private/invalid for ${ip}`).toBe(true);
    }
  });
});

describe("isPrivateOrReservedIp: IPv4 を埋め込んだ IPv6", () => {
  it.each([
    ["NAT64 の 10.0.0.1", "64:ff9b::a00:1"],
    ["NAT64 の 127.0.0.1（ドット表記）", "64:ff9b::127.0.0.1"],
    ["NAT64 の 169.254.169.254（メタデータ）", "64:ff9b::a9fe:a9fe"],
    ["網の中だけの NAT64（64:ff9b:1::/48）", "64:ff9b:1::5db8:d822"],
    ["6to4 の 192.168.1.1", "2002:c0a8:101::1"],
    ["6to4 の 127.0.0.1", "2002:7f00:1::"],
  ])("%s は内側として拒む", (_label, ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(true);
  });

  it.each([
    ["NAT64 の 93.184.216.34", "64:ff9b::5db8:d822"],
    ["6to4 の 93.184.216.34", "2002:5db8:d822::1"],
  ])("%s は外側として通す", (_label, ip) => {
    expect(isPrivateOrReservedIp(ip)).toBe(false);
  });
});

describe("parseExternalUrl", () => {
  it("対応サービスの URL を正規化し取得候補 URL を返す", () => {
    const ia = {
      ok: true,
      provider: "iachara",
      kind: "character",
      displayUrl: "https://iachara.com/view/12345",
      fetchUrls: ["https://apiv3.iachara.com/v3/charasheet/12345"],
    };
    expect(parseExternalUrl("https://www.iachara.com:443/char/view/12345?foo=bar")).toEqual(ia);
    expect(parseExternalUrl("https://iachara.com/view/12345")).toEqual(ia);
    expect(parseExternalUrl("https://iachara.com/edit/12345/")).toEqual(ia);
    expect(parseExternalUrl("https://iachara.com/view/12345#skills")).toEqual(ia);
    expect(parseExternalUrl("https://booth.pm/items/654321")).toEqual({
      ok: true,
      provider: "booth",
      kind: "scenario",
      displayUrl: "https://booth.pm/ja/items/654321",
      fetchUrls: ["https://booth.pm/ja/items/654321.json", "https://booth.pm/ja/items/654321"],
    });
    expect(parseExternalUrl("https://booth.pm/en/items/654321")).toEqual({
      ok: true,
      provider: "booth",
      kind: "scenario",
      displayUrl: "https://booth.pm/en/items/654321",
      fetchUrls: ["https://booth.pm/en/items/654321.json", "https://booth.pm/en/items/654321"],
    });
    expect(parseExternalUrl("https://talto.cc/projects/p-001")).toMatchObject({
      ok: true,
      provider: "talto",
      displayUrl: "https://talto.cc/projects/p-001",
    });
    expect(parseExternalUrl("https://yutorize.2-d.jp/other/?id=1").ok).toBe(false);
    expect(parseExternalUrl("https://charasheet.vampire-blood.net/").ok).toBe(false);
    expect(parseExternalUrl("https://booth.pm/x").ok).toBe(false);

    expect(parseExternalUrl("https://charasheet.vampire-blood.net/m4455.html")).toEqual({
      ok: true,
      provider: "charasheet",
      kind: "character",
      displayUrl: "https://charasheet.vampire-blood.net/m4455",
      fetchUrls: ["https://charasheet.vampire-blood.net/m4455.js"],
    });

    const yt = parseExternalUrl("https://yutorize.2-d.jp/ytsheet/sw2.5/?id=abc_123&extra=1");
    expect(yt.ok).toBe(true);
    if (yt.ok) {
      expect(yt.provider).toBe("ytsheet");
      expect(yt.displayUrl).toBe("https://yutorize.2-d.jp/ytsheet/sw2.5/?id=abc_123");
      expect(yt.fetchUrls[0]).toContain("mode=json");
    }

    expect(parseExternalUrl("https://emoklore.charasheet.jp/chars/555").ok).toBe(false);

    expect(parseExternalUrl("https://booth.pm/ja/items/123456")).toEqual({
      ok: true,
      provider: "booth",
      kind: "scenario",
      displayUrl: "https://booth.pm/ja/items/123456",
      fetchUrls: ["https://booth.pm/ja/items/123456.json", "https://booth.pm/ja/items/123456"],
    });
    expect(parseExternalUrl("https://circle.booth.pm/items/987")).toMatchObject({
      ok: true,
      provider: "booth",
      displayUrl: "https://circle.booth.pm/items/987",
    });

    expect(parseExternalUrl("https://www.talto.cc/projects/p-001")).toEqual({
      ok: true,
      provider: "talto",
      kind: "scenario",
      displayUrl: "https://talto.cc/projects/p-001",
      fetchUrls: ["https://talto.cc/projects/p-001"],
    });
  });

  it("非 https・認証情報・ポート・ローカルホスト・未対応ドメイン・不正パスを拒否しエラー文を返す", () => {
    const invalidUrls = [
      "   ",
      "not a url",
      "http://iachara.com/view/1",
      "https://user:pass@iachara.com/view/1",
      "https://user@iachara.com/view/1",
      "https://:pass@iachara.com/view/1",
      "https://iachara.com:8443/view/1",
      "https://localhost/view/1",
      "https://foo.local/view/1",
      "https://127.0.0.1/view/1",
      "https://iachara.com/other",
      "https://charasheet.vampire-blood.net/",
      "https://charasheet.vampire-blood.net/search",
      "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=bad/path",
      "https://yutorize.2-d.jp/other/?id=1",
      "https://emoklore.charasheet.jp/",
      "https://admin.booth.pm/items/123",
      "https://booth.pm/x",
      "https://booth.pm/ja/search",
      "https://talto.cc/users/1",
      "https://evil.example.com/sheet/1",
    ];
    for (const bad of invalidUrls) {
      const r = parseExternalUrl(bad);
      expect(r.ok, `Expected rejection for ${bad}`).toBe(false);
      if (!r.ok) expect(r.error.trim().length).toBeGreaterThan(5);
    }
  });
});

describe("HTML / JSON パーサー群", () => {
  it("HTML エンティティを安全にデコードする", () => {
    expect(decodeHtmlEntities("A&amp;B &lt;C&gt; &quot;D&quot; &#39;E&#x27;&nbsp;&#65;&#x42;")).toBe(
      "A&B <C> \"D\" 'E' AB",
    );
  });

  it("parseCharasheetResponse / parseYtsheetResponse を正しく処理する", () => {
    const jsonp = `fn(${JSON.stringify({
      pc_name: "水無瀬 柊",
      works: "私立探偵",
      game: "coc",
      SAN_Left: "64",
      HP: "11",
      pc_image: "https://cdn.example.com/c.png",
    })});`;
    const c = parseCharasheetResponse(jsonp);
    expect(c?.name).toBe("水無瀬 柊");
    expect(c?.stats.san).toBe(64);
    expect(c?.image).toBe("https://cdn.example.com/c.png");
    expect(parseCharasheetResponse("fn({broken});")).toBeNull();
    expect(parseCharasheetResponse("")).toBeNull();

    const ytHtml = `<html><head>
      <meta property="og:title" content="エルナ - ゆとシートⅡ" />
      <meta property="og:description" content="ソード・ワールド2.5 冒険者" />
    </head></html>`;
    const yt = parseYtsheetResponse(ytHtml);
    expect(yt?.name).toBe("エルナ");
    expect(yt?.systemId).toBe("sw25");
    expect(
      parseYtsheetResponse(`<html><head><title>探索者A - ゆとシート</title></head></html>`),
    ).toMatchObject({
      name: "探索者A",
      systemId: "sw25",
    });
    expect(parseYtsheetResponse("")).toBeNull();
  });

  it("parseBoothResponse / parseTaltoResponse / parseExternalResponse がシナリオとキャラを正しく変換する", () => {
    const boothHtml = `<html><head>
      <meta property="og:title" content="深海の郵便局 - 星灯堂 - BOOTH" />
      <meta property="og:description" content="新クトゥルフ神話TRPG（7版）の短編シナリオ" />
    </head></html>`;
    const booth = parseBoothResponse(boothHtml, "https://booth.pm/ja/items/1");
    expect(booth?.title).toBe("深海の郵便局");
    expect(booth?.author).toBe("星灯堂");
    expect(booth?.systemId).toBe("coc7");

    const taltoHtml = `<html><head>
      <title>白夜の駅舎 | TALTO</title>
      <script type="application/ld+json">{"author":{"name":"月見工房"},"description":"エモクロアTRPG向けシナリオ"}</script>
    </head></html>`;
    const talto = parseTaltoResponse(taltoHtml, "https://talto.cc/projects/1");
    expect(talto?.title).toBe("白夜の駅舎");
    expect(talto?.author).toBe("月見工房");
    expect(talto?.systemId).toBe("emoklore");

    const taltoJson = parseTaltoResponse(
      JSON.stringify({ title: "JsonSc", author: "A", system: "CoC6", tags: ["短編", 123] }),
      "https://talto.cc/projects/2",
    );
    expect(taltoJson?.tags).toEqual(["短編"]);
    expect(taltoJson?.systemId).toBe("coc6");

    const boothJson = parseBoothResponse(
      JSON.stringify({
        name: "境界の森",
        shop: { name: "星屑工房" },
        tags: [
          "CoC",
          { name: "短編" },
          "CoC",
          "謎解き",
          "ホラー",
          "1人用",
          "2人用",
          "現代",
          "クローズド",
          "秘匿",
        ],
        description: `${"あ".repeat(425)}\r\n\r\n\r\n続き`,
      }),
      "https://booth.pm/ja/items/2",
    );
    expect(boothJson?.author).toBe("星屑工房");
    expect(boothJson?.tags).toHaveLength(8);
    expect(boothJson?.systemId).toBe("coc7");
    expect(boothJson?.description?.endsWith("…")).toBe(true);
    expect(
      parseBoothResponse(
        `<html><head><title>著者なしタイトル - BOOTH</title></head></html>`,
        "https://booth.pm/ja/items/3",
      ),
    ).toMatchObject({
      title: "著者なしタイトル",
      author: undefined,
      tags: [],
    });
    expect(
      parseBoothResponse(
        JSON.stringify({ name: "タグ無しマダミス", description: "マダミスシナリオ" }),
        "https://booth.pm/ja/items/5",
      ),
    ).toMatchObject({
      title: "タグ無しマダミス",
      systemId: "madamis",
      tags: [],
    });
    expect(parseBoothResponse("plain text", "https://booth.pm/ja/items/4")).toBeNull();
    expect(parseBoothResponse("", "https://booth.pm/ja/items/6")).toBeNull();

    const taltoBadJsonLd = parseTaltoResponse(
      `<html><head><meta name="author" content="作者X"><meta name="description" content="SW2.5 向け"><meta property="og:title" content="風の大地 | TALTO"><script type="application/ld+json">{broken</script></head></html>`,
      "https://talto.cc/projects/3",
    );
    expect(taltoBadJsonLd).toMatchObject({
      title: "風の大地",
      author: "作者X",
      systemId: "sw25",
    });
    const taltoStrCreator = parseTaltoResponse(
      JSON.stringify({
        title: "マダミス館",
        creator: { name: "Creator工房" },
        description: "マダミス",
        system: "unknown",
      }),
      "https://talto.cc/projects/5",
    );
    expect(taltoStrCreator).toMatchObject({ author: "Creator工房", systemId: "madamis", tags: [] });
    expect(parseTaltoResponse(JSON.stringify({}), "https://talto.cc/projects/6")).toBeNull();
    expect(
      parseTaltoResponse(`<html><head><title></title></head></html>`, "https://talto.cc/projects/7"),
    ).toBeNull();
    expect(parseTaltoResponse("{broken", "https://talto.cc/projects/4")).toBeNull();
    expect(computeExternalContentHash([1, null, { b: 2, a: undefined }])).toHaveLength(16);
    expect(computeExternalContentHash("ab")).not.toBe(computeExternalContentHash("ba"));
    expect(computeExternalContentHash([1, null])).not.toBe(computeExternalContentHash([1, "x"]));
    expect(
      parseBoothResponse(
        `<html><head><title>パイプ作品 ｜ 作者名｜BOOTH</title></head></html>`,
        "https://booth.pm/ja/items/8",
      ),
    ).toMatchObject({
      title: "パイプ作品",
      author: "作者名",
    });
    expect(
      parseTaltoResponse(
        `<html><head><title>文字作者 | TALTO</title><script type="application/ld+json">{"author":"文字列P","description":"クトゥルフ6版向け"}</script></head></html>`,
        "https://talto.cc/projects/8",
      ),
    ).toMatchObject({
      title: "文字作者",
      author: "文字列P",
      systemId: "coc6",
      description: "クトゥルフ6版向け",
    });

    // parseExternalResponse 各プロバイダ + 不正入力 null
    expect(parseExternalResponse("iachara", "   ", "text/html", "https://iachara.com/view/1")).toBeNull();
    expect(
      parseExternalResponse(
        "charasheet",
        JSON.stringify({ pc_name: "C1", game: "coc6", HP: 10 }),
        "application/javascript",
        "https://charasheet.vampire-blood.net/m1",
      )?.kind,
    ).toBe("character");
    expect(
      parseExternalResponse(
        "ytsheet",
        JSON.stringify({ characterName: "Y1", hpTotal: 20 }),
        "application/json",
        "https://yutorize.2-d.jp/ytsheet/sw2.5/?id=1",
      )?.kind,
    ).toBe("character");
    expect(
      parseExternalResponse(
        "emoklore",
        JSON.stringify({ system: "emoklore", name: "E1", von: 3 }),
        "application/json",
        "https://emoklore.charasheet.jp/chars/1",
      ),
    ).toBeNull();
    expect(
      parseExternalResponse(
        "talto",
        `<html><head><title>T1 | TALTO</title></head></html>`,
        "text/html",
        "https://talto.cc/projects/1",
      )?.kind,
    ).toBe("scenario");

    const payload = parseExternalResponse("booth", boothHtml, "text/html", "https://booth.pm/ja/items/1");
    expect(payload?.kind).toBe("scenario");
    expect(payload?.contentHash).toMatch(/^[\da-f]{16}$/);
  });
});

describe("computeExternalContentHash, mergeExternalCharacterUpdate, shouldAutoSync", () => {
  it("キー順によらず決定的な 16 文字ハッシュを生成する", () => {
    const h1 = computeExternalContentHash({ a: 1, b: { c: 2, d: undefined } });
    const h2 = computeExternalContentHash({ b: { c: 2 }, a: 1 });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
    expect(computeExternalContentHash({ a: 2 })).not.toBe(h1);
  });

  it("extractArchetypeFromMemo は職業・種族・ルーツを抽出する", () => {
    expect(extractArchetypeFromMemo("職業: 図書館司書\nメモ")).toBe("図書館司書");
    expect(extractArchetypeFromMemo("種族：エルフ")).toBe("エルフ");
    expect(extractArchetypeFromMemo("メモのみ")).toBe("");
    expect(extractArchetypeFromMemo(undefined)).toBe("");
  });

  it("非破壊マージでセッション・共有設定を保ちつつ能力差分を成長履歴へ追記する", () => {
    const existing = baseCharacter({
      externalSync: {
        provider: "iachara",
        url: "https://iachara.com/view/1",
        lastSyncedAt: "2026-11-01T00:00:00.000Z",
        lastStatus: "ok",
        contentHash: "old_hash",
        autoSync: true,
      },
    });
    const res = mergeExternalCharacterUpdate(
      existing,
      {
        name: "遠沢 澄花（改）",
        memo: "職業: 上級司書\n更新後プロフィール",
        systemId: "coc7",
        stats: { san: 59, hp: 11, mp: 14 },
      },
      {
        url: "https://iachara.com/view/1",
        provider: "iachara",
        syncedAt: "2026-11-20T00:00:00.000Z",
        contentHash: "new_hash",
      },
    );

    expect(res.changed).toBe(true);
    expect(res.next.sessions).toEqual(existing.sessions);
    expect(res.next.share).toEqual(existing.share);
    expect(res.next.name).toBe("遠沢 澄花（改）");
    expect(res.next.archetype).toBe("上級司書");
    expect(res.statChanges.map((d) => `${d.key}:${d.from}->${d.to}`)).toEqual(["san:65->59", "mp:12->14"]);
    expect(res.profileChanges).toContain("名前");
    /* SAN・MP の増減は状態の値で、成長ではない */
    expect(res.next.growth).toHaveLength(0);

    // 同一ハッシュの時は変更扱いにならない
    const sameHashRes = mergeExternalCharacterUpdate(
      res.next,
      {
        name: "遠沢 澄花（改）",
        memo: "職業: 上級司書\n更新後プロフィール",
        systemId: "coc7",
        stats: { san: 59, hp: 11, mp: 14 },
      },
      {
        url: "https://iachara.com/view/1",
        provider: "iachara",
        syncedAt: "2026-11-20T01:00:00.000Z",
        contentHash: "new_hash",
      },
    );
    expect(sameHashRes.changed).toBe(false);
    expect(sameHashRes.next.growth).toHaveLength(0);

    // 4項目 (名前/職業など/システム/画像。ひとこと紹介は卓譜側の項目なので上書きしない) + 未知ラベル(英数字は大文字化・日本語はそのまま) + 未入力フィールドの既存値維持
    const customExisting = baseCharacter({
      systemId: "coc7",
      archetype: "探索者",
      bio: "元メモ",
      stats: { san: 60, customStat: 10, 図書館: 70 },
      image: "https://cdn.example.com/old.png",
    });
    const fullDiff = mergeExternalCharacterUpdate(
      customExisting,
      {
        name: "別名",
        memo: "ルーツ: 学者\n別メモ",
        systemId: "coc6",
        stats: { san: 55, customStat: 15, 図書館: 80, hp: 12 },
        image: "https://cdn.example.com/new.png",
      },
      {
        url: "https://charasheet.vampire-blood.net/m1",
        provider: "charasheet",
        syncedAt: "2026-11-20T02:00:00.000Z",
        autoSync: false,
      },
    );
    expect(fullDiff.changed).toBe(true);
    expect(fullDiff.profileChanges).toEqual(["名前", "職業など", "システム", "画像"]);
    expect(fullDiff.next.bio).toBe("元メモ");
    expect(fullDiff.statChanges.map((d) => d.label)).toEqual(["SAN", "CUSTOMSTAT", "図書館"]);
    /* 上がった技能だけが成長になり、どれもいちばん新しいセッションのあとのもの（SAN は下がった状態の値） */
    expect(fullDiff.next.growth.map((g) => [g.skill, g.logId])).toEqual([
      ["CUSTOMSTAT", "s01"],
      ["図書館", "s01"],
    ]);
    expect(fullDiff.growth).toEqual(fullDiff.next.growth);
    expect(fullDiff.next.growth[0]?.id).toMatch(/^g_/);
    expect(fullDiff.next.stats).toMatchObject({ san: 55, hp: 12, customStat: 15, 図書館: 80 });
    expect(fullDiff.statChanges[0]).toEqual({ key: "san", label: "SAN", from: 60, to: 55 });
    expect(fullDiff.next.externalSync?.autoSync).toBe(false);

    const emptySysRes = mergeExternalCharacterUpdate(
      baseCharacter({ systemId: "", name: "そのまま", bio: "元", archetype: "元職業" }),
      { name: "そのまま", systemId: undefined, stats: { san: 65, hp: 11, mp: 12 } },
      {
        url: "https://iachara.com/view/1",
        provider: "iachara",
        syncedAt: "2026-11-20T00:00:00Z",
        contentHash: "new_diff_hash",
      },
    );
    expect(emptySysRes.changed).toBe(false);
    expect(emptySysRes.next.externalSync?.lastStatus).toBe("ok");
    expect(emptySysRes.next.externalSync?.autoSync).toBe(true);

    // incoming に memo・systemId・image が無くても既存の値を壊さない
    const keepExistingRes = mergeExternalCharacterUpdate(
      customExisting,
      { name: "   ", stats: { san: 60, customStat: 10, 図書館: 70 } },
      {
        url: "https://charasheet.vampire-blood.net/m1",
        provider: "charasheet",
        syncedAt: "2026-11-20T03:00:00.000Z",
      },
    );
    expect(keepExistingRes.changed).toBe(true); // 名前が "名前未設定" に変わるため
    expect(keepExistingRes.next.archetype).toBe("探索者");
    expect(keepExistingRes.next.bio).toBe("元メモ");
    expect(keepExistingRes.next.systemId).toBe("coc7");
    expect(keepExistingRes.next.image).toBe("https://cdn.example.com/old.png");
  });

  it("shouldAutoSync の間隔・フラグ・不正日時境界を正しく判定する", () => {
    const now = Date.parse("2026-11-20T12:00:00.000Z");
    expect(shouldAutoSync(undefined, now)).toBe(false);
    expect(
      shouldAutoSync({ provider: "iachara", url: "https://iachara.com/view/1", autoSync: false }, now),
    ).toBe(false);
    expect(shouldAutoSync({ provider: "iachara", url: "", autoSync: true }, now)).toBe(false);
    expect(
      shouldAutoSync({ provider: "iachara", url: "https://iachara.com/view/1", autoSync: true }, now),
    ).toBe(true);
    expect(
      shouldAutoSync(
        {
          provider: "iachara",
          url: "https://iachara.com/view/1",
          autoSync: true,
          lastSyncedAt: "invalid-date",
        },
        now,
      ),
    ).toBe(true);
    // ちょうど 1 日前なら true、1ms 短いなら false
    const sixHours = 24 * 3600 * 1000;
    expect(
      shouldAutoSync(
        {
          provider: "iachara",
          url: "https://iachara.com/view/1",
          autoSync: true,
          lastSyncedAt: new Date(now - sixHours).toISOString(),
        },
        now,
      ),
    ).toBe(true);
    expect(
      shouldAutoSync(
        {
          provider: "iachara",
          url: "https://iachara.com/view/1",
          autoSync: true,
          lastSyncedAt: new Date(now - sixHours + 1).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });
});
