/**
 * 関連するもの（YouTube・ニコニコ・ふせったー・X）の題名・書いた人の取得を本物で通す。
 * 入口は /api/media-preview の中身（handleMediaPreview）。覚えておく表は毎回空にして、必ず相手に問い合わせる。
 */
import { describe, expect, it } from "vitest";
import { handleMediaPreview, type MediaPreviewResult } from "../../lib/media-preview-server";
import { politely } from "./live-kit";
import { MEDIA_SAMPLES } from "./live-samples";

async function preview(url: string) {
  return politely(new URL(url).hostname, () =>
    handleMediaPreview(url, { cache: new Map(), timeoutMs: 15_000 }),
  );
}

describe("関連するものの取得（本物）", () => {
  it.each(MEDIA_SAMPLES.youtube)(
    "YouTube（%s）は題名・投稿者・i.ytimg.com のサムネイルを返す",
    async (url) => {
      const r = await preview(url);

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.preview).toMatchObject({
        service: "youtube",
        title: expect.any(String),
        author: expect.any(String),
      });
      expect(new URL(r.preview.thumbnail!).hostname).toBe("i.ytimg.com");
    },
  );

  it.each(MEDIA_SAMPLES.niconico)("ニコニコ（%s）は題名・投稿者・ニコニコのサムネイルを返す", async (url) => {
    const r = await preview(url);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview).toMatchObject({
      service: "niconico",
      title: expect.any(String),
      author: expect.any(String),
    });
    expect(["nicovideo.cdn.nimg.jp", "tn.smilevideo.jp"]).toContain(new URL(r.preview.thumbnail!).hostname);
  });

  it("ふせったーは、公開の部分の頭と書いた人を返す", async () => {
    const results: MediaPreviewResult[] = [];
    for (const url of MEDIA_SAMPLES.fusetter) {
      const r = await preview(url);
      results.push(r);
      if (r.ok) break;
    }

    const ok = results.find((r) => r.ok);
    expect(ok?.ok).toBe(true);
    if (!ok?.ok) return;
    expect(ok.preview).toMatchObject({
      service: "fusetter",
      title: expect.any(String),
      excerpt: expect.any(String),
    });
  });

  it.each(MEDIA_SAMPLES.x)("X（%s）は公式の oEmbed から本文の頭と書いた人を返す", async (url) => {
    const r = await preview(url);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.preview).toMatchObject({ service: "x", title: expect.any(String), author: expect.any(String) });
    expect(r.preview.excerpt?.trim()).not.toBe("");
  });
});
