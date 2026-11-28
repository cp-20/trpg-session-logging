import { describe, expect, it } from "vitest";
import { scrubEvent, scrubSpan, scrubText } from "./sentry-scrub";

describe("scrubText（鍵になる URL を伏せる）", () => {
  it.each([
    ["https://takufu.example/join/abcDEF123", "https://takufu.example/join/:token"],
    ["/invite/t_123", "/invite/:token"],
    ["https://takufu.example/share/l/slug-1?x=1", "https://takufu.example/share/l/:id"],
    ["/share/c/ch_ab12cd", "/share/c/:id"],
    ["GET /api/calendar/0123abcd.ics", "GET /api/calendar/:token"],
    [
      "Discord POST /webhooks/123/aW50ZXJhY3Rpb24/messages/@original: 404",
      "Discord POST /webhooks/123/:token/messages/@original: 404",
    ],
    ["/interactions/987/tok.en/callback", "/interactions/987/:token/callback"],
  ])("%s → %s", (input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it("鍵を含まない URL はそのまま、問い合わせの部分だけ落とす", () => {
    expect(scrubText("https://takufu.example/sessions?q=秘密")).toBe("https://takufu.example/sessions");
    expect(scrubText("/settings")).toBe("/settings");
  });
});

describe("scrubEvent", () => {
  it("要求の Cookie・ヘッダー・本文・問い合わせと利用者の欄を消し、URL と例外の文を伏せる", () => {
    const event = scrubEvent({
      transaction: "GET /join/abc",
      request: {
        url: "https://takufu.example/join/abc?t=1",
        query_string: "t=1",
        cookies: { session: "x" },
        headers: { cookie: "session=x" },
        data: '{"secret":1}',
      },
      exception: { values: [{ value: "failed /api/calendar/tok.ics" }] },
      breadcrumbs: [{ message: "nav", data: { to: "/share/l/s1", from: "/home" } }],
      user: { ip_address: "203.0.113.1" },
    });

    expect(event).toEqual({
      transaction: "GET /join/:token",
      request: { url: "https://takufu.example/join/:token" },
      exception: { values: [{ value: "failed /api/calendar/:token" }] },
      breadcrumbs: [{ message: "nav", data: { to: "/share/l/:id", from: "/home" } }],
    });
  });
});

describe("scrubSpan（性能の計測の span）", () => {
  it("名前と属性の URL に入った鍵を伏せ、利用者・ヘッダー・問い合わせの属性を消す", () => {
    const span = scrubSpan({
      name: "GET /join/abc",
      attributes: {
        "url.full": "https://takufu.example/share/l/s1?x=1",
        "http.target": { value: "/api/calendar/tok.ics", type: "string" },
        "url.query": "token=1",
        "user.id": "u_1",
        "client.address": "203.0.113.1",
        "http.request.header.cookie": "session=x",
        "http.response.status_code": 200,
        "sentry.op": "pageload",
      },
      links: [{ attributes: { "url.full": "/invite/t_1" } }],
    });

    expect(span).toEqual({
      name: "GET /join/:token",
      attributes: {
        "url.full": "https://takufu.example/share/l/:id",
        "http.target": { value: "/api/calendar/:token", type: "string" },
        "http.response.status_code": 200,
        "sentry.op": "pageload",
      },
      links: [{ attributes: { "url.full": "/invite/:token" } }],
    });
  });
});
