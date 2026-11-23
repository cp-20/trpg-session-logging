/**
 * 記録の完了で描く「譜」の点。セッションのダイスを時間の順に、発言者ごとの段（3 段）へ置く。
 * 卓譜の名のとおり、遊んだ回が 1 枚の譜になるところを見せる（記録の完了の演出。src/components/ui.tsx の ScoreInscription）
 */
import type { Channel } from "../types";

export interface ScoreMark {
  /** 時間の位置（0〜1） */
  x: number;
  /** 段（0〜2） */
  lane: 0 | 1 | 2;
  tone: "crit" | "fumble" | "plain";
}

const LANES = 3;

/**
 * ダイスの振られた所を点にする（記録した本人にだけ出す演出で、中身は出さない点だけなので、どのタブも含める）。
 * ダイスが少なければ発言で代える。多すぎるときは時間の順に間引き、クリティカル・ファンブルは残す
 */
export function scoreMarks(channels: readonly Channel[], max = 16): ScoreMark[] {
  const msgs = channels
    .flatMap((c) => c.msgs)
    .filter((m) => m.ts > 0)
    .sort((a, b) => a.ts - b.ts);
  const rolls = msgs.filter((m) => m.type === "roll" && m.roll);
  const source = rolls.length >= 3 ? rolls : msgs;
  if (source.length === 0) return [];
  const t0 = source[0]!.ts;
  const span = Math.max(1, source.at(-1)!.ts - t0);
  const speakers = [...new Set(source.map((m) => m.sp))];
  const all: ScoreMark[] = source.map((m) => {
    const result = m.roll?.result ?? "";
    return {
      x: source.length === 1 ? 0.5 : (m.ts - t0) / span,
      lane: (speakers.indexOf(m.sp) % LANES) as ScoreMark["lane"],
      tone: /クリティカル|スペシャル/.test(result) ? "crit" : /ファンブル/.test(result) ? "fumble" : "plain",
    };
  });
  if (all.length <= max) return all;
  const special = all.filter((m) => m.tone !== "plain").slice(0, Math.floor(max / 2));
  const plain = all.filter((m) => m.tone === "plain");
  const room = max - special.length;
  const picked = Array.from(
    { length: room },
    (_, i) => plain[Math.round((i * (plain.length - 1)) / Math.max(1, room - 1))]!,
  );
  return [...new Set([...picked, ...special])].sort((a, b) => a.x - b.x);
}
