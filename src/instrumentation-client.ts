/** ブラウザで最初に動く（Next.js の instrumentation-client）。Sentry に画面の例外を送る（SDK はあとから読む。src/lib/sentry-client.ts） */
import { captureRouterTransitionStart, startSentry } from "./lib/sentry-client";

startSentry();

export const onRouterTransitionStart = captureRouterTransitionStart;
