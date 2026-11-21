import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedState } from "../data/seed";

const docMock = vi.fn((db: unknown, col: string, id: string) => ({ db, col, id }));
const setDocMock = vi.fn(async () => {});
const deleteDocMock = vi.fn(async () => {});
const serverTimestampMock = vi.fn(() => "SERVER_TS");
const getCloudFirestoreMock = vi.fn<() => unknown>(() => ({ projectId: "mock-db" }));

vi.mock("firebase/firestore", () => ({
  doc: docMock,
  setDoc: setDocMock,
  deleteDoc: deleteDocMock,
  serverTimestamp: serverTimestampMock,
}));

vi.mock("./cloud-state", () => ({
  getCloudFirestore: getCloudFirestoreMock,
}));

const { FEED_TOKEN_RE, buildFeedIcs, feedUrl, newFeedToken, publishFeed, revokeFeed } =
  await import("./calendar-feed");

beforeEach(() => {
  vi.clearAllMocks();
  getCloudFirestoreMock.mockReturnValue({ projectId: "mock-db" });
});

describe("calendar feed", () => {
  it("newFeedToken は乱数から一意かつ +, /, = を URL セーフ文字に置換し、FEED_TOKEN_RE で境界検証する", () => {
    const tokens = new Set([newFeedToken(), newFeedToken(), newFeedToken()]);
    expect(tokens.size).toBe(3);

    vi.spyOn(crypto, "getRandomValues").mockImplementationOnce((arr) => {
      const bytes = arr as Uint8Array;
      for (let i = 0; i < bytes.length; i++) {
        // 0xfb 0xff produces '+', '/', and 32 bytes produces '==' padding before stripping
        bytes[i] = i % 2 === 0 ? 0xfb : 0xff;
      }
      return arr;
    });
    const fixed = newFeedToken();
    expect(fixed).toContain("-");
    expect(fixed).toContain("_");
    expect(fixed).not.toContain("+");
    expect(fixed).not.toContain("/");
    expect(fixed).not.toContain("=");
    expect(fixed).toMatch(FEED_TOKEN_RE);
    // 32 bytes base64 (44 chars) becomes length 43 after stripping trailing '=' padding
    expect(fixed).toHaveLength(43);

    expect(FEED_TOKEN_RE.test("a".repeat(31))).toBe(false);
    expect(FEED_TOKEN_RE.test("a".repeat(32))).toBe(true);
    expect(FEED_TOKEN_RE.test("a".repeat(64))).toBe(true);
    expect(FEED_TOKEN_RE.test("a".repeat(65))).toBe(false);
    expect(FEED_TOKEN_RE.test("!" + "a".repeat(32))).toBe(false);
    expect(FEED_TOKEN_RE.test("a".repeat(32) + "!")).toBe(false);
    expect(FEED_TOKEN_RE.test("abc_DEF-0123456789_xyzABCDEF0123")).toBe(true);

    expect(feedUrl("https://takufu.example", fixed)).toBe(`https://takufu.example/api/calendar/${fixed}.ics`);
  });

  it("確定した予定の 60 日前境界・ソート・卓名プレフィックス・カレンダー名を正しく出力する", () => {
    const state = structuredClone(seedState());
    state.events = {
      tooOld: {
        id: "tooOld",
        title: "61日前",
        status: "confirmed",
        date: "2026-09-18",
        startTime: "21:00",
        endTime: "24:00",
        responses: {},
        createdBy: state.me,
      },
      boundary: {
        id: "boundary",
        title: "60日前ちょうど",
        status: "confirmed",
        date: "2026-09-19",
        startTime: "22:00",
        endTime: "24:00",
        note: "メモ付き",
        responses: {},
        createdBy: state.me,
      },
      laterDay: {
        id: "laterDay",
        title: "翌日早朝",
        status: "confirmed",
        date: "2026-09-20",
        startTime: "08:00",
        endTime: "10:00",
        responses: {},
        createdBy: state.me,
      },
      sameDayEarlier: {
        id: "sameDayEarlier",
        tableId: Object.keys(state.tables)[0],
        title: "同日昼",
        status: "confirmed",
        date: "2026-09-19",
        startTime: "13:00",
        endTime: "17:00",
        responses: {},
        createdBy: state.me,
      },
      aPoll: {
        id: "aPoll",
        title: "調整中",
        status: "poll",
        date: "2026-11-25",
        startTime: "21:00",
        endTime: "24:00",
        responses: {},
        createdBy: state.me,
      },
    };
    const tbName = Object.values(state.tables)[0]!.name;
    const ics = buildFeedIcs(state, "2026-11-18");
    expect(ics).toContain("X-WR-CALNAME:卓譜\r\n");
    expect(ics).not.toContain("UID:tooOld@takufu");
    expect(ics).not.toContain("UID:aPoll@takufu");
    expect(ics).toContain("UID:boundary@takufu");
    expect(ics).toContain("DESCRIPTION:メモ付き");
    expect(ics).toContain(`SUMMARY:[${tbName}] 同日昼`);
    expect(ics).toContain("SUMMARY:60日前ちょうど");
    // 13:00, 22:00, 翌朝 08:00 の順に並ぶ
    expect(ics.indexOf("UID:sameDayEarlier@takufu")).toBeLessThan(ics.indexOf("UID:boundary@takufu"));
    expect(ics.indexOf("UID:boundary@takufu")).toBeLessThan(ics.indexOf("UID:laterDay@takufu"));
  });

  it("publishFeed / revokeFeed が Firestore 未設定時にエラーを投げ、設定時に読み書きする", async () => {
    getCloudFirestoreMock.mockReturnValueOnce(null);
    await expect(publishFeed("tok_1", "u1", "ICS")).rejects.toThrow("Firebase is not configured");

    await publishFeed("tok_2", "u1", "BEGIN:VCALENDAR");
    expect(docMock).toHaveBeenCalledWith({ projectId: "mock-db" }, "calendarFeeds", "tok_2");
    expect(setDocMock).toHaveBeenCalledWith(
      { db: { projectId: "mock-db" }, col: "calendarFeeds", id: "tok_2" },
      { ownerId: "u1", ics: "BEGIN:VCALENDAR", updatedAt: "SERVER_TS" },
    );

    await revokeFeed("tok_2");
    expect(deleteDocMock).toHaveBeenCalledWith({
      db: { projectId: "mock-db" },
      col: "calendarFeeds",
      id: "tok_2",
    });
  });
});
