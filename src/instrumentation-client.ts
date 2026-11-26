/** ブラウザで最初に動く（Next.js の instrumentation-client）。Sentry に画面の例外を送る */
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/sentry-options";

Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
