/**
 * サーバーの起動時に 1 回だけ呼ばれる（Next.js の instrumentation）。
 * Discord 連携の設定があれば、前日のお知らせの時計を動かす（src/lib/discord/scheduler.ts、docs/DEPLOYMENT.md「Discord」）。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { serverContext } = await import("./lib/discord/server");
    if (!serverContext()) return;
    const { ensureReminderScheduler } = await import("./lib/discord/scheduler");
    ensureReminderScheduler(serverContext);
  } catch (error) {
    // 時計が動かなくても、サーバーは立ち上げる（Discord の要求が来たときにもう一度試す）
    console.error(
      "discord: reminder scheduler failed to start",
      error instanceof Error ? error.message : error,
    );
  }
}
