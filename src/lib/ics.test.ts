// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildIcsCalendar, downloadIcs, googleCalendarUrl, icsDataUrl } from "./ics";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function buildSample() {
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
  return { ics, lines: ics.split("\r\n") };
}

describe("ics module", () => {
  describe("buildIcsCalendar", () => {
    it("CRLF 終端で VCALENDAR のヘッダと名前（; はエスケープ）を出す", () => {
      const { ics, lines } = buildSample();

      expect(ics.endsWith("\r\n")).toBe(true);
      expect(lines).toContain("BEGIN:VCALENDAR");
      expect(lines).toContain("VERSION:2.0");
      expect(lines).toContain("PRODID:-//Takufu//TRPG Session Calendar//JA");
      expect(lines).toContain("CALSCALE:GREGORIAN");
      expect(lines).toContain("METHOD:PUBLISH");
      expect(lines).toContain("X-WR-CALNAME:テスト\\;カレンダー");
      expect(lines).toContain("X-WR-TIMEZONE:Asia/Tokyo");
      expect(lines).toContain("END:VCALENDAR");
    });

    it("Asia/Tokyo の VTIMEZONE を含める", () => {
      const { lines } = buildSample();

      expect(lines).toContain("BEGIN:VTIMEZONE");
      expect(lines).toContain("TZID:Asia/Tokyo");
      expect(lines).toContain("BEGIN:STANDARD");
      expect(lines).toContain("DTSTART:19700101T000000");
      expect(lines).toContain("TZOFFSETFROM:+0900");
      expect(lines).toContain("TZOFFSETTO:+0900");
      expect(lines).toContain("TZNAME:JST");
      expect(lines).toContain("END:STANDARD");
      expect(lines).toContain("END:VTIMEZONE");
    });

    it("UID・題名・説明の ; , \\ 改行をエスケープする", () => {
      const { lines } = buildSample();

      expect(lines).toContain("UID:ev_a\\;1@takufu");
      expect(lines).toContain("SUMMARY:夜卓\\\\前編\\, 開始\\;テスト\\n2行目");
      expect(lines).toContain("DESCRIPTION:詳細\\;メモ\\n改行付き");
    });

    it("DTSTAMP を現在時刻の UTC で出す", () => {
      const { lines } = buildSample();

      expect(lines).toContain("DTSTAMP:20260105T010203Z");
    });

    it("終了が開始より前なら終了を翌日にする", () => {
      const { lines } = buildSample();

      expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20260105T220000");
      expect(lines).toContain("DTEND;TZID=Asia/Tokyo:20260106T013000");
    });

    it("開始と終了が同時刻なら終了を翌日にし、時刻をゼロ埋めする", () => {
      const { lines } = buildSample();

      expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20260105T080500");
      expect(lines).toContain("DTEND;TZID=Asia/Tokyo:20260106T080500");
    });

    it("イベントごとに VEVENT を出す", () => {
      const { lines } = buildSample();

      expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(2);
    });

    it("説明が無いイベントには DESCRIPTION を出さない", () => {
      const { ics } = buildSample();

      const secondEvent = ics.split("BEGIN:VEVENT")[2]!;
      expect(secondEvent).not.toContain("DESCRIPTION:");
    });

    it("名前を省くと既定のカレンダー名にし、空の一覧ではイベントを出さない", () => {
      const emptyIcs = buildIcsCalendar([]);

      expect(emptyIcs).toContain("X-WR-CALNAME:卓譜 卓予定");
      expect(emptyIcs).toContain("BEGIN:VCALENDAR");
      expect(emptyIcs).not.toContain("BEGIN:VEVENT");
    });
  });

  it("icsDataUrl は text/calendar の data URL にエンコードする", () => {
    expect(icsDataUrl("BEGIN:VCALENDAR\r\n")).toBe(
      "data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR%0D%0A",
    );
  });

  describe("downloadIcs", () => {
    function setup() {
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
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: createObjUrl,
        revokeObjectURL: revokeObjUrl,
      });
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const ics = buildIcsCalendar([]);
      downloadIcs("test.ics", ics);
      return { blobPayloads, createObjUrl, revokeObjUrl, clickSpy, ics };
    }

    it("text/calendar の Blob を作ってリンクをクリックする", () => {
      const { blobPayloads, createObjUrl, clickSpy, ics } = setup();

      expect(blobPayloads[0]).toEqual({
        parts: [ics],
        type: "text/calendar;charset=utf-8",
      });
      expect(createObjUrl).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("1 秒後に Blob URL を解放する", () => {
      const { revokeObjUrl } = setup();

      vi.advanceTimersByTime(1000);

      expect(revokeObjUrl).toHaveBeenCalledWith("blob:mock");
    });
  });

  describe("googleCalendarUrl", () => {
    it("詳細があれば TEMPLATE の URL に UTC 換算の日時と詳細を載せる", () => {
      const url = googleCalendarUrl({
        title: "深夜卓",
        date: "2026-11-20",
        startTime: "23:00",
        endTime: "02:00",
        details: "Discord集合",
      });

      expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
      expect(url).toContain("action=TEMPLATE");
      expect(url).toContain("dates=20261120T140000Z%2F20261120T170000Z");
      expect(url).toContain("details=Discord%E9%9B%86%E5%90%88");
    });

    it("詳細が無ければ details を付けない", () => {
      const url = googleCalendarUrl({
        title: "昼卓",
        date: "2026-11-20",
        startTime: "13:00",
        endTime: "16:00",
      });

      expect(url).not.toContain("details=");
    });
  });
});
