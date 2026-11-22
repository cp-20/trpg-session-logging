import { describe, expect, it, vi } from "vitest";

vi.mock("expo-clipboard", () => ({
  hasStringAsync: vi.fn(async () => false),
  getStringAsync: vi.fn(async () => ""),
}));

import { classifyClipboardContent } from "./clipboard-import";

describe("classifyClipboardContent", () => {
  it("キャラシの URL を取り込み候補にし、コマ出力やテキストは候補にしない（P6）", () => {
    expect(classifyClipboardContent("https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac")).toEqual({
      kind: "sheetUrl",
      url: "https://charaeno.com/7th/h_wQNXeiHPXDEDtG3r2ac",
      sourceLabel: "キャラエノ",
    });
    expect(
      classifyClipboardContent(JSON.stringify({ kind: "character", data: { name: "遠沢澄花" } })),
    ).toBeNull();
    expect(classifyClipboardContent("名前: 白瀬怜\nSTR: 11 HP: 12 SAN: 65/99")).toBeNull();
    expect(classifyClipboardContent("https://iachara.com/view/1")).toEqual({
      kind: "sheetUrl",
      url: "https://iachara.com/view/1",
      sourceLabel: "いあきゃら",
    });
  });

  it("Udonarium のチャットログ XML をログ候補として認識し、自由形式のテキストは候補にしない", () => {
    const text = `<chat-log><chat name="KP" tab="メイン">それでは開始します。</chat><chat name="遠沢澄花" tab="メイン">よろしくお願いします</chat></chat-log>`;
    expect(
      classifyClipboardContent(
        `[メイン] 21:00 KP: 夜霜: それでは開始します。\n[メイン] 21:02 遠沢澄花: 「よろしく」`,
      ),
    ).toBeNull();
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
