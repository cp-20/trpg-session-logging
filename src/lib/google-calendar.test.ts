import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addScopeMock = vi.fn();
const setCustomParametersMock = vi.fn();
class MockGoogleAuthProvider {
  addScope = addScopeMock;
  setCustomParameters = setCustomParametersMock;
  static credentialFromResult = vi.fn((r: { token?: string }) =>
    r?.token ? { accessToken: r.token } : null,
  );
}
const reauthenticateWithPopupMock = vi.fn();
const getTakufuAuthMock = vi.fn();

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: MockGoogleAuthProvider,
  reauthenticateWithPopup: reauthenticateWithPopupMock,
}));

vi.mock("./auth", () => ({
  getTakufuAuth: getTakufuAuthMock,
}));

const {
  GOOGLE_CALENDAR_SCOPES,
  fetchGoogleBusyRanges,
  listGoogleCalendars,
  parseCalendarList,
  parseFreeBusy,
  requestGoogleCalendarAccess,
} = await import("./google-calendar");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestGoogleCalendarAccess", () => {
  it("ログインしていなければ許可画面を開かない（勝手にログインさせない）", async () => {
    getTakufuAuthMock.mockReturnValueOnce(null);
    await expect(requestGoogleCalendarAccess()).rejects.toThrow("ログインしてから");
    getTakufuAuthMock.mockReturnValueOnce({ currentUser: null });
    await expect(requestGoogleCalendarAccess()).rejects.toThrow("ログインしてから");
    expect(reauthenticateWithPopupMock).not.toHaveBeenCalled();
  });

  it("空き時間とカレンダー一覧のスコープだけを求め、エラーを日本語で返す", async () => {
    getTakufuAuthMock.mockReturnValue({ currentUser: { uid: "u1" } });
    reauthenticateWithPopupMock.mockResolvedValueOnce({ token: "ya29.tok" });
    await expect(requestGoogleCalendarAccess()).resolves.toBe("ya29.tok");
    expect(addScopeMock.mock.calls.map((c) => c[0])).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(GOOGLE_CALENDAR_SCOPES.every((s) => !s.endsWith("/calendar") && !s.includes("events"))).toBe(true);
    expect(setCustomParametersMock).toHaveBeenCalledWith({ prompt: "consent" });

    for (const [code, msg] of [
      ["auth/popup-closed-by-user", "画面を閉じました"],
      ["auth/cancelled-popup-request", "画面を閉じました"],
      ["auth/popup-blocked", "ポップアップを許可"],
      ["auth/user-mismatch", "Google アカウントを選んで"],
      ["auth/internal-error", "許可を確認できませんでした"],
    ] as const) {
      reauthenticateWithPopupMock.mockRejectedValueOnce({ code });
      await expect(requestGoogleCalendarAccess()).rejects.toThrow(msg);
    }
    reauthenticateWithPopupMock.mockResolvedValueOnce({});
    await expect(requestGoogleCalendarAccess()).rejects.toThrow("許可を確認できませんでした");
  });
});

describe("parseCalendarList / listGoogleCalendars", () => {
  it("ID と名前だけを取り出し、メインのカレンダーを先頭にする", () => {
    expect(
      parseCalendarList([
        { id: "ja.japanese#holiday@group.v.calendar.google.com", summary: "日本の祝日" },
        { id: "me@example.com", summary: "me@example.com", summaryOverride: "自分", primary: true },
        { summary: "ID なし" },
      ]),
    ).toEqual([
      { id: "me@example.com", name: "自分", primary: true },
      { id: "ja.japanese#holiday@group.v.calendar.google.com", name: "日本の祝日", primary: false },
    ]);
  });

  it("一覧 API は fields で ID と名前だけを要求する", async () => {
    const fetchMock = vi.fn(
      async (_url: URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ items: [{ id: "a", summary: "A", primary: true }] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await listGoogleCalendars("tok")).toEqual([{ id: "a", name: "A", primary: true }]);
    const url = fetchMock.mock.calls[0]![0];
    expect(url.searchParams.get("fields")).toBe("items(id,summary,summaryOverride,primary)");
    expect(url.searchParams.get("minAccessRole")).toBe("freeBusyReader");

    fetchMock.mockResolvedValueOnce(new Response("x", { status: 403 }));
    await expect(listGoogleCalendars("tok")).rejects.toThrow("一覧を取得できませんでした");
  });
});

describe("parseFreeBusy / fetchGoogleBusyRanges", () => {
  it("選んだカレンダーの時間帯だけを取り、壊れた値・エラーのカレンダーを飛ばす", () => {
    const out = parseFreeBusy(
      {
        calendars: {
          a: {
            busy: [
              { start: "2026-11-21T12:00:00Z", end: "2026-11-21T14:00:00Z" },
              { start: "2026-11-23T10:00:00Z", end: "2026-11-23T10:00:00Z" },
              { start: "bad", end: "2026-11-28T00:00:00Z" },
              { start: undefined, end: "2026-11-28T00:00:00Z" },
            ],
          },
          b: { errors: [{ reason: "notFound" }], busy: [] },
          c: { busy: [{ start: "2026-11-22T00:00:00+09:00", end: "2026-11-22T01:00:00+09:00" }] },
        },
      },
      ["a", "b"],
    );
    expect(out).toEqual([
      { calendarId: "a", start: "2026-11-21T12:00:00.000Z", end: "2026-11-21T14:00:00.000Z" },
    ]);
  });

  it("90 日を 30 日ずつに分けて問い合わせる", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            calendars: { a: { busy: [{ start: "2026-11-21T12:00:00Z", end: "2026-11-21T14:00:00Z" }] } },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const now = Date.parse("2026-11-21T00:00:00Z");
    const out = await fetchGoogleBusyRanges("tok", ["a"], now);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://www.googleapis.com/calendar/v3/freeBusy");
    expect(init!.headers).toEqual({ Authorization: "Bearer tok", "Content-Type": "application/json" });
    expect(JSON.parse(String(init!.body))).toEqual({
      timeMin: "2026-11-21T00:00:00.000Z",
      timeMax: "2026-12-21T00:00:00.000Z",
      timeZone: "Asia/Tokyo",
      items: [{ id: "a" }],
    });
    expect(out).toHaveLength(3);

    expect(await fetchGoogleBusyRanges("tok", [], now)).toEqual([]);
    fetchMock.mockResolvedValueOnce(new Response("err", { status: 500 }));
    await expect(fetchGoogleBusyRanges("tok", ["a"], now)).rejects.toThrow("予定を取得できませんでした");
  });
});
