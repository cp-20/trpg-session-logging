import type { Channel } from "../types";

/**
 * ログのロール形式・テキストからシステムを推定する。
 * Upload フローで「システム」を自動設定するときに使う（ユーザーはいつでも上書きできる）。
 */
export function inferSystem(channels: Channel[]): { id: string; reason: string } | null {
  let coc = 0;
  let emo = 0;
  let sw = 0;
  channels.forEach((c) =>
    c.msgs.forEach((m) => {
      const t = (m.roll?.cmd ?? "") + " " + (m.roll?.skill ?? "") + " " + (m.text ?? "");
      if (/CC<=|CBR|SANチェック|SAN ?\d*D\d/.test(t)) coc++;
      if (/結合|自分:不可能|神術|修得/.test(t)) emo++;
      if (/2D6/.test(t)) sw++;
    })
  );
  if (emo > 0 && emo >= coc) return { id: "emoklore", reason: "「結合」「自分:不可能」などの表記を検出" };
  if (coc > 0) return { id: "coc7", reason: "「CC<=〜」「SANチェック」のロール形式を検出" };
  if (sw > 0) return { id: "sw25", reason: "「2D6」ロール形式を検出" };
  return null;
}
