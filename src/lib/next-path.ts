/**
 * ログイン後に戻る先（?next=）を検証する。外のサイトへ飛ばされないよう、卓譜の中のパスだけを受け付ける。
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/home"): string {
  if (!raw) return fallback;
  // "/" で始まり、"//"（別のホスト）や "/\"（ブラウザが "//" と解釈する）で始まらないものだけ
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  // 改行などの制御文字を含むものは受け付けない
  if ([...raw].some((ch) => ch.charCodeAt(0) < 0x20)) return fallback;
  const path = raw.split(/[?#]/)[0]!;
  if (path === "/" || path === "/signin") return fallback;
  return raw;
}
