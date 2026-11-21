import Storage from "expo-sqlite/kv-store";

const PREFIX = "takufu-reading-v1:";

export interface ReadingProgress {
  autoMsgId?: string;
  autoIndex?: number;
  manualMsgId?: string;
  manualLabel?: string;
  updatedAt: number;
}

export function loadReadingProgress(logId: string): ReadingProgress | null {
  try {
    const raw = Storage.getItemSync(`${PREFIX}${logId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ReadingProgress;
  } catch {
    return null;
  }
}

export function saveReadingProgress(logId: string, patch: Partial<ReadingProgress>): ReadingProgress {
  const prev = loadReadingProgress(logId);
  const next: ReadingProgress = {
    ...prev,
    ...patch,
    updatedAt: Date.now(),
  };
  try {
    Storage.setItemSync(`${PREFIX}${logId}`, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return next;
}
