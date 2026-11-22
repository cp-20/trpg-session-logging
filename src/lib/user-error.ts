/**
 * 捕まえた例外を、利用者に見せる文に直す。
 * Firebase などの内部の文（"Missing or insufficient permissions"、"false for 'create' @ L73"）は画面に出さない。
 * 卓譜が自分で投げた日本語の文（「共有設定が別の端末で更新されています。…」）はそのまま使う。
 * 権限で断られたもの（permission-denied）は、場面ごとの fallback を出す（何が断られたかは場面で違う）。
 * 詳しいことは呼び出し側で console に残す。
 */

const FIREBASE_CODE_MESSAGES: Record<string, string> = {
  unauthenticated: "ログインの期限が切れました。ログインし直してから、もう一度お試しください。",
  unavailable: "接続できませんでした。通信状態を確認して、もう一度お試しください。",
  "deadline-exceeded": "接続に時間がかかっています。通信状態を確認して、もう一度お試しください。",
  "resource-exhausted": "混み合っています。しばらくしてから、もう一度お試しください。",
  "auth/network-request-failed": "接続できませんでした。通信状態を確認してください。",
};

const JAPANESE_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;

/** 例外を利用者向けの文に直す。読めないものは fallback */
export function userFacingError(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") {
    const bare = code.replace(/^firestore\//, "");
    return FIREBASE_CODE_MESSAGES[bare] ?? fallback;
  }
  if (error instanceof Error && JAPANESE_RE.test(error.message)) return error.message;
  return fallback;
}
