import { z } from "zod";
import { RestoredStateSchema, resetData } from "../store";

export { resetData };
export { RestoredStateSchema };
export { z };

/**
 * JSON文字列を検証して localStorage へ復元する(Settings のインポート用)。
 * スキーマ不適合なら失敗を返し、現在のデータを壊さない。
 */
export function importPersisted(jsonText: string): { ok: boolean; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "JSONとして読めませんでした" };
  }
  const result = RestoredStateSchema.safeParse(parsed);
  if (!result.success) return { ok: false, error: "卓譜のデータ形式と一致しません" };
  try {
    localStorage.setItem(KEY_NAME, JSON.stringify(result.data));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `保存できませんでした: ${String(e).slice(0, 80)}` };
  }
}

const KEY_NAME = "takufu-state-v4";
