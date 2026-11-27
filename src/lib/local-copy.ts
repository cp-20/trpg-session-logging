/**
 * この端末に置く記録の控え（localStorage と IndexedDB）。ログインした人ごとに `takufu-cloud-{uid}` を頭に持つ。
 * 共用の端末で、ログアウトしたあとも他人の記録が残らないように、またエラー画面の書き出しが
 * ほかのアカウントの控えを含めないように、ここで扱う。
 */
import { idbDelete } from "./local-db";

export const GUEST_KEY = "takufu-state-v4";
export const cloudKey = (uid: string) => `takufu-cloud-${uid}`;

/** その人の控えの localStorage のキー（本体と、同期の印・共有の控えなど `{key}-…`） */
export function localCopyKeys(storage: Pick<Storage, "length" | "key">, key: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k !== null && (k === key || k.startsWith(`${key}-`))) keys.push(k);
  }
  return keys;
}

/** エラー画面の「記録をダウンロード」: 今の人（ログインしていなければお試しの記録）の控えだけ */
export function backupLocalCopy(storage: Storage, uid: string | null): Record<string, string | null> {
  const key = uid ? cloudKey(uid) : GUEST_KEY;
  return Object.fromEntries(localCopyKeys(storage, key).map((k) => [k, storage.getItem(k)]));
}

/**
 * ログアウトするとき、その人の控えを消す。まだクラウドに送れていない変更（`{key}-pending` が true）があれば、
 * 消すと失われるので残し、false を返す
 */
export async function forgetLocalCopy(storage: Storage, uid: string): Promise<boolean> {
  const key = cloudKey(uid);
  if (storage.getItem(`${key}-pending`) === "true") return false;
  for (const k of localCopyKeys(storage, key)) storage.removeItem(k);
  await idbDelete(key);
  return true;
}
