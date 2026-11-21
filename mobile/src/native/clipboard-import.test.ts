import { describe, expect, it, vi } from "vitest";

vi.mock("expo-clipboard", () => ({
  hasStringAsync: vi.fn(async () => false),
  getStringAsync: vi.fn(async () => ""),
}));

import { classifyClipboardContent } from "./clipboard-import";

describe("classifyClipboardContent", () => {
  it("CCFOLIA 駒出力 JSON を探索者候補として認識する", () => {
    const json = JSON.stringify({
      kind: "character",
      data: {
        name: "遠沢澄花",
        memo: "地方紙記者",
        commands: "CC<=70 目星",
        status: [
          { label: "SAN", value: 52 },
          { label: "HP", value: 11 },
        ],
      },
    });
    const res = classifyClipboardContent(json);
    expect(res?.kind).toBe("character");
    if (res?.kind === "character") {
      expect(res.previewName).toBe("遠沢澄花");
      expect(res.sourceLabel).toBe("CCFOLIA");
    }
  });

  it("いあきゃらテキストを探索者候補として認識する", () => {
    const text = `名前: 白瀬怜
職業: 救急医
STR: 11 CON: 12 POW: 13
HP: 12 MP: 13 SAN: 65/99`;
    const res = classifyClipboardContent(text);
    expect(res?.kind).toBe("character");
    if (res?.kind === "character") {
      expect(res.previewName).toBe("白瀬怜");
    }
  });

  it("複数行のセッションログテキストをログ候補として認識する", () => {
    const text = `[メイン] 21:00 KP: 夜霜: それでは開始します。
[メイン] 21:02 遠沢澄花: 「よろしくお願いします」`;
    const res = classifyClipboardContent(text);
    expect(res?.kind).toBe("log");
    if (res?.kind === "log") {
      expect(res.messageCount).toBe(2);
    }
  });

  it("招待リンク・公開ログリンク・公開探索者リンクを認識する", () => {
    expect(classifyClipboardContent("https://takufu.example.com/invite/tbl_abc123")).toEqual({
      kind: "invite",
      token: "tbl_abc123",
      url: "https://takufu.example.com/invite/tbl_abc123",
    });

    expect(classifyClipboardContent("takufu://share/l/slug-xyz")).toEqual({
      kind: "shareLog",
      slug: "slug-xyz",
      url: "takufu://share/l/slug-xyz",
    });

    expect(classifyClipboardContent("https://takufu.example.com/share/c/ch_09")).toEqual({
      kind: "shareCharacter",
      id: "ch_09",
      url: "https://takufu.example.com/share/c/ch_09",
    });
  });

  it("関係ない雑談テキストには null を返す", () => {
    expect(classifyClipboardContent("")).toBeNull();
    expect(classifyClipboardContent("来週の金曜21時から大丈夫です")).toBeNull();
  });
});
