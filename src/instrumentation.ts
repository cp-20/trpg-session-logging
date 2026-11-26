import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

/** サーバーで投げられた例外（route handler・描画）を Sentry に送る */
export const onRequestError = Sentry.captureRequestError;

/**
 * サーバーの起動時に 1 回だけ呼ばれる（Next.js の instrumentation）。
 * Sentry を立ち上げ、Discord 連携の設定があれば、前日のお知らせの時計を動かす（src/lib/discord/scheduler.ts、docs/DEPLOYMENT.md「Discord」）。
 */
export async function register(): Promise<void> {
  // サーバーの console.warn / console.error も Sentry の記録（Logs）に送る
  Sentry.init({
    ...sentryOptions(),
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
  });
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { serverContext } = await import("./lib/discord/server");
    if (!serverContext()) return;
    const { ensureReminderScheduler } = await import("./lib/discord/scheduler");
    ensureReminderScheduler(serverContext);
  } catch (error) {
    // 時計が動かなくても、サーバーは立ち上げる（Discord の要求が来たときにもう一度試す）
    Sentry.captureException(error);
    console.error(
      "discord: reminder scheduler failed to start",
      error instanceof Error ? error.message : error,
    );
  }
}
