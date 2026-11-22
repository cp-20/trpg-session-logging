/**
 * Discord 連携のサーバーが Firestore を読み書きするときの「ボットの利用者」（Firebase Auth のメールとパスワードの利用者）。
 * サービスアカウントの鍵は組織のポリシーで作れないので、サーバーはこの利用者としてログインし、
 * できることは Firestore のルール（firestore.rules の isBot()）で絞る（docs/DEPLOYMENT.md「Discord」）。
 *
 * scripts/discord.ts からも読むので、このファイルは相対 import を持たない。
 */

/**
 * ボットの uid。`node scripts/discord.ts setup-bot` が利用者を作り、ここと firestore.rules の botUid() を書き換える
 * （2 か所が同じことは bot-account.test.ts が確かめる）。
 * 作る前の値は、メールとパスワードの登録では生まれない形（uid は 28 文字の英数字）なので、誰もボットになれない。
 */
export const BOT_UID = "sn0k0ZTt6KXjYnPf46cZ6UqrYCo2";

/** 本番で setup-bot が使う既定のメール。届かないドメインにして、パスワードの再設定を誰にも受け取らせない */
export const DEFAULT_BOT_EMAIL = "discord-bot@takufu.invalid";

/** エミュレーターでだけ使う、決まったログイン情報（本番の値ではない） */
export const EMULATOR_BOT = { email: DEFAULT_BOT_EMAIL, password: "emulator-only-bot-password" } as const;

const RULES_BOT_UID = /function botUid\(\) \{ return '([^']*)'; \}/;

/** firestore.rules に書いてあるボットの uid */
export function rulesBotUid(rules: string): string | null {
  return RULES_BOT_UID.exec(rules)?.[1] ?? null;
}

export function patchRulesBotUid(rules: string, uid: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error(`invalid uid: ${uid}`);
  if (!RULES_BOT_UID.test(rules)) throw new Error("firestore.rules has no botUid() function");
  return rules.replace(RULES_BOT_UID, `function botUid() { return '${uid}'; }`);
}

const BOT_UID_TS = /export const BOT_UID = "([^"]*)";/;

export function patchSourceBotUid(source: string, uid: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new Error(`invalid uid: ${uid}`);
  if (!BOT_UID_TS.test(source)) throw new Error("bot-account.ts has no BOT_UID constant");
  return source.replace(BOT_UID_TS, `export const BOT_UID = "${uid}";`);
}

export function emulatorAuthUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  const host = env.FIREBASE_AUTH_EMULATOR_HOST?.trim();
  return host ? `http://${host}` : "http://127.0.0.1:9099";
}

/**
 * エミュレーターに、決まった uid のボットを作る（あれば何もしない）。
 * エミュレーターは `Authorization: Bearer owner` を管理者として扱い、uid を指定した登録を許す
 */
export async function ensureEmulatorBotUser(opts: {
  authUrl: string;
  projectId: string;
  uid?: string;
  email?: string;
  password?: string;
  fetchFn?: typeof fetch;
}): Promise<{ uid: string; created: boolean }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const uid = opts.uid ?? BOT_UID;
  const email = opts.email ?? EMULATOR_BOT.email;
  const password = opts.password ?? EMULATOR_BOT.password;
  const base = `${opts.authUrl}/identitytoolkit.googleapis.com/v1/projects/${opts.projectId}`;
  const headers = { "Content-Type": "application/json", Authorization: "Bearer owner" };
  const lookup = await fetchFn(`${base}/accounts:lookup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ localId: [uid] }),
  });
  if (lookup.ok && ((await lookup.json()) as { users?: unknown[] }).users?.length)
    return { uid, created: false };
  const res = await fetchFn(`${base}/accounts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ localId: uid, email, password }),
  });
  if (!res.ok) throw new Error(`emulator bot sign-up failed: ${res.status} ${await res.text()}`);
  return { uid, created: true };
}
