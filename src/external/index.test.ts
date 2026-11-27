import { describe, expect, it } from "vitest";
import { reportTweetText, xIntentUrl } from "./index";

describe("X の #卓報告 の投稿", () => {
  const d = { title: "廃校の十三時間目", playerCount: 4, shareUrl: "https://takufu.app/l/abc" };

  it("題名と人数と #卓報告 を入れ、エンディングなどネタバレになるものは入れない", () => {
    expect(reportTweetText(d)).toBe("「廃校の十三時間目」を4人で遊びました #卓報告");
  });

  it("顔ぶれが分からないときは人数を書かない", () => {
    expect(reportTweetText({ ...d, playerCount: 0 })).toBe("「廃校の十三時間目」を遊びました #卓報告");
  });

  it("投稿画面の URL に本文と共有ページの URL を載せる", () => {
    const url = new URL(xIntentUrl(d));
    expect(url.origin + url.pathname).toBe("https://twitter.com/intent/tweet");
    expect(url.searchParams.get("text")).toBe(reportTweetText(d));
    expect(url.searchParams.get("url")).toBe(d.shareUrl);
  });
});
