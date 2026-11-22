/**
 * 役割の呼び方（docs/glossary.md）。
 * 1 つのセッション・キャラクターの画面では、そのシステムの言葉（CoC の「KP」など）を使う（context: "system"）。
 * 一覧・絞り込み・ナビなど、システムをまたぐ画面では一般語（GM / PL）を使う（context: "generic"）。
 */
import { SYSTEMS } from "../data/systems";
import type { MsgKind, RoleKey } from "../types";

export type RoleContext = "system" | "generic";

const GENERIC_LABEL: Record<RoleKey, string> = {
  GM: "GM",
  PL: "PL",
  PC: "PC",
  NPC: "NPC",
  ENEMY: "エネミー",
};

/** 発言の種類（MsgKind）を役割に直す。取り込みで KP と読んだものも GM として扱う。SYSTEM は役割ではない */
export function roleOfKind(kind: MsgKind): RoleKey | null {
  if (kind === "KP" || kind === "GM") return "GM";
  if (kind === "SYSTEM") return null;
  return kind;
}

/**
 * 役割の表示名。
 * @param systemId そのセッション・キャラクターのシステム。分からないときは undefined
 * @param role 役割、または発言の種類
 * @param context "system" ならシステムの言葉、"generic" なら一般語
 */
export function roleLabel(
  systemId: string | undefined,
  role: RoleKey | MsgKind,
  context: RoleContext = "system",
): string {
  if (role === "SYSTEM") return "システム";
  const key: RoleKey = role === "KP" ? "GM" : role;
  if (context === "system" && systemId) {
    const own = SYSTEMS[systemId]?.roles?.[key];
    if (own) return own;
  }
  return GENERIC_LABEL[key];
}

/** そのシステムにエネミーの役割があるか */
export function systemHasEnemies(systemId: string | undefined): boolean {
  return Boolean(systemId && SYSTEMS[systemId]?.roles?.ENEMY);
}

/**
 * 発言者に付けられる役割の選択肢（ログの取り込み・発言者の設定）。
 * エネミーはエネミーのいるシステムだけ。いま ENEMY が付いている発言者には、システムを問わず残す
 */
export function speakerRoleOptions(
  systemId: string | undefined,
  current?: MsgKind,
): { value: MsgKind; label: string }[] {
  const kinds: MsgKind[] = ["GM", "PC", "PL", "NPC"];
  if (systemHasEnemies(systemId) || current === "ENEMY") kinds.push("ENEMY");
  kinds.push("SYSTEM");
  return kinds.map((k) => ({
    // 取り込みで KP と読んだ発言者は、値を KP のまま保つ（選び直すまで書き換えない）
    value: k === "GM" && current === "KP" ? "KP" : k,
    label: roleLabel(systemId, k),
  }));
}
