/**
 * 「この端末で卓譜を使い始めているか」の目印。LP や規約などの公開ページは記録（ストア）を読み込まずに
 * サーバーで描画するので、ヘッダーの「ログイン / ホームを開く」はこの目印で切り替える。
 * 記録の本体ではないので、食い違っても行き先の画面（/home など）が正しく案内し直す。
 */
import { useSyncExternalStore } from "react";

export const ENTERED_HINT_KEY = "takufu-entered";
const EVENT = "takufu-entered-change";

export function writeEnteredHint(entered: boolean): void {
  try {
    if (entered) localStorage.setItem(ENTERED_HINT_KEY, "1");
    else localStorage.removeItem(ENTERED_HINT_KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // 保存できない環境では目印なし（ログインの案内を出すだけ）
  }
}

export function readEnteredHint(): boolean {
  try {
    return localStorage.getItem(ENTERED_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** サーバーと最初の描画では false（ログインの案内）。ブラウザに載ったあとで目印を読む */
export function useEnteredHint(): boolean {
  return useSyncExternalStore(subscribe, readEnteredHint, () => false);
}
