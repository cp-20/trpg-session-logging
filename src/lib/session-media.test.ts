import { describe, expect, it } from "vitest";
import {
  MEDIA_KINDS,
  MEDIA_SOURCES,
  SERVICE_LABEL,
  canViewMedia,
  defaultSpoiler,
  detectMediaLink,
  expiryState,
  formatChapters,
  mediaForSharedPage,
  mediaThumbnail,
  mediaEditorFields,
  mediaSourceOf,
  needsConsentCheck,
  normalizeMediaUrl,
  embedAt,
  playerSrc,
  formatClock,
  parseChapters,
  parseClock,
  parseTimeParam,
  resolveMediaSource,
  shouldHideSpoiler,
  urlAt,
  visibleMedia,
  type MediaViewer,
  type SessionMedia,
} from "./session-media";

const base: SessionMedia = {
  id: "m1",
  kind: "recording",
  title: "録画",
  spoiler: true,
  scope: "members",
  addedBy: "u_gm",
  createdAt: "2026-11-21T00:00:00Z",
};
const outsider: MediaViewer = { viewerId: null, isMember: false, hasPassed: false };
const member: MediaViewer = { viewerId: "u_pl", isMember: true, hasPassed: true };
const passer: MediaViewer = { viewerId: "u_other", isMember: false, hasPassed: true };

describe("detectMediaLink", () => {
  it("YouTube の動画・配信・再生リストを見分け、埋め込み先を作る", () => {
    expect(detectMediaLink("https://www.youtube.com/watch?v=abcdefghijk&t=1h2m3s")).toEqual({
      service: "youtube",
      label: "YouTube",
      kindHint: "recording",
      embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk?start=3723",
    });
    expect(detectMediaLink("https://youtu.be/abcdefghijk")?.embedUrl).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(detectMediaLink("https://www.youtube.com/live/abcdefghijk")?.kindHint).toBe("stream");
    expect(detectMediaLink("https://www.youtube.com/playlist?list=PL123")).toMatchObject({
      kindHint: "replay",
      embedUrl: "https://www.youtube-nocookie.com/embed/videoseries?list=PL123",
    });
  });

  it("よく使われる置き場所を見分ける", () => {
    expect(detectMediaLink("https://www.nicovideo.jp/watch/sm12345")).toMatchObject({
      service: "niconico",
      embedUrl: "https://embed.nicovideo.jp/watch/sm12345",
    });
    expect(detectMediaLink("https://www.twitch.tv/videos/987")?.embedUrl).toContain("video=v987");
    // BGM・シナリオの頒布ページは紐付ける対象にしないので、汎用の Web として扱う
    expect(detectMediaLink("https://open.spotify.com/playlist/37i9dQ")?.service).toBe("web");
    expect(detectMediaLink("https://booth.pm/ja/items/1")?.service).toBe("web");
    expect(detectMediaLink("https://fusetter.com/tw/abc")?.kindHint).toBe("impression");
    expect(detectMediaLink("https://xxx.gigafile.nu/1201-abc")?.service).toBe("gigafile");
    expect(detectMediaLink("https://www.pixiv.net/novel/show.php?id=1")?.kindHint).toBe("story");
    expect(detectMediaLink("https://example.com/a")?.service).toBe("web");
  });

  it("URL でないもの・http(s) 以外は扱わない", () => {
    expect(detectMediaLink("録画はHDDにある")).toBeNull();
    expect(detectMediaLink("javascript:alert(1)")).toBeNull();
  });
});

describe("見せる相手", () => {
  it("範囲ごとに見られる人が変わる", () => {
    expect(canViewMedia(base, member)).toBe(true);
    expect(canViewMedia(base, passer)).toBe(false);
    expect(canViewMedia({ ...base, scope: "passed" }, passer)).toBe(true);
    expect(canViewMedia({ ...base, scope: "passed" }, outsider)).toBe(false);
    expect(canViewMedia({ ...base, scope: "public" }, outsider)).toBe(true);
    expect(canViewMedia({ ...base, scope: "self" }, member)).toBe(false);
    expect(canViewMedia({ ...base, scope: "people", audience: ["u_pl"] }, member)).toBe(true);
    expect(canViewMedia({ ...base, scope: "people", audience: ["u_pl"] }, passer)).toBe(false);
  });

  it("追加した本人はいつでも見られる", () => {
    expect(canViewMedia({ ...base, scope: "self" }, { ...outsider, viewerId: "u_gm" })).toBe(true);
  });

  it("見てよいものを種類のまとまり順に並べる", () => {
    const items: SessionMedia[] = [
      { ...base, id: "a", kind: "art", scope: "public" },
      { ...base, id: "b", kind: "recording" },
      { ...base, id: "c", kind: "recording", scope: "self" },
      { ...base, id: "d", kind: "report", scope: "public" },
    ];
    expect(visibleMedia(items, member).map((m) => m.id)).toEqual(["b", "d", "a"]);
    expect(visibleMedia(items, outsider).map((m) => m.id)).toEqual(["d", "a"]);
  });

  it("ネタバレは未通過の人にだけ伏せる", () => {
    expect(shouldHideSpoiler(base, outsider)).toBe(true);
    expect(shouldHideSpoiler(base, passer)).toBe(false);
    expect(shouldHideSpoiler({ ...base, spoiler: false }, outsider)).toBe(false);
  });

  it("すべての種類にまとまりと名前がある", () => {
    expect(new Set(MEDIA_KINDS.map((d) => d.kind)).size).toBe(MEDIA_KINDS.length);
  });
});

describe("目次と時刻", () => {
  it("時刻の書式を読み書きする", () => {
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("12:34")).toBe(754);
    expect(parseClock("1:75")).toBeUndefined();
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(754)).toBe("12:34");
    expect(parseTimeParam("90")).toBe(90);
    expect(parseTimeParam("1m30s")).toBe(90);
    expect(parseTimeParam("abc")).toBeUndefined();
  });

  it("概要欄の形式から目次を作り、パートの見出しを解釈する", () => {
    const chapters = parseChapters("0:00 導入\n12:34 - 探索開始\nメモ\nPart2\n1:02:03 クライマックス");
    expect(chapters).toEqual([
      { at: 0, label: "導入" },
      { at: 754, label: "探索開始" },
      { at: 3723, label: "クライマックス", part: 2 },
    ]);
    expect(parseChapters(formatChapters(chapters))).toEqual(chapters);
  });

  it("録画の位置で開く URL を作る", () => {
    expect(urlAt("https://youtu.be/abcdefghijk", 754)).toBe("https://youtu.be/abcdefghijk?t=754s");
    expect(urlAt("https://drive.google.com/file/d/x", 754)).toBe("https://drive.google.com/file/d/x");
  });

  it("置き場所の期限を知らせる", () => {
    expect(expiryState({ ...base, expiresAt: "2026-11-20" }, "2026-11-21")).toBe("expired");
    expect(expiryState({ ...base, expiresAt: "2026-11-25" }, "2026-11-21")).toBe("soon");
    expect(expiryState({ ...base, expiresAt: "2027-01-01" }, "2026-11-21")).toBeNull();
    expect(expiryState(base, "2026-11-21")).toBeNull();
  });
});

describe("共有ページに載せる範囲", () => {
  const items: SessionMedia[] = [
    { ...base, id: "self", scope: "self" },
    { ...base, id: "people", scope: "people", audience: ["u_pl"] },
    { ...base, id: "members", scope: "members" },
    { ...base, id: "passed", scope: "passed" },
    { ...base, id: "public", scope: "public" },
  ];
  it("共有ページを読める人より狭い範囲のものは載せない", () => {
    expect(mediaForSharedPage(items, "members").map((m) => m.id)).toEqual(["members", "passed", "public"]);
    expect(mediaForSharedPage(items, "passed").map((m) => m.id)).toEqual(["passed", "public"]);
    expect(mediaForSharedPage(items, "public").map((m) => m.id)).toEqual(["public"]);
    expect(mediaForSharedPage(undefined, "public")).toEqual([]);
  });
});

describe("一覧の見た目に使う URL", () => {
  it("YouTube のサムネイルと、目次から飛ぶ埋め込み URL", () => {
    expect(mediaThumbnail("https://youtu.be/abcdefghijk")).toBe(
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    );
    expect(mediaThumbnail("https://drive.google.com/x")).toBeUndefined();
    expect(mediaThumbnail(undefined)).toBeUndefined();
    expect(embedAt("https://www.youtube-nocookie.com/embed/abcdefghijk", 754)).toBe(
      "https://www.youtube-nocookie.com/embed/abcdefghijk?start=754&autoplay=1",
    );
  });
});

describe("追加の流れ", () => {
  it("貼られた URL を整え、スキームのないものには https:// を補う", () => {
    expect(normalizeMediaUrl("  https://youtu.be/abcdefg  ")).toBe("https://youtu.be/abcdefg");
    expect(normalizeMediaUrl("youtu.be/abcdefg")).toBe("https://youtu.be/abcdefg");
    expect(normalizeMediaUrl("fusetter.com/tw/abc")).toBe("https://fusetter.com/tw/abc");
    expect(normalizeMediaUrl("")).toBeNull();
    expect(normalizeMediaUrl("録画は HDD にあります")).toBeNull();
    expect(normalizeMediaUrl("ftp://example.com/a")).toBeNull();
  });

  it("置き場所の例の URL は、その置き場所の URL と読める", () => {
    for (const s of MEDIA_SOURCES) {
      if (s.id === "other" || s.id === "none") continue;
      const link = detectMediaLink(s.urlExample.replaceAll("…", "abcdefghijk"));
      expect(link && mediaSourceOf(link.service), s.urlExample).toBe(s.id);
    }
    expect(MEDIA_SOURCES.flatMap((s) => s.services).length).toBe(
      new Set(MEDIA_SOURCES.flatMap((s) => s.services)).size,
    );
  });

  it("選ばせるのは YouTube・ニコニコ・ふせったー・X とその他。どのサービスもどこかの置き場所に入る", () => {
    expect(MEDIA_SOURCES.map((s) => s.id)).toEqual(["youtube", "niconico", "fusetter", "x", "other", "none"]);
    for (const service of Object.keys(SERVICE_LABEL) as (keyof typeof SERVICE_LABEL)[]) {
      expect(
        MEDIA_SOURCES.some((s) => s.services.includes(service)),
        service,
      ).toBe(true);
    }
    // 選べなくなったサービスの URL も、これまでどおり読める（保存済みのものを壊さない）
    expect(detectMediaLink("https://www.twitch.tv/videos/123")?.embedUrl).toContain("player.twitch.tv");
    expect(mediaSourceOf("twitch")).toBe("other");
    expect(resolveMediaSource("other", detectMediaLink("https://www.twitch.tv/videos/123")).kind).toBe(
      "stream",
    );
  });

  it("選んだ置き場所と違う URL を貼ったら、合う置き場所と種類に寄せる", () => {
    const at = (raw: string) => detectMediaLink(raw);
    expect(resolveMediaSource("youtube", null)).toEqual({ source: "youtube", kind: "recording" });
    expect(resolveMediaSource("fusetter", null)).toEqual({ source: "fusetter", kind: "impression" });
    expect(resolveMediaSource("youtube", at("https://youtu.be/abcdefghijk"))).toEqual({
      source: "youtube",
      kind: "recording",
    });
    expect(resolveMediaSource("youtube", at("https://www.youtube.com/live/abcdefghijk")).kind).toBe("stream");
    expect(resolveMediaSource("youtube", at("https://fusetter.com/tw/abc"))).toEqual({
      source: "fusetter",
      kind: "impression",
    });
    expect(resolveMediaSource("x", at("https://www.pixiv.net/novel/show.php?id=1"))).toEqual({
      source: "other",
      kind: "story",
    });
    // 知らないサイトでも、選んだときのつもり（感想）は残す
    expect(resolveMediaSource("fusetter", at("https://example.com/a"))).toEqual({
      source: "other",
      kind: "impression",
    });
    expect(resolveMediaSource("other", at("https://example.com/a")).kind).toBe("other");
  });

  it("種類と置き場所で、最初に見せる欄と畳む欄を分ける", () => {
    expect(mediaEditorFields("recording", "youtube")).toEqual({
      main: [],
      more: ["parts", "chapters", "startedAt", "pov", "credits", "expiresAt", "note"],
    });
    expect(mediaEditorFields("recording", "gigafile").main).toEqual(["expiresAt"]);
    expect(mediaEditorFields("art", "pixiv")).toEqual({ main: ["credits"], more: ["expiresAt", "note"] });
    // 再生できないものにパート・目次は出さない
    expect(mediaEditorFields("impression", "fusetter").more).not.toContain("chapters");
    // 値の入っている欄は種類を変えても残す
    expect(mediaEditorFields("impression", null, ["pov"]).more).toContain("pov");
  });

  it("ネタバレの既定は、卓報告だけ含まない", () => {
    expect(defaultSpoiler("report")).toBe(false);
    expect(defaultSpoiler("impression")).toBe(true);
    expect(defaultSpoiler("recording")).toBe(true);
    // X の URL は卓報告と読むので、ネタバレを含まないが既定になる
    expect(defaultSpoiler(detectMediaLink("https://x.com/a/status/1")!.kindHint)).toBe(false);
  });

  it("了承は録画・録音・配信を自分以外に見せるときだけ確かめる", () => {
    expect(needsConsentCheck("recording", "members")).toBe(true);
    expect(needsConsentCheck("stream", "public")).toBe(true);
    expect(needsConsentCheck("recording", "self")).toBe(false);
    expect(needsConsentCheck("replay", "public")).toBe(false);
    expect(needsConsentCheck("impression", "members")).toBe(false);
  });
});

describe("playerSrc（ログと並べて再生する埋め込み）", () => {
  const page = { origin: "https://takufu.app", host: "takufu.app" };
  it("YouTube は位置を知らせる設定と開始位置", () => {
    const u = new URL(playerSrc("https://www.youtube-nocookie.com/embed/abc", 754, page));
    expect(Object.fromEntries(u.searchParams)).toEqual({
      start: "754",
      autoplay: "1",
      enablejsapi: "1",
      origin: "https://takufu.app",
      playsinline: "1",
    });
  });
  it("ニコニコは jsapi、Twitch は埋め込む側のホスト", () => {
    const n = new URL(playerSrc("https://embed.nicovideo.jp/watch/sm9", 61, page));
    expect(n.searchParams.get("from")).toBe("61");
    expect(n.searchParams.get("jsapi")).toBe("1");
    const t = new URL(playerSrc("https://player.twitch.tv/?video=v1&autoplay=false", 3723, page));
    expect(t.searchParams.get("time")).toBe("1h2m3s");
    expect(t.searchParams.get("parent")).toBe("takufu.app");
    expect(t.searchParams.get("autoplay")).toBe("true");
  });
});
