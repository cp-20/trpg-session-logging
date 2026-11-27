/**
 * Sentry に送る前に、URL や文に入った「知っていれば入れる」値を伏せる。
 * 招待・共有・カレンダー購読のリンクは、その URL そのものが鍵になっている。Discord の返信 URL の token も同じ。
 */
const SECRET_PATHS: [RegExp, string][] = [
  [/\/(join|invite)\/[^/?#\s"']+/g, "/$1/:token"],
  [/\/share\/(l|c)\/[^/?#\s"']+/g, "/share/$1/:id"],
  [/\/api\/calendar\/[^/?#\s"']+/g, "/api/calendar/:token"],
  [/\/(webhooks|interactions)\/(\d+)\/[^/?#\s"']+/g, "/$1/$2/:token"],
];

export function scrubText(text: string): string {
  let out = text;
  for (const [re, to] of SECRET_PATHS) out = out.replace(re, to);
  // 問い合わせの部分は丸ごと落とす（招待の番号などを ?token= で運ぶことがある）
  return out.replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, "$1");
}

type Scrubbable = {
  message?: string;
  transaction?: string;
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: unknown; data?: unknown };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  user?: unknown;
  tags?: Record<string, unknown>;
};

/** beforeSend / beforeSendTransaction で通す。持ち主の特定につながる欄も消す */
export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.message) event.message = scrubText(event.message);
  if (event.transaction) event.transaction = scrubText(event.transaction);
  if (event.request) {
    if (event.request.url) event.request.url = scrubText(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  for (const v of event.exception?.values ?? []) if (v.value) v.value = scrubText(v.value);
  for (const b of event.breadcrumbs ?? []) {
    if (b.message) b.message = scrubText(b.message);
    for (const key of ["url", "to", "from"]) {
      const value = b.data?.[key];
      if (typeof value === "string") b.data![key] = scrubText(value);
    }
  }
  delete event.user;
  if (typeof event.tags?.url === "string") event.tags.url = scrubText(event.tags.url);
  return event;
}
