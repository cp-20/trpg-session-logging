import { describe, expect, it } from "vitest";
import {
  buildSessionRange,
  countTextNodes,
  deriveSessionFromMessages,
  fmtDates,
  jstEpoch,
  sessionClock,
  sessionDay,
  sessionMinutes,
  sessionPlayMinutes,
} from "./time";

describe("countTextNodes", () => {
  it("配列・入れ子オブジェクトから空でない文字列 text プロパティだけを再帰的に数える", () => {
    expect(countTextNodes(null)).toBe(0);
    expect(countTextNodes("text")).toBe(0);
    expect(countTextNodes({ text: "" })).toBe(0);
    expect(countTextNodes({ text: 123 })).toBe(0);
    expect(
      countTextNodes([
        { text: "A", child: { text: "B" } },
        { text: { nested: true }, items: [{ text: "C" }, { text: "" }, null] },
      ]),
    ).toBe(3);
    expect(countTextNodes({ text: "Top", other: { text: "Sub" } })).toBe(2);
    expect(countTextNodes({ text: "OnlyTextProp", deep: [{ text: "D" }] })).toBe(2);
  });
});

describe("sessionDay (6:00 区切りの30時間制)", () => {
  it("深夜2時は前日に含まれる", () => {
    const ts = jstEpoch("2026-11-15", "26:00");
    expect(sessionDay(ts)).toBe("2026-11-15");
  });
  it("6:00ちょうどは新しい日、5:59は前日", () => {
    expect(sessionDay(jstEpoch("2026-11-15", "29:59"))).toBe("2026-11-15");
    expect(sessionDay(jstEpoch("2026-11-15", "30:00"))).toBe("2026-11-16");
  });
});

describe("jstEpoch", () => {
  it("JST の date+time(30h表記) を epoch秒に変換する", () => {
    const ts = jstEpoch("2026-11-15", "21:00");
    expect(sessionDay(ts)).toBe("2026-11-15");
    expect(new Date(ts * 1000).toISOString()).toBe("2026-11-15T12:00:00.000Z");
  });
});

describe("deriveSessionFromMessages", () => {
  it("メッセージのタイムスタンプから日付・開始・終了を算出する", () => {
    const a = jstEpoch("2026-11-15", "21:00");
    const b = jstEpoch("2026-11-15", "26:30");
    const result = deriveSessionFromMessages([{ msgs: [{ ts: b }, { ts: a }] }]);
    expect(result).toEqual({ dates: ["2026-11-15"], t0: a, t1: b });
  });
  it("複数日にまたがる場合は sessionDay で重複を除いて並べる", () => {
    const d1 = jstEpoch("2026-11-14", "21:00");
    const d1b = jstEpoch("2026-11-14", "22:00");
    const d2 = jstEpoch("2026-11-15", "20:30");
    const result = deriveSessionFromMessages([{ msgs: [{ ts: d1 }, { ts: d1b }, { ts: d2 }] }]);
    expect(result?.dates).toEqual(["2026-11-14", "2026-11-15"]);
  });
  it("メッセージがなければ null", () => {
    expect(deriveSessionFromMessages([{ msgs: [] }])).toBeNull();
  });
});

describe("sessionPlayMinutes", () => {
  it("複数日セッションは夜間の空白を含めず合算し、同じ参照ではキャッシュを返す", () => {
    const a = jstEpoch("2026-11-14", "21:00");
    const mid = jstEpoch("2026-11-14", "22:00");
    const b = jstEpoch("2026-11-14", "23:00");
    const c = jstEpoch("2026-11-15", "20:00");
    const d = jstEpoch("2026-11-15", "22:00");
    const channels = [{ msgs: [{ ts: mid }, { ts: a }, { ts: b }, { ts: d }, { ts: c }] }];
    const log = { hasLog: true, channels, t0: a, t1: d };
    expect(sessionPlayMinutes(log)).toBe(240);
    // WeakMap キャッシュ経路: channels の中身を増やしてもキャッシュ済み参照なら以前の 240 を返す
    channels[0]!.msgs.push({ ts: jstEpoch("2026-11-16", "20:00") }, { ts: jstEpoch("2026-11-16", "22:00") });
    expect(sessionPlayMinutes({ hasLog: true, channels, t0: 0, t1: 0 })).toBe(240);
    expect(sessionMinutes(a, d)).toBeGreaterThan(240);
  });
  it("ログがないかメッセージが空なら t1-t0 を使い、最小 1 分に丸める", () => {
    const a = jstEpoch("2026-11-15", "21:00");
    const b = jstEpoch("2026-11-15", "26:00");
    expect(
      sessionPlayMinutes({
        hasLog: false,
        channels: [{ msgs: [{ ts: a }, { ts: a + 60 }] }],
        t0: a,
        t1: b,
      }),
    ).toBe(300);
    expect(sessionPlayMinutes({ hasLog: true, channels: [{ msgs: [] }], t0: a, t1: b })).toBe(300);
    expect(sessionPlayMinutes({ hasLog: false, channels: [], t0: a, t1: a })).toBe(1);
    expect(sessionPlayMinutes({ hasLog: true, channels: [{ msgs: [{ ts: a }] }], t0: a, t1: a })).toBe(1);
  });
});

describe("buildSessionRange & sessionClock", () => {
  it("複数日: 終了は最終日の時刻として解釈し、日数を二重加算しない", () => {
    const r = buildSessionRange({
      dates: ["2026-11-14", "2026-11-15"],
      startTime: "9:00",
      endTime: "31:59",
    });
    expect(r.ok).toBe(true);
    expect(r.error).toBeUndefined();
    if (r.ok) {
      expect(Math.round((r.t1 - r.t0) / 60)).toBe((24 + 22) * 60 + 59);
    }
  });
  it("単日のタイトル編集だけなら時刻は不変(ゼロ埋めも含めて往復一致)", () => {
    const t0 = jstEpoch("2026-11-14", "08:05");
    const t1 = jstEpoch("2026-11-14", "26:40");
    expect(sessionClock(t0, "2026-11-14")).toBe("08:05");
    expect(sessionClock(t0 - 600, "2026-11-14")).toBe("07:55");
    expect(sessionClock(jstEpoch("2026-11-13", "23:00"), "2026-11-14")).toBe("00:00");
    const end = sessionClock(t1, "2026-11-14");
    expect(end).toBe("26:40");
    const r = buildSessionRange({ dates: ["2026-11-14"], startTime: "08:05", endTime: end });
    expect(r).toEqual({ ok: true, t0, t1 });
  });
  it("空の日付・不正な時刻境界・同刻または逆転時刻を明確なメッセージ付きで拒否する", () => {
    expect(buildSessionRange({ dates: [], startTime: "21:00", endTime: "24:00" })).toEqual({
      ok: false,
      t0: 0,
      t1: 0,
      error: "実施日を入力してください",
    });
    for (const bad of ["32:00", "x21:00", "21:00x", "21:60", "ab:cd"]) {
      const r1 = buildSessionRange({ dates: ["2026-11-14"], startTime: bad, endTime: "23:00" });
      expect(r1.ok).toBe(false);
      expect(r1.error).toContain("時刻は");
      const r2 = buildSessionRange({ dates: ["2026-11-14"], startTime: "21:00", endTime: bad });
      expect(r2.ok).toBe(false);
      expect(r2.error).toContain("時刻は");
    }
    const same = buildSessionRange({ dates: ["2026-11-14"], startTime: "21:00", endTime: "21:00" });
    expect(same.ok).toBe(false);
    expect(same.error).toContain("終了は開始より後にしてください");
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
