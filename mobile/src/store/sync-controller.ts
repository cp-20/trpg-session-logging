import { useEffect, useRef, useState } from "react";

export interface SyncIndicatorOptions {
  /** この時間未満で同期が終われば、画面に一切インジケータを出さない */
  delayMs?: number;
  /** 一度表示したら、チラつきを防ぐため最低この時間は維持する */
  minVisibleMs?: number;
}

export interface SyncIndicatorAction {
  visible: boolean;
  waitMs: number | null;
}

/**
 * 同期インジケータの遅延表示・最小保持時間を計算する純粋関数。
 * 単体テストから直接検証できるように分離している。
 */
export function evaluateSyncIndicatorTransition(params: {
  active: boolean;
  currentlyVisible: boolean;
  shownAtMs: number | null;
  nowMs: number;
  delayMs: number;
  minVisibleMs: number;
}): SyncIndicatorAction {
  const { active, currentlyVisible, shownAtMs, nowMs, delayMs, minVisibleMs } = params;
  if (active) {
    if (currentlyVisible) return { visible: true, waitMs: null };
    return { visible: false, waitMs: delayMs };
  }
  if (!currentlyVisible) {
    return { visible: false, waitMs: null };
  }
  const elapsed = shownAtMs === null ? minVisibleMs : Math.max(0, nowMs - shownAtMs);
  const remaining = Math.max(0, minVisibleMs - elapsed);
  if (remaining === 0) {
    return { visible: false, waitMs: null };
  }
  return { visible: true, waitMs: remaining };
}

/** 再試行の指数バックオフ（1s → 2s → 4s → 8s → 最大 30s） */
export function nextRetryDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 1000 * 2 ** safeAttempt);
}

/**
 * 250ms 未満の高速同期ではインジケータを出さず、一度出したら 500ms 維持するフック。
 */
export function useDelayedSyncIndicator(active: boolean, opts: SyncIndicatorOptions = {}): boolean {
  const delayMs = opts.delayMs ?? 250;
  const minVisibleMs = opts.minVisibleMs ?? 500;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    const decision = evaluateSyncIndicatorTransition({
      active,
      currentlyVisible: visible,
      shownAtMs: shownAtRef.current,
      nowMs: Date.now(),
      delayMs,
      minVisibleMs,
    });

    if (decision.waitMs === null) {
      if (!decision.visible && visible) {
        shownAtRef.current = null;
        setVisible(false);
      }
      return;
    }

    const timer = setTimeout(() => {
      if (active) {
        shownAtRef.current = Date.now();
        setVisible(true);
      } else {
        shownAtRef.current = null;
        setVisible(false);
      }
    }, decision.waitMs);

    return () => clearTimeout(timer);
  }, [active, visible, delayMs, minVisibleMs]);

  return visible;
}
