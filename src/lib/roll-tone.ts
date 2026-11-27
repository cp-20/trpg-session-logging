import type { Roll, RollOutcome } from "../types";

/**
 * ダイスの判定結果の段階。システムごとに言い方が違うものを 5 段にまとめる。
 * - CoC 6 版: 決定的成功/スペシャル・スペシャル・成功・失敗・致命的失敗
 * - CoC 7 版: クリティカル・イクストリーム成功・ハード成功・レギュラー成功・失敗・ファンブル
 * - エモクロア: ミラクル!・トリプル!・ダブル!・成功!・失敗!・ファンブル!
 * - ネクロニカ: 大成功・大失敗 / ソード・ワールド: 自動的成功・自動的失敗 / ダブルクロス・サタスペ: 自動失敗
 *   （BCDice の i18n の文言。大成功・自動的成功は「成功」、大失敗・自動失敗は「失敗」を含むので先に見る）
 * 合計値や表の結果のように判定の無いロールは undefined。
 */
export type RollTone = "crit" | "special" | "success" | "fail" | "fumble";

export function rollTone(result: string): RollTone | undefined {
  if (/ファンブル|致命的失敗|大失敗|自動的?失敗/.test(result)) return "fumble";
  if (/クリティカル|決定的成功|ミラクル|大成功|自動的成功/.test(result)) return "crit";
  if (/スペシャル|イクストリーム|トリプル|ダブル/.test(result)) return "special";
  if (/失敗/.test(result)) return "fail";
  if (/成功/.test(result)) return "success";
  return undefined;
}

/** クリティカルとスペシャルを「例外的によい結果」として目立たせる */
export const isGoodRoll = (result: string) => {
  const t = rollTone(result);
  return t === "crit" || t === "special";
};

/** ロールの各回の結果。繰り返しロールは各回、1 回だけのロールはそれ自身 */
export function rollOutcomes(roll: Roll): RollOutcome[] {
  return roll.repeats?.length ? roll.repeats : [{ dice: roll.dice, result: roll.result }];
}

/** 何回か振ったうちの目立つ段階（ファンブルを最優先、次に良い結果）。譜の点の色などに使う */
export function strongestTone(roll: Roll): RollTone | undefined {
  const tones = rollOutcomes(roll).map((o) => rollTone(o.result));
  for (const t of ["fumble", "crit", "special", "fail", "success"] as const) if (tones.includes(t)) return t;
  return undefined;
}
