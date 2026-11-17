import { describe, expect, it } from "vitest";
import { buildReportCardSVG, reportTweetText, xIntentUrl, svgDataUrl } from "./index";

describe("buildReportCardSVG", () => {
  const data = {
    scenarioTitle: "深淵の呼び声",
    scenarioEmoji: "🌊",
    title: "深淵の呼び声 — 第3陣",
    dateLabel: "11月7日(土)・8日(日)",
    systemName: "クトゥルフ神話TRPG 7版",
    playerCount: 4,
    endLabel: "BAD END「海の聲」",
    shareUrl: "https://takufu.app/l/svhemln",
  };

  it("シナリオ名・ENDラベル・共有URLを含むSVGを生成する", () => {
    const svg = buildReportCardSVG(data);
    expect(svg).toContain("<svg");
    expect(svg).toContain("深淵の呼び声");
    expect(svg).toContain("BAD END「海の聲」");
  });
  it("エスケープされる(不正なタイトルでも壊れない)", () => {
    const svg = buildReportCardSVG({ ...data, scenarioTitle: "<script>alert(1)</script>", endLabel: undefined });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});

describe("X intent", () => {
  it("#卓報告 付きのツイート本文とURLを組む", () => {
    const d = { scenarioTitle: "廃校の十三時間目", title: "廃校の十三時間目 — 後夜祭", dateLabel: "11月14日(土)", systemName: "CoC7", playerCount: 4, endLabel: "正常END「新しい朝」", shareUrl: "https://takufu.app/l/abc" };
    expect(reportTweetText(d)).toContain("#卓報告");
    expect(reportTweetText(d)).toContain("廃校の十三時間目");
    expect(xIntentUrl(d)).toContain("https://twitter.com/intent/tweet");
  });
});

describe("svgDataUrl", () => {
  it("data URL にエンコードする", () => {
    expect(svgDataUrl("<svg/>").startsWith("data:image/svg+xml;utf8,%3Csvg%2F%3E")).toBe(true);
  });
});
