import { describe, expect, it } from "vitest";
import { evaluateSyncIndicatorTransition, nextRetryDelayMs } from "./sync-controller";

describe("evaluateSyncIndicatorTransition", () => {
  it("250ms 未満の高速同期では最初からインジケータを出さない", () => {
    const start = evaluateSyncIndicatorTransition({
      active: true,
      currentlyVisible: false,
      shownAtMs: null,
      nowMs: 1000,
      delayMs: 250,
      minVisibleMs: 500,
    });
    expect(start).toEqual({ visible: false, waitMs: 250 });

    const doneQuickly = evaluateSyncIndicatorTransition({
      active: false,
      currentlyVisible: false,
      shownAtMs: null,
      nowMs: 1120,
      delayMs: 250,
      minVisibleMs: 500,
    });
    expect(doneQuickly).toEqual({ visible: false, waitMs: null });
  });

  it("一度表示されたら最低 500ms は維持してチラつきを防ぐ", () => {
    const stopEarly = evaluateSyncIndicatorTransition({
      active: false,
      currentlyVisible: true,
      shownAtMs: 2000,
      nowMs: 2150,
      delayMs: 250,
      minVisibleMs: 500,
    });
    expect(stopEarly).toEqual({ visible: true, waitMs: 350 });

    const stopAfterHold = evaluateSyncIndicatorTransition({
      active: false,
      currentlyVisible: true,
      shownAtMs: 2000,
      nowMs: 2500,
      delayMs: 250,
      minVisibleMs: 500,
    });
    expect(stopAfterHold).toEqual({ visible: false, waitMs: null });
  });

  it("既に表示中で同期継続中ならタイマー不要で表示を維持する", () => {
    const keepShowing = evaluateSyncIndicatorTransition({
      active: true,
      currentlyVisible: true,
      shownAtMs: 2000,
      nowMs: 2600,
      delayMs: 250,
      minVisibleMs: 500,
    });
    expect(keepShowing).toEqual({ visible: true, waitMs: null });
  });
});

describe("nextRetryDelayMs", () => {
  it("指数バックオフが 1s -> 2s -> 4s ... で増え 30s で頭打ちになる", () => {
    expect(nextRetryDelayMs(0)).toBe(1000);
    expect(nextRetryDelayMs(1)).toBe(2000);
    expect(nextRetryDelayMs(2)).toBe(4000);
    expect(nextRetryDelayMs(3)).toBe(8000);
    expect(nextRetryDelayMs(4)).toBe(16000);
    expect(nextRetryDelayMs(5)).toBe(30000);
    expect(nextRetryDelayMs(10)).toBe(30000);
    expect(nextRetryDelayMs(-2)).toBe(1000);
  });
});
