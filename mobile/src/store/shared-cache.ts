import Storage from "expo-sqlite/kv-store";
import type { SharedCharacterData, SharedLogData } from "@shared/lib/cloud-state";

const LOG_PREFIX = "takufu-share-log-v1:";
const CHAR_PREFIX = "takufu-share-char-v1:";

export interface CachedShareEntry<T> {
  data: T;
  cachedAt: number;
}

export function getCachedSharedLog(slug: string): CachedShareEntry<SharedLogData> | null {
  try {
    const raw = Storage.getItemSync(`${LOG_PREFIX}${slug}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedShareEntry<SharedLogData>;
  } catch {
    return null;
  }
}

export function setCachedSharedLog(slug: string, data: SharedLogData): void {
  try {
    Storage.setItemSync(`${LOG_PREFIX}${slug}`, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {
    /* キャッシュ保存失敗は無視 */
  }
}

export function clearCachedSharedLog(slug: string): void {
  try {
    Storage.removeItemSync(`${LOG_PREFIX}${slug}`);
  } catch {
    /* noop */
  }
}

export function getCachedSharedCharacter(id: string): CachedShareEntry<SharedCharacterData> | null {
  try {
    const raw = Storage.getItemSync(`${CHAR_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedShareEntry<SharedCharacterData>;
  } catch {
    return null;
  }
}

export function setCachedSharedCharacter(id: string, data: SharedCharacterData): void {
  try {
    Storage.setItemSync(`${CHAR_PREFIX}${id}`, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {
    /* キャッシュ保存失敗は無視 */
  }
}
