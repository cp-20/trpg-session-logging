import { describe, expect, it } from "vitest";
import type { State, TableEvent } from "../types";
import {
  addDays,
  calendarSubscribeLinks,
  canConfirmPoll,
  computeEndTime,
  daysBetween,
  eventDurationMinutes,
  groupBy,
  monthCells,
  myScheduleView,
  parseBusyDates,
  pollCandidates,
  pollMemberIds,
  quickWeekendDates,
  relativeDayLabel,
  shiftYearMonth,
  unansweredCount,
} from "./schedule";

const poll = (over: Partial<TableEvent> = {}): TableEvent => ({
  id: "ev1",
  tableId: "t1",
  title: "次回",
  status: "poll",
  date: "2026-11-21",
  startTime: "21:00",
  endTime: "24:00",
  responses: {},
  createdBy: "u_a",
  candidates: [
    { id: "c1", date: "2026-11-21", startTime: "21:00", endTime: "24:00", responses: { u_a: "ok" } },
    { id: "c2", date: "2026-11-22", startTime: "21:00", endTime: "24:00", responses: { u_x: "ng" } },
  ],
  ...over,
});

const state = {
  me: "u_b",
  users: { u_a: {}, u_b: {}, u_x: {} },
  tables: { t1: { id: "t1", ownerId: "u_b", memberIds: ["u_a", "u_b"] } },
} as unknown as State;

describe("日付と月", () => {
  it("月をまたいでずらせる", () => {
    expect(shiftYearMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
  });
  it("日を足せる（月末をまたぐ）", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
  it("週末の候補: 今日が土曜なら今日", () => {
    expect(quickWeekendDates("2026-11-21")).toEqual({
      thisSat: "2026-11-21",
      thisSun: "2026-11-22",
      nextSat: "2026-11-28",
    });
    expect(quickWeekendDates("2026-11-18").thisSat).toBe("2026-11-21");
  });
  it("月のマスは 7 の倍数で、1 日の曜日から始まる", () => {
    const cells = monthCells("2026-11"); // 11/1 は日曜
    expect(cells[0]).toBe(1);
    expect(cells.length % 7).toBe(0);
    expect(cells.filter((c) => c !== null)).toHaveLength(30);
    expect(monthCells("2026-12")[0]).toBeNull(); // 12/1 は火曜
  });
});

describe("時刻と長さ", () => {
  it("終了時刻は日付をまたぐと 24 時以降で表す", () => {
    expect(computeEndTime("21:00", 180)).toBe("24:00");
    expect(computeEndTime("22:30", 240)).toBe("26:30");
    expect(computeEndTime("abc", 60)).toBe("");
  });
  it("保存された長さを優先し、なければ開始と終了から求める", () => {
    expect(eventDurationMinutes("21:00", "23:00", 150)).toBe(150);
    expect(eventDurationMinutes("21:00", "24:00")).toBe(180);
    expect(eventDurationMinutes("23:00", "01:00")).toBe(120);
    expect(eventDurationMinutes("x", "y")).toBe(0);
  });
});

describe("自分の予定ファイルの読み取り", () => {
  it("開始日だけを日本時間で取り出す（UTC は 9 時間ずらす・折り返し行に対応）", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "DTSTART:19700101T000000",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "DTSTART;TZID=Asia/Tokyo:20261121T210000",
      "SUMMARY:長い",
      " 件名",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20261121T160000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20261203",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseBusyDates(text)).toEqual(["2026-11-21", "2026-11-22", "2026-12-03"]);
  });
});

describe("日程調整", () => {
  it("候補日のない古い形式は候補 1 件として扱う", () => {
    const old = poll({ candidates: undefined, responses: { u_a: "ok" } });
    expect(pollCandidates(old)).toHaveLength(1);
    expect(pollCandidates(old)[0]!.responses).toEqual({ u_a: "ok" });
  });
  it("回答者は卓のメンバーと実際に回答した人", () => {
    expect(pollMemberIds(poll(), state).sort()).toEqual(["u_a", "u_b", "u_x"]);
  });
  it("確定できるのは作った人か卓の作成者", () => {
    expect(canConfirmPoll(poll(), state)).toBe(true); // 卓の作成者
    expect(canConfirmPoll(poll({ tableId: undefined }), state)).toBe(false);
    expect(canConfirmPoll(poll({ createdBy: "u_b", tableId: undefined }), state)).toBe(true);
  });
  it("自分の未回答の候補日を数える", () => {
    expect(unansweredCount(poll(), "u_a")).toBe(1);
    expect(unansweredCount(poll(), "u_b")).toBe(2);
  });
  it("複数日の項目は各日に入る", () => {
    const m = groupBy([{ d: ["a", "b"] }, { d: ["b"] }], (x) => x.d);
    expect(m.get("b")).toHaveLength(2);
  });
});

describe("購読リンク", () => {
  it("Apple は webcal、Google は購読追加の URL を作る", () => {
    const links = calendarSubscribeLinks("https://example.com/feed/abc");
    expect(links.apple).toBe("webcal://example.com/feed/abc");
    expect(links.google).toBe(
      "https://calendar.google.com/calendar/render?cid=" +
        encodeURIComponent("webcal://example.com/feed/abc"),
    );
  });
});

describe("近い予定の言い方", () => {
  it("今日・あす・あとN日、2週間より先は出さない", () => {
    expect(daysBetween("2026-11-30", "2026-12-02")).toBe(2);
    expect(relativeDayLabel("2026-11-18", "2026-11-18")).toBe("今日");
    expect(relativeDayLabel("2026-11-18", "2026-11-19")).toBe("あす");
    expect(relativeDayLabel("2026-11-18", "2026-11-21")).toBe("あと3日");
    expect(relativeDayLabel("2026-11-18", "2026-12-02")).toBeNull();
    expect(relativeDayLabel("2026-11-18", "2026-11-17")).toBeNull();
  });
});

describe("自分に関係する予定", () => {
  const ev = (over: Partial<TableEvent>): TableEvent => ({
    id: "e",
    tableId: "t1",
    title: "x",
    status: "confirmed",
    date: "2026-11-20",
    startTime: "21:00",
    endTime: "24:00",
    responses: {},
    createdBy: "u_b",
    ...over,
  });
  const base = {
    me: "u_a",
    tables: { t1: { id: "t1", name: "卓", ownerId: "u_b", memberIds: ["u_a", "u_b"], createdAt: "" } },
    logs: {},
  } as unknown as Pick<State, "tables" | "events" | "logs" | "me">;
  it("返事待ち・これから・記録がまだに分け、他人の卓は含めない", () => {
    const view = myScheduleView(
      {
        ...base,
        events: {
          a: ev({ id: "a" }),
          b: ev({ id: "b", date: "2026-11-10" }),
          c: ev({
            id: "c",
            status: "poll",
            candidates: [
              { id: "k", date: "2026-11-25", startTime: "21:00", endTime: "24:00", responses: {} },
            ],
          }),
          d: ev({ id: "d", tableId: "other" }),
        },
      },
      "2026-11-18",
    );
    expect(view.upcoming.map((e) => e.id)).toEqual(["a"]);
    expect(view.unrecorded.map((e) => e.id)).toEqual(["b"]);
    expect(view.pollsNeedingReply.map((e) => e.id)).toEqual(["c"]);
  });
});
