import { describe, expect, it } from "vitest";
import {
  PREVIEW_UPSTREAM_HOSTS,
  decodeEntities,
  htmlToText,
  parseFusetterPost,
  parseIsoDuration,
  parseNicoThumbInfo,
  parsePreviewResponse,
  parseYoutubeWatchTiming,
  parseXOembed,
  parseYoutubeOembed,
  previewRequestUrl,
  previewTarget,
  readPreviewJson,
  safeThumbnail,
  thumbnailCandidates,
  titleRepeatsExcerpt,
} from "./media-preview";

describe("問い合わせ先", () => {
  it("対応するサービスの URL から ID を取り出し、固定の問い合わせ先に組み直す", () => {
    expect(previewTarget("https://youtu.be/abcdefghijk?si=track")).toEqual({
      service: "youtube",
      id: "abcdefghijk",
      fetchUrl:
        "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabcdefghijk",
      timingUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    expect(previewTarget("https://www.nicovideo.jp/watch/sm9?from=30")?.fetchUrl).toBe(
      "https://ext.nicovideo.jp/api/getthumbinfo/sm9",
    );
    expect(previewTarget("https://nico.ms/so123")?.id).toBe("so123");
    expect(previewTarget("https://fusetter.com/tw/aX7Hu")?.fetchUrl).toBe(
      "https://api.fusetter.com/api/posts/public/aX7Hu",
    );
    expect(previewTarget("https://twitter.com/someone/status/123456?s=20")?.fetchUrl).toBe(
      "https://publish.x.com/oembed?omit_script=1&dnt=true&url=https%3A%2F%2Fx.com%2Fsomeone%2Fstatus%2F123456",
    );
    expect(previewTarget("https://x.com/i/web/status/99")?.id).toBe("99");
  });

  it("一覧の外・http・中身を指さない URL・ホストに紛れ込ませたものは引かない", () => {
    for (const raw of [
      "http://x.com/a/status/1",
      "https://x.com/a",
      "https://x.com.evil.example/a/status/1",
      "https://evil.example/?u=https://x.com/a/status/1",
      "https://user:pw@x.com/a/status/1",
      "https://x.com:8443/a/status/1",
      "https://fusetter.com/tw/../../admin",
      "https://fusetter.com/",
      "https://live.nicovideo.jp/watch/lv1",
      "https://www.nicovideo.jp/watch/sm9/../../x",
      "https://www.youtube.com/playlist?list=PLx",
      "https://127.0.0.1/a/status/1",
      "javascript:alert(1)",
      "",
    ]) {
      expect(previewTarget(raw), raw).toBeNull();
    }
  });

  it("組み直した先は必ず固定のホスト", () => {
    for (const raw of [
      "https://youtu.be/abcdefghijk",
      "https://nico.ms/sm1",
      "https://fusetter.com/tw/abc",
      "https://x.com/a/status/1",
    ]) {
      const t = previewTarget(raw)!;
      expect(PREVIEW_UPSTREAM_HOSTS.has(new URL(t.fetchUrl).hostname)).toBe(true);
    }
  });

  it("画面からは自分のサーバーにだけ問い合わせる", () => {
    expect(previewRequestUrl(" https://x.com/a/status/1 ")).toBe(
      "/api/media-preview?url=https%3A%2F%2Fx.com%2Fa%2Fstatus%2F1",
    );
    expect(previewRequestUrl("https://poipiku.com/1/2.html")).toBeUndefined();
    expect(previewRequestUrl(undefined)).toBeUndefined();
  });
});

describe("文字にする", () => {
  it("文字参照を戻し、タグを除き、改行を残す", () => {
    expect(decodeEntities("&amp;&lt;b&gt; &#12354;&#x3044; a&mdash;b &bogus;")).toBe("&<b> あい a—b &bogus;");
    expect(htmlToText("一行目<br>二行目<br/><br><br>三行目 <b>太字</b>")).toBe(
      "一行目\n二行目\n\n三行目 太字",
    );
    expect(htmlToText("‪見えない文字‬")).toBe("見えない文字");
  });

  it("サムネイルはサービス自身の CDN のものだけ", () => {
    expect(safeThumbnail("niconico", "http://tn.smilevideo.jp/smile?i=1")).toBe(
      "https://tn.smilevideo.jp/smile?i=1",
    );
    expect(safeThumbnail("niconico", "https://evil.example/a.jpg")).toBeUndefined();
    expect(safeThumbnail("youtube", "javascript:alert(1)")).toBeUndefined();
    expect(safeThumbnail("x", "https://pbs.twimg.com/a.jpg")).toBeUndefined();
  });
});

describe("X の oEmbed", () => {
  const oembed = {
    url: "https://x.com/takufu_gm/status/1",
    author_name: "みかん",
    author_url: "https://x.com/takufu_gm",
    html: '<blockquote class="twitter-tweet" data-dnt="true"><p lang="ja" dir="ltr">「深淵の呼び声」卓報告&#10;<br>全員生還しました &amp; 楽しかった！<br><a href="https://twitter.com/hashtag/CoC?src=hash">#CoC</a> <a href="https://t.co/abc">pic.x.com/abc</a></p>&mdash; みかん (@takufu_gm) <a href="https://x.com/takufu_gm/status/1?ref_src=twsrc%5Etfw">November 1, 2026</a></blockquote>\n',
    provider_name: "X",
  };

  it("書いた人と本文を取り出し、画像のリンクと日付・署名は外す", () => {
    expect(parseXOembed(oembed)).toEqual({
      service: "x",
      title: "「深淵の呼び声」卓報告",
      author: "みかん @takufu_gm",
      excerpt: "「深淵の呼び声」卓報告\n\n全員生還しました & 楽しかった！\n#CoC",
    });
  });

  it("本文に HTML を紛れ込ませても文字として扱う", () => {
    const p = parseXOembed({
      ...oembed,
      html: "<blockquote><p>&lt;img src=x onerror=alert(1)&gt;<script>x</script></p></blockquote>",
    });
    expect(p?.excerpt).toBe("<img src=x onerror=alert(1)>x");
  });

  it("読めない応答は null", () => {
    expect(parseXOembed(null)).toBeNull();
    expect(parseXOembed({ html: "" })).toBeNull();
    expect(parsePreviewResponse(previewTarget("https://x.com/a/status/1")!, "<html>")).toBeNull();
  });
});

describe("ふせったー", () => {
  const post = {
    identificationCode: "abc12",
    rawContent: "感想です。犯人は<mark>執事</mark>でした",
    turnContent: "‪感想です。犯人は<mark>*****</mark>でした\n続きは追記で‬",
    additionalContent: "追記: 結末は〇〇",
    isHidden: false,
    author: { displayName: "そら", fusetterUserId: "sora" },
  };

  it("公開の部分だけを使い、伏せ字は伏せたまま", () => {
    const p = parseFusetterPost(post, "abc12")!;
    expect(p).toEqual({
      service: "fusetter",
      title: "感想です。犯人は＊＊＊でした",
      author: "そら",
      excerpt: "感想です。犯人は＊＊＊でした\n続きは追記で",
    });
    // 伏せる前の本文と追記は出さない
    expect(JSON.stringify(p)).not.toContain("執事");
    expect(JSON.stringify(p)).not.toContain("結末");
  });

  it("非公開・別の投稿・公開の部分がないものは null", () => {
    expect(parseFusetterPost({ ...post, isHidden: true }, "abc12")).toBeNull();
    expect(parseFusetterPost(post, "other")).toBeNull();
    expect(parseFusetterPost({ ...post, turnContent: undefined }, "abc12")).toBeNull();
  });

  it("長い本文は題名を 1 行目の 40 字、本文を 280 字で切る", () => {
    const long = "あ".repeat(500);
    const p = parseFusetterPost({ ...post, turnContent: long }, "abc12")!;
    expect([...p.title].length).toBe(40);
    expect([...p.excerpt!].length).toBe(280);
    expect(p.excerpt!.endsWith("…")).toBe(true);
  });
});

describe("ニコニコ・YouTube", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok"><thumb><video_id>sm1</video_id><title>【CoC】深淵の呼び声 &amp; 第一夜</title><description>説明</description><thumbnail_url>https://nicovideo.cdn.nimg.jp/thumbnails/1/1</thumbnail_url><user_nickname>みかん</user_nickname></thumb></nicovideo_thumb_response>`;

  it("getthumbinfo から題名・投稿者・サムネイル", () => {
    expect(parseNicoThumbInfo(xml, "sm1")).toEqual({
      service: "niconico",
      title: "【CoC】深淵の呼び声 & 第一夜",
      author: "みかん",
      thumbnail: "https://nicovideo.cdn.nimg.jp/thumbnails/1/1",
    });
    expect(
      parseNicoThumbInfo(xml.replace("user_nickname>みかん</user_nickname", "ch_name>公式</ch_name"), "sm1")
        ?.author,
    ).toBe("公式");
    expect(parseNicoThumbInfo(xml, "sm2")).toBeNull();
    expect(
      parseNicoThumbInfo(
        '<nicovideo_thumb_response status="fail"><error/></nicovideo_thumb_response>',
        "sm1",
      ),
    ).toBeNull();
    expect(
      parseNicoThumbInfo(xml.replace("nicovideo.cdn.nimg.jp", "evil.example"), "sm1")?.thumbnail,
    ).toBeUndefined();
  });

  it("YouTube の oEmbed から題名・投稿者・サムネイル", () => {
    expect(
      parseYoutubeOembed({
        title: " 第一夜 ",
        author_name: "卓",
        thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg",
      }),
    ).toEqual({
      service: "youtube",
      title: "第一夜",
      author: "卓",
      thumbnail: "https://i.ytimg.com/vi/x/hqdefault.jpg",
    });
    expect(parseYoutubeOembed({ title: "" })).toBeNull();
  });

  it("getthumbinfo の長さ（1:02:03・12:34）を秒にする", () => {
    const withLength = (l: string) => xml.replace("<description>", `<length>${l}</length><description>`);
    expect(parseNicoThumbInfo(withLength("1:02:03"), "sm1")?.durationSec).toBe(3723);
    expect(parseNicoThumbInfo(withLength("12:34"), "sm1")?.durationSec).toBe(754);
    expect(parseNicoThumbInfo(withLength("不明"), "sm1")).not.toHaveProperty("durationSec");
  });

  it("YouTube の動画のページから、配信の開始時刻と長さを読む（時差つきの日時だけ）", () => {
    const page = (meta: string) => `<div>${meta}</div>`;
    const live = page(
      '<meta itemprop="duration" content="PT3H2M1S"><meta itemprop="isLiveBroadcast" content="True"><meta itemprop="startDate" content="2026-11-20T21:00:56+09:00"><meta itemprop="endDate" content="2026-11-21T00:03:00+09:00">',
    );
    expect(parseYoutubeWatchTiming(live)).toEqual({
      startedAt: Math.floor(Date.parse("2026-11-20T12:00:56Z") / 1000),
      durationSec: 3 * 3600 + 2 * 60 + 1,
    });
    // 長さがまだ載っていない配信は、終了 − 開始
    expect(
      parseYoutubeWatchTiming(
        page(
          '<meta itemprop="isLiveBroadcast" content="True"><meta itemprop="startDate" content="2026-11-20T12:00:00+00:00"><meta itemprop="endDate" content="2026-11-20T13:30:00+00:00">',
        ),
      ),
    ).toEqual({ startedAt: Math.floor(Date.parse("2026-11-20T12:00:00Z") / 1000), durationSec: 5400 });
    // 配信でない動画は、投稿日時を開始時刻にしない
    expect(
      parseYoutubeWatchTiming(
        page(
          '<meta itemprop="duration" content="PT3M34S"><meta itemprop="uploadDate" content="2009-10-24T23:57:33-07:00">',
        ),
      ),
    ).toEqual({ durationSec: 214 });
    // 時差のない日時は読まない
    expect(
      parseYoutubeWatchTiming(
        page(
          '<meta itemprop="isLiveBroadcast" content="True"><meta itemprop="startDate" content="2026-11-20T21:00:00">',
        ),
      ),
    ).toEqual({});
  });

  it("ISO 8601 の期間", () => {
    expect(parseIsoDuration("PT1H")).toBe(3600);
    expect(parseIsoDuration("P1DT1S")).toBe(86401);
    expect(parseIsoDuration("PT0S")).toBeUndefined();
    expect(parseIsoDuration("PT")).toBeUndefined();
    expect(parseIsoDuration("1:00")).toBeUndefined();
  });
});

describe("画面で受け取るとき", () => {
  it("形の合わないもの・よその画像は捨てる", () => {
    expect(readPreviewJson({ service: "x", title: "a", thumbnail: "https://evil.example/a.png" })).toEqual({
      service: "x",
      title: "a",
    });
    expect(readPreviewJson({ service: "web", title: "a" })).toBeNull();
    expect(readPreviewJson({ ok: false, error: "x" })).toBeNull();
  });

  it("開始時刻・長さは、ありうる範囲の整数だけ", () => {
    const base = { service: "youtube", title: "a" };
    expect(readPreviewJson({ ...base, startedAt: 1_795_000_000, durationSec: 7200 })).toEqual({
      ...base,
      startedAt: 1_795_000_000,
      durationSec: 7200,
    });
    expect(readPreviewJson({ ...base, startedAt: "1795000000", durationSec: -1 })).toEqual(base);
    expect(readPreviewJson({ ...base, startedAt: 12, durationSec: 1.5 })).toEqual(base);
  });

  it("題名が本文の頭なら重ねて出さない", () => {
    expect(titleRepeatsExcerpt("卓報告…", "卓報告です")).toBe(true);
    expect(titleRepeatsExcerpt("ネタバレ感想", "卓報告です")).toBe(false);
    expect(titleRepeatsExcerpt("ネタバレ感想", undefined)).toBe(false);
  });
});

describe("サムネイルの候補", () => {
  it("ニコニコは大きい版（.M）を先に試し、なければ元の画像", () => {
    expect(thumbnailCandidates("https://nicovideo.cdn.nimg.jp/thumbnails/30000000/30000000")).toEqual([
      "https://nicovideo.cdn.nimg.jp/thumbnails/30000000/30000000.M",
      "https://nicovideo.cdn.nimg.jp/thumbnails/30000000/30000000",
    ]);
    expect(
      thumbnailCandidates("https://nicovideo.cdn.nimg.jp/thumbnails/43000000/43000000.95515327"),
    ).toHaveLength(2);
    expect(thumbnailCandidates("https://i.ytimg.com/vi/x/hqdefault.jpg")).toEqual([
      "https://i.ytimg.com/vi/x/hqdefault.jpg",
    ]);
    expect(thumbnailCandidates(undefined)).toEqual([]);
  });
});
