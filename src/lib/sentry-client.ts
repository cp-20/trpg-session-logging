/**
 * ブラウザの Sentry。SDK（gzip で約 80KB）は最初の JS に載せず、画面が出て手が空いたときに読む。
 * それまでに起きた例外は溜めておき、読み終えたら送る（DSN がなければ何も読まない）。
 */
import { sentryOptions } from "./sentry-options";

type SentryModule = typeof import("@sentry/nextjs");

let sentry: SentryModule | null = null;
let started = false;
const early: unknown[] = [];

const onError = (event: ErrorEvent) => early.push(event.error ?? event.message);
const onRejection = (event: PromiseRejectionEvent) => early.push(event.reason);

async function load(): Promise<void> {
  const mod = await import("@sentry/nextjs");
  mod.init(sentryOptions());
  sentry = mod;
  // ここからは SDK が自分で例外を拾う
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
  for (const error of early.splice(0)) mod.captureException(error);
}

/** instrumentation-client から 1 度だけ呼ぶ */
export function startSentry(): void {
  if (started || !process.env.NEXT_PUBLIC_SENTRY_DSN || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  };
  const schedule = () => {
    const run = () => void load().catch(() => {});
    if (win.requestIdleCallback) win.requestIdleCallback(run, { timeout: 3000 });
    else window.setTimeout(run, 1000);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

/** 例外を送る。SDK を読む前なら、読み終えたときに送る */
export function captureException(error: unknown): void {
  if (sentry) sentry.captureException(error);
  else if (started) early.push(error);
}

/** 画面の移動の計測（Next.js の onRouterTransitionStart）。SDK を読む前の移動は計らない */
export function captureRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}
