import type { Log } from "../types";

export interface ShareGateResult {
  /** 閲覧できるか */
  visible: boolean;
  /** 見られないときの理由(ゲート表示用) */
  reason: string | null;
}

export interface ShareViewerOptions {
  /** 「このシナリオを通過した(自己申告)」のチェック */
  asPassed?: boolean;
}

/**
 * 共有ビューで誰がログを見られるかの判定(純関数)。
 * viewerId はログイン済みなら uid、未認証なら null(=匿名)。
 * 匿名は public ログだけを読める。
 */
export function evaluateShareGate(
  log: Pick<Log, "scope" | "ownerId" | "players">,
  viewerId: string | null,
  opts: ShareViewerOptions = {},
): ShareGateResult {
  const isParticipant = viewerId !== null && (log.ownerId === viewerId || Boolean(log.players[viewerId]));
  if (log.scope === "members" && !isParticipant) {
    return { visible: false, reason: "このログはメンバー限定です。卓のメンバーだけが読めます。" };
  }
  if (log.scope === "passed" && !isParticipant && !opts.asPassed) {
    return { visible: false, reason: "このログは、このシナリオを通過した人だけが読めます（自己申告）。" };
  }
  return { visible: true, reason: null };
}

/**
 * 共有ビューに表示される参加者(UserId)の一覧。
 * 未リンク・非表示の人は除く。「共有ビューで自分を非表示」設定も反映。
 */
export function visibleShareMembers(
  log: Pick<Log, "players">,
  opts: { hideSelfOnShare?: boolean; viewerId: string | null },
): string[] {
  return Object.entries(log.players)
    .filter(([u, p]) => p.linked && !p.hidden && !(opts.hideSelfOnShare && u === opts.viewerId))
    .map(([u]) => u);
}
