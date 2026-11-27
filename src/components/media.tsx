/**
 * セッションに紐付く「関連するもの」（録画・録音・配信・リプレイ動画・卓報告・感想・絵など）の一覧と追加・編集。
 * 判定や見せる範囲の決まりは src/lib/session-media.ts。
 *
 * 見せ方:
 * - 再生できるもの（録画・配信・リプレイ動画）は大きな再生面・パート・目次を持つカードにする。目次を押すとその位置から再生する。
 * - それ以外（卓報告・感想・絵など）は、種類の印・タイトル・見せる範囲を 1 行に並べた一覧にする。
 * - ネタバレは未通過の人にだけ伏せる（サムネイルはぼかし、タイトルは種類名に置き換える）。
 */
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  IconBook,
  IconBooks,
  IconBroadcast,
  IconExternal,
  IconEye,
  IconFileText,
  IconLayoutList,
  IconLink,
  IconLock,
  IconMessageCircle,
  IconMicrophone,
  IconMovie,
  IconNotes,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconTrophy,
  IconUnlink,
  IconUsers,
  IconVideo,
  IconWorld,
} from "./icons";
import { Combobox, DateInput, Field, FieldError, Menu, Modal, SectionTitle, Seg, Select, cx } from "./ui";
import { todayStr, uid } from "../lib/format";
import {
  MEDIA_KINDS,
  MEDIA_KIND_MAP,
  MEDIA_SCOPE_LABEL,
  MEDIA_SOURCES,
  MEDIA_SOURCE_MAP,
  defaultSpoiler,
  detectMediaLink,
  embedAt,
  expiryState,
  formatChapters,
  formatClock,
  mediaEditorFields,
  mediaThumbnail,
  needsConsentCheck,
  normalizeMediaUrl,
  parseChapters,
  resolveMediaSource,
  shouldHideSpoiler,
  urlAt,
  visibleMedia,
  type MediaField,
  type MediaKind,
  type MediaScope,
  type MediaSourceId,
  type MediaViewer,
  type SessionMedia,
} from "../lib/session-media";
import {
  previewRequestUrl,
  readPreviewJson,
  thumbnailCandidates,
  titleRepeatsExcerpt,
  type MediaPreview,
} from "../lib/media-preview";
import type { Log, State } from "../types";
import {
  clockNearSittings,
  recordingVideos,
  videoChapters,
  videoLabels,
  type LogLine,
} from "../lib/recording-sync";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const KIND_ICON: Record<MediaKind, Icon> = {
  recording: IconVideo,
  audio: IconMicrophone,
  stream: IconBroadcast,
  replay: IconMovie,
  log: IconFileText,
  transcript: IconLayoutList,
  photo: IconPhoto,
  report: IconNotes,
  impression: IconMessageCircle,
  trophy: IconTrophy,
  art: IconPalette,
  comic: IconBooks,
  story: IconBook,
  other: IconLink,
};

/** 置き場所の印。サービスのロゴは使わず、そこに置かれるものの絵で示す（P17） */
const SOURCE_ICON: Record<MediaSourceId, Icon> = {
  youtube: IconVideo,
  niconico: IconMovie,
  fusetter: IconMessageCircle,
  x: IconNotes,
  other: IconLink,
  none: IconUnlink,
};

const SCOPE_ICON: Record<MediaScope, Icon> = {
  self: IconLock,
  people: IconLock,
  members: IconUsers,
  passed: IconEye,
  public: IconWorld,
};

const SCOPE_OPTIONS = (Object.keys(MEDIA_SCOPE_LABEL) as MediaScope[]).map((value) => ({
  value,
  label: MEDIA_SCOPE_LABEL[value],
}));
const KIND_OPTIONS = MEDIA_KINDS.map((d) => ({ value: d.kind, label: d.label }));

function participantIds(log: Log): string[] {
  return [log.ownerId, ...Object.keys(log.players).filter((id) => id !== log.ownerId)];
}

/* ---------- 題名・本文の頭（サーバーの /api/media-preview から） ---------- */
const previewCache = new Map<string, Promise<MediaPreview | null>>();

export function loadPreview(path: string): Promise<MediaPreview | null> {
  let p = previewCache.get(path);
  if (!p) {
    p = fetch(path, { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: unknown) => readPreviewJson(json))
      .catch(() => null);
    previewCache.set(path, p);
  }
  return p;
}

/** 引ける URL（YouTube・ニコニコ・ふせったー・X）の題名・書いた人・本文の頭。enabled でないとき（伏せているとき）は引かない */
function useMediaPreview(url: string | null | undefined, enabled = true): MediaPreview | null {
  const path = enabled ? previewRequestUrl(url ?? undefined) : undefined;
  const [got, setGot] = useState<{ path: string; value: MediaPreview | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void loadPreview(path).then((value) => {
      if (alive) setGot({ path, value });
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return path && got?.path === path ? got.value : null;
}

/* ---------- 共通の小物 ---------- */
function ScopeMeta({ m, state }: { m: SessionMedia; state: State }) {
  const Icon = SCOPE_ICON[m.scope];
  const who =
    m.scope === "people"
      ? (m.audience ?? [])
          .map((id) => state.users[id]?.name)
          .filter(Boolean)
          .join("・")
      : "";
  return (
    <span className="inline-flex items-center gap-1">
      <Icon width={13} height={13} aria-hidden />
      {m.scope === "people" && who ? `${who} だけ` : MEDIA_SCOPE_LABEL[m.scope]}
    </span>
  );
}

function ExpiryMeta({ m }: { m: SessionMedia }) {
  const e = expiryState(m, todayStr());
  if (e === "expired") return <span className="text-error">置き場所の期限切れ</span>;
  if (e === "soon") return <span className="text-error">{m.expiresAt} に消えます</span>;
  return null;
}

function ItemMenu({
  m,
  label,
  onEdit,
  onDelete,
}: {
  m: SessionMedia;
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      label={`${m.title || label} の操作`}
      items={[
        { label: "編集", icon: <IconPencil width={16} height={16} />, onSelect: onEdit },
        { label: "削除", icon: <IconTrash width={16} height={16} />, danger: true, onSelect: onDelete },
      ]}
    />
  );
}

interface ItemProps {
  m: SessionMedia;
  /** ログの発言（場面の見出しから目次を作る） */
  lines: readonly LogLine[];
  onReadWithLog?: () => void;
  state: State;
  viewer: MediaViewer;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

/* ---------- 再生できるもの（録画・録音・配信・リプレイ動画） ---------- */
function PlayableCard({ m, lines, onReadWithLog, state, viewer, canEdit, onEdit, onDelete }: ItemProps) {
  const def = MEDIA_KIND_MAP[m.kind];
  const KindIcon = KIND_ICON[m.kind];
  const parts = [
    ...(m.url ? [{ url: m.url, label: undefined as string | undefined }] : []),
    ...(m.parts ?? []),
  ];
  const [part, setPart] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [playingAt, setPlayingAt] = useState<number | null>(null);
  const hidden = shouldHideSpoiler(m, viewer) && !revealed;
  const current = parts[part];
  const link = current ? detectMediaLink(current.url) : null;
  // ニコニコはサムネイル、YouTube は題名と配信の開始時刻を引く（伏せていてもサムネイルはぼかして出すので引く）
  const preview = useMediaPreview(current?.url, link?.service === "niconico" || link?.service === "youtube");
  // サムネイルの読めなかったもの・小さいもの（古いニコニコなど）は URL ごとに覚える（パートを替えても持ち越さない）
  const [thumbIssues, setThumbIssues] = useState<Record<string, "failed" | "small">>({});
  const thumb = thumbnailCandidates(mediaThumbnail(current?.url) ?? preview?.thumbnail).find(
    (u) => thumbIssues[u] !== "failed",
  );
  const smallThumb = Boolean(thumb && thumbIssues[thumb] === "small");
  const markThumb = (u: string, issue: "failed" | "small") =>
    setThumbIssues((cur) => (cur[u] === issue ? cur : { ...cur, [u]: issue }));
  // 大きな再生面は、再生中か大きなサムネイルがあるときだけ。ほかは低い帯にして、空の 16:9 を出さない
  const wide = (playingAt !== null && Boolean(link?.embedUrl)) || Boolean(thumb && !smallThumb);
  // 目次は、書いたものがなければログの場面の見出しから（録画とログが時刻で合っているとき）
  const video = recordingVideos(m, () =>
    preview ? { startedAt: preview.startedAt, durationSec: preview.durationSec } : undefined,
  )[part];
  const chapters = video ? videoChapters(video, m.chapters, lines) : [];
  const partLabels = videoLabels(recordingVideos(m));
  const title = hidden
    ? `${def.label}（ネタバレを含みます）`
    : m.title || preview?.title || link?.label || def.label;
  const pov = m.povUserId ? state.users[m.povUserId]?.name : undefined;

  function play(at: number) {
    if (link?.embedUrl) setPlayingAt(at);
    else if (current) window.open(urlAt(current.url, at), "_blank", "noopener,noreferrer");
  }

  return (
    <article className="surface overflow-hidden" data-media-kind={m.kind}>
      {(link?.embedUrl || thumb) && (
        <div className={cx("relative overflow-hidden bg-base-200", wide && "aspect-video")}>
          {playingAt !== null && link?.embedUrl ? (
            <iframe
              key={`${part}-${playingAt}`}
              src={embedAt(link.embedUrl, playingAt)}
              aria-label={title}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className={cx(
                "group flex size-full items-center justify-center",
                wide ? "absolute inset-0" : "gap-4 px-4 py-6",
              )}
              onClick={() => (hidden ? setRevealed(true) : play(0))}
              aria-label={hidden ? "ネタバレを表示する" : `${title} を再生`}
            >
              {thumb ? (
                <img
                  key={thumb}
                  src={thumb}
                  alt=""
                  loading="lazy"
                  onError={() => markThumb(thumb, "failed")}
                  onLoad={(e) => {
                    const w = e.currentTarget.naturalWidth;
                    // 存在しない動画は YouTube が 120px 幅の灰色の画像を返すので、それもアイコンに戻す
                    if (link?.service === "youtube" && w <= 120) markThumb(thumb, "failed");
                    // 小さい画像は引き伸ばさず、そのままの大きさで出す
                    else if (w < 240) markThumb(thumb, "small");
                  }}
                  className={cx(
                    wide ? "absolute inset-0 size-full object-cover" : "h-auto max-h-28 w-auto rounded-md",
                    hidden && (wide ? "scale-110 blur-xl" : "blur-md"),
                  )}
                />
              ) : (
                <KindIcon width={40} height={40} className="shrink-0 text-ink2" aria-hidden />
              )}
              <span className="media-play relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold">
                {hidden ? (
                  "ネタバレを表示する"
                ) : (
                  <>
                    <IconPlayerPlay width={18} height={18} aria-hidden />
                    {parts.length > 1 ? `${partLabels[part]} を再生` : "再生"}
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      )}

      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <span className="media-kind-mark" aria-hidden>
            <KindIcon width={18} height={18} />
          </span>
          <div className="min-w-0 flex-1">
            {current && !hidden ? (
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="break-words text-base font-bold underline-offset-2 hover:underline"
                data-user-content
              >
                {title}
              </a>
            ) : (
              <span className="break-words text-base font-bold" data-user-content>
                {title}
              </span>
            )}
            <div className="meta mt-1 text-xs">
              <span>{def.label}</span>
              {link && link.service !== "web" && <span>{link.label}</span>}
              {!hidden && preview?.author && <span data-user-content>{preview.author}</span>}
              {pov && <span>{pov} の視点</span>}
              <ScopeMeta m={m} state={state} />
              <ExpiryMeta m={m} />
            </div>
          </div>
          {hidden && !(link?.embedUrl || thumb) && (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRevealed(true)}>
              表示する
            </button>
          )}
          {canEdit && <ItemMenu m={m} label={def.label} onEdit={onEdit} onDelete={onDelete} />}
        </div>

        {!hidden && parts.length > 1 && (
          <div className="mt-3">
            <Seg
              ariaLabel="パート"
              size="sm"
              value={String(part)}
              options={parts.map((_, i) => ({ v: String(i), label: partLabels[i] ?? `Part${i + 1}` }))}
              onChange={(v) => {
                setPart(Number(v));
                setPlayingAt(null);
              }}
            />
          </div>
        )}

        {!hidden && onReadWithLog && (video?.startedAt !== undefined || canEdit) && (
          <button type="button" className="btn btn-sm mt-3" onClick={onReadWithLog}>
            <IconLayoutList width={16} height={16} aria-hidden />
            ログと並べて見る
          </button>
        )}

        {!hidden && chapters.length > 0 && (
          <ol className="mt-3 max-h-64 overflow-y-auto border-t border-base-300 pt-2" aria-label="目次">
            {chapters.map((c, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => play(c.at)}
                  className="row-interactive flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm"
                >
                  <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-primary">
                    {formatClock(c.at)}
                  </span>
                  <span className="min-w-0 flex-1" data-user-content>
                    {c.label}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {!hidden && (m.credits || m.note) && (
          <div className="mt-3 space-y-1 text-sm" data-user-content>
            {m.credits && <p className="text-xs text-ink2">{m.credits}</p>}
            {m.note && <p className="whitespace-pre-wrap leading-relaxed">{m.note}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------- それ以外（1 行の一覧） ----------
 * ふせったー・X は、書いた人と本文の頭（公開の部分）まで見せて、押すと元の投稿を開く。伏せている間は引かない。
 */
function LinkRow({ m, state, viewer, canEdit, onEdit, onDelete }: ItemProps) {
  const def = MEDIA_KIND_MAP[m.kind];
  const KindIcon = KIND_ICON[m.kind];
  const [revealed, setRevealed] = useState(false);
  const hidden = shouldHideSpoiler(m, viewer) && !revealed;
  const link = m.url ? detectMediaLink(m.url) : null;
  const preview = useMediaPreview(m.url, !hidden);
  const excerpt = hidden ? undefined : preview?.excerpt;
  // 題名が本文の 1 行目から作ったもの（追加のときに埋めたまま）なら、見出しは書いた人にして本文と重ねない
  const ownTitle = m.title && !titleRepeatsExcerpt(m.title, excerpt) ? m.title : "";
  const byline = !hidden && preview?.author ? preview.author : undefined;
  const headline = hidden
    ? `ネタバレを含む${def.label}`
    : ownTitle || (excerpt ? byline : undefined) || m.title || preview?.title || link?.label || def.label;
  const showByline = byline && headline !== byline;

  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5" data-media-kind={m.kind}>
      <span className="media-kind-mark" aria-hidden>
        <KindIcon width={18} height={18} />
      </span>
      <div className="min-w-0 flex-1">
        {m.url && !hidden ? (
          <a href={m.url} target="_blank" rel="noreferrer" className="group block" data-user-content>
            <span className="break-words text-sm font-bold underline-offset-2 group-hover:underline">
              {headline}
              <IconExternal width={13} height={13} className="ml-1 inline-block align-[-1px] text-ink2" />
            </span>
            {excerpt && (
              <span className="mt-1.5 line-clamp-3 whitespace-pre-line break-words border-l border-base-300 pl-3 text-xs leading-relaxed text-ink2">
                {excerpt}
              </span>
            )}
          </a>
        ) : (
          <span className={cx("break-words text-sm font-bold", hidden && "text-ink2")} data-user-content>
            {headline}
          </span>
        )}
        <div className="meta mt-0.5 text-xs">
          {!hidden && <span>{def.label}</span>}
          {link && link.service !== "web" && <span>{link.label}</span>}
          {showByline && <span data-user-content>{byline}</span>}
          {!hidden && m.credits && <span data-user-content>{m.credits}</span>}
          <ScopeMeta m={m} state={state} />
          <ExpiryMeta m={m} />
        </div>
        {!hidden && m.note && (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed" data-user-content>
            {m.note}
          </p>
        )}
      </div>
      {hidden && (
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRevealed(true)}>
          表示する
        </button>
      )}
      {canEdit && <ItemMenu m={m} label={def.label} onEdit={onEdit} onDelete={onDelete} />}
    </li>
  );
}

/* ---------- 追加・編集 ----------
 * 流れ: どこにあるものかを選ぶ → その置き場所の URL を貼る → 種類を URL から決め、題名も引ける所からは引く
 * → 見られる人・ネタバレ（録画などは了承）を決めて追加。選んだ置き場所と違う URL なら、合う置き場所に寄せる。
 * パート・目次・開始時刻・視点・メモなど、使う人の少ない欄は「詳しく」に畳む（値が入っていれば開いておく）。
 */
interface Draft {
  url: string;
  kind: MediaKind;
  kindTouched: boolean;
  title: string;
  titleTouched: boolean;
  scope: MediaScope;
  audience: string[];
  povUserId: string;
  spoiler: boolean;
  spoilerTouched: boolean;
  parts: string;
  chapters: string;
  /** 録画を始めた時刻（日付は遊んだ時間帯から決める） */
  startTime: string;
  expiresAt: string;
  credits: string;
  note: string;
  consent: boolean;
}

/** 録画の開始時刻の書き方。秒まで合わせてあれば秒も出す（書き直さなければ、保存しても秒を落とさない） */
function startClock(epoch: number | undefined): string {
  if (epoch === undefined) return "";
  const d = new Date((epoch + 9 * 3600) * 1000).toISOString();
  return d.slice(17, 19) === "00" ? d.slice(11, 16) : d.slice(11, 19);
}

function toDraft(m: SessionMedia | null): Draft {
  return {
    url: m?.url ?? "",
    kind: m?.kind ?? "recording",
    kindTouched: Boolean(m),
    title: m?.title ?? "",
    titleTouched: Boolean(m?.title),
    scope: m?.scope ?? "members",
    audience: m?.audience ?? [],
    povUserId: m?.povUserId ?? "",
    spoiler: m?.spoiler ?? defaultSpoiler(m?.kind ?? "recording"),
    spoilerTouched: Boolean(m),
    parts: (m?.parts ?? []).map((p) => (p.label ? `${p.label} ${p.url}` : p.url)).join("\n"),
    chapters: formatChapters(m?.chapters),
    startTime: startClock(m?.startedAt),
    expiresAt: m?.expiresAt ?? "",
    credits: m?.credits ?? "",
    note: m?.note ?? "",
    consent: m?.consent ?? false,
  };
}

/** 種類を変える。ネタバレを自分で選んでいなければ、種類に合う既定（卓報告は含まない）にそろえる */
function withKind(d: Draft, kind: MediaKind, touched: boolean): Draft {
  return {
    ...d,
    kind,
    kindTouched: touched || d.kindTouched,
    ...(d.spoilerTouched ? {} : { spoiler: defaultSpoiler(kind) }),
  };
}

/** 値の入っている欄（種類を変えても消さずに見せる・「詳しく」を開いておく） */
function filledFields(d: Draft): MediaField[] {
  const has: Record<MediaField, boolean> = {
    expiresAt: Boolean(d.expiresAt),
    credits: Boolean(d.credits.trim()),
    parts: Boolean(d.parts.trim()),
    chapters: Boolean(d.chapters.trim()),
    startedAt: Boolean(d.startTime),
    pov: Boolean(d.povUserId),
    note: Boolean(d.note.trim()),
  };
  return (Object.keys(has) as MediaField[]).filter((k) => has[k]);
}

const FIELD_LABEL: Record<MediaField, string> = {
  expiresAt: "置き場所の期限",
  credits: "クレジット",
  parts: "パート",
  chapters: "目次",
  startedAt: "開始時刻",
  pov: "視点",
  note: "メモ",
};

function parseParts(text: string): { url: string; label?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s*(https?:\/\/\S+)$/);
      if (!m) return null;
      return m[1] ? { url: m[2]!, label: m[1] } : { url: m[2]! };
    })
    .filter((p): p is { url: string; label?: string } => p !== null);
}

/** 追加の最初の段。どこにあるものかを選ぶ */
function SourcePicker({
  last,
  onPick,
}: {
  /** 選び直しに戻ったとき、前に選んだもの（そこにフォーカスを戻す） */
  last: MediaSourceId | null;
  onPick: (id: MediaSourceId) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="どこにあるもの">
      {MEDIA_SOURCES.map((s) => {
        const SourceIcon = SOURCE_ICON[s.id];
        return (
          <li key={s.id} className="flex">
            <button
              type="button"
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- 選び直しに戻ったとき、選んでいた所から続けられるように
              autoFocus={s.id === last}
              onClick={() => onPick(s.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-base-300 px-3 py-2.5 text-left transition-colors hover:bg-base-200/60"
            >
              <span className="media-kind-mark" aria-hidden>
                <SourceIcon width={18} height={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{s.label}</span>
                <span className="block text-xs text-ink2">{s.about}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MediaEditor({
  log,
  state,
  initial,
  onSave,
  onClose,
}: {
  log: Log;
  state: State;
  initial: SessionMedia | null;
  onSave: (m: SessionMedia) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [picked, setPicked] = useState<MediaSourceId | null>(null);
  const [lastPicked, setLastPicked] = useState<MediaSourceId | null>(null);
  const [urlBlurred, setUrlBlurred] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const url = normalizeMediaUrl(d.url);
  const detected = url ? detectMediaLink(url) : null;
  const def = MEDIA_KIND_MAP[d.kind];
  const people = participantIds(log).filter((id) => state.users[id]);
  // 置き場所は、選んだものを貼られた URL で正したもの。編集では選ばせず URL から決める
  const choosing = !initial && !picked;
  const sourceId = resolveMediaSource(picked ?? "other", detected).source;
  const source = MEDIA_SOURCE_MAP[sourceId];
  const SourceIcon = SOURCE_ICON[sourceId];
  const withoutUrl = picked === "none";
  // URL が読めたら（または URL のないものと決めたら）残りを出す。編集は最初から全部
  const ready = Boolean(initial) || Boolean(url) || withoutUrl;
  const filled = filledFields(d);
  const fields = mediaEditorFields(d.kind, detected?.service ?? null, filled);
  const [moreOpen, setMoreOpen] = useState(() => fields.more.some((f) => filled.includes(f)));
  const consentNeeded = needsConsentCheck(d.kind, d.scope);

  // 題名を引ける置き場所（YouTube・ニコニコ・ふせったー・X）なら引いて入れる。利用者が書いた題名は上書きしない
  const preview = useMediaPreview(url);
  // 書いていなければ、引けた題名を入れておく（書いたものは上書きしない）
  // 動画の題名は書いていなければ入れておく。ポスト・ふせったーの本文は題名ではないので、入れずに見本として出すだけ
  const titleIsPost = preview?.service === "x" || preview?.service === "fusetter";
  const title = d.titleTouched || titleIsPost ? d.title : (preview?.title ?? d.title);

  function pick(id: MediaSourceId) {
    setPicked(id);
    setLastPicked(id);
    setD((cur) => withKind(cur, MEDIA_SOURCE_MAP[id].kind, false));
  }

  /** 選び直すときは、前の置き場所の URL とそこから引いた題名を持ち越さない */
  function repick() {
    setPicked(null);
    setError(null);
    setUrlBlurred(false);
    setD((cur) => ({ ...cur, url: "", ...(cur.titleTouched ? {} : { title: "" }) }));
  }

  function save() {
    if (d.url.trim() && !url) {
      setUrlBlurred(true);
      return setError(null);
    }
    if (!url && !title.trim())
      return setError(
        withoutUrl
          ? "タイトルを入れてください。"
          : ready
            ? "URL かタイトルを入れてください。"
            : "URL を入れてください。",
      );
    if (d.scope === "people" && d.audience.length === 0) return setError("共有する人を選んでください。");
    if (consentNeeded && !d.consent) return setError("共有するには同卓者全員の了承が要ります。");
    const startedAt = !def.timed
      ? undefined
      : initial?.startedAt !== undefined && d.startTime === startClock(initial.startedAt)
        ? initial.startedAt
        : (clockNearSittings(d.startTime, log.sittings) ?? undefined);
    if (def.timed && d.startTime.trim() && startedAt === undefined)
      return setError("録画を始めた時刻は 21:00 のように入れてください。");
    const chapters = def.timed ? parseChapters(d.chapters) : [];
    // ログと合わせたパートの開始時刻は、URL が同じなら残す
    const parts = def.timed
      ? parseParts(d.parts).map((p) => {
          const was = initial?.parts?.find((x) => x.url === p.url)?.startedAt;
          return was !== undefined ? { ...p, startedAt: was } : p;
        })
      : [];
    const m: SessionMedia = {
      id: initial?.id ?? uid("md_"),
      kind: d.kind,
      title: title.trim(),
      ...(url ? { url } : {}),
      ...(parts.length ? { parts } : {}),
      spoiler: d.spoiler,
      scope: d.scope,
      ...(d.scope === "people" ? { audience: d.audience } : {}),
      ...(d.povUserId ? { povUserId: d.povUserId } : {}),
      ...(d.credits.trim() ? { credits: d.credits.trim() } : {}),
      ...(d.note.trim() ? { note: d.note.trim() } : {}),
      ...(chapters.length ? { chapters } : {}),
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(d.expiresAt ? { expiresAt: d.expiresAt } : {}),
      ...(def.needsConsent ? { consent: d.consent } : {}),
      addedBy: initial?.addedBy ?? state.me,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onSave(m);
  }

  function renderField(f: MediaField) {
    switch (f) {
      case "expiresAt":
        return (
          <Field key={f} label={FIELD_LABEL[f]}>
            <DateInput
              value={d.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className="w-full"
            />
          </Field>
        );
      case "credits":
        return (
          <Field key={f} label={FIELD_LABEL[f]}>
            <input
              className="input input-bordered w-full"
              placeholder="描いた人・編集した人"
              value={d.credits}
              onChange={(e) => set("credits", e.target.value)}
            />
          </Field>
        );
      case "parts":
        return (
          <Field key={f} label="2 本目以降の URL">
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              placeholder="Part2 https://…"
              value={d.parts}
              onChange={(e) => set("parts", e.target.value)}
            />
          </Field>
        );
      case "chapters":
        return (
          <Field key={f} label={FIELD_LABEL[f]}>
            <textarea
              className="textarea textarea-bordered w-full font-mono text-sm"
              rows={3}
              placeholder={"0:00 導入\n1:23:45 戦闘"}
              value={d.chapters}
              onChange={(e) => set("chapters", e.target.value)}
            />
          </Field>
        );
      case "startedAt":
        // 発言に時刻のないログでは、録画の開始時刻を使う所がない
        if (log.sittings.length === 0) return null;
        return (
          <Field key={f} label="録画を始めた時刻">
            <input
              className="input input-bordered w-40 tabular-nums"
              inputMode="numeric"
              // 配信のアーカイブなら、配信を始めた時刻が分かっている（書かなければそれを使う）
              placeholder={startClock(preview?.startedAt) || "21:00"}
              value={d.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            />
          </Field>
        );
      case "pov":
        return (
          <Field key={f} label="誰の視点か">
            <Combobox
              ariaLabel="誰の視点か"
              value={d.povUserId}
              options={[
                { value: "", label: "指定しない" },
                ...people.map((id) => ({ value: id, label: state.users[id]!.name })),
              ]}
              onChange={(v) => set("povUserId", v)}
              className="w-full"
            />
          </Field>
        );
      case "note":
        return (
          <Field key={f} label={FIELD_LABEL[f]}>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={2}
              value={d.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>
        );
    }
  }

  return (
    <Modal
      title={initial ? "関連するものを編集" : "関連するものを追加"}
      onClose={onClose}
      wide
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          {!choosing && (
            <button type="button" className="btn btn-primary" onClick={save}>
              {initial ? "保存" : "追加"}
            </button>
          )}
        </>
      }
    >
      {choosing && <SourcePicker last={lastPicked} onPick={pick} />}
      {!initial && picked && (
        <div className="mb-4 flex items-center gap-3">
          <span className="media-kind-mark" aria-hidden>
            <SourceIcon width={18} height={18} />
          </span>
          <p className="min-w-0 flex-1 text-sm font-bold" aria-live="polite">
            {detected && detected.service !== "web" ? detected.label : source.label}
          </p>
          <button type="button" className="btn btn-sm btn-quiet" onClick={repick}>
            選び直す
          </button>
        </div>
      )}
      {!choosing && !withoutUrl && (
        <>
          <Field label={source.urlLabel} noMargin>
            <input
              className="input input-bordered w-full"
              inputMode="url"
              placeholder={source.urlExample}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- 置き場所を選んだ直後に貼れるように
              autoFocus={!initial}
              value={d.url}
              onBlur={() => setUrlBlurred(true)}
              onChange={(e) => {
                const raw = e.target.value;
                const hit = normalizeMediaUrl(raw);
                const link = hit ? detectMediaLink(hit) : null;
                setError(null);
                setD((cur) => ({
                  ...(cur.kindTouched
                    ? cur
                    : withKind(cur, resolveMediaSource(picked ?? "other", link).kind, false)),
                  url: raw,
                }));
              }}
            />
          </Field>
          <FieldError text={urlBlurred && d.url.trim() && !url ? "URL として読めません。" : null} />
        </>
      )}

      {ready && (
        <div className="motion-enter">
          <div className="grid gap-x-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field label="種類">
              <Select
                value={d.kind}
                options={KIND_OPTIONS}
                onChange={(kind) => setD((cur) => withKind(cur, kind, true))}
                className="w-full"
              />
            </Field>
            <Field label="タイトル">
              <input
                className="input input-bordered w-full"
                placeholder={
                  (titleIsPost ? preview?.title : undefined) ??
                  (detected?.label && detected.service !== "web" ? detected.label : def.label)
                }
                value={title}
                onChange={(e) => setD((cur) => ({ ...cur, title: e.target.value, titleTouched: true }))}
              />
            </Field>
          </div>

          <div className="grid gap-x-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field label="共有範囲">
              <Select
                value={d.scope}
                options={SCOPE_OPTIONS}
                onChange={(v) => set("scope", v)}
                className="w-full"
              />
            </Field>
            <Field label="ネタバレ" group>
              <div className="flex">
                <Seg
                  ariaLabel="ネタバレ"
                  value={d.spoiler ? "yes" : "no"}
                  options={[
                    { v: "yes", label: "含む" },
                    { v: "no", label: "含まない" },
                  ]}
                  onChange={(v) => setD((cur) => ({ ...cur, spoiler: v === "yes", spoilerTouched: true }))}
                />
              </div>
            </Field>
          </div>
          {d.scope === "people" && (
            <fieldset className="mt-3">
              <legend className="sr-only">共有範囲を選ぶ</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {people.map((id) => (
                  <label key={id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={d.audience.includes(id)}
                      onChange={(e) =>
                        set(
                          "audience",
                          e.target.checked ? [...d.audience, id] : d.audience.filter((x) => x !== id),
                        )
                      }
                    />
                    {state.users[id]!.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {consentNeeded && (
            <label className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed">
              <input
                type="checkbox"
                className="checkbox checkbox-sm mt-0.5"
                checked={d.consent}
                onChange={(e) => set("consent", e.target.checked)}
              />
              同卓者全員から、記録と共有の了承を得ています。
            </label>
          )}

          {fields.main.map(renderField)}

          <details
            open={moreOpen}
            onToggle={(e) => setMoreOpen(e.currentTarget.open)}
            className="group mt-5 border-t border-base-300 pt-4"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink2 hover:text-base-content">
              <span className="group-open:hidden">
                ＋ {fields.more.map((f) => FIELD_LABEL[f]).join("・")}
              </span>
              <span className="hidden group-open:inline">詳しい設定</span>
            </summary>
            {fields.more.map(renderField)}
          </details>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-error">
          {error}
        </p>
      )}
    </Modal>
  );
}

/* ---------- セクション ---------- */
export function SessionMediaSection({
  log,
  state,
  viewer,
  editable,
  onChange,
  className,
  hidePlayable,
  onReadWithLog,
}: {
  className?: string;
  log: Log;
  state: State;
  viewer: MediaViewer;
  /** 追加・編集できるか（自分の記録として持っているとき） */
  editable: boolean;
  onChange?: (media: SessionMedia[]) => void;
  /** 再生できるものを出さない（同じページでログの横に再生面を置くとき） */
  hidePlayable?: boolean;
  /** ログと並べて読む画面へ（ログのあるセッション詳細） */
  onReadWithLog?: () => void;
}) {
  const [editing, setEditing] = useState<SessionMedia | null | "new">(null);
  const items = useMemo(
    () =>
      visibleMedia(log.media, viewer).filter(
        (m) => !(hidePlayable && MEDIA_KIND_MAP[m.kind].timed && recordingVideos(m).length > 0),
      ),
    [log.media, viewer, hidePlayable],
  );
  const lines = useMemo(() => log.channels.flatMap((c) => c.msgs), [log.channels]);
  if (!editable && items.length === 0) return null;
  const all = log.media ?? [];
  const canEditItem = (m: SessionMedia) => editable && (m.addedBy === state.me || log.ownerId === state.me);
  const playable = items.filter((m) => MEDIA_KIND_MAP[m.kind].timed);
  const others = items.filter((m) => !MEDIA_KIND_MAP[m.kind].timed);
  const itemProps = (m: SessionMedia): ItemProps => ({
    m,
    lines,
    onReadWithLog,
    state,
    viewer,
    canEdit: canEditItem(m),
    onEdit: () => setEditing(m),
    onDelete: () => onChange?.(all.filter((x) => x.id !== m.id)),
  });

  return (
    <section aria-labelledby={`media-${log.id}`} className={className}>
      <SectionTitle
        right={
          editable &&
          items.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing("new")}>
              <IconPlus width={16} height={16} /> 追加
            </button>
          )
        }
      >
        <span id={`media-${log.id}`}>関連するもの</span>
      </SectionTitle>
      {items.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="media-empty flex w-full items-center gap-3 rounded-box px-5 py-4 text-left"
        >
          <span className="media-kind-mark" aria-hidden>
            <IconPlus width={18} height={18} />
          </span>
          <span className="min-w-0 text-sm font-bold">録画・卓報告・感想・イラストを紐付ける</span>
        </button>
      ) : (
        <div className="space-y-4">
          {playable.map((m) => (
            <PlayableCard key={m.id} {...itemProps(m)} />
          ))}
          {others.length > 0 && (
            <ul className="surface list">
              {others.map((m) => (
                <LinkRow key={m.id} {...itemProps(m)} />
              ))}
            </ul>
          )}
        </div>
      )}
      {editing && (
        <MediaEditor
          log={log}
          state={state}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(m) => {
            const exists = all.some((x) => x.id === m.id);
            onChange?.(exists ? all.map((x) => (x.id === m.id ? m : x)) : [...all, m]);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
