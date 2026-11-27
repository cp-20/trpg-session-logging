/**
 * POST /api/report-card: 本文の大きさの上限。描画（書体の取得）には進ませない形だけを確かめる。
 */
import { describe, expect, it, vi } from "vitest";
import { REPORT_BODY_MAX } from "../../../lib/report-card";

async function loadPost() {
  vi.resetModules();
  return (await import("./route")).POST;
}

const send = (post: (req: Request) => Promise<Response>, body: string) =>
  post(
    new Request("https://takufu.test/api/report-card", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body,
    }),
  );

describe("POST /api/report-card", () => {
  it("上限を超える本文（画像を入れたものなど）は読まずに 413 で断る", async () => {
    const POST = await loadPost();
    const body = JSON.stringify({
      title: "x",
      image: `data:image/png;base64,${"A".repeat(REPORT_BODY_MAX)}`,
    });
    const res = await send(POST, body);
    expect(res.status).toBe(413);
  });

  it("中身が足りないものは 400", async () => {
    const POST = await loadPost();
    expect((await send(POST, JSON.stringify({ members: [] }))).status).toBe(400);
    expect((await send(POST, "{")).status).toBe(400);
  });

  it("上限は本番の前段（CloudFront）が断る大きさより小さい", () => {
    expect(REPORT_BODY_MAX).toBeLessThanOrEqual(10_000);
  });
});
