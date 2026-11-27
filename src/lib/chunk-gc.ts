/**
 * 消し残った切れ端（chunks）を見分ける。記録・共有は「見出し（manifest）が指す世代（revision）」の切れ端だけを読み、
 * 新しい世代を書いたあとの古い世代はブラウザが消す。消す前にタブを閉じると、どこからも指されない世代が残る。
 * 書きかけ（切れ端を書いてから見出しを書くまでの間）を消さないよう、最後の書き込みから猶予を置く。
 * 使うのは運営者のコマンド（node scripts/ops.ts gc）
 */
export interface FoundRevision {
  /** 世代の親（users/{uid}・sharedLogs/{slug}・sharedCharacters/{id}） */
  parent: string;
  revision: string;
  /** その世代の切れ端のうち、いちばん新しい書き込みの時刻（ミリ秒） */
  newestWriteMs: number;
  chunkNames: string[];
}

export const GC_GRACE_MS = 24 * 60 * 60 * 1000;

/** どこからも指されず、猶予より古い世代 */
export function orphanRevisions(
  found: FoundRevision[],
  referenced: Map<string, Set<string>>,
  nowMs: number,
  graceMs = GC_GRACE_MS,
): FoundRevision[] {
  return found.filter(
    (r) => !referenced.get(r.parent)?.has(r.revision) && nowMs - r.newestWriteMs >= graceMs,
  );
}

/** 記録の見出し（users/{uid}/workspace/manifest の parts）が指す世代 */
export function workspaceRevisions(manifest: Record<string, unknown> | null): Set<string> {
  const parts = manifest?.parts;
  const out = new Set<string>();
  if (!parts || typeof parts !== "object") return out;
  for (const part of Object.values(parts as Record<string, unknown>)) {
    const rev = (part as { revision?: unknown } | null)?.revision;
    if (typeof rev === "string") out.add(rev);
  }
  return out;
}
