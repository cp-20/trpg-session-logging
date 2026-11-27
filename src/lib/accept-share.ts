/**
 * 招待で受け取った共有の記録を、自分の記録に入れる。
 * 中身は共有した人が書いたもの（信用しない）。形を確かめ、自分の記録をけっして上書きしない:
 * - 記録（ログ）は、同じ番号のものがなければ足す。あれば、同じ共有（slug と持ち主が同じ）のときだけ入れ替える
 * - 人・シナリオは、まだ知らないものだけ足す。知っている人の名前やシナリオは書き換えない
 */
import { validateSavedState } from "./state-schema";
import type { Log, Scenario, State, User } from "../types";

export interface AcceptedShare {
  log: Log;
  users: Record<string, User>;
  scenario?: Scenario;
}

export class AcceptShareError extends Error {}

/** 共有の中身を、保存の形の検査（state-schema）に通す。読めないものは null */
export function validateSharedPayload(shared: unknown, me: string): AcceptedShare | null {
  if (!shared || typeof shared !== "object") return null;
  const { log, users, scenario } = shared as Record<string, unknown>;
  if (!log || typeof log !== "object" || typeof (log as Log).id !== "string") return null;
  const id = (log as Log).id;
  const scenarios =
    scenario && typeof scenario === "object" && typeof (scenario as Scenario).id === "string"
      ? { [(scenario as Scenario).id]: scenario }
      : {};
  // 保存の形の検査は、記録が指す人がみな users にいることを求める。共有の中身は隠れた参加者を載せないので、
  // 足りない人は仮の人で埋めて形だけを確かめ、返すのは中身にあった人だけにする
  const given =
    users && typeof users === "object" && !Array.isArray(users) ? (users as Record<string, User>) : {};
  const referenced = [me, (log as Log).ownerId, ...Object.keys((log as Log).players ?? {})];
  const placeholders = Object.fromEntries(
    referenced
      .filter((id) => typeof id === "string" && !given[id])
      .map((id) => [id, { id, name: "参加者", color: "#64748b", accounts: [] }]),
  );
  const checked = validateSavedState({
    me,
    users: { ...placeholders, ...given },
    tables: {},
    characters: {},
    scenarios,
    logs: { [id]: log },
  });
  if (!checked?.logs[id]) return null;
  const sc = Object.values(checked.scenarios)[0];
  const sharedUsers = Object.fromEntries(Object.entries(checked.users).filter(([uid]) => uid in given));
  return { log: checked.logs[id], users: sharedUsers, ...(sc ? { scenario: sc } : {}) };
}

/** 受け取った共有を state（下書き）に入れる。入れられないときは AcceptShareError を投げ、state は変えない */
export function mergeAcceptedShare(
  s: State,
  shared: AcceptedShare,
  expected: { slug: string; ownerId: string },
): void {
  const { log } = shared;
  if (log.slug !== expected.slug || log.ownerId !== expected.ownerId)
    throw new AcceptShareError("招待の中身が正しくありません。招待した人に確かめてください。");
  if (log.ownerId === s.me) throw new AcceptShareError("自分の記録の招待です。");
  const existing = s.logs[log.id];
  if (existing && (existing.slug !== log.slug || existing.ownerId !== log.ownerId))
    throw new AcceptShareError("同じ番号の記録がすでにあるため、受け取れませんでした。");

  for (const [id, user] of Object.entries(shared.users)) {
    if (id !== s.me && !s.users[id]) s.users[id] = user;
  }
  s.logs[log.id] = {
    ...log,
    players: {
      ...log.players,
      [s.me]: { linked: true, hidden: s.prefs.hideSelfOnShare, characterIds: [] },
    },
  };
  if (shared.scenario && !s.scenarios[shared.scenario.id]) s.scenarios[shared.scenario.id] = shared.scenario;
}
