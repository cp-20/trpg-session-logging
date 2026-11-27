/**
 * 要求の本文を、上限を超えた時点で読むのをやめて取り出す（全部をメモリに載せてから大きさを見ない）。
 * 公開している API の口（卓報告カード・外部取り込み・ご意見・Discord）で使う。
 */

/** 上限を超えた本文 */
export class BodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
  }
}

/**
 * 本文を UTF-8 の文字列として読む。Content-Length が上限を超えていれば読まずに、
 * 書いていない・偽っているときは読みながら上限を超えた時点で打ち切り、BodyTooLargeError を投げる
 */
export async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** 本文を上限つきで読み、JSON として解く。大きすぎれば BodyTooLargeError、JSON でなければ SyntaxError */
export async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readBodyWithLimit(req, maxBytes)) as unknown;
}
