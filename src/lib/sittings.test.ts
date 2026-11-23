import { describe, expect, it } from "vitest";
import { jstEpoch } from "./format";
import {
  SITTING_GAP_SECONDS,
  deriveSittings,
  endsNextDay,
  fmtSessionWhen,
  fmtSitting,
  hasMessageTimes,
  migrateLegacySchedule,
  nextSittingFields,
  normalizeEndTime,
  endFieldFor,
  normalizeSittings,
  normalizeTime,
  sessionDays,
  sessionEnd,
  sessionStart,
  sittingFromFields,
  sittingToFields,
  sittingsFromFields,
  sittingsMinutes,
  upgradeLogSchedule,
} from "./sittings";

const at = (d: string, t: string) => jstEpoch(d, t);

describe("deriveSittings: ログの発言時刻から集まりを導く", () => {
  it("深夜をまたぐ 1 回の集まりは 1 つ（日付で切らない）", () => {
    const msgs = [at("2026-10-17", "21:00"), at("2026-10-17", "23:30"), at("2026-10-18", "02:10")].map(
      (ts) => ({ ts }),
    );
    expect(deriveSittings([{ msgs }])).toEqual([
      { start: at("2026-10-17", "21:00"), end: at("2026-10-18", "02:10") },
    ]);
  });
  it("発言が 4 時間以上空いたら別の集まり。タブをまたいで時刻順に見る", () => {
    const a = [{ ts: at("2026-11-08", "21:00") }, { ts: at("2026-11-15", "21:30") }];
    const b = [{ ts: at("2026-11-08", "23:00") }, { ts: at("2026-11-15", "23:59") }];
    expect(deriveSittings([{ msgs: a }, { msgs: b }])).toEqual([
      { start: at("2026-11-08", "21:00"), end: at("2026-11-08", "23:00") },
      { start: at("2026-11-15", "21:30"), end: at("2026-11-15", "23:59") },
    ]);
  });
  it("ちょうど閾値の空きで分け、閾値未満の休憩はつなぐ", () => {
    const t = at("2026-11-08", "20:00");
    expect(deriveSittings([{ msgs: [{ ts: t }, { ts: t + SITTING_GAP_SECONDS }] }])).toHaveLength(2);
    expect(deriveSittings([{ msgs: [{ ts: t }, { ts: t + SITTING_GAP_SECONDS - 1 }] }])).toHaveLength(1);
  });
  it("時刻のない発言（ts = 0）は使わず、全部なければ空", () => {
    expect(deriveSittings([{ msgs: [{ ts: 0 }, { ts: 0 }] }])).toEqual([]);
    expect(hasMessageTimes([{ msgs: [{ ts: 0 }] }])).toBe(false);
    expect(hasMessageTimes([{ msgs: [{ ts: 0 }, { ts: 5 }] }])).toBe(true);
    expect(deriveSittings([])).toEqual([]);
  });
});

describe("集まりの並びから導く値", () => {
  const log = {
    sittings: [
      { start: at("2026-11-08", "21:00"), end: at("2026-11-09", "01:30") },
      { start: at("2026-11-15", "20:00"), end: at("2026-11-15", "23:00") },
    ],
  };
  it("開始・終了・日・合計時間", () => {
    expect(sessionStart(log)).toBe(at("2026-11-08", "21:00"));
    expect(sessionEnd(log)).toBe(at("2026-11-15", "23:00"));
    expect(sessionDays(log)).toEqual(["2026-11-08", "2026-11-15"]);
    expect(sittingsMinutes(log.sittings)).toBe(270 + 180);
    expect(sessionStart({ sittings: [] })).toBe(0);
    expect(sessionEnd({ sittings: [] })).toBe(0);
  });
  it("深夜 2 時に始めた集まりは前日の日に数える", () => {
    expect(
      sessionDays({ sittings: [{ start: at("2026-11-09", "02:00"), end: at("2026-11-09", "04:00") }] }),
    ).toEqual(["2026-11-08"]);
  });
  it("表示: 1 回なら時刻まで、翌日に終わるなら 24 を足した時刻、複数回なら回数", () => {
    expect(fmtSitting(log.sittings[0]!)).toBe("11月8日(日) 21:00〜25:30");
    expect(endsNextDay(log.sittings[1]!)).toBe(false);
    expect(fmtSessionWhen({ sittings: [log.sittings[1]!] })).toBe("11月15日(日) 20:00〜23:00");
    expect(fmtSessionWhen(log)).toBe("11月8日(日)・15日(日)");
    expect(fmtSessionWhen({ sittings: [] })).toBe("日付未定");
  });
});

describe("normalizeSittings", () => {
  it("並べ替え、壊れたものを落とし、重なりをまとめる", () => {
    expect(
      normalizeSittings([
        { start: 50, end: 60 },
        { start: 10, end: 20 },
        { start: 15, end: 30 },
        { start: 0, end: 5 },
        { start: 40, end: 30 },
        { start: Number.NaN, end: 1 },
      ]),
    ).toEqual([
      { start: 10, end: 30 },
      { start: 50, end: 60 },
    ]);
  });
});

describe("入力欄（日付・開始・終了）", () => {
  it("日をまたぐ終了は 26:30 と書く。開始以前の 02:30 も翌日とみなし、往復すると 26:30 になる", () => {
    const s = sittingFromFields({ date: "2026-10-17", start: "21:00", end: "26:30" })!;
    expect(s).toEqual({ start: at("2026-10-17", "21:00"), end: at("2026-10-18", "02:30") });
    expect(sittingFromFields({ date: "2026-10-17", start: "21:00", end: "02:30" })).toEqual(s);
    expect(sittingToFields(s)).toEqual({ date: "2026-10-17", start: "21:00", end: "26:30" });
    expect(sittingFromFields({ date: "2026-10-17", start: "21:00", end: "24:00" })!.end).toBe(
      at("2026-10-18", "00:00"),
    );
    expect(endFieldFor("21:00", "1:00")).toBe("25:00");
    expect(endFieldFor("21:00", "23:30")).toBe("23:30");
    expect(endFieldFor("21:00", "25:00")).toBe("25:00");
    expect(sittingFromFields({ date: "2026-10-17", start: "21:00", end: "21:00" })!.end).toBe(
      at("2026-10-18", "21:00"),
    );
  });
  it("時刻は全角・コロンなし・1 桁の時も読む。24 時以降は終了だけ（47 時まで）", () => {
    expect(normalizeTime("9:05")).toBe("09:05");
    expect(normalizeTime("２１：３０")).toBe("21:30");
    expect(normalizeTime("2130")).toBe("21:30");
    expect(normalizeTime("25:30")).toBeNull();
    expect(normalizeEndTime("25:30")).toBe("25:30");
    expect(normalizeEndTime("２５３０")).toBe("25:30");
    expect(normalizeEndTime("48:00")).toBeNull();
    expect(normalizeTime("21")).toBeNull();
    expect(sittingFromFields({ date: "2026/10/17", start: "21:00", end: "23:00" })).toBeNull();
  });
  it("並びの検証: 空・日付・時刻・重なりを、どの行かとともに返す", () => {
    expect(sittingsFromFields([])).toMatchObject({ ok: false, index: 0 });
    expect(sittingsFromFields([{ date: "", start: "21:00", end: "23:00" }])).toMatchObject({
      ok: false,
      error: expect.stringContaining("YYYY/MM/DD"),
    });
    expect(sittingsFromFields([{ date: "2026-10-17", start: "x", end: "23:00" }])).toMatchObject({
      ok: false,
    });
    expect(
      sittingsFromFields([
        { date: "2026-10-18", start: "01:00", end: "03:00" },
        { date: "2026-10-17", start: "21:00", end: "02:00" },
      ]),
    ).toMatchObject({ ok: false, index: 0, error: "時間帯が重なっています。" });
    const ok = sittingsFromFields([
      { date: "2026-10-24", start: "21:00", end: "23:00" },
      { date: "2026-10-17", start: "21:00", end: "23:00" },
    ]);
    expect(ok.ok && ok.sittings.map((s) => s.start)).toEqual([
      at("2026-10-17", "21:00"),
      at("2026-10-24", "21:00"),
    ]);
  });
  it("次の集まりの初期値は直前の翌日・同じ時刻。なければ今日の夜", () => {
    expect(nextSittingFields([{ date: "2026-10-31", start: "20:00", end: "23:00" }], "2026-01-01")).toEqual({
      date: "2026-11-01",
      start: "20:00",
      end: "23:00",
    });
    expect(nextSittingFields([], "2026-01-01")).toEqual({ date: "2026-01-01", start: "21:00", end: "24:00" });
  });
});

describe("古い保存データ（dates + t0 + t1）の読み替え", () => {
  it("発言時刻があればそれを正とする", () => {
    const msgs = [{ ts: at("2026-11-08", "21:00") }, { ts: at("2026-11-08", "23:00") }];
    expect(migrateLegacySchedule({ dates: ["2026-01-01"], t0: 1, t1: 2, channels: [{ msgs }] })).toEqual([
      { start: msgs[0]!.ts, end: msgs[1]!.ts },
    ]);
  });
  it("1 日なら t0〜t1（25:00 のような終わりも翌日として残る）", () => {
    const t0 = at("2026-11-08", "21:00");
    const t1 = at("2026-11-08", "25:00");
    expect(migrateLegacySchedule({ dates: ["2026-11-08"], t0, t1, channels: [] })).toEqual([
      { start: t0, end: t1 },
    ]);
  });
  it("複数日なら初日の開始時刻と最終日の長さを各日に当てる", () => {
    const t0 = at("2026-11-08", "21:00");
    const t1 = at("2026-11-15", "24:00");
    expect(migrateLegacySchedule({ dates: ["2026-11-15", "2026-11-08"], t0, t1 })).toEqual([
      { start: t0, end: at("2026-11-08", "24:00") },
      { start: at("2026-11-15", "21:00"), end: t1 },
    ]);
  });
  it("読めない値は空", () => {
    expect(migrateLegacySchedule({})).toEqual([]);
    expect(migrateLegacySchedule({ t0: "x", dates: "y", channels: [{ msgs: "z" }] })).toEqual([]);
  });
  it("upgradeLogSchedule は sittings を正とし古い欄を消す", () => {
    const legacy: Record<string, unknown> = { dates: ["2026-11-08"], t0: 100, t1: 200, channels: [] };
    expect(upgradeLogSchedule(legacy)).toBe(true);
    expect(legacy).toEqual({ channels: [], sittings: [{ start: 100, end: 200 }] });
    const current: Record<string, unknown> = {
      sittings: [
        { start: 300, end: 400 },
        { start: 100, end: 200 },
      ],
      t0: 1,
    };
    upgradeLogSchedule(current);
    expect(current).toEqual({
      sittings: [
        { start: 100, end: 200 },
        { start: 300, end: 400 },
      ],
    });
    expect(upgradeLogSchedule({ channels: [] })).toBe(false);
  });
});
