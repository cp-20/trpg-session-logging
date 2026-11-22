import type { Character } from "../types";
import type { CharacterSheet } from "./sheet";

/**
 * キャラシサイトから読んだキャラクター（取り込みの中間形）。読むのは URL から取った構造化データだけで、
 * コマ・ファイルの貼り付けからは読まない（P6）。
 */
export interface ParsedCharacter {
  name: string;
  color?: string;
  memo?: string;
  /** 卓譜のシステムid(推定できなければ undefined) */
  systemId?: string;
  /** 数値パラメータ(HP/SAN等。キーは元JSONのまま) */
  stats: Record<string, number>;
  /** キャラ画像の URL */
  image?: string;
  /** 能力値・技能などのキャラシ全体（src/lib/sheet.ts の汎用形式） */
  sheet?: CharacterSheet;
}

/** 解析結果 → 卓譜 Character 型への変換(save で使う共通部分) */
export function toCharacterFields(parsed: ParsedCharacter, sysId: string) {
  return {
    name: parsed.name.trim() || "名前未設定",
    systemId: parsed.systemId ?? sysId,
    color: parsed.color ?? "#5348c8",
    bio: parsed.memo ?? "",
    stats: parsed.stats,
    image: parsed.image,
    ...(parsed.sheet ? { sheet: parsed.sheet } : {}),
  } satisfies Partial<Character>;
}
