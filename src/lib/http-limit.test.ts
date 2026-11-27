import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readBodyWithLimit, readJsonWithLimit } from "./http-limit";

/** 指定した塊を順に流す本文（Content-Length を付けない・偽る要求を作る） */
function streamed(
  chunks: string[],
  headers: Record<string, string> = {},
): { req: Request; pulled: () => number } {
  let pulled = 0;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled];
      if (next === undefined) controller.close();
      else {
        pulled++;
        controller.enqueue(enc.encode(next));
      }
    },
  });
  const req = new Request("https://takufu.test/api", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit);
  return { req, pulled: () => pulled };
}

describe("上限つきで本文を読む", () => {
  it("上限以内なら、文字の途中で切れた塊も崩さずに読む", async () => {
    const bytes = new TextEncoder().encode("卓報告カード");
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 4)); // 「報」の途中で切る
        c.enqueue(bytes.slice(4));
        c.close();
      },
    });
    const req = new Request("https://takufu.test/api", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    expect(await readBodyWithLimit(req, 100)).toBe("卓報告カード");
  });

  it("Content-Length が上限を超えていれば、本文を読まずに断る", async () => {
    const { req } = streamed(["{}"], { "content-length": "999999" });
    await expect(readBodyWithLimit(req, 1000)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(req.bodyUsed).toBe(false);
  });

  it("長さを書いていない本文は、上限を超えた塊で読むのをやめる（残りを読まない）", async () => {
    const { req, pulled } = streamed(["a".repeat(600), "b".repeat(600), "c".repeat(600), "d".repeat(600)]);
    await expect(readBodyWithLimit(req, 1000)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled()).toBeLessThan(4);
  });

  it("JSON として読む。JSON でなければ SyntaxError", async () => {
    expect(await readJsonWithLimit(streamed(['{"url":', '"https://x"}']).req, 100)).toEqual({
      url: "https://x",
    });
    await expect(readJsonWithLimit(streamed(["not json"]).req, 100)).rejects.toBeInstanceOf(SyntaxError);
  });

  it("本文が無ければ空の文字列", async () => {
    expect(await readBodyWithLimit(new Request("https://takufu.test/api", { method: "POST" }), 10)).toBe("");
  });
});
