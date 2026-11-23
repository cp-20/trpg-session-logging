import { describe, expect, it } from "vitest";
import {
  MEDIA_KINDS,
  canViewMedia,
  detectMediaLink,
  expiryState,
  formatChapters,
  mediaForSharedPage,
  mediaThumbnail,
  mediaEditorFields,
  mediaTitleLookupUrl,
  needsConsentCheck,
  normalizeMediaUrl,
  titleFromOembed,
  embedAt,
  formatClock,
  mediaOffsetAt,
  parseChapters,
  parseClock,
  parseTimeParam,
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

  it("ログの発言時刻から録画の位置を出し、その位置で開く URL を作る", () => {
    const m = { ...base, startedAt: 1_000_000 };
    expect(mediaOffsetAt(m, 1_000_754)).toBe(754);
    expect(mediaOffsetAt(m, 999_999)).toBeNull();
    expect(mediaOffsetAt(base, 1_000_754)).toBeNull();
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

  it("題名は YouTube の動画だけ oEmbed で引く", () => {
    expect(mediaTitleLookupUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
    );
    expect(mediaTitleLookupUrl("https://www.youtube.com/playlist?list=PLx")).toBeUndefined();
    expect(mediaTitleLookupUrl("https://fusetter.com/tw/abc")).toBeUndefined();
    expect(titleFromOembed({ title: "  第一夜  " })).toBe("第一夜");
    expect(titleFromOembed({ title: "" })).toBeUndefined();
    expect(titleFromOembed(null)).toBeUndefined();
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

  it("了承は録画・録音・配信を自分以外に見せるときだけ確かめる", () => {
    expect(needsConsentCheck("recording", "members")).toBe(true);
    expect(needsConsentCheck("stream", "public")).toBe(true);
    expect(needsConsentCheck("recording", "self")).toBe(false);
    expect(needsConsentCheck("replay", "public")).toBe(false);
    expect(needsConsentCheck("impression", "members")).toBe(false);
  });
});
