/**
 * セッションに紐付く「関連するもの」（録画・録音・配信・リプレイ動画・卓報告・感想・絵など）。
 * シナリオの著作物（HO・ルームデータ・シナリオ本文）や BGM などの他人の著作物は対象にしない。
 * 利用場面の調査は docs/research/session-media-usecases.md。
 *
 * - 置き場所は外部（YouTube・Google ドライブ・ふせったーなど）なので、基本は URL で持つ。
 * - 見せる相手はものごとに決める（自分だけ / 指定した人 / メンバー / プレイした人 / 公開）。秘匿 HO の視点録画のように、
 *   あとから範囲を広げる使い方を想定する。
 * - 長い録画は何本にも分かれるので、パートと目次（タイムスタンプ）を持てる。録画の開始時刻があれば、ログの発言時刻から
 *   録画のその場面へ飛べる。
 */

export type MediaKind =
  | "recording"
  | "audio"
  | "stream"
  | "replay"
  | "log"
  | "transcript"
  | "photo"
  | "report"
  | "impression"
  | "trophy"
  | "art"
  | "comic"
  | "story"
  | "other";

/** self: 自分だけ / people: 指定した人 / members: セッションのメンバー / passed: プレイした人 / public: 公開 */
export type MediaScope = "self" | "people" | "members" | "passed" | "public";

export interface MediaPart {
  url: string;
  label?: string;
}

export interface MediaChapter {
  /** 録画の先頭からの秒数（パートが複数ある場合は通しの秒数ではなく、`part` 番目の中の秒数） */
  at: number;
  label: string;
  part?: number;
}

export interface SessionMedia {
  id: string;
  kind: MediaKind;
  title: string;
  /** 1 本目（または唯一）の URL。手元にしかないもの（HDD の録画など）は空でよい */
  url?: string;
  /** 2 本目以降のパート */
  parts?: MediaPart[];
  spoiler: boolean;
  scope: MediaScope;
  /** scope が people のときに見られる利用者 ID */
  audience?: string[];
  /** 誰の視点か（秘匿 HO の視点録画など）。利用者 ID */
  povUserId?: string;
  /** 作った人・描いた人などのクレジット */
  credits?: string;
  note?: string;
  chapters?: MediaChapter[];
  /** 録画・録音の 1 本目が始まった時刻（epoch 秒）。ログの発言時刻から録画の位置を出すのに使う */
  startedAt?: number;
  /** 置き場所の期限（ギガファイル便など）。YYYY-MM-DD */
  expiresAt?: string;
  /** 録画・録音を同卓者全員が了承しているか */
  consent?: boolean;
  addedBy: string;
  createdAt: string;
}

export interface MediaKindDef {
  kind: MediaKind;
  label: string;
  group: MediaGroup;
  /** 録画・録音のように、同卓者の了承を確かめるもの */
  needsConsent?: boolean;
  /** パート・目次・開始時刻を持てるもの */
  timed?: boolean;
}

export type MediaGroup = "record" | "publish" | "report" | "creation" | "other";

export const MEDIA_GROUPS: { group: MediaGroup; label: string }[] = [
  { group: "record", label: "記録" },
  { group: "publish", label: "配信・動画" },
  { group: "report", label: "報告・感想" },
  { group: "creation", label: "創作" },
  { group: "other", label: "その他" },
];

export const MEDIA_KINDS: MediaKindDef[] = [
  { kind: "recording", label: "録画", group: "record", needsConsent: true, timed: true },
  { kind: "audio", label: "録音", group: "record", needsConsent: true, timed: true },
  { kind: "log", label: "ログ", group: "record" },
  { kind: "transcript", label: "文字起こし・あらすじ", group: "record" },
  { kind: "photo", label: "写真・スクリーンショット", group: "record" },
  { kind: "stream", label: "配信アーカイブ", group: "publish", needsConsent: true, timed: true },
  { kind: "replay", label: "リプレイ動画", group: "publish", timed: true },
  { kind: "report", label: "卓報告", group: "report" },
  { kind: "impression", label: "感想", group: "report" },
  { kind: "trophy", label: "通過証", group: "report" },
  { kind: "art", label: "イラスト・立ち絵・スチル", group: "creation" },
  { kind: "comic", label: "漫画", group: "creation" },
  { kind: "story", label: "小説・SS", group: "creation" },
  { kind: "other", label: "その他", group: "other" },
];

export const MEDIA_KIND_MAP: Record<MediaKind, MediaKindDef> = Object.fromEntries(
  MEDIA_KINDS.map((d) => [d.kind, d]),
) as Record<MediaKind, MediaKindDef>;

export const MEDIA_SCOPE_LABEL: Record<MediaScope, string> = {
  self: "自分だけ",
  people: "指定した人",
  members: "メンバー限定",
  passed: "プレイした人",
  public: "公開",
};

/* ---------- URL からのサービス判定 ---------- */

export type MediaService =
  | "youtube"
  | "niconico"
  | "twitch"
  | "twitcasting"
  | "gdrive"
  | "dropbox"
  | "gigafile"
  | "fusetter"
  | "privatter"
  | "poipiku"
  | "notion"
  | "pixiv"
  | "fanbox"
  | "skeb"
  | "x"
  | "ccfolia"
  | "discord"
  | "web";

export interface DetectedLink {
  service: MediaService;
  /** 画面に出すサービス名 */
  label: string;
  /** URL から推し量った種類。利用者が変えてよい */
  kindHint: MediaKind;
  /** 埋め込めるときの埋め込み先 URL（ネタバレでないとき・見てよい人にだけ使う） */
  embedUrl?: string;
}

const SERVICE_LABEL: Record<MediaService, string> = {
  youtube: "YouTube",
  niconico: "ニコニコ",
  twitch: "Twitch",
  twitcasting: "ツイキャス",
  gdrive: "Google ドライブ",
  dropbox: "Dropbox",
  gigafile: "ギガファイル便",
  fusetter: "ふせったー",
  privatter: "Privatter",
  poipiku: "ポイピク",
  notion: "Notion",
  pixiv: "pixiv",
  fanbox: "pixivFANBOX",
  skeb: "Skeb",
  x: "X",
  ccfolia: "CCFOLIA",
  discord: "Discord",
  web: "Web",
};

function hostOf(u: URL): string {
  return u.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "");
}

/** "1h2m3s" / "3723" / "62s" を秒に直す */
export function parseTimeParam(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtubeId(u: URL, host: string): { id?: string; list?: string; live?: boolean } {
  const list = u.searchParams.get("list") ?? undefined;
  if (host === "youtu.be") return { id: u.pathname.slice(1).split("/")[0] || undefined, list };
  if (u.pathname === "/watch") return { id: u.searchParams.get("v") ?? undefined, list };
  const m = u.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{6,})/);
  if (m) return { id: m[1], list, live: u.pathname.startsWith("/live/") };
  if (u.pathname === "/playlist") return { list };
  return {};
}

/** URL を見て、置き場所のサービスと種類の見当、埋め込み先を返す。URL でなければ null */
export function detectMediaLink(rawUrl: string): DetectedLink | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = hostOf(u);
  const make = (service: MediaService, kindHint: MediaKind, embedUrl?: string): DetectedLink => ({
    service,
    label: SERVICE_LABEL[service],
    kindHint,
    ...(embedUrl ? { embedUrl } : {}),
  });

  if (host === "youtube.com" || host === "youtu.be") {
    const { id, list, live } = youtubeId(u, host);
    const start = parseTimeParam(u.searchParams.get("t") ?? u.searchParams.get("start"));
    const kind: MediaKind = live ? "stream" : list && !id ? "replay" : "recording";
    if (id) {
      const q = new URLSearchParams();
      if (start) q.set("start", String(start));
      if (list) q.set("list", list);
      const qs = q.toString();
      return make("youtube", kind, `https://www.youtube-nocookie.com/embed/${id}${qs ? `?${qs}` : ""}`);
    }
    if (list) return make("youtube", kind, `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`);
    return make("youtube", kind);
  }
  if (
    host === "nicovideo.jp" ||
    host === "nico.ms" ||
    host === "live.nicovideo.jp" ||
    host.endsWith(".nicovideo.jp")
  ) {
    const id = u.pathname.match(/((?:sm|so|nm)\d+)/)?.[1];
    if (host.startsWith("live")) return make("niconico", "stream");
    return make("niconico", "replay", id ? `https://embed.nicovideo.jp/watch/${id}` : undefined);
  }
  if (host === "twitch.tv") {
    const vid = u.pathname.match(/^\/videos\/(\d+)/)?.[1];
    return make(
      "twitch",
      "stream",
      vid ? `https://player.twitch.tv/?video=v${vid}&autoplay=false` : undefined,
    );
  }
  if (host === "twitcasting.tv") return make("twitcasting", "stream");
  if (host === "drive.google.com" || host === "docs.google.com") return make("gdrive", "recording");
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) return make("dropbox", "log");
  if (host.endsWith("gigafile.nu")) return make("gigafile", "recording");
  if (host === "fusetter.com") return make("fusetter", "impression");
  if (host === "privatter.net" || host === "privatter.me") return make("privatter", "impression");
  if (host === "poipiku.com") return make("poipiku", "art");
  if (host.endsWith("notion.site") || host === "notion.so") return make("notion", "report");
  if (host === "pixiv.net") return make("pixiv", u.pathname.includes("/novel") ? "story" : "art");
  if (host.endsWith("fanbox.cc")) return make("fanbox", "comic");
  if (host === "skeb.jp") return make("skeb", "art");
  if (host === "x.com" || host === "twitter.com") return make("x", "report");
  if (host === "ccfolia.com") return make("ccfolia", "log");
  if (host === "discord.com" || host === "discord.gg") return make("discord", "other");
  return make("web", "other");
}

/* ---------- 見せてよいか ---------- */

export interface MediaViewer {
  /** 見ている人。ログインしていない共有ページの閲覧者は null */
  viewerId: string | null;
  /** セッションのメンバー（GM と PL） */
  isMember: boolean;
  /** そのシナリオをプレイ済みと確かめられた人（メンバーを含む） */
  hasPassed: boolean;
}

export function canViewMedia(m: SessionMedia, v: MediaViewer): boolean {
  if (v.viewerId && m.addedBy === v.viewerId) return true;
  switch (m.scope) {
    case "self":
      return false;
    case "people":
      return Boolean(v.viewerId && (m.audience ?? []).includes(v.viewerId));
    case "members":
      return v.isMember;
    case "passed":
      return v.isMember || v.hasPassed;
    case "public":
      return true;
  }
}

/** 見てよいものだけを、種類のまとまり順・追加順に並べる */
export function visibleMedia(items: readonly SessionMedia[] | undefined, v: MediaViewer): SessionMedia[] {
  const order = new Map(MEDIA_KINDS.map((d, i) => [d.kind, i]));
  return (items ?? [])
    .filter((m) => canViewMedia(m, v))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (order.get(a.m.kind) ?? 99) - (order.get(b.m.kind) ?? 99) || a.i - b.i)
    .map(({ m }) => m);
}

/** 未通過の人にネタバレを伏せるか（伏せても、押せば開ける） */
export function shouldHideSpoiler(m: SessionMedia, v: MediaViewer): boolean {
  return m.spoiler && !v.isMember && !v.hasPassed;
}

/* ---------- 目次（タイムスタンプ） ---------- */

/** "1:02:03" / "12:34" を秒に直す */
export function parseClock(raw: string): number | undefined {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (min >= 60 || s >= 60) return undefined;
  return h * 3600 + min * 60 + s;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(r).padStart(2, "0")}` : `${mm}:${String(r).padStart(2, "0")}`;
}

/**
 * YouTube の概要欄のような「0:00 導入」形式の行を目次にする。時刻のない行は無視する。
 * 「Part2」「パート2」で始まる行があれば、それ以降の時刻をそのパートのものとみなす。
 */
export function parseChapters(text: string): MediaChapter[] {
  const out: MediaChapter[] = [];
  let part = 1;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const partHead = line.match(/^(?:part|パート)\s*(\d+)/i);
    if (partHead) {
      part = Number(partHead[1]);
      continue;
    }
    const m = line.match(/^((?:\d+:)?\d{1,2}:\d{2})\s*[-–—:：]?\s*(.+)$/);
    if (!m) continue;
    const at = parseClock(m[1]!);
    if (at === undefined) continue;
    out.push({ at, label: m[2]!.trim(), ...(part > 1 ? { part } : {}) });
  }
  return out;
}

export function formatChapters(chapters: readonly MediaChapter[] | undefined): string {
  const lines: string[] = [];
  let part = 1;
  for (const c of chapters ?? []) {
    const p = c.part ?? 1;
    if (p !== part) {
      lines.push(`Part${p}`);
      part = p;
    }
    lines.push(`${formatClock(c.at)} ${c.label}`);
  }
  return lines.join("\n");
}

/** 録画の開始時刻から、ログの発言時刻（epoch 秒）が録画の何秒目かを出す。録画の外なら null */
export function mediaOffsetAt(m: SessionMedia, epochSec: number, maxLengthSec = 16 * 3600): number | null {
  if (m.startedAt === undefined) return null;
  const off = epochSec - m.startedAt;
  return off >= 0 && off <= maxLengthSec ? off : null;
}

/** 秒数付きで開ける URL（YouTube・ニコニコ・Twitch）。開けないサービスは元の URL */
export function urlAt(rawUrl: string, sec: number): string {
  const d = detectMediaLink(rawUrl);
  if (!d) return rawUrl;
  const u = new URL(rawUrl);
  const s = Math.max(0, Math.floor(sec));
  if (d.service === "youtube") {
    u.searchParams.set("t", `${s}s`);
    return u.toString();
  }
  if (d.service === "niconico") {
    u.searchParams.set("from", String(s));
    return u.toString();
  }
  if (d.service === "twitch") {
    u.searchParams.set("t", `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m${s % 60}s`);
    return u.toString();
  }
  return rawUrl;
}

/** 置き場所の期限が近い（または過ぎた）か。today は YYYY-MM-DD */
export function expiryState(m: SessionMedia, today: string, soonDays = 7): "expired" | "soon" | null {
  if (!m.expiresAt) return null;
  if (m.expiresAt < today) return "expired";
  const diff = (Date.parse(`${m.expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return diff <= soonDays ? "soon" : null;
}

/**
 * 共有ページ用のデータに含めてよいものだけを返す。共有ページは、その共有範囲の人なら誰でも読めるデータとして書き出すので、
 * それより狭い範囲（自分だけ・指定した人、公開ページにおけるメンバー限定など）のものは含めない。
 */
export function mediaForSharedPage(
  items: readonly SessionMedia[] | undefined,
  pageScope: "members" | "passed" | "public",
): SessionMedia[] {
  const allowed: Record<typeof pageScope, MediaScope[]> = {
    members: ["members", "passed", "public"],
    passed: ["passed", "public"],
    public: ["public"],
  };
  return (items ?? [])
    .filter((m) => allowed[pageScope].includes(m.scope))
    .map(({ audience: _audience, ...m }) => m);
}

/** YouTube の動画ならサムネイル画像の URL（一覧で中身を見分けるため）。それ以外は undefined */
export function mediaThumbnail(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return undefined;
  }
  const host = hostOf(u);
  if (host !== "youtube.com" && host !== "youtu.be") return undefined;
  const { id } = youtubeId(u, host);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined;
}

/** 埋め込みの再生位置を変えた URL（目次から再生中の動画を飛ばすため） */
export function embedAt(embedUrl: string, sec: number): string {
  const u = new URL(embedUrl);
  if (u.hostname.includes("youtube")) {
    u.searchParams.set("start", String(Math.max(0, Math.floor(sec))));
    u.searchParams.set("autoplay", "1");
  } else if (u.hostname.includes("nicovideo")) {
    u.searchParams.set("from", String(Math.max(0, Math.floor(sec))));
  } else if (u.hostname.includes("twitch")) {
    u.searchParams.set(
      "time",
      `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m${Math.floor(sec % 60)}s`,
    );
  }
  return u.toString();
}
