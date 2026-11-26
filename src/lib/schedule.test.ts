import { jstEpoch } from "./format";
import { describe, expect, it } from "vitest";
import type { State, TableEvent } from "../types";
import {
  addDays,
  applyCandidateRsvp,
  applyConfirmCandidate,
  applyPollAnswers,
  applyPollEdit,
  busyChecker,
  confirmedOwnPlans,
  planFinder,
  planTimeText,
  plansByDate,
  calendarSubscribeLinks,
  compactBusyRanges,
  hasBusySource,
  isAllDayRange,
  pollDurationMinutes,
  slotRange,
  canConfirmPoll,
  canEditPoll,
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

const at = (d: string) => ({ start: jstEpoch(d, "21:00"), end: jstEpoch(d, "23:00") });

describe("日付と月", () => {
  it("月をまたいでゼロ埋めありでずらせる", () => {
    expect(shiftYearMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftYearMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftYearMonth("2026-09", 1)).toBe("2026-10");
  });
  it("日を足せる（月末・マイナス対応）", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-01", -1)).toBe("2026-11-30");
  });
  it("週末の候補: 今日が土曜なら今日、日曜なら来週土曜", () => {
    expect(quickWeekendDates("2026-11-21")).toEqual({
      thisSat: "2026-11-21",
      thisSun: "2026-11-22",
      nextSat: "2026-11-28",
    });
    expect(quickWeekendDates("2026-11-18")).toEqual({
      thisSat: "2026-11-21",
      thisSun: "2026-11-22",
      nextSat: "2026-11-28",
    });
    expect(quickWeekendDates("2026-11-22").thisSat).toBe("2026-11-28");
  });
  it("月のマスは 7 の倍数で、開始曜日と末尾空白を正しく埋める", () => {
    const nov = monthCells("2026-11"); // 11/1 日曜, 30日 月曜
    expect(nov[0]).toBe(1);
    expect(nov).toHaveLength(35);
    expect(nov.filter((c) => c !== null)).toHaveLength(30);
    // 2026-10: 10/1 木曜 (4), 10/31 土曜 (末尾空白なし = 35 マス)
    const oct = monthCells("2026-10");
    expect(oct.slice(0, 4)).toEqual([null, null, null, null]);
    expect(oct[4]).toBe(1);
    expect(oct.at(-1)).toBe(31);
    expect(oct).toHaveLength(35);
    expect(monthCells("2026-12")[0]).toBeNull();
  });
});

describe("時刻と長さ", () => {
  it("終了時刻は日付をまたぐと 24 時以降で表し、最小 15 分・NaN フォールバック 180 分・ゼロ埋めする", () => {
    expect(computeEndTime(" 09:05 ", 180)).toBe("12:05");
    expect(computeEndTime("9:05", 60)).toBe("10:05");
    expect(computeEndTime("08:05", 5)).toBe("08:20");
    expect(computeEndTime("08:05", Number.NaN)).toBe("11:05");
    expect(computeEndTime("21:00", 180)).toBe("24:00");
    expect(computeEndTime("22:30", 240)).toBe("26:30");
    expect(computeEndTime("abc", 60)).toBe("");
  });
  it("保存された長さを優先し、0 や無効値なら開始と終了から求める", () => {
    expect(eventDurationMinutes("21:00", "23:00", 150)).toBe(150);
    expect(eventDurationMinutes("21:15", "23:45", 0)).toBe(150);
    expect(eventDurationMinutes("21:15", "23:45", Number.NaN)).toBe(150);
    expect(eventDurationMinutes("21:00", "24:00")).toBe(180);
    expect(eventDurationMinutes("23:00", "01:00")).toBe(120);
    expect(eventDurationMinutes("21:00", "21:00")).toBe(1440);
    expect(eventDurationMinutes("x", "21:00")).toBe(0);
    expect(eventDurationMinutes("21:00", "y")).toBe(0);
  });
});

describe("自分の予定ファイルの読み取り", () => {
  it("開始日だけを日本時間で取り出す（UTC/ローカル/DATE/折り返し・TZ除外）", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "DTSTART:19700101T000000",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20261203",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "  DTSTART;TZID=Asia/Tokyo:20261121\n T210000",
      "SUMMARY:長い",
      " 件名",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20261121T163000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART:20261121T145900Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "X-NOT-DTSTART:20260101T000000Z",
      "DESCRIPTION:DTSTART:20260202T000000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseBusyDates(text)).toEqual(["2026-11-21", "2026-11-22", "2026-12-03"]);
  });
});

describe("日程調整・RSVP・確定", () => {
  it("候補日のない古い形式は候補 1 件として扱う", () => {
    const old = poll({ candidates: undefined, responses: { u_a: "ok" } });
    expect(pollCandidates(old)).toHaveLength(1);
    expect(pollCandidates(old)[0]).toEqual({
      id: "default",
      date: "2026-11-21",
      startTime: "21:00",
      endTime: "24:00",
      responses: { u_a: "ok" },
    });
  });
  it("回答者は卓のメンバー（または作成者）と実回答者のうち存在するユーザーだけ", () => {
    expect(pollMemberIds(poll(), state).sort()).toEqual(["u_a", "u_b", "u_x"]);
    expect(
      pollMemberIds(
        poll({
          tableId: undefined,
          createdBy: "u_a",
          candidates: [
            {
              id: "c1",
              date: "2026-11-21",
              startTime: "21:00",
              endTime: "24:00",
              responses: { missing: "ok" },
            },
          ],
        }),
        state,
      ),
    ).toEqual(["u_a"]);
  });
  it("確定できるのは作った人か卓の作成者", () => {
    expect(canConfirmPoll(poll(), state)).toBe(true);
    expect(canConfirmPoll(poll({ tableId: "t1", createdBy: "u_a" }), { ...state, me: "u_a" })).toBe(true);
    expect(canConfirmPoll(poll({ tableId: undefined }), state)).toBe(false);
    expect(canConfirmPoll(poll({ createdBy: "u_b", tableId: undefined }), state)).toBe(true);
  });
  it("候補を直せるのは作った人だけ（卓の作成者は確定だけ）", () => {
    expect(canEditPoll(poll({ createdBy: "u_a" }), { me: "u_a" })).toBe(true);
    expect(canEditPoll(poll({ createdBy: "u_b" }), { me: "u_a" })).toBe(false);
  });
  it("自分の未回答の候補日を数える", () => {
    expect(unansweredCount(poll(), "u_a")).toBe(1);
    expect(unansweredCount(poll(), "u_b")).toBe(2);
  });
  it("複数日の項目は各日に入る", () => {
    const m = groupBy([{ d: ["a", "b"] }, { d: ["b"] }], (x) => x.d);
    expect(m.get("b")).toHaveLength(2);
  });

  it("候補への回答と確定を反映し、存在しない ID は無視する", () => {
    const doc = {
      me: "u_b",
      events: {
        ev1: poll(),
        legacy: poll({ id: "legacy", candidates: [], responses: {} }),
      } as State["events"],
    };
    applyCandidateRsvp(doc, "missing", "c1", "ok");
    applyCandidateRsvp(doc, "ev1", "no_cand", "ok");
    applyCandidateRsvp(doc, "ev1", "c2", "maybe");
    expect(doc.events.ev1?.candidates?.[0]?.responses.u_b).toBeUndefined();
    expect(doc.events.ev1?.candidates?.[1]?.responses.u_b).toBe("maybe");
    applyCandidateRsvp(doc, "legacy", "default", "ng");
    expect(doc.events.legacy?.responses.u_b).toBe("ng");

    applyConfirmCandidate(doc, "missing", doc.events.ev1!.candidates![1]!);
    applyConfirmCandidate(doc, "ev1", doc.events.ev1!.candidates![1]!);
    expect(doc.events.ev1).toMatchObject({
      status: "confirmed",
      date: "2026-11-22",
      startTime: "21:00",
      endTime: "24:00",
      durationMin: 180,
      responses: { u_x: "ng", u_b: "maybe" },
    });
    expect("candidates" in doc.events.ev1!).toBe(false);
  });
});

describe("購読リンク", () => {
  it("Apple は webcal、Google は購読追加の URL を作る", () => {
    const links = calendarSubscribeLinks("https://example.com/feed/https://abc");
    expect(links.feed).toBe("https://example.com/feed/https://abc");
    expect(links.apple).toBe("webcal://example.com/feed/https://abc");
    expect(links.google).toBe(
      "https://calendar.google.com/calendar/render?cid=" +
        encodeURIComponent("webcal://example.com/feed/https://abc"),
    );
    expect(calendarSubscribeLinks("http://example.com/feed/abc").apple).toBe("webcal://example.com/feed/abc");
  });
});

describe("近い予定の言い方", () => {
  it("今日・あす・あとN日（13日境界）・範囲外", () => {
    expect(daysBetween("2026-11-30", "2026-12-02")).toBe(2);
    expect(daysBetween("2026-12-02", "2026-11-30")).toBe(-2);
    expect(relativeDayLabel("2026-11-18", "2026-11-18")).toBe("今日");
    expect(relativeDayLabel("2026-11-18", "2026-11-19")).toBe("あす");
    expect(relativeDayLabel("2026-11-18", "2026-11-21")).toBe("あと3日");
    expect(relativeDayLabel("2026-11-18", "2026-12-01")).toBe("あと13日");
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
    tables: {
      t1: { id: "t1", name: "卓1", ownerId: "u_b", memberIds: ["u_a", "u_b"], createdAt: "" },
      tOwned: { id: "tOwned", name: "自卓", ownerId: "u_a", memberIds: [], createdAt: "" },
      other: { id: "other", name: "他卓", ownerId: "u_b", memberIds: ["u_b"], createdAt: "" },
    },
    logs: {
      // その日の 21:00〜23:00 に遊んだ
      l1: { ownerId: "u_a", players: {}, sittings: [at("2026-11-12")], tableId: "t1" },
      lOtherUser: { ownerId: "u_b", players: {}, sittings: [at("2026-11-10")], tableId: "t1" },
      lNoTable: { ownerId: "u_a", players: {}, sittings: [at("2026-11-05")] },
    },
  } as unknown as Pick<State, "tables" | "events" | "logs" | "me">;

  it("返事待ち・これから・記録がまだ（30日境界・記録済み除外・時刻順）に分類する", () => {
    const view = myScheduleView(
      {
        ...base,
        events: {
          aLate: ev({ id: "aLate", date: "2026-11-20", startTime: "22:00" }),
          aEarly: ev({ id: "aEarly", date: "2026-11-20", startTime: "19:00", tableId: "tOwned" }),
          personalMine: ev({ id: "personalMine", tableId: undefined, createdBy: "u_a", date: "2026-11-18" }),
          personalResp: ev({
            id: "personalResp",
            tableId: undefined,
            createdBy: "u_b",
            responses: { u_a: "ok" },
            date: "2026-11-22",
          }),
          personalOther: ev({ id: "personalOther", tableId: undefined, createdBy: "u_b", responses: {} }),
          recorded: ev({ id: "recorded", date: "2026-11-12", tableId: "t1" }),
          diffTableSameDate: ev({ id: "diffTableSameDate", date: "2026-11-12", tableId: "tOwned" }),
          unrecBoundary: ev({ id: "unrecBoundary", date: "2026-10-19" }),
          unrecRecent: ev({ id: "unrecRecent", date: "2026-11-10" }),
          unrecTooOld: ev({ id: "unrecTooOld", date: "2026-10-18" }),
          personalRec: ev({ id: "personalRec", tableId: undefined, createdBy: "u_a", date: "2026-11-05" }),
          pollNeed: ev({
            id: "pollNeed",
            status: "poll",
            candidates: [
              { id: "k", date: "2026-11-25", startTime: "21:00", endTime: "24:00", responses: {} },
            ],
          }),
          pollDone: ev({
            id: "pollDone",
            status: "poll",
            candidates: [
              {
                id: "k2",
                date: "2026-11-26",
                startTime: "21:00",
                endTime: "24:00",
                responses: { u_a: "ok" },
              },
            ],
          }),
          otherTable: ev({ id: "otherTable", tableId: "other" }),
        },
      },
      "2026-11-18",
    );
    expect(view.upcoming.map((e) => e.id)).toEqual(["personalMine", "aEarly", "aLate", "personalResp"]);
    expect(view.unrecorded.map((e) => e.id)).toEqual(["diffTableSameDate", "unrecRecent", "unrecBoundary"]);
    expect(view.pollsNeedingReply.map((e) => e.id)).toEqual(["pollNeed"]);
  });
});

describe("自分の予定との照らし合わせ", () => {
  const google = (ranges: { start: string; end: string; calendarId?: string }[], extra = {}) => ({
    consentedAt: "2026-11-20T00:00:00Z",
    calendars: [
      { id: "main", name: "自分", on: true },
      { id: "holiday", name: "日本の祝日", on: false },
    ],
    countAllDay: false,
    ranges: ranges.map((r) => ({ calendarId: "main", ...r })),
    ...extra,
  });

  it("slotRange は JST の開始から長さぶん。25:00 のような翌日表記も扱う", () => {
    expect(slotRange("2026-11-21", "21:00", 180)).toEqual({
      start: Date.parse("2026-11-21T21:00:00+09:00"),
      end: Date.parse("2026-11-22T00:00:00+09:00"),
    });
    expect(slotRange("2026-11-21", "25:00", 60)?.start).toBe(Date.parse("2026-11-22T01:00:00+09:00"));
    expect(slotRange("bad", "21:00", 60)).toBeNull();
  });

  it("isAllDayRange は JST の 0:00〜0:00 で丸ごと埋まる時間帯だけ", () => {
    const d = (s: string) => Date.parse(s);
    expect(isAllDayRange(d("2026-11-22T00:00:00+09:00"), d("2026-11-23T00:00:00+09:00"))).toBe(true);
    expect(isAllDayRange(d("2026-11-22T00:00:00+09:00"), d("2026-11-25T00:00:00+09:00"))).toBe(true);
    expect(isAllDayRange(d("2026-11-22T00:00:00Z"), d("2026-11-23T00:00:00Z"))).toBe(false);
    expect(isAllDayRange(d("2026-11-22T00:00:00+09:00"), d("2026-11-22T23:00:00+09:00"))).toBe(false);
  });

  it("同じ日でも時間帯が重ならなければ予定ありにしない（昼の予定と夜の候補）", () => {
    const check = busyChecker({
      googleBusy: google([{ start: "2026-11-21T12:00:00+09:00", end: "2026-11-21T13:00:00+09:00" }]),
    });
    expect(check("2026-11-21", "21:00", 180)).toBe(false);
    expect(check("2026-11-21", "12:30", 60)).toBe(true);
    // 境界がちょうど接するだけなら重ならない
    expect(check("2026-11-21", "13:00", 60)).toBe(false);
    expect(check("2026-11-21", "11:00", 60)).toBe(false);
  });

  it("日をまたぐ候補は翌日の予定とも照らし合わせる", () => {
    const check = busyChecker({
      googleBusy: google([{ start: "2026-11-22T00:30:00+09:00", end: "2026-11-22T02:00:00+09:00" }]),
    });
    expect(check("2026-11-21", "22:00", 180)).toBe(true);
    expect(check("2026-11-21", "21:00", 180)).toBe(false);
  });

  it("終日の予定は countAllDay のときだけ数え、オフのカレンダーは数えない", () => {
    const allDay = { start: "2026-11-23T00:00:00+09:00", end: "2026-11-24T00:00:00+09:00" };
    expect(busyChecker({ googleBusy: google([allDay]) })("2026-11-23", "21:00", 180)).toBe(false);
    expect(
      busyChecker({ googleBusy: google([allDay], { countAllDay: true }) })("2026-11-23", "21:00", 180),
    ).toBe(true);
    const holiday = busyChecker({
      googleBusy: google([{ ...allDay, calendarId: "holiday" }], { countAllDay: true }),
    });
    expect(holiday("2026-11-23", "21:00", 180)).toBe(false);
  });

  it("Google の許可がなければ常に false", () => {
    expect(busyChecker({})("2026-11-21", "21:00", 180)).toBe(false);
    expect(hasBusySource({})).toBe(false);
    expect(hasBusySource({ googleBusy: google([]) })).toBe(false);
    expect(
      hasBusySource({ googleBusy: google([{ start: "2026-11-21T00:00:00Z", end: "2026-11-21T01:00:00Z" }]) }),
    ).toBe(true);
  });

  it("compactBusyRanges は終わった時間帯と重複を落とし、隣接はまとめない", () => {
    const now = Date.parse("2026-11-21T00:00:00Z");
    expect(
      compactBusyRanges(
        [
          { calendarId: "a", start: "2026-11-22T00:00:00Z", end: "2026-11-22T01:00:00Z" },
          { calendarId: "a", start: "2026-11-22T00:00:00.000Z", end: "2026-11-22T01:00:00.000Z" },
          { calendarId: "a", start: "2026-11-22T01:00:00Z", end: "2026-11-22T02:00:00Z" },
          { calendarId: "a", start: "2026-11-20T00:00:00Z", end: "2026-11-20T01:00:00Z" },
          { calendarId: "a", start: "bad", end: "2026-11-20T01:00:00Z" },
        ],
        now,
      ),
    ).toEqual([
      { calendarId: "a", start: "2026-11-22T00:00:00.000Z", end: "2026-11-22T01:00:00.000Z" },
      { calendarId: "a", start: "2026-11-22T01:00:00.000Z", end: "2026-11-22T02:00:00.000Z" },
    ]);
  });
});

describe("日程調整の編集と回答", () => {
  const base = (): Pick<State, "events" | "me"> => ({
    me: "u1",
    events: {
      ev1: poll({
        durationMin: 180,
        candidates: [
          {
            id: "c1",
            date: "2026-11-21",
            startTime: "21:00",
            endTime: "24:00",
            responses: { u1: "ok", u2: "ng" },
          },
          { id: "c2", date: "2026-11-22", startTime: "20:00", endTime: "23:00", responses: { u2: "ok" } },
        ],
      }),
    },
  });

  it("pollDurationMinutes は保存された長さか、最初の候補から求める", () => {
    expect(pollDurationMinutes(base().events.ev1!)).toBe(180);
    expect(
      pollDurationMinutes(
        poll({
          durationMin: undefined,
          candidates: [{ id: "c", date: "2026-11-21", startTime: "20:00", endTime: "22:30", responses: {} }],
        }),
      ),
    ).toBe(150);
  });

  it("applyPollEdit は長さをそろえ、日時を変えた候補の回答だけを消して並べ直す", () => {
    const s = base();
    applyPollEdit(s, "ev1", {
      title: " 次回（改） ",
      note: "  ",
      durationMin: 240,
      candidates: [
        { id: "c2", date: "2026-11-22", startTime: "21:00" },
        { id: "c1", date: "2026-11-21", startTime: "21:00" },
        { id: "c3", date: "2026-11-20", startTime: "19:00" },
      ],
    });
    const ev = s.events.ev1!;
    expect(ev.title).toBe("次回（改）");
    expect(ev.note).toBeUndefined();
    expect(ev.durationMin).toBe(240);
    expect(ev.candidates!.map((c) => [c.id, c.endTime, c.responses])).toEqual([
      ["c3", "23:00", {}],
      ["c1", "25:00", { u1: "ok", u2: "ng" }],
      ["c2", "25:00", {}],
    ]);
    expect(ev.date).toBe("2026-11-20");
    // 候補が空になる編集は受け付けない
    applyPollEdit(s, "ev1", { title: "x", durationMin: 60, candidates: [] });
    expect(ev.candidates).toHaveLength(3);
  });

  it("applyPollAnswers は自分の回答だけをまとめて書く", () => {
    const s = base();
    applyPollAnswers(s, "ev1", { c1: "maybe", c2: "ok" });
    expect(s.events.ev1!.candidates!.map((c) => c.responses.u1)).toEqual(["maybe", "ok"]);
    expect(s.events.ev1!.candidates![0]!.responses.u2).toBe("ng");
  });
});

describe("自分の予定", () => {
  const at = (iso: string) => Date.parse(`${iso}+09:00`);
  const plan = (a: string, b: string, label?: string) => ({
    start: at(a),
    end: at(b),
    ...(label ? { label } : {}),
  });

  it("卓譜で確定した自分の予定だけを数え、日程調整中・不可と返事したもの・ほかの人の予定は数えない", () => {
    const base = { date: "2026-12-04", startTime: "21:00", endTime: "24:00", responses: {}, createdBy: "a" };
    const plans = confirmedOwnPlans({
      me: "a",
      tables: {
        t1: { id: "t1", name: "", ownerId: "b", memberIds: ["a", "b"], createdAt: "" },
        t2: { id: "t2", name: "", ownerId: "b", memberIds: ["b"], createdAt: "" },
      },
      events: {
        mine: { ...base, id: "mine", title: "卓", tableId: "t1" },
        solo: { ...base, id: "solo", title: "個人", date: "2026-12-05" },
        poll: { ...base, id: "poll", title: "調整中", tableId: "t1", status: "poll" },
        ng: { ...base, id: "ng", title: "不可", tableId: "t1", responses: { a: "ng" } },
        other: { ...base, id: "other", title: "他人", tableId: "t2", createdBy: "b" },
      },
    });
    expect(plans.map((p) => p.label)).toEqual(["卓", "個人"]);
    const find = planFinder(plans);
    expect(find("2026-12-04", "23:00", 120).map((p) => p.label)).toEqual(["卓"]);
    expect(find("2026-12-04", "18:00", 180)).toEqual([]);
  });

  it("時間帯は見る日を基準に書く", () => {
    expect(planTimeText(plan("2026-12-04T20:00", "2026-12-04T22:00"), "2026-12-04")).toBe("20:00〜22:00");
    expect(planTimeText(plan("2026-12-04T22:00", "2026-12-05T01:30"), "2026-12-04")).toBe("22:00〜25:30");
    expect(planTimeText(plan("2026-12-04T22:00", "2026-12-05T00:00"), "2026-12-04")).toBe("22:00〜24:00");
    expect(planTimeText(plan("2026-12-04T22:00", "2026-12-05T10:00"), "2026-12-05")).toBe("0:00〜10:00");
    expect(planTimeText(plan("2026-12-04T00:00", "2026-12-05T00:00"), "2026-12-04")).toBe("終日");
  });

  it("日ごとに分ける。深夜までの続きは前日だけ、朝を越えるものは両方の日に", () => {
    const days = plansByDate([
      plan("2026-12-04T22:00", "2026-12-05T01:30"),
      plan("2026-12-06T22:00", "2026-12-07T10:00"),
      plan("2026-12-08T00:00", "2026-12-09T00:00"),
    ]);
    expect([...days.keys()]).toEqual(["2026-12-04", "2026-12-06", "2026-12-07", "2026-12-08"]);
  });
});
