import type { Scope } from "../types";

/**
 * 共有範囲。firestore.rules の validShare と同じ定義を、画面・保存・テストで共有する（P3）。
 *
 * シナリオの共有方針はこのアプリでは扱わない。共有範囲は利用者が選んだとおりに保存する
 * （メンバー限定 / プレイした人 / 公開）。シナリオ作者の定めは利用者が確認して使う（利用規約）。
 */

/** firestore.rules validShare の `data.scope in [...]` */
export const SHARE_MANIFEST_SCOPES = ["members", "passed", "public"] as const satisfies readonly Scope[];

/** 共有ページを読める範囲（目録に書く scope）。記録の scope そのまま */
export function sharedPageScope(log: { scope: Scope }): Scope {
  return log.scope;
}

/** firestore.rules validShare のうち、共有範囲の条件の写し */
export function validShareAccess(manifest: { scope: string }): boolean {
  return (SHARE_MANIFEST_SCOPES as readonly string[]).includes(manifest.scope);
}
