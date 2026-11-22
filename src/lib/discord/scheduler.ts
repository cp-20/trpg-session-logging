/**
 * 前日のお知らせを送る、サーバーの中の時計。src/instrumentation.ts がサーバーの起動時に動かす。
 *
 * - 次に送る時刻（reminders.ts の reminderDueAt）にぴったり合わせて 1 つのタイマーを置く。
 *   遠い時刻でも最長 CAP_MS で起きて数え直し、そのほかに SAFETY_MS ごとに見直す（取りこぼしの保険）。
 * - 起動したとき・Discord 連携の要求が来たとき（wake）は、送る時刻を過ぎてまだ始まっていない予定を送る
 *   （サーバーが眠っていた分を取り戻す）。予定が変わったとき（reschedule）は、すぐ数え直す。
 * - 同時には 1 つしか走らせない。走っている間に呼ばれたら、終わってからもう 1 回だけ走らせる。
 * - 二重に送らないのは discordReminders の印（claimReminder）が受け持つ。再起動しても、複数のサーバーでも 1 回だけ。
 * - サーバーが止まっていればお知らせは出ない。始まる時刻の知らせは Discord のイベントが出す（docs/DEPLOYMENT.md）。
 */
import type { DiscordContext } from "./context";
import { runReminders } from "./reminders";

export const SAFETY_MS = 10 * 60_000;
/** 要求が続いても、取り戻しはこの間隔に 1 回まで */
export const WAKE_THROTTLE_MS = 60_000;
export const CAP_MS = 6 * 3600_000;
/** setTimeout に渡せる最長（これを超えるとすぐに呼ばれてしまう） */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface SchedulerOptions {
  ctx: () => DiscordContext | null;
  safetyMs?: number;
  capMs?: number;
  setTimer?: (run: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
}

export interface ReminderScheduler {
  /** 送る時刻を過ぎた予定を送り、次のタイマーを置き直す（直前に走っていたら何もしない）。例外は投げない */
  wake(): Promise<void>;
  /** 予定が決まった・変わった・消えたとき: すぐ数え直す */
  reschedule(): Promise<void>;
  stop(): void;
  /** 置いているタイマーの時刻（テスト用） */
  readonly nextRunAt: number | null;
}

/** 次に起きるまでの時間。過ぎた時刻は 0、遠い時刻は上限で切る */
export function timerDelay(nextDueAt: number | null, now: number, limitMs: number): number {
  const until = nextDueAt === null ? limitMs : nextDueAt - now;
  return Math.max(0, Math.min(until, limitMs, MAX_TIMEOUT_MS));
}

export function createReminderScheduler(opts: SchedulerOptions): ReminderScheduler {
  const safetyMs = opts.safetyMs ?? SAFETY_MS;
  const capMs = opts.capMs ?? CAP_MS;
  const setTimer = opts.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h));
  /** タイマーを置く最長。次に起きるまでに来る送る時刻だけ探せばよい */
  const limitMs = Math.min(safetyMs, capMs, MAX_TIMEOUT_MS);
  let timer: TimerHandle | null = null;
  let nextRunAt: number | null = null;
  let inflight: Promise<void> | null = null;
  let again = false;
  let stopped = false;
  let lastRunAt = -Infinity;

  function arm(ctx: DiscordContext | null, nextDueAt: number | null): void {
    if (timer) clearTimer(timer);
    timer = null;
    nextRunAt = null;
    if (stopped) return;
    const now = ctx?.now() ?? Date.now();
    const delay = timerDelay(nextDueAt, now, limitMs);
    nextRunAt = now + delay;
    timer = setTimer(() => {
      timer = null;
      void run();
    }, delay);
    (timer as { unref?: () => void }).unref?.();
  }

  async function once(): Promise<void> {
    const ctx = opts.ctx();
    lastRunAt = ctx?.now() ?? Date.now();
    if (!ctx) return arm(null, null);
    try {
      const report = await runReminders(ctx, limitMs);
      if (report.sent || report.failed)
        ctx.log?.(`discord: reminders sent=${report.sent} failed=${report.failed}`);
      arm(ctx, report.nextDueAt);
    } catch (error) {
      ctx.log?.("discord: reminder scan failed", error);
      arm(ctx, null);
    }
  }

  function run(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (inflight) {
      again = true;
      return inflight;
    }
    inflight = (async () => {
      do {
        again = false;
        await once().catch(() => {});
      } while (again && !stopped);
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    wake() {
      if (inflight) return inflight;
      const now = opts.ctx()?.now() ?? Date.now();
      return now - lastRunAt < WAKE_THROTTLE_MS ? Promise.resolve() : run();
    },
    reschedule: run,
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      timer = null;
      nextRunAt = null;
    },
    get nextRunAt() {
      return nextRunAt;
    },
  };
}

/* ---------- サーバーに 1 つだけ ---------- */

// instrumentation と route handler は別々に束ねられることがあるので、モジュールでなく globalThis に置く
const KEY = Symbol.for("takufu.discord.reminderScheduler");
type Holder = { [KEY]?: ReminderScheduler };

/** サーバーの時計を動かす（2 回目からは同じものを返す）。最初に 1 回、取り戻しを走らせる */
export function ensureReminderScheduler(ctx: () => DiscordContext | null): ReminderScheduler {
  const holder = globalThis as Holder;
  let scheduler = holder[KEY];
  if (!scheduler) {
    scheduler = createReminderScheduler({ ctx });
    holder[KEY] = scheduler;
    void scheduler.wake();
  }
  return scheduler;
}
