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

/** 戻る先のボタンの文言。「続きを開く」では行き先が分からないので、画面の名前で言う */
const DESTINATION_LABELS: Readonly<Record<string, string>> = {
  home: "ホームを開く",
  sessions: "セッションを開く",
  calendar: "カレンダーを開く",
  tables: "卓を開く",
  join: "卓の招待を開く",
  characters: "キャラクターを開く",
  scenarios: "シナリオを開く",
  upload: "記録の画面を開く",
  users: "プロフィールを開く",
  settings: "設定を開く",
  share: "共有されたログを開く",
};

export function destinationLabel(next: string): string {
  const head = next.split(/[?#]/)[0]!.split("/")[1] ?? "";
  return DESTINATION_LABELS[head] ?? "元の画面に戻る";
}
