/**
 * ユーザー ID（handle）。プロフィールの URL（/users/<handle>）と既定のアイコン（identicon）の種になる。
 *
 * - 半角の英小文字・数字・アンダースコアで 3〜20 文字。先頭は英字、末尾は英字か数字、`__` は使わない
 * - 一度決めたら変えない（P14）。一意性は Firestore の `handles/{handle}` をトランザクションで作って保証する
 * - 画面の名前（ルートの区切り）や運営と紛らわしい語は予約して使わせない
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const HANDLE_PATTERN = "^[a-z](?:[a-z0-9]|_(?!_))*[a-z0-9]$";
const HANDLE_RE = new RegExp(HANDLE_PATTERN);

/** 使えない ID。URL の区切りに使っている語と、運営・役割と紛らわしい語 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "calendar",
  "characters",
  "demo",
  "edit",
  "feedback",
  "help",
  "home",
  "invite",
  "join",
  "licenses",
  "login",
  "logout",
  "me",
  "mod",
  "moderator",
  "new",
  "null",
  "official",
  "privacy",
  "root",
  "scenarios",
  "sessions",
  "settings",
  "share",
  "signin",
  "signup",
  "staff",
  "support",
  "system",
  "tables",
  "takufu",
  "terms",
  "undefined",
  "upload",
  "user",
  "users",
  "welcome",
]);

/** 入力を ID の形に寄せる（大文字は小文字に、前後の空白と先頭の @ は落とす）。足りない文字は補わない */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

/** 使えない理由（使えるときは null）。文は利用者にそのまま見せる */
export function handleProblem(handle: string): string | null {
  if (handle.length < HANDLE_MIN) return `${HANDLE_MIN}文字以上にしてください`;
  if (handle.length > HANDLE_MAX) return `${HANDLE_MAX}文字以内にしてください`;
  if (/[^a-z0-9_]/.test(handle)) return "半角の英小文字・数字・_ だけが使えます";
  if (!/^[a-z]/.test(handle)) return "英字で始めてください";
  if (!HANDLE_RE.test(handle)) return "_ を続けたり、最後に置いたりできません";
  if (RESERVED_HANDLES.has(handle)) return "この ID は使えません";
  return null;
}

export function isValidHandle(handle: string): boolean {
  return handleProblem(handle) === null;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * はじめに入れておく ID の候補。メールアドレスの @ より前（なければ表示名）を ID の形に直す。
 * 作れないとき・予約語のときは `player` と、アカウントから決まる数字にする
 */
export function suggestHandle(seed: { email?: string; name?: string; uid: string }): string {
  const source = seed.email?.split("@")[0] ?? seed.name ?? "";
  const shaped = source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[^a-z]+/, "")
    .slice(0, HANDLE_MAX)
    .replace(/_+$/, "");
  if (isValidHandle(shaped)) return shaped;
  return `player${String(hash(seed.uid) % 100000).padStart(5, "0")}`;
}

/** 候補が使われていたときの次の候補（末尾に 2 桁の数字を足す）。何度呼んでも同じ順に出る */
export function alternateHandle(base: string, attempt: number): string {
  const digits = String((hash(`${base}:${attempt}`) % 90) + 10);
  const head = base.slice(0, HANDLE_MAX - digits.length).replace(/_+$/, "");
  return `${head}${digits}`;
}
