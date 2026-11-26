import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_KINDS,
  FEEDBACK_LIMITS,
  createRateLimiter,
  discordPayload,
  feedbackSchema,
  handleFeedback,
  neutralizeMentions,
} from "./feedback";

const now = () => new Date("2026-11-22T00:00:00Z");
const okFetch = () => vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
const hook = "https://discord.test/hook";
const sentBody = (fetchFn: ReturnType<typeof okFetch>) => JSON.parse(String(fetchFn.mock.calls[0]![1]!.body));

describe("handleFeedback", () => {
  it("内容を Discord に送り、メンションは効かせない", async () => {
    const fetchFn = okFetch();
    const r = await handleFeedback(
      { kind: "bug", body: " 保存できない @everyone ", contact: "X: @mikan", page: "/home" },
      { webhookUrl: hook, fetchFn, now },
    );
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(hook);
    const sent = JSON.parse(String(init.body));
    expect(sent.allowed_mentions).toEqual({ parse: [] });
    expect(sent.embeds[0].title).toBe("【不具合】");
    expect(sent.embeds[0].description).toBe("保存できない @​everyone");
    expect(sent.embeds[0].fields).toEqual([
      { name: "連絡先", value: "X: @mikan", inline: true },
      { name: "開いていた画面", value: "/home", inline: true },
    ]);
  });

  it("受け取った時刻は差し替えた時計の今にする", async () => {
    const fetchFn = okFetch();

    await handleFeedback({ kind: "idea", body: "hi" }, { webhookUrl: hook, fetchFn, now });

    expect(sentBody(fetchFn).embeds[0].timestamp).toBe("2026-11-22T00:00:00.000Z");
  });

  it.each(FEEDBACK_KINDS.map((k) => [k.v, k.discord] as const))(
    "種類 %s なら受け付け、見出しを【%s】にする",
    async (kind, heading) => {
      const fetchFn = okFetch();

      const r = await handleFeedback({ kind, body: "hi" }, { webhookUrl: hook, fetchFn, now });

      expect(r).toEqual({ ok: true });
      expect(sentBody(fetchFn).embeds[0].title).toBe(`【${heading}】`);
    },
  );

  it.each([
    ["空の内容", { kind: "idea", body: "" }, "内容を書いてください。"],
    ["空白だけの内容", { kind: "idea", body: " \n\t　" }, "内容を書いてください。"],
    [
      "上限より 1 文字長い内容",
      { kind: "idea", body: "a".repeat(FEEDBACK_LIMITS.body + 1) },
      `内容は ${FEEDBACK_LIMITS.body} 文字までです。`,
    ],
    [
      "上限より 1 文字長い連絡先",
      { kind: "idea", body: "a", contact: "c".repeat(FEEDBACK_LIMITS.contact + 1) },
      `連絡先は ${FEEDBACK_LIMITS.contact} 文字までです。`,
    ],
  ])("%s なら 400 と理由を返し、送らない", async (_label, input, error) => {
    const fetchFn = okFetch();

    const r = await handleFeedback(input, { webhookUrl: hook, fetchFn });

    expect(r).toEqual({ ok: false, status: 400, error });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["知らない種類", { kind: "spam", body: "a" }],
    ["種類なし", { body: "a" }],
    ["文字列でない内容", { kind: "idea", body: 123 }],
    ["上限より 1 文字長い画面", { kind: "idea", body: "a", page: "/".repeat(FEEDBACK_LIMITS.page + 1) }],
    ["null の本文", null],
    ["配列の本文", [{ kind: "idea", body: "a" }]],
  ])("%s なら 400 を返し、送らない", async (_label, input) => {
    const fetchFn = okFetch();

    const r = await handleFeedback(input, { webhookUrl: hook, fetchFn });

    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("内容・連絡先・画面がちょうど上限の長さなら受け付ける", async () => {
    const fetchFn = okFetch();
    const input = {
      kind: "idea",
      body: "a".repeat(FEEDBACK_LIMITS.body),
      contact: "c".repeat(FEEDBACK_LIMITS.contact),
      page: "/".repeat(FEEDBACK_LIMITS.page),
    };

    const r = await handleFeedback(input, { webhookUrl: hook, fetchFn });

    expect(r).toEqual({ ok: true });
  });

  it("前後の空白は長さに数えず、取り除いて送る", async () => {
    const fetchFn = okFetch();
    const body = `  ${"a".repeat(FEEDBACK_LIMITS.body)}  `;

    const r = await handleFeedback({ kind: "idea", body }, { webhookUrl: hook, fetchFn });

    expect(r).toEqual({ ok: true });
    expect(sentBody(fetchFn).embeds[0].description).toBe("a".repeat(FEEDBACK_LIMITS.body));
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

  it("見えない欄が埋まっていれば、送り先が未設定でも成功を返す", async () => {
    const r = await handleFeedback({ kind: "idea", body: "hi", website: "x" }, { webhookUrl: undefined });

    expect(r).toEqual({ ok: true });
  });

  it("送り先が未設定なら 503 を返す", async () => {
    const r = await handleFeedback({ kind: "idea", body: "hi" }, { webhookUrl: undefined });

    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("送り先が失敗を返したら、URL を出さずに 502 を返す", async () => {
    const failing = vi.fn(async () => new Response("no", { status: 500 }));

    const r = await handleFeedback(
      { kind: "idea", body: "hi" },
      { webhookUrl: "https://secret", fetchFn: failing },
    );

    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(JSON.stringify(r)).not.toContain("secret");
  });

  it("送り先につながらなければ、URL を出さずに 502 を返す", async () => {
    const throwing = vi.fn(async () => {
      throw new TypeError("fetch failed: https://secret");
    });

    const r = await handleFeedback(
      { kind: "idea", body: "hi" },
      { webhookUrl: "https://secret", fetchFn: throwing },
    );

    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});

describe("部品", () => {
  it("ユーザー・ロールへのメンションも崩す", () => {
    expect(neutralizeMentions("<@123> <@&456> @here")).toBe("<​@123> <​@&456> @​here");
  });

  it("連絡先と画面に書かれたメンションも崩す", () => {
    const f = feedbackSchema.parse({ kind: "other", body: "x", contact: "@everyone", page: "<@1>" });

    const fields = discordPayload(f, now()).embeds[0]!.fields;

    expect(fields.map((x) => x.value)).toEqual(["@​everyone", "<​@1>"]);
  });

  it("連絡先と画面が空なら欄を作らない", () => {
    const f = feedbackSchema.parse({ kind: "other", body: "x" });
    expect(discordPayload(f, now()).embeds[0]!.fields).toEqual([]);
  });
});

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("時間内なら上限の件数までは通す", () => {
    const allow = createRateLimiter(2, 1000);

    expect([allow("ip", 0), allow("ip", 10)]).toEqual([true, true]);
  });

  it("時間内に上限を超えたら断る", () => {
    const allow = createRateLimiter(2, 1000);
    allow("ip", 0);
    allow("ip", 10);

    expect(allow("ip", 20)).toBe(false);
  });

  it("ほかの送り元は、別の送り元が上限に達していても通す", () => {
    const allow = createRateLimiter(1, 1000);
    allow("a", 0);

    expect(allow("b", 0)).toBe(true);
  });

  it("最初の送信から時間がちょうど経つ 1 ミリ秒前までは断る", () => {
    const allow = createRateLimiter(1, 1000);
    allow("ip", 0);

    expect(allow("ip", 999)).toBe(false);
  });

  it("最初の送信から時間がちょうど経ったら通す", () => {
    const allow = createRateLimiter(1, 1000);
    allow("ip", 0);

    expect(allow("ip", 1000)).toBe(true);
  });

  it("断った送信は数えないので、断られ続けても時間が経てば通す", () => {
    const allow = createRateLimiter(1, 1000);
    allow("ip", 0);
    allow("ip", 500);
    allow("ip", 900);

    expect(allow("ip", 1000)).toBe(true);
  });

  it("古い送信から順に数えなくなる（窓は動いていく）", () => {
    const allow = createRateLimiter(2, 1000);
    allow("ip", 0);
    allow("ip", 600);

    expect([allow("ip", 1000), allow("ip", 1001)]).toEqual([true, false]);
  });

  it("時刻を渡さなければ今の時計で数える", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T00:00:00Z"));
    const allow = createRateLimiter(1, 60_000);
    allow("ip");

    vi.setSystemTime(new Date("2026-11-26T00:01:00Z"));

    expect(allow("ip")).toBe(true);
  });
});
