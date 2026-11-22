/**
 * 予定（日程調整）ごとに、Discord へのメッセージとイベントの作成・書き換えを 1 つずつ進める。
 * 「保存済みの記録を読む → Discord に作る → 記録を書く」は割り込まれると二重に作るため
 * （確定と同時に日程調整の同期と予定の同期が届くと、メッセージもイベントも 2 つできた）。
 * サーバーは 1 つのプロセスで動く前提で、プロセスの中だけで直列にする。
 * Next.js は route と instrumentation を別々に束ねることがあるので、表は globalThis に置く。
 */
const KEY = Symbol.for("takufu.discord.eventLocks");

type LockTable = Map<string, Promise<unknown>>;

function table(): LockTable {
  const g = globalThis as { [KEY]?: LockTable };
  return (g[KEY] ??= new Map());
}

export async function withEventLock<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
  const locks = table();
  const prev = locks.get(eventId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(eventId, tail);
  try {
    return await run;
  } finally {
    // 後ろに誰も並んでいなければ表から消す
    if (locks.get(eventId) === tail) locks.delete(eventId);
  }
}
