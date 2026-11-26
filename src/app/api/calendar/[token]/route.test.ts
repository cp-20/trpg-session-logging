/**
 * GET /api/calendar/{token}.ics: Firestore の公開 REST API は fetch を差し替えて偽の応答を返す。
 * 接続先の設定はモジュールを読んだときに決まるので、環境変数を変えてから読み直す。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "a".repeat(32);
const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

let firestore: ReturnType<typeof vi.fn>;

async function loadGet() {
  vi.resetModules();
  return (await import("./route")).GET;
}

const call = async (token: string) =>
  (await loadGet())(new Request(`https://takufu.test/api/calendar/${token}`), {
    params: Promise.resolve({ token }),
  });

const feedDoc = (ics: string | undefined) =>
  Response.json(ics === undefined ? { fields: {} } : { fields: { ics: { stringValue: ics } } });

beforeEach(() => {
  firestore = vi.fn(async () => feedDoc(ICS));
  vi.stubGlobal("fetch", firestore);
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "takufu-test");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_DATABASE_ID", "");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GET /api/calendar/{token}", () => {
  it("保存されたカレンダーがあれば、カレンダー形式で返す", async () => {
    const res = await call(`${TOKEN}.ics`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(ICS);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
  });

  it("カレンダーアプリが数分は使い回せるように返す", async () => {
    const res = await call(`${TOKEN}.ics`);

    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
  });

  it("末尾の .ics を除いた鍵で、既定のデータベースの calendarFeeds を読む", async () => {
    await call(`${TOKEN}.ics`);

    expect(firestore).toHaveBeenCalledWith(
      `https://firestore.googleapis.com/v1/projects/takufu-test/databases/takufu/documents/calendarFeeds/${TOKEN}`,
      { cache: "no-store" },
    );
  });

  it("API キーが設定されていれば、問い合わせに付ける", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "k123");

    await call(TOKEN);

    expect(String(firestore.mock.calls[0]![0])).toMatch(/\?key=k123$/);
  });

  it("demo なら Firestore を読まずに見本のカレンダーを返す", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T03:00:00Z"));

    const res = await call("demo.ics");

    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR/);
    expect(firestore).not.toHaveBeenCalled();
  });

  it.each([
    ["短すぎる鍵", "a".repeat(31)],
    ["長すぎる鍵", "a".repeat(65)],
    ["使えない文字を含む鍵", `${"a".repeat(31)}/`],
    ["上の階層をたどる鍵", `../${"a".repeat(32)}`],
  ])("%s なら 404 を返し、Firestore を読まない", async (_label, token) => {
    const res = await call(token);

    expect(res.status).toBe(404);
    expect(firestore).not.toHaveBeenCalled();
  });

  it("ちょうど 64 文字の鍵なら読みに行く", async () => {
    const res = await call("a".repeat(64));

    expect(res.status).toBe(200);
  });

  it("Firestore の接続先が設定されていなければ 404 を返す", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");

    const res = await call(TOKEN);

    expect(res.status).toBe(404);
    expect(firestore).not.toHaveBeenCalled();
  });

  it.each([404, 403])("Firestore が %i を返したら 404 を返す", async (status) => {
    firestore.mockResolvedValue(new Response("", { status }));

    const res = await call(TOKEN);

    expect(res.status).toBe(404);
  });

  it("Firestore がほかの失敗を返したら 502 を返す", async () => {
    firestore.mockResolvedValue(new Response("", { status: 500 }));

    const res = await call(TOKEN);

    expect(res.status).toBe(502);
  });

  it.each([
    ["カレンダーの欄がない", undefined],
    ["カレンダーが空", ""],
  ])("文書に%s なら 404 を返す", async (_label, ics) => {
    firestore.mockResolvedValue(feedDoc(ics));

    const res = await call(TOKEN);

    expect(res.status).toBe(404);
  });

  // 不具合: route.ts:31 の fetch が例外を投げる（DNS 失敗・接続断）と、そのまま投げ出して 500 になる。
  // 応答が失敗したとき（route.ts:33）と同じく 502 で答えるべき。
  it.fails("Firestore につながらなければ 502 を返す", async () => {
    firestore.mockRejectedValue(new TypeError("fetch failed"));

    const res = await call(TOKEN);

    expect(res.status).toBe(502);
  });
});
