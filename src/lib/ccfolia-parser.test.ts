import fixtureRaw from "../../e2e/fixtures/ccfolia-sample.json";
import { describe, expect, it } from "vitest";
import { parseCcfoliaLog, sessionDatesOf, summarizeParsed } from "./ccfolia-parser";

const fixture = JSON.stringify(fixtureRaw);

describe("parseCcfoliaLog", () => {
  const parsed = parseCcfoliaLog(fixture)!;

  it("実形式のフィクスチャからメッセージを復元する", () => {
    expect(parsed.messageCount).toBe(12);
  });

  it("チャンネルを正規名に分類する(main/info/chat)", () => {
    const names = parsed.channels.map((c) => c.name);
    expect(names).toContain("メイン");
    expect(names).toContain("情報");
    expect(names).toContain("チャット");
  });

  it("発言者2人以下の非標準チャンネルをシークレットとして扱う", () => {
    const secret = parsed.channels.find((c) => c.id === "tab_3");
    expect(secret?.secret).toBe(true);
    const main = parsed.channels.find((c) => c.name === "メイン");
    expect(main?.secret).toBe(false);
  });

  it("ロール行を独立メッセージとして復元する", () => {
    const roll = parsed.channels.flatMap((c) => c.msgs).find((m) => m.roll);
    expect(roll?.roll).toMatchObject({ cmd: "CC<=70 目星", result: "成功" });
  });

  it("◆ で始まる行はシナリオ本文(note)として分類する", () => {
    const note = parsed.channels.flatMap((c) => c.msgs).find((m) => m.text?.startsWith("◆"));
    expect(note?.type).toBe("note");
  });

  it("createdAt(ms)から epoch秒 に変換し、時系列にソートする", () => {
    const main = parsed.channels.find((c) => c.name === "メイン")!;
    const ts = main.msgs.map((m) => m.ts);
    expect([...ts]).toEqual([...ts].sort((a, b) => a - b));
    expect(sessionDatesOf(parsed)).toEqual(["2026-11-16"]);
  });

  it("スピーカーの kind 推定: KPプレフィックス付きはKP、それ以外はPC(Step2で修正可能)", () => {
    const withPrefix = parseCcfoliaLog(
      JSON.stringify({ messages: [{ name: "KP:夜霜", text: "導入です", createdAt: 1794831600000, channel: "main" }] })
    )!;
    expect(withPrefix.kinds["KP:夜霜"]).toBe("KP");
    expect(parsed.kinds["夜霜"]).toBe("PC");
  });

  it("要約ヘルパーが動く", () => {
    expect(summarizeParsed(parsed).length).toBe(4);
  });

  it("解析できない入力は null", () => {
    expect(parseCcfoliaLog("not json")).toBeNull();
    expect(parseCcfoliaLog('{"foo":1}')).toBeNull();
  });
});
