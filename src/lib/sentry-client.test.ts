// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = { init: vi.fn(), captureException: vi.fn(), captureRouterTransitionStart: vi.fn() };
vi.mock("@sentry/nextjs", () => sdk);

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("ブラウザの Sentry（あとから読む）", () => {
  it("SDK を読む前の例外を溜めておき、読み終えたら送る", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@example.invalid/1");
    vi.useFakeTimers();
    const client = await import("./sentry-client");
    client.startSentry();
    const early = new Error("描画前の例外");
    window.dispatchEvent(new ErrorEvent("error", { error: early }));
    client.captureException("画面の例外");
    expect(sdk.init).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await vi.waitFor(() => expect(sdk.init).toHaveBeenCalledTimes(1));
    expect(sdk.captureException).toHaveBeenCalledWith(early);
    expect(sdk.captureException).toHaveBeenCalledWith("画面の例外");

    client.captureException("読んだあとの例外");
    expect(sdk.captureException).toHaveBeenLastCalledWith("読んだあとの例外");
  });

  it("DSN がなければ SDK を読まない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.useFakeTimers();
    const client = await import("./sentry-client");
    client.startSentry();
    client.captureException(new Error("x"));
    await vi.runAllTimersAsync();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});
