/**
 * 関連するもの（YouTube・ニコニコ・ふせったー・X）の URL から、題名・書いた人・本文の頭・サムネイルを引く決まり。
 * 問い合わせはサーバー（src/app/api/media-preview）だけが行い、閲覧者の素性（IP・クッキー）を相手のサービスに渡さない。
 *
 * - 問い合わせ先は固定の一覧（PREVIEW_UPSTREAM_HOSTS）だけ。貼られた URL をそのまま取りに行かず、ID を取り出して組み直す
 * - X は公式の oEmbed（widgets.js は読まない）。返る blockquote から本文を文字にする
 * - ふせったーは公開の部分（turnContent。伏せ字は伏せたまま）だけ。追記（additionalContent）と伏せる前の本文（rawContent）は読まない
 * - ニコニコは getthumbinfo。サムネイルはサービス自身の CDN のものだけ返す
 * - YouTube は oEmbed に加えて動画のページの頭（構造化データ）から、配信の開始時刻と長さを読む。ログと録画を時刻で
 *   合わせるのに使う（src/lib/recording-sync.ts）
 */

export type PreviewService = "youtube" | "niconico" | "fusetter" | "x";

export interface MediaPreview {
  service: PreviewService;
  /** 題名。題名のないもの（ポスト・ふせったー）は本文の 1 行目 */
  title: string;
  author?: string;
  /** 本文の頭（ポスト・ふせったーの公開の部分）。動画は持たない */
  excerpt?: string;
  /** サービス自身の CDN の画像だけ */
  thumbnail?: string;
  /** 配信のアーカイブなら、配信を始めた時刻（epoch 秒）。動画の 0 秒の時刻 */
  startedAt?: number;
  /** 動画の長さ（秒） */
  durationSec?: number;
}

export interface PreviewTarget {
  service: PreviewService;
  /** 問い合わせ先（固定の一覧のホストだけ） */
  fetchUrl: string;
  /** 本来の URL から取り出した ID（応答が別のものを指していないか確かめる） */
  id: string;
  /** 開始時刻・長さを読む先（固定の一覧のホストだけ）。読めなくても題名は返す */
  timingUrl?: string;
}

/** サーバーが問い合わせてよいホスト。これ以外へは出ない */
export const PREVIEW_UPSTREAM_HOSTS: ReadonlySet<string> = new Set([
  "www.youtube.com",
  "ext.nicovideo.jp",
  "api.fusetter.com",
  "publish.x.com",
]);

const THUMBNAIL_HOSTS: Record<PreviewService, readonly string[]> = {
  youtube: ["i.ytimg.com"],
  niconico: ["nicovideo.cdn.nimg.jp", "tn.smilevideo.jp"],
  fusetter: [],
  x: [],
};

const TITLE_MAX = 80;
const EXCERPT_MAX = 280;

function parseHttps(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  return u;
}

/**
 * 貼られた URL から問い合わせ先を決める。対応するサービスの、中身を指す URL でなければ null。
 * https のものだけ受け付ける（画面で貼られたものは normalizeMediaUrl が https を補う）。
 */
export function previewTarget(rawUrl: string): PreviewTarget | null {
  const u = parseHttps(rawUrl);
  if (!u) return null;
  const host = u.hostname.toLowerCase();

  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    const id =
      host === "youtu.be"
        ? u.pathname.slice(1).split("/")[0]
        : u.pathname === "/watch"
          ? u.searchParams.get("v")
          : u.pathname.match(/^\/(?:live|shorts|embed)\/([^/]+)/)?.[1];
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    const watch = `https://www.youtube.com/watch?v=${id}`;
    return {
      service: "youtube",
      id,
      fetchUrl: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
      timingUrl: watch,
    };
  }

  if (["nicovideo.jp", "www.nicovideo.jp", "sp.nicovideo.jp", "nico.ms"].includes(host)) {
    const id = (host === "nico.ms" ? u.pathname : u.pathname.match(/^\/watch\/(.+)$/)?.[1])
      ?.replace(/^\//, "")
      .match(/^((?:sm|so|nm)\d{1,12})$/)?.[1];
    if (!id) return null;
    return { service: "niconico", id, fetchUrl: `https://ext.nicovideo.jp/api/getthumbinfo/${id}` };
  }

  if (host === "fusetter.com" || host === "www.fusetter.com") {
    const id = u.pathname.match(/^\/tw\/([A-Za-z0-9]{3,32})\/?$/)?.[1];
    if (!id) return null;
    return { service: "fusetter", id, fetchUrl: `https://api.fusetter.com/api/posts/public/${id}` };
  }

  if (
    ["x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"].includes(
      host,
    )
  ) {
    const m = u.pathname.match(/^\/(?:([A-Za-z0-9_]{1,15})|i\/web)\/status(?:es)?\/(\d{1,25})\/?$/);
    if (!m) return null;
    const id = m[2]!;
    const post = `https://x.com/${m[1] ?? "i"}/status/${id}`;
    return {
      service: "x",
      id,
      fetchUrl: `https://publish.x.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(post)}`,
    };
  }
  return null;
}

/** 画面から引くときの問い合わせ先。引けない URL なら undefined */
export function previewRequestUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl || !previewTarget(rawUrl)) return undefined;
  return `/api/media-preview?url=${encodeURIComponent(rawUrl.trim())}`;
}

/* ---------- 文字にする ---------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  laquo: "«",
  raquo: "»",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (all, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? all;
  });
}

/** 書きの向きを変える見えない文字・制御文字を除く（題名に混ざると表示が崩れる） */
function stripInvisible(s: string): string {
  // oxlint-disable-next-line no-control-regex -- 制御文字を取り除くための正規表現
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "");
}

/** HTML の断片を文字にする。改行は残し、続く空行は 1 つにまとめる */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "");
  return stripInvisible(decodeEntities(text))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`
    : s;
}

/** 本文の 1 行目を題名にする */
export function firstLine(text: string, max = 40): string {
  return clip(
    text
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "",
    max,
  );
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function oneLine(v: unknown, max = TITLE_MAX): string | undefined {
  const s = str(v);
  return s
    ? clip(stripInvisible(decodeEntities(s)).replace(/\s+/g, " ").trim(), max) || undefined
    : undefined;
}

/** サービス自身の CDN の画像なら https にそろえて返す */
export function safeThumbnail(service: PreviewService, raw: unknown): string | undefined {
  const s = str(raw);
  if (!s) return undefined;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
  if (!THUMBNAIL_HOSTS[service].includes(u.hostname.toLowerCase())) return undefined;
  u.protocol = "https:";
  return u.toString();
}

/* ---------- 応答を読む ---------- */

function asObject(json: unknown): Record<string, unknown> | null {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
}

export function parseYoutubeOembed(json: unknown): MediaPreview | null {
  const o = asObject(json);
  const title = oneLine(o?.title);
  if (!o || !title) return null;
  return {
    service: "youtube",
    title,
    ...(oneLine(o.author_name) ? { author: oneLine(o.author_name)! } : {}),
    ...(safeThumbnail("youtube", o.thumbnail_url)
      ? { thumbnail: safeThumbnail("youtube", o.thumbnail_url)! }
      : {}),
  };
}

/**
 * X の oEmbed。本文は blockquote の最初の <p> の中身。画像のリンク（pic.x.com など）は本文から外す。
 * 名前は author_name、ID は author_url から。
 */
export function parseXOembed(json: unknown): MediaPreview | null {
  const o = asObject(json);
  const html = str(o?.html);
  if (!o || !html) return null;
  const inner = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  const body = inner
    ? htmlToText(inner.replace(/<a\b[^>]*>\s*pic\.(?:twitter|x)\.com\/[^<]*<\/a>/gi, "")).trim()
    : "";
  const name = oneLine(o.author_name, 50);
  const handle = str(o.author_url)?.match(/^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
  const author =
    name && handle && name !== handle ? `${name} @${handle}` : (name ?? (handle ? `@${handle}` : undefined));
  if (!body && !author) return null;
  return {
    service: "x",
    title: body ? firstLine(body) : `${author} のポスト`,
    ...(author ? { author } : {}),
    ...(body ? { excerpt: clip(body, EXCERPT_MAX) } : {}),
  };
}

/**
 * ふせったーの公開の投稿。読むのは公開の部分（turnContent）と書いた人の表示名だけ。
 * 伏せ字（<mark>）は伏せたまま「＊＊＊」にする。伏せる前の本文・追記は応答にあっても読まない。
 */
export function parseFusetterPost(json: unknown, id: string): MediaPreview | null {
  const o = asObject(json);
  if (!o || o.isHidden === true) return null;
  if (str(o.identificationCode) && o.identificationCode !== id) return null;
  const turn = str(o.turnContent);
  if (!turn) return null;
  const body = htmlToText(turn.replace(/<mark\b[^>]*>[\s\S]*?<\/mark>/gi, "＊＊＊"));
  if (!body) return null;
  const author = oneLine(asObject(o.author)?.displayName, 50);
  return {
    service: "fusetter",
    title: firstLine(body),
    ...(author ? { author } : {}),
    excerpt: clip(body, EXCERPT_MAX),
  };
}

function xmlText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return undefined;
  const raw = m[1]!.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1");
  return decodeEntities(raw).trim() || undefined;
}

/** ニコニコの getthumbinfo（XML）。投稿者はユーザーかチャンネルのどちらか */
export function parseNicoThumbInfo(xml: string, id: string): MediaPreview | null {
  if (!/<nicovideo_thumb_response\s+status="ok"/.test(xml)) return null;
  const vid = xmlText(xml, "video_id");
  if (vid && vid !== id) return null;
  const title = oneLine(xmlText(xml, "title"));
  if (!title) return null;
  const author = oneLine(xmlText(xml, "user_nickname") ?? xmlText(xml, "ch_name"), 50);
  const thumbnail = safeThumbnail("niconico", xmlText(xml, "thumbnail_url"));
  const length = xmlText(xml, "length")?.match(/^(?:(\d+):)?(\d+):(\d{2})$/);
  const durationSec = length ? Number(length[1] ?? 0) * 3600 + Number(length[2]) * 60 + Number(length[3]) : 0;
  return {
    service: "niconico",
    title,
    ...(author ? { author } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(durationSec > 0 ? { durationSec } : {}),
  };
}

/** ISO 8601 の期間（PT1H2M3S）を秒に */
export function parseIsoDuration(raw: string | undefined): number | undefined {
  const m = raw?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m || raw === "P" || raw === "PT") return undefined;
  const sec =
    Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return sec > 0 ? sec : undefined;
}

function isoEpoch(raw: string | undefined): number | undefined {
  // 時差の書かれていない日時は読まない（どこの時刻か分からない）
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(raw))
    return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/** 動画のページの頭で、構造化データ（itemprop）を読み終えたか。そこで読むのをやめてよい */
export function youtubeTimingComplete(html: string): boolean {
  const genre = html.indexOf('itemprop="genre"');
  return genre >= 0 && html.length - genre > 1500;
}

/**
 * YouTube の動画のページの構造化データから、配信の開始時刻と長さを読む。
 *   <meta itemprop="duration" content="PT3H2M1S">
 *   <span itemprop="publication" …BroadcastEvent><meta itemprop="startDate" content="2026-11-27T12:00:56+00:00">
 *     <meta itemprop="endDate" …>
 * 配信でない動画は startDate がないので、開始時刻は返さない（投稿日時は録画の 0 秒ではない）。
 * 長さが載っていない（配信直後）ときは、配信の終了 − 開始
 */
export function parseYoutubeWatchTiming(html: string): { startedAt?: number; durationSec?: number } {
  const meta = (prop: string) =>
    html.match(new RegExp(`<meta\\s+itemprop="${prop}"\\s+content="([^"]*)"`))?.[1]?.trim();
  const live = /^true$/i.test(meta("isLiveBroadcast") ?? "");
  const startedAt = live ? isoEpoch(meta("startDate")) : undefined;
  const endedAt = live ? isoEpoch(meta("endDate")) : undefined;
  const durationSec =
    parseIsoDuration(meta("duration")) ??
    (startedAt !== undefined && endedAt !== undefined && endedAt > startedAt
      ? endedAt - startedAt
      : undefined);
  return {
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
  };
}

/** 問い合わせ先の応答（本文の文字列）を読む。読めなければ null */
export function parsePreviewResponse(target: PreviewTarget, body: string): MediaPreview | null {
  if (target.service === "niconico") return parseNicoThumbInfo(body, target.id);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  switch (target.service) {
    case "youtube":
      return parseYoutubeOembed(json);
    case "x":
      return parseXOembed(json);
    case "fusetter":
      return parseFusetterPost(json, target.id);
  }
}

/** 画面で受け取った JSON を確かめる（よその値をそのまま描かない） */
export function readPreviewJson(json: unknown): MediaPreview | null {
  const o = asObject(json);
  const service = o?.service;
  if (!o || (service !== "youtube" && service !== "niconico" && service !== "fusetter" && service !== "x"))
    return null;
  const title = oneLine(o.title, TITLE_MAX);
  if (!title) return null;
  const author = oneLine(o.author, 60);
  const excerpt = str(o.excerpt) ? clip(String(o.excerpt), EXCERPT_MAX) : undefined;
  const thumbnail = safeThumbnail(service, o.thumbnail);
  const count = (v: unknown, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max ? v : undefined;
  // 2000 年〜2100 年の時刻、長さは 2 日まで
  const startedAt = count(o.startedAt, 4_102_444_800);
  const durationSec = count(o.durationSec, 2 * 86400);
  return {
    service,
    title,
    ...(author ? { author } : {}),
    ...(excerpt ? { excerpt } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    ...(startedAt !== undefined && startedAt >= 946_684_800 ? { startedAt } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
  };
}

/**
 * サムネイルとして試す順。ニコニコの CDN は末尾に .M を付けると 320px の画像があるので先に試す（古い動画にはなく、そのときは元の 130px）
 */
export function thumbnailCandidates(thumbnail: string | undefined): string[] {
  if (!thumbnail) return [];
  let u: URL;
  try {
    u = new URL(thumbnail);
  } catch {
    return [];
  }
  if (u.hostname === "nicovideo.cdn.nimg.jp" && /^\/thumbnails\/\d+\/[\d.]+$/.test(u.pathname) && !u.search) {
    return [`${thumbnail}.M`, thumbnail];
  }
  return [thumbnail];
}

/** 題名が本文の 1 行目から作ったもの（そのまま並べると重なる）か */
export function titleRepeatsExcerpt(title: string, excerpt: string | undefined): boolean {
  if (!excerpt) return false;
  const t = title.replace(/…$/, "").trim();
  return Boolean(t) && excerpt.trim().startsWith(t);
}
