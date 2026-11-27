/**
 * シナリオの取り込み（BOOTH・TALTO）と、共有シナリオ一覧の元になる TALTO の公開 API を本物で通す。
 * 入口は画面の取り込みと同じ handleExternalImport。
 */
import { describe, expect, it } from "vitest";
import { TALTO_API_ORIGIN } from "../../lib/external-sync";
import { discover, fetchText, importFirst } from "./live-kit";

/** BOOTH の検索（robots.txt で許されている）から、TRPG シナリオの商品を拾う */
const BOOTH_SEARCH = "https://booth.pm/ja/search/TRPG%20%E3%82%B7%E3%83%8A%E3%83%AA%E3%82%AA";

interface TaltoProject {
  id: string;
  name: string;
  author: string;
  category_id: number;
}

async function taltoLatest(limit: number): Promise<TaltoProject[]> {
  const res = await fetchText(`${TALTO_API_ORIGIN}/v1/projects?limit=${limit}&offset=0`);
  expect(res.status).toBe(200);
  return JSON.parse(res.body) as TaltoProject[];
}

describe("BOOTH（本物）", () => {
  it("商品ページの URL から、題名・作者（ショップ）・タグを読む", async () => {
    const urls = await discover(BOOTH_SEARCH, /https:\/\/booth\.pm\/ja\/items\/\d+/, 3);

    const r = await importFirst(urls);

    expect(r.kind).toBe("scenario");
    if (r.kind !== "scenario") return;
    expect(r.scenario.title.trim()).not.toBe("");
    expect(r.scenario.author?.trim()).not.toBe("");
    expect(r.scenario.source).toBe("booth");
    expect(Array.isArray(r.scenario.tags)).toBe(true);
  });
});

describe("TALTO（本物）", () => {
  it("作品ページの URL から、サイトと同じ題名・作者を読む", async () => {
    const [project] = await taltoLatest(1);

    const r = await importFirst([`https://talto.cc/projects/${project!.id}`]);

    expect(r.kind).toBe("scenario");
    if (r.kind !== "scenario") return;
    expect(r.scenario).toMatchObject({
      title: project!.name.trim(),
      author: project!.author.trim(),
      source: "talto",
      sourceUrl: `https://talto.cc/projects/${project!.id}`,
    });
  });

  it("共有シナリオ一覧の取得（scripts/fetch-talto-scenarios.ts）が使う一覧とカテゴリの形が変わっていない", async () => {
    const projects = await taltoLatest(3);
    const categories = await fetchText(`${TALTO_API_ORIGIN}/v1/categories`);

    for (const p of projects) {
      expect(p).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        author: expect.any(String),
        category_id: expect.any(Number),
      });
    }
    const list = JSON.parse(categories.body) as { id: number; slug: string; name: string }[];
    expect(list.length).toBeGreaterThan(10);
    expect(list.map((c) => c.slug)).toEqual(
      expect.arrayContaining(["call_of_cthulhu_6th", "call_of_cthulhu_7th"]),
    );
  });
});
