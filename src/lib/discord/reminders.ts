/**
 * 前日のお知らせ。サーバーの中の時計（scheduler.ts）が、送る時刻に合わせて runReminders を呼ぶ。
 * 確定済みの予定ごとに 1 回だけ送る（discordReminders の印。時刻を変えた予定は改めて送る）。
 *
 * 送る時刻は「始まりの 24 時間前」。ただし決まったばかり（6 時間以内）の予定は、決まったときの知らせと
 * 重なるので、決まってから 6 時間たつまで待つ。待つうちに始まってしまう予定には送らない。
 * 送る時刻を過ぎていて、まだ始まっていない予定は、遅れても送る（サーバーが眠っていた分を取り戻す）。
 */
import type { DiscordContext } from "./context";
import { reminderMessage } from "./messages";
import type { EventPost } from "./types";

export const REMINDER_WINDOW_MS = 24 * 3600_000;
export const RECENTLY_CONFIRMED_MS = 6 * 3600_000;

export function reminderKey(eventId: string, startMs: number): string {
  return `${eventId}_dayBefore_${startMs}`;
}

/** お知らせを送る時刻。送らない予定（時刻がない・送る前に始まる）は null */
export function reminderDueAt(post: Pick<EventPost, "startMs" | "endMs" | "confirmedAt">): number | null {
  if (!post.startMs || !post.endMs) return null;
  const due = Math.max(post.startMs - REMINDER_WINDOW_MS, (post.confirmedAt ?? 0) + RECENTLY_CONFIRMED_MS);
  return due < post.startMs ? due : null;
}

export interface ReminderReport {
  sent: number;
  skipped: number;
  failed: number;
  /** まだ送る時刻になっていない予定のうち、いちばん早い送る時刻（なければ null） */
  nextDueAt: number | null;
}

/**
 * 送る時刻を過ぎた予定に送り、lookaheadMs 先までで次に送る時刻を返す。
 * 送る時刻は始まりの 24 時間前より早くならないので、始まりが 24 時間 + lookaheadMs 先までの予定だけ読めば足りる
 */
export async function runReminders(ctx: DiscordContext, lookaheadMs = 0): Promise<ReminderReport> {
  const now = ctx.now();
  const report: ReminderReport = { sent: 0, skipped: 0, failed: 0, nextDueAt: null };
  const posts = await ctx.store.listEventPostsStartingBetween(now, now + REMINDER_WINDOW_MS + lookaheadMs);
  for (const post of posts) {
    const due = reminderDueAt(post);
    if (due === null) {
      if (post.startMs! <= now + REMINDER_WINDOW_MS) report.skipped++;
      continue;
    }
    if (due > now) {
      if (report.nextDueAt === null || due < report.nextDueAt) report.nextDueAt = due;
      continue;
    }
    const key = reminderKey(post.eventId, post.startMs!);
    if (!(await ctx.store.claimReminder(key))) {
      report.skipped++;
      continue;
    }
    try {
      const link = await ctx.store.getTableLink(post.tableId);
      // つながりを外した・別のチャンネルにつなぎ直した卓には送らない
      if (!link || link.channelId !== post.channelId) {
        await ctx.store.markReminderSent(key);
        report.skipped++;
        continue;
      }
      await ctx.rest.createMessage(
        post.channelId,
        reminderMessage(
          {
            eventId: post.eventId,
            tableId: post.tableId,
            title: post.title ?? "",
            start: post.startMs! / 1000,
            end: post.endMs! / 1000,
          },
          link,
          ctx.config.publicUrl,
          now,
          post.scheduledEventId,
        ),
      );
      await ctx.store.markReminderSent(key);
      report.sent++;
    } catch (error) {
      // 次の回でもう一度送れるように印を外す
      await ctx.store.releaseReminder(key).catch(() => {});
      ctx.log?.("discord: reminder failed", error);
      report.failed++;
    }
  }
  return report;
}
