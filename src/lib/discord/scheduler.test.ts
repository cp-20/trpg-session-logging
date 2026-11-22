import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reminderDueAt } from "./reminders";
import {
  CAP_MS,
  createReminderScheduler,
  MAX_TIMEOUT_MS,
  SAFETY_MS,
  timerDelay,
  type SchedulerOptions,
} from "./scheduler";
import { syncEventFromApp } from "./sync";
import { linkTable, makeCtx, NOW } from "./testkit";

const HOUR = 3600_000;

function setup() {
  const t = makeCtx();
  t.ctx.now = () => Date.now();
  t.ctx.log = vi.fn();
  linkTable(t.store);
  return t;
}

type T = ReturnType<typeof setup>;

function addPost(t: T, eventId: string, startMs: number, confirmedAt = NOW - 3 * 24 * HOUR) {
  t.store.data.posts.set(eventId, {
    eventId,
    tableId: "t1",
    guildId: "g1",
    channelId: "ch1",
    title: "第2話",
    startMs,
    endMs: startMs + 3 * HOUR,
    confirmedAt,
  });
}

const sent = (t: T) => t.rest.calls.filter((c) => c.op === "createMessage").length;

function scheduler(t: T, over: Partial<SchedulerOptions> = {}) {
  const s = createReminderScheduler({ ctx: () => t.ctx, ...over });
  stops.push(() => s.stop());
  return s;
}

const stops: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
});

describe("次に送る時刻", () => {
  it("日本時間の 25:30 は翌日 1:30 として、その 24 時間前に送る", async () => {
    const t = setup();
    // 卓譜から 11/21 の 25:30〜28:00（= 11/22 1:30〜4:00）の予定を確定する
    const r = await syncEventFromApp(t.ctx, "u_owner", {
      eventId: "ev1",
      tableId: "t1",
      title: "第2話",
      date: "2026-11-21",
      startTime: "25:30",
      endTime: "28:00",
    });
    expect(r).toMatchObject({ ok: true, changed: true });
    const post = t.store.data.posts.get("ev1")!;
    expect(post.startMs).toBe(Date.parse("2026-11-22T01:30:00+09:00"));
    const due = Date.parse("2026-11-21T01:30:00+09:00");
    expect(reminderDueAt(post)).toBe(due);

    const before = sent(t);
    const s = scheduler(t, { safetyMs: 24 * HOUR, capMs: 24 * HOUR });
    await s.wake();
    expect(s.nextRunAt).toBe(due);
    await vi.advanceTimersByTimeAsync(due - Date.now() - 1);
    expect(sent(t)).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent(t)).toBe(before + 1);
  });

  it("決まったばかりなら 6 時間後、始まるまでに 6 時間ないなら送らない", () => {
    const start = NOW + 10 * HOUR;
    expect(reminderDueAt({ startMs: start, endMs: start + HOUR, confirmedAt: NOW })).toBe(NOW + 6 * HOUR);
    expect(reminderDueAt({ startMs: start, endMs: start + HOUR, confirmedAt: start - 5 * HOUR })).toBeNull();
    expect(reminderDueAt({ startMs: start })).toBeNull();
  });

  it("遠い時刻は上限で切り、setTimeout の上限（約 24.8 日）を超えない", () => {
    expect(timerDelay(NOW + 100 * 24 * HOUR, NOW, CAP_MS)).toBe(CAP_MS);
    expect(timerDelay(NOW + 100 * 24 * HOUR, NOW, Number.POSITIVE_INFINITY)).toBe(MAX_TIMEOUT_MS);
    expect(timerDelay(null, NOW, Number.MAX_SAFE_INTEGER)).toBe(MAX_TIMEOUT_MS);
    expect(timerDelay(NOW - HOUR, NOW, CAP_MS)).toBe(0);
  });

  it("予定がなくても 10 分ごとに見直す。上限を大きくしても約 24.8 日で起きる", async () => {
    const t = setup();
    const s = scheduler(t);
    await s.wake();
    expect(s.nextRunAt).toBe(NOW + SAFETY_MS);
    const far = scheduler(t, { safetyMs: 1e15, capMs: 1e15 });
    await far.reschedule();
    expect(far.nextRunAt).toBe(NOW + MAX_TIMEOUT_MS);
  });
});

describe("予定が変わったら数え直す", () => {
  it("確定した予定を書いたらすぐ、その送る時刻にタイマーを置き直す", async () => {
    const t = setup();
    const s = scheduler(t, { safetyMs: 24 * HOUR, capMs: 24 * HOUR });
    await s.wake();
    expect(s.nextRunAt).toBe(NOW + 24 * HOUR);
    let pending: Promise<void> | undefined;
    t.ctx.onEventsChanged = () => {
      pending = s.reschedule();
    };
    await syncEventFromApp(t.ctx, "u_owner", {
      eventId: "ev1",
      tableId: "t1",
      title: "第2話",
      date: "2026-11-21",
      startTime: "21:00",
      endTime: "24:00",
    });
    await pending;
    expect(s.nextRunAt).toBe(Date.parse("2026-11-20T21:00:00+09:00"));
    // 予定を消したら、そのタイマーも外れる
    await syncEventFromApp(t.ctx, "u_owner", { eventId: "ev1", tableId: "t1", deleted: true });
    await pending;
    expect(s.nextRunAt).toBe(NOW + 24 * HOUR);
  });

  it("走っている間の呼び出しはまとめて、あと 1 回だけ走らせる", async () => {
    const t = setup();
    const list = vi.spyOn(t.store, "listEventPostsStartingBetween");
    const s = scheduler(t);
    const a = s.reschedule();
    const b = s.reschedule();
    const c = s.wake();
    await Promise.all([a, b, c]);
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("眠っていた間の取り戻し", () => {
  it("送る時刻を過ぎていて、まだ始まっていない予定は起きたときに送る。始まった予定には送らない", async () => {
    const t = setup();
    addPost(t, "soon", NOW + 2 * HOUR);
    addPost(t, "started", NOW - HOUR);
    await scheduler(t).wake();
    expect(sent(t)).toBe(1);
    expect(t.rest.calls[0]?.args[0]).toBe("ch1");
  });

  it("起こす要求が続いても、1 分に 1 回しか調べない", async () => {
    const t = setup();
    const list = vi.spyOn(t.store, "listEventPostsStartingBetween");
    const s = scheduler(t);
    await s.wake();
    await s.wake();
    expect(list).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 61_000);
    await s.wake();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("再起動しても、サーバーが 2 つ動いていても二重には送らない", async () => {
    const t = setup();
    addPost(t, "soon", NOW + 2 * HOUR);
    await Promise.all([scheduler(t).wake(), scheduler(t).wake()]);
    expect(sent(t)).toBe(1);
    await scheduler(t).wake();
    await vi.advanceTimersByTimeAsync(3 * SAFETY_MS);
    expect(sent(t)).toBe(1);
  });

  it("失敗しても投げず、短く書き残して 10 分後にもう一度調べる", async () => {
    const t = setup();
    addPost(t, "soon", NOW + 2 * HOUR);
    const list = vi.spyOn(t.store, "listEventPostsStartingBetween").mockRejectedValueOnce(new Error("down"));
    const s = scheduler(t);
    await expect(s.wake()).resolves.toBeUndefined();
    expect(t.ctx.log).toHaveBeenCalledWith("discord: reminder scan failed", expect.any(Error));
    expect(s.nextRunAt).toBe(NOW + SAFETY_MS);
    await vi.advanceTimersByTimeAsync(SAFETY_MS);
    expect(list).toHaveBeenCalledTimes(2);
    expect(sent(t)).toBe(1);
  });

  it("止めたらタイマーを残さない", async () => {
    const t = setup();
    const s = scheduler(t);
    await s.wake();
    expect(vi.getTimerCount()).toBe(1);
    s.stop();
    expect(vi.getTimerCount()).toBe(0);
    await s.reschedule();
    expect(vi.getTimerCount()).toBe(0);
  });
});
