// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIcsCalendar, downloadIcs, googleCalendarUrl, icsDataUrl } from "./ics";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ics module", () => {
  it("RFC 5545 の必須ヘッダ・エスケープ・日跨ぎ時刻・ゼロ埋め・複数イベントを出力する", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-05T01:02:03.000Z"));

    const ics = buildIcsCalendar(
      [
        {
          uid: "ev_a;1@takufu",
          title: "夜卓\\前編, 開始;テスト\r\n2行目",
          date: "2026-01-05",
          startTime: "22:00",
          endTime: "01:30",
          description: "詳細;メモ\n改行付き",
        },
        {
          uid: "ev_same@takufu",
          title: "同刻開始終了",
          date: "2026-01-05",
          startTime: "08:05",
          endTime: "08:05",
        },
      ],
      "テスト;カレンダー",
    );

    expect(ics.endsWith("\r\n")).toBe(true);
    const lines = ics.split("\r\n");
    expect(lines).toContain("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("PRODID:-//Takufu//TRPG Session Calendar//JA");
    expect(lines).toContain("CALSCALE:GREGORIAN");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("X-WR-CALNAME:テスト\\;カレンダー");
    expect(lines).toContain("X-WR-TIMEZONE:Asia/Tokyo");
    expect(lines).toContain("BEGIN:VTIMEZONE");
    expect(lines).toContain("TZID:Asia/Tokyo");
    expect(lines).toContain("BEGIN:STANDARD");
    expect(lines).toContain("DTSTART:19700101T000000");
    expect(lines).toContain("TZOFFSETFROM:+0900");
    expect(lines).toContain("TZOFFSETTO:+0900");
    expect(lines).toContain("TZNAME:JST");
    expect(lines).toContain("END:STANDARD");
    expect(lines).toContain("END:VTIMEZONE");
    expect(lines).toContain("UID:ev_a\\;1@takufu");
    expect(lines).toContain("DTSTAMP:20260105T010203Z");
    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20260105T220000");
    expect(lines).toContain("DTEND;TZID=Asia/Tokyo:20260106T013000");
    expect(lines).toContain("SUMMARY:夜卓\\\\前編\\, 開始\\;テスト\\n2行目");
    expect(lines).toContain("DESCRIPTION:詳細\\;メモ\\n改行付き");
    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20260105T080500");
    expect(lines).toContain("DTEND;TZID=Asia/Tokyo:20260106T080500");
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(2);
    expect(lines).toContain("END:VCALENDAR");

    const secondEvent = ics.split("BEGIN:VEVENT")[2]!;
    expect(secondEvent).not.toContain("DESCRIPTION:");
  });

  it("既定カレンダー名・空一覧・data URL・ダウンロード MIME・Google URL を検証する", () => {
    const emptyIcs = buildIcsCalendar([]);
    expect(emptyIcs).toContain("X-WR-CALNAME:卓譜 卓予定");
    expect(emptyIcs).toContain("BEGIN:VCALENDAR");
    expect(emptyIcs).not.toContain("BEGIN:VEVENT");
    expect(icsDataUrl("BEGIN:VCALENDAR\r\n")).toBe(
      "data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR%0D%0A",
    );

    const blobPayloads: { parts: BlobPart[]; type: string }[] = [];
    const OrigBlob = globalThis.Blob;
    vi.stubGlobal(
      "Blob",
      class MockBlob extends OrigBlob {
        constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
          super(parts, opts);
          blobPayloads.push({ parts, type: opts?.type ?? "" });
        }
      },
    );
    vi.useFakeTimers();
    const createObjUrl = vi.fn(() => "blob:mock");
    const revokeObjUrl = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjUrl, revokeObjectURL: revokeObjUrl });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadIcs("test.ics", emptyIcs);
    expect(blobPayloads[0]).toEqual({
      parts: [emptyIcs],
      type: "text/calendar;charset=utf-8",
    });
    expect(createObjUrl).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(revokeObjUrl).toHaveBeenCalledWith("blob:mock");
    vi.useRealTimers();

    const withDetails = googleCalendarUrl({
      title: "深夜卓",
      date: "2026-11-20",
      startTime: "23:00",
      endTime: "02:00",
      details: "Discord集合",
    });
    expect(withDetails.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(withDetails).toContain("action=TEMPLATE");
    expect(withDetails).toContain("dates=20261120T140000Z%2F20261120T170000Z");
    expect(withDetails).toContain("details=Discord%E9%9B%86%E5%90%88");

    const withoutDetails = googleCalendarUrl({
      title: "昼卓",
      date: "2026-11-20",
      startTime: "13:00",
      endTime: "16:00",
    });
    expect(withoutDetails).not.toContain("details=");
  });
});
