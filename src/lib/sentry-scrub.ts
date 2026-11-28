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

/** beforeSend で通す（例外などの出来事）。持ち主の特定につながる欄も消す */
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

/** 利用者や要求の中身につながる span の属性（名前の頭で見る）。値ごと消す */
const DROPPED_SPAN_ATTRIBUTES = [
  /^user\./,
  /^client\.address$/,
  /^http\.request\.header\./,
  /^http\.response\.header\./,
  /^url\.query$/,
  /^http\.query$/,
  /cookie/i,
];

type ScrubbableSpan = {
  name?: string;
  attributes?: Record<string, unknown>;
  links?: { attributes?: Record<string, unknown> }[];
};

function scrubAttributes(attributes: Record<string, unknown> | undefined): void {
  if (!attributes) return;
  for (const key of Object.keys(attributes)) {
    if (DROPPED_SPAN_ATTRIBUTES.some((re) => re.test(key))) {
      delete attributes[key];
      continue;
    }
    const value = attributes[key];
    if (typeof value === "string") attributes[key] = scrubText(value);
    else if (value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string") {
      const v = value as { value: string };
      v.value = scrubText(v.value);
    }
  }
}

/**
 * beforeSendSpan で通す。性能の計測は span 1 つずつで送られ（Sentry v11 の既定）、beforeSendTransaction は呼ばれない。
 * span の名前（"GET /join/<token>" など）と属性（url.full・http.target など）に入った鍵を伏せ、利用者・ヘッダー・問い合わせの属性を消す
 */
export function scrubSpan<T extends ScrubbableSpan>(span: T): T {
  if (span.name) span.name = scrubText(span.name);
  scrubAttributes(span.attributes);
  for (const link of span.links ?? []) scrubAttributes(link.attributes);
  return span;
}
