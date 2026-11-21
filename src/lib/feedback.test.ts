import { describe, expect, it, vi } from "vitest";
import {
  createRateLimiter,
  discordPayload,
  feedbackSchema,
  handleFeedback,
  neutralizeMentions,
} from "./feedback";

const now = () => new Date("2026-11-22T00:00:00Z");
const okFetch = () => vi.fn(async () => new Response(null, { status: 204 }));

describe("handleFeedback", () => {
  it("内容を Discord に送り、メンションは効かせない", async () => {
    const fetchFn = okFetch();
    const r = await handleFeedback(
      { kind: "bug", body: " 保存できない @everyone ", contact: "X: @mikan", page: "/home" },
      { webhookUrl: "https://discord.test/hook", fetchFn, now },
    );
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://discord.test/hook");
    const sent = JSON.parse(String(init.body));
    expect(sent.allowed_mentions).toEqual({ parse: [] });
    expect(sent.embeds[0].title).toBe("【不具合】");
    expect(sent.embeds[0].description).toBe("保存できない @​everyone");
    expect(sent.embeds[0].fields).toEqual([
      { name: "連絡先", value: "X: @mikan", inline: true },
      { name: "開いていた画面", value: "/home", inline: true },
    ]);
  });

  it("空・長すぎる・種類が違うものは受け付けない", async () => {
    const deps = { webhookUrl: "https://discord.test/hook", fetchFn: okFetch() };
    expect(await handleFeedback({ kind: "idea", body: "   " }, deps)).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await handleFeedback({ kind: "idea", body: "a".repeat(2001) }, deps)).toMatchObject({
      status: 400,
    });
    expect(await handleFeedback({ kind: "spam", body: "a" }, deps)).toMatchObject({ status: 400 });
    expect(deps.fetchFn).not.toHaveBeenCalled();
  });

  it("見えない欄が埋まっていたら、成功を返して何も送らない", async () => {
    const fetchFn = okFetch();
    const r = await handleFeedback(
      { kind: "idea", body: "hi", website: "http://spam" },
      { webhookUrl: "x", fetchFn },
    );
    expect(r).toEqual({ ok: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("送り先が未設定・失敗したときは、URL を出さずに伝える", async () => {
    expect(await handleFeedback({ kind: "idea", body: "hi" }, { webhookUrl: undefined })).toMatchObject({
      status: 503,
    });
    const failing = vi.fn(async () => new Response("no", { status: 500 }));
    const r = await handleFeedback(
      { kind: "idea", body: "hi" },
      { webhookUrl: "https://secret", fetchFn: failing },
    );
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});

describe("部品", () => {
  it("ユーザー・ロールへのメンションも崩す", () => {
    expect(neutralizeMentions("<@123> <@&456> @here")).toBe("<​@123> <​@&456> @​here");
  });

  it("連絡先と画面が空なら欄を作らない", () => {
    const f = feedbackSchema.parse({ kind: "other", body: "x" });
    expect(discordPayload(f, now()).embeds[0]!.fields).toEqual([]);
  });

  it("同じ送り元は時間内の上限まで", () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow("ip", 0)).toBe(true);
    expect(allow("ip", 10)).toBe(true);
    expect(allow("ip", 20)).toBe(false);
    expect(allow("other", 20)).toBe(true);
    expect(allow("ip", 1500)).toBe(true);
  });
});
