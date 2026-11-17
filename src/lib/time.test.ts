import { describe, expect, it } from "vitest";
import {
  buildSessionRange,
  deriveSessionFromMessages,
  fmtDates,
  jstEpoch,
  sessionClock,
  sessionDay,
  sessionMinutes,
  sessionPlayMinutes,
} from "./time";

describe("sessionDay (6:00 区切りの30時間制)", () => {
  it("深夜2時は前日に含まれる", () => {
    // 2026-11-16 02:00 JST = 2026-11-15T17:00Z
    const ts = jstEpoch("2026-11-15", "26:00");
    expect(sessionDay(ts)).toBe("2026-11-15");
  });
  it("6:00ちょうどは新しい日", () => {
    const ts = jstEpoch("2026-11-15", "30:00"); // 16日 06:00
    expect(sessionDay(ts)).toBe("2026-11-16");
  });
});

describe("jstEpoch", () => {
  it("JST の date+time(30h表記) を epoch秒に変換する", () => {
    const ts = jstEpoch("2026-11-15", "21:00");
    expect(sessionDay(ts)).toBe("2026-11-15");
    // 21:00 JST = 12:00 UTC
    expect(new Date(ts * 1000).toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });
});

describe("deriveSessionFromMessages", () => {
  it("メッセージのタイムスタンプから日付・開始・終了を算出する", () => {
    const a = jstEpoch("2026-11-15", "21:00");
    const b = jstEpoch("2026-11-15", "26:30"); // 翌日 02:30
    const result = deriveSessionFromMessages([{ msgs: [{ ts: b }, { ts: a }] }]);
    expect(result).toEqual({ dates: ["2026-11-15"], t0: a, t1: b });
  });
  it("複数日にまたがる場合は sessionDay で区切る", () => {
    const d1 = jstEpoch("2026-11-14", "21:00");
    const d2 = jstEpoch("2026-11-15", "20:30");
    const result = deriveSessionFromMessages([{ msgs: [{ ts: d1 }, { ts: d2 }] }]);
    expect(result?.dates).toEqual(["2026-11-14", "2026-11-15"]);
  });
  it("メッセージがなければ null", () => {
    expect(deriveSessionFromMessages([{ msgs: [] }])).toBeNull();
  });
});

describe("sessionPlayMinutes", () => {
  it("複数日セッションは夜間の空白を含めず、日ごとの区間を合算する", () => {
    // 1日目 21:00-23:00 (120分) + 2日目 20:00-22:00 (120分) = 240分
    const a = jstEpoch("2026-11-14", "21:00");
    const b = jstEpoch("2026-11-14", "23:00");
    const c = jstEpoch("2026-11-15", "20:00");
    const d = jstEpoch("2026-11-15", "22:00");
    const log = {
      hasLog: true,
      channels: [{ msgs: [{ ts: a }, { ts: b }, { ts: c }, { ts: d }] }],
      t0: a,
      t1: d,
    };
    expect(sessionPlayMinutes(log)).toBe(240);
    // 壁時間(47h)とは異なる
    expect(sessionMinutes(a, d)).toBeGreaterThan(240);
  });
  it("ログがないセッションは t1-t0 を使う", () => {
    const a = jstEpoch("2026-11-15", "21:00");
    const b = jstEpoch("2026-11-15", "26:00");
    expect(sessionPlayMinutes({ hasLog: false, channels: [], t0: a, t1: b })).toBe(300);
  });
});

describe("buildSessionRange", () => {
  it("複数日: 終了は最終日の時刻として解釈し、日数を二重加算しない", () => {
    const r = buildSessionRange({
      dates: ["2026-11-14", "2026-11-15"],
      startTime: "21:00",
      endTime: "25:00",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 14日21:00 → 16日01:00(15日の25:00) = 28時間
      expect(Math.round((r.t1 - r.t0) / 60)).toBe(1680);
    }
  });
  it("単日のタイトル編集だけなら時刻は不変(往復一致)", () => {
    const t0 = jstEpoch("2026-11-14", "21:00");
    const t1 = jstEpoch("2026-11-14", "26:40");
    const start = sessionClock(t0, "2026-11-14");
    const end = sessionClock(t1, "2026-11-14");
    expect(start).toBe("21:00");
    expect(end).toBe("26:40");
    const r = buildSessionRange({ dates: ["2026-11-14"], startTime: start, endTime: end });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.t0).toBe(t0);
      expect(r.t1).toBe(t1);
    }
  });
  it("不正な時刻は拒否する", () => {
    expect(buildSessionRange({ dates: ["2026-11-14"], startTime: "21:00", endTime: "99:99" }).ok).toBe(false);
  });
  it("終了が開始より前なら拒否する", () => {
    expect(buildSessionRange({ dates: ["2026-11-14"], startTime: "21:00", endTime: "20:00" }).ok).toBe(false);
  });
});

describe("fmtDates", () => {
  it("単日", () => {
    expect(fmtDates(["2026-11-15"])).toContain("11月15日");
  });
  it("複数日は省略表示", () => {
    const s = fmtDates(["2026-11-14", "2026-11-15"]);
    expect(s).toContain("11月14日");
    expect(s).toContain("15日");
  });
});
