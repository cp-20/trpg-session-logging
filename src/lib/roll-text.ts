import type { Msg } from "../types";

const squash = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

/**
 * ダイスの発言に添えられた言葉（「（目星）教室の黒板、まだ新しい。」など）。ダイスの行に出る内容（コマンド・出目・結果）を
 * 書いただけの本文なら空。ダイスの行だけを出すと、言葉のほうが読めなくなる
 */
export function rollSpeech(m: Pick<Msg, "text" | "roll">): string {
  const text = m.text?.trim() ?? "";
  if (!text || !m.roll) return "";
  // 結果の矢印があれば、ツールが書いた判定の文
  if (/[＞→]|\s>\s/.test(text)) return "";
  const body = squash(text);
  const cmd = squash(m.roll.cmd);
  const head = squash(m.roll.cmd.trim().split(/\s+/)[0] ?? "");
  if (!cmd || body.includes(head) || cmd.includes(body)) return "";
  return text;
}
