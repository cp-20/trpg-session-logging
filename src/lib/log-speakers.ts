/**
 * ログを読む画面の「発言者で絞り込み」に並べる人。PC と GM はいつも並べ、NPC は多く発言した人だけを並べて、
 * 残り（通りすがりの NPC・描写・システム）は「ほかの発言者」にまとめる（P5）。
 */
import type { Channel, MsgKind } from "../types";

/** いつも並べる人を含めて、これを超える NPC は並べない */
const MAX_LISTED = 8;
/** 並べる NPC の条件: いちばん多く発言した PC・GM の発言数に対する割合と、最低の発言数 */
const NPC_MIN_RATIO = 0.2;
const NPC_MIN_MSGS = 10;

export interface LogSpeaker {
  sp: string;
  kind: MsgKind;
  count: number;
}

/** 発言のある発言者と、その発言数（登場順） */
export function logSpeakers(channels: readonly Channel[]): LogSpeaker[] {
  const seen = new Map<string, LogSpeaker>();
  for (const c of channels)
    for (const m of c.msgs) {
      if (m.type === "note") continue;
      const s = seen.get(m.sp);
      if (s) s.count++;
      else seen.set(m.sp, { sp: m.sp, kind: m.kind, count: 1 });
    }
  return [...seen.values()];
}

const isLead = (k: MsgKind) => k === "PC" || k === "PL" || k === "GM" || k === "KP";
const isExtra = (k: MsgKind) => k === "NARRATION" || k === "SYSTEM";

export function splitSpeakers(speakers: readonly LogSpeaker[]): { main: LogSpeaker[]; rest: LogSpeaker[] } {
  const leads = speakers.filter((s) => isLead(s.kind));
  const top = Math.max(0, ...leads.map((s) => s.count));
  const npcs = speakers
    .filter((s) => !isLead(s.kind) && !isExtra(s.kind))
    .filter((s) => s.count >= NPC_MIN_MSGS && s.count >= top * NPC_MIN_RATIO)
    .sort((a, b) => b.count - a.count)
    .slice(0, Math.max(0, MAX_LISTED - leads.length));
  const main = [...leads, ...npcs];
  const listed = new Set(main);
  return {
    main,
    rest: speakers.filter((s) => !listed.has(s)).sort((a, b) => b.count - a.count),
  };
}
