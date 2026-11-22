/**
 * 何日かに分けて遊んだセッションのログ（日ごとに書き出した複数のファイル）を 1 つにまとめる。
 * - 同じ名前のタブ（メイン・情報・雑談・秘匿タブ）は 1 つのタブにする
 * - 発言は時刻順に並べる。時刻のないログ（CCFOLIA の HTML）が混じるときは、ファイルの順（時刻があるものはその開始順）につなぐ
 * - 書き出しの範囲が重なって同じ発言が 2 回入っていたら 1 つにする（時刻・発言者・本文が同じもの）
 */
import type { Channel, Msg } from "../types";

export interface LogPart {
  channels: Channel[];
}

const firstTs = (p: LogPart) =>
  Math.min(...p.channels.flatMap((c) => c.msgs.map((m) => (m.ts > 0 ? m.ts : Number.POSITIVE_INFINITY))));

function msgKey(chName: string, m: Msg): string | null {
  if (!(m.ts > 0)) return null;
  const body = m.roll ? `${m.roll.cmd}|${m.roll.result}` : (m.text ?? "");
  return `${chName}\u0000${m.ts}\u0000${m.sp}\u0000${body}`;
}

export function mergeLogParts(parts: readonly LogPart[]): Channel[] {
  if (parts.length === 1) return parts[0]!.channels;
  const timed = parts.every((p) => p.channels.every((c) => c.msgs.every((m) => m.ts > 0)));
  // 時刻のないものが混じるときは、時刻のあるファイルを開始順に、ないものは選んだ順のまま後ろへ
  const ordered = timed
    ? [...parts]
    : [...parts]
        .map((p, i) => ({ p, i, t: firstTs(p) }))
        .sort((a, b) => a.t - b.t || a.i - b.i)
        .map((x) => x.p);

  const byName = new Map<string, Channel>();
  const seen = new Set<string>();
  let order = 0;
  const pos = new Map<Msg, number>();
  for (const part of ordered) {
    for (const ch of part.channels) {
      const target = byName.get(ch.name) ?? { id: ch.id, name: ch.name, secret: ch.secret, msgs: [] };
      if (!byName.has(ch.name)) byName.set(ch.name, target);
      // どれかのファイルで公開のタブなら公開として扱う（秘匿の判定は話者の少なさから推した値なので弱い）
      target.secret = target.secret && ch.secret;
      for (const m of ch.msgs) {
        const key = msgKey(ch.name, m);
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        const copy = { ...m };
        pos.set(copy, order++);
        target.msgs.push(copy);
      }
    }
  }

  const channels = [...byName.values()];
  let n = 0;
  for (const c of channels) {
    if (timed) c.msgs.sort((a, b) => a.ts - b.ts || pos.get(a)! - pos.get(b)!);
    for (const m of c.msgs) m.id = `m${n++}`;
  }
  return channels.sort((a, b) => (a.name === "メイン" ? -1 : b.name === "メイン" ? 1 : 0));
}
