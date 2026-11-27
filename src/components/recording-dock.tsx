/**
 * ログと録画を並べて読む。計算の決まりは src/lib/recording-sync.ts。
 *
 * - デスクトップはログの右に再生面と目次を置き、スクロールしても付いてくる。モバイルはログの上に置き、再生中の再生面は
 *   画面の右下に小さく浮かせて、ログを読みながら見られるようにする
 * - 録画に映っている発言は、時刻を押すとそこから再生する。再生中は、いまの発言をログで示して追う（手でスクロールしたら
 *   追うのをやめ、「いまの発言へ」で戻る）
 * - 目次は、書いた目次がなければログの場面の見出しから作る
 * - 開始時刻が分からない録画は、録画を足した人が 1 か所だけ合わせる（発言を選んで「この発言は録画の 1:23:45」）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { IconPlayerPlay, IconVideo, IconX } from "./icons";
import { Field, FieldError, Modal, Seg, Select, SplitLayout, cx } from "./ui";
import { RecordingSyncContext, type RecordingSync } from "./timeline";
import { loadPreview } from "./media";
import { previewRequestUrl } from "../lib/media-preview";
import {
  MEDIA_KIND_MAP,
  detectMediaLink,
  formatClock,
  mediaThumbnail,
  parseClock,
  playerSrc,
  urlAt,
  visibleMedia,
  type MediaViewer,
  type SessionMedia,
} from "../lib/session-media";
import {
  anchorStart,
  currentChapterIndex,
  offsetIn,
  positionAt,
  readPlayerMessage,
  recordingVideos,
  videoChapters,
  videoLabels,
  withVideoStart,
  type LogLine,
  type PlayerService,
  type RecordingVideo,
  type VideoTiming,
} from "../lib/recording-sync";
import { jstTime } from "../lib/format";
import type { Log, Msg, State } from "../types";

const keyOf = (v: Pick<RecordingVideo, "mediaId" | "part">) => `${v.mediaId}:${v.part}`;

/** 動画ごとの配信の開始時刻・長さ（サーバーの /api/media-preview から。引けるのは YouTube・ニコニコ） */
function useVideoTimings(urls: readonly string[]): Record<string, VideoTiming> {
  const [got, setGot] = useState<Record<string, VideoTiming>>({});
  const key = urls.join("\n");
  useEffect(() => {
    let alive = true;
    for (const url of key ? key.split("\n") : []) {
      const path = previewRequestUrl(url);
      if (!path) continue;
      void loadPreview(path).then((p) => {
        if (!alive || !p || (p.startedAt === undefined && p.durationSec === undefined)) return;
        setGot((cur) => ({
          ...cur,
          [url]: {
            ...(p.startedAt !== undefined ? { startedAt: p.startedAt } : {}),
            ...(p.durationSec !== undefined ? { durationSec: p.durationSec } : {}),
          },
        }));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return got;
}

function playerServiceOf(url: string): PlayerService | null {
  const s = detectMediaLink(url)?.service;
  return s === "youtube" || s === "niconico" || s === "twitch" ? s : null;
}

const PLAYER_ORIGIN: Record<PlayerService, string> = {
  youtube: "https://www.youtube-nocookie.com",
  niconico: "https://embed.nicovideo.jp",
  twitch: "https://player.twitch.tv",
};

interface PlayerControl {
  /** 読み込み済みの再生面の位置を動かす。動かせない（Twitch など）なら false */
  seek: (sec: number) => boolean;
}

/** 埋め込みの再生面。YouTube・ニコニコは再生位置を受け取り、位置を動かせる */
function Player({
  video,
  start,
  title,
  onTime,
  controlRef,
}: {
  video: RecordingVideo;
  start: number;
  title: string;
  onTime: (sec: number) => void;
  controlRef: MutableRefObject<PlayerControl | null>;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const service = playerServiceOf(video.url);
  const embed = detectMediaLink(video.url)?.embedUrl;
  const heard = useRef(false);
  const [src] = useState(() =>
    embed ? playerSrc(embed, start, { origin: window.location.origin, host: window.location.hostname }) : "",
  );

  const post = useCallback(
    (msg: object) => {
      if (!service) return;
      ref.current?.contentWindow?.postMessage(
        service === "youtube" ? JSON.stringify({ ...msg, id: 1, channel: "widget" }) : msg,
        PLAYER_ORIGIN[service],
      );
    },
    [service],
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!service || e.source !== ref.current?.contentWindow) return;
      const r = readPlayerMessage(service, e.origin, e.data);
      if (!r) return;
      heard.current = true;
      if (r.currentTime !== undefined) onTime(r.currentTime);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [service, onTime]);

  useEffect(() => {
    controlRef.current = {
      seek: (sec) => {
        if (!heard.current) return false;
        if (service === "youtube") {
          post({ event: "command", func: "seekTo", args: [sec, true] });
          post({ event: "command", func: "playVideo", args: [] });
          return true;
        }
        if (service === "niconico") {
          post({
            eventName: "seek",
            data: { time: Math.round(sec * 1000) },
            playerId: "1",
            sourceConnectorType: 1,
          });
          post({ eventName: "play", playerId: "1", sourceConnectorType: 1 });
          return true;
        }
        return false;
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, post, service]);

  // YouTube は「聞いている」と伝えるまで位置を送ってこない。届くまで何度か伝える
  function onLoad() {
    if (service !== "youtube") return;
    let tries = 0;
    const tick = () => {
      if (heard.current || tries++ > 10 || !ref.current) return;
      post({ event: "listening" });
      window.setTimeout(tick, 1000);
    };
    tick();
  }

  return (
    <iframe
      ref={ref}
      src={src}
      aria-label={title}
      onLoad={onLoad}
      className="absolute inset-0 size-full"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
    />
  );
}

/** 「この発言は録画の何分何秒か」を 1 か所だけ入れてもらう */
function AnchorModal({
  msg,
  initial,
  onSave,
  onClose,
}: {
  msg: Msg;
  initial: string;
  onSave: (sec: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const text = msg.type === "roll" ? (msg.roll?.cmd ?? "") : (msg.text ?? "");
  function save() {
    const sec = parseClock(value);
    if (sec === undefined) return setError("1:23:45 のように入れてください。");
    onSave(sec);
  }
  return (
    <Modal
      title="録画を合わせる"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            合わせる
          </button>
        </>
      }
    >
      <figure className="mb-4 border-l border-base-300 pl-3 text-sm">
        <figcaption className="meta text-xs">
          <span data-user-content className="font-bold text-base-content">
            {msg.sp}
          </span>
          <span className="tabular-nums">{jstTime(msg.ts)}</span>
        </figcaption>
        <p data-user-content className="mt-1 line-clamp-3 whitespace-pre-wrap leading-relaxed">
          {text}
        </p>
      </figure>
      <Field label="この発言の録画での位置" noMargin>
        <input
          className="input input-bordered w-40 font-mono tabular-nums"
          inputMode="numeric"
          placeholder="1:23:45"
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- 開いてすぐ入れられるように
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
      </Field>
      <FieldError text={error} />
    </Modal>
  );
}

interface PlayRequest {
  key: string;
  at: number;
  nonce: number;
}

function Dock({
  media,
  videos,
  lines,
  selected,
  onSelect,
  request,
  onPlay,
  onStop,
  canAnchor,
  anchoring,
  onAnchoring,
  rootRef,
  timeRef,
  state,
}: {
  media: SessionMedia[];
  videos: RecordingVideo[];
  lines: LogLine[];
  selected: RecordingVideo;
  onSelect: (key: string) => void;
  request: PlayRequest | null;
  onPlay: (v: RecordingVideo, at: number) => void;
  onStop: () => void;
  canAnchor: boolean;
  anchoring: boolean;
  onAnchoring: (on: boolean) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  /** 再生中の位置（合わせるときの初めの値に使う） */
  timeRef: MutableRefObject<{ key: string; sec: number } | null>;
  state: State;
}) {
  const m = media.find((x) => x.id === selected.mediaId)!;
  const parts = videos.filter((v) => v.mediaId === m.id);
  const partLabels = videoLabels(parts);
  const playing = request && request.key === keyOf(selected) ? request : null;
  const controlRef = useRef<PlayerControl | null>(null);
  const [mount, setMount] = useState<PlayRequest | null>(null);
  const [time, setTime] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const synced = selected.startedAt !== undefined;
  const chapters = useMemo(() => videoChapters(selected, m.chapters, lines), [selected, m.chapters, lines]);
  const title = m.title || MEDIA_KIND_MAP[m.kind].label;
  const embed = detectMediaLink(selected.url)?.embedUrl;
  const thumb = mediaThumbnail(selected.url);
  const [thumbBad, setThumbBad] = useState<string | null>(null);

  // 再生の求め: 読み込み済みなら位置だけ動かし、だめなら開き直す
  useEffect(() => {
    if (!playing) {
      setMount(null);
      setTime(null);
      timeRef.current = null;
      return;
    }
    setFollow(true);
    if (mount && mount.key === playing.key && controlRef.current?.seek(playing.at)) {
      setTime(playing.at);
      return;
    }
    setMount(playing);
    setTime(playing.at);
    // mount は求めごとに 1 回だけ見る
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [playing?.nonce, playing?.key]);

  // いまの発言を示して追う
  const nowTs = synced && time !== null && playing ? selected.startedAt! + time : null;
  const nowEl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (nowTs === null) {
      nowEl.current?.removeAttribute("data-now");
      nowEl.current = null;
      return;
    }
    window.dispatchEvent(new CustomEvent("takufu:reveal-ts", { detail: nowTs }));
    const rows = rootRef.current?.querySelectorAll<HTMLElement>("[data-ts]") ?? [];
    let hit: HTMLElement | null = null;
    for (const el of rows) {
      if (Number(el.dataset.ts) <= nowTs) hit = el;
      else break;
    }
    if (hit === nowEl.current) return;
    nowEl.current?.removeAttribute("data-now");
    nowEl.current = hit;
    if (!hit) return;
    hit.setAttribute("data-now", "");
    if (follow) hit.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nowTs, follow, rootRef]);

  // 「いまの発言へ」で追うのに戻ったら、いまの発言まで送る
  useEffect(() => {
    if (follow) nowEl.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [follow]);

  // 手でスクロールしたら追うのをやめる
  useEffect(() => {
    if (!playing || !follow) return;
    const stop = () => setFollow(false);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
  }, [playing, follow]);

  const selectedKey = keyOf(selected);
  const onTime = useCallback(
    (sec: number) => {
      setTime(sec);
      timeRef.current = { key: selectedKey, sec };
    },
    [timeRef, selectedKey],
  );
  const chapterIdx = time !== null && playing ? currentChapterIndex(chapters, time) : -1;

  function jumpChapter(at: number, msgId?: string) {
    onPlay(selected, at);
    if (msgId) {
      const ts = lines.find((l) => l.id === msgId)?.ts;
      if (ts) window.dispatchEvent(new CustomEvent("takufu:reveal-ts", { detail: ts }));
      window.requestAnimationFrame(() =>
        rootRef.current
          ?.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
    }
  }

  const pov = m.povUserId ? state.users[m.povUserId]?.name : undefined;

  return (
    <section className="surface overflow-hidden" aria-label="録画" data-recording-dock>
      {embed || thumb ? (
        <div
          className={cx(
            mount
              ? "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-30 w-[min(64vw,20rem)] overflow-hidden rounded-lg border border-base-300 bg-black lg:static lg:w-auto lg:rounded-none lg:border-0"
              : // モバイルでは、再生するまで大きな面を取らない（ログを先に読めるように）
                "hidden lg:block",
          )}
          data-recording-player
        >
          <div className="relative aspect-video bg-base-200">
            {mount && embed ? (
              <>
                <Player
                  key={`${mount.key}-${mount.nonce}`}
                  video={selected}
                  start={mount.at}
                  title={title}
                  onTime={onTime}
                  controlRef={controlRef}
                />
                <button
                  type="button"
                  className="icon-btn absolute right-1 top-1 bg-base-100/90 lg:hidden"
                  aria-label="再生を閉じる"
                  onClick={onStop}
                >
                  <IconX width={16} height={16} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="group absolute inset-0 flex items-center justify-center"
                onClick={() => onPlay(selected, 0)}
                aria-label={`${title} を再生`}
              >
                {thumb && thumbBad !== thumb && (
                  <img
                    key={thumb}
                    src={thumb}
                    alt=""
                    loading="lazy"
                    onError={() => setThumbBad(thumb)}
                    // 存在しない動画は YouTube が 120px 幅の灰色の画像を返す
                    onLoad={(e) => e.currentTarget.naturalWidth <= 120 && setThumbBad(thumb)}
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                <span className="media-play relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold">
                  <IconPlayerPlay width={18} height={18} aria-hidden />
                  再生
                </span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className="space-y-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="media-kind-mark" aria-hidden>
            <IconVideo width={18} height={18} />
          </span>
          <div className="min-w-0 flex-1">
            {media.length > 1 ? (
              <Select
                size="sm"
                ariaLabel="録画を選ぶ"
                className="w-full"
                value={m.id}
                options={media.map((x) => ({
                  value: x.id,
                  label: x.title || MEDIA_KIND_MAP[x.kind].label,
                }))}
                onChange={(id) => onSelect(keyOf(videos.find((v) => v.mediaId === id)!))}
              />
            ) : (
              <p data-user-content className="break-words text-sm font-bold">
                {title}
              </p>
            )}
            {pov && <p className="mt-0.5 text-xs text-ink2">{pov} の視点</p>}
          </div>
          {embed && !mount && (
            <button
              type="button"
              className="btn btn-sm shrink-0 lg:hidden"
              onClick={() => onPlay(selected, 0)}
            >
              <IconPlayerPlay width={16} height={16} aria-hidden /> 再生
            </button>
          )}
          {!embed && (
            <a href={selected.url} target="_blank" rel="noreferrer" className="btn btn-sm shrink-0">
              <IconPlayerPlay width={16} height={16} aria-hidden /> 開く
            </a>
          )}
        </div>

        {(parts.length > 1 || (!anchoring && (canAnchor || (playing && !follow)))) && (
          <div className="flex flex-wrap items-center gap-2">
            {parts.length > 1 && (
              <Seg
                size="sm"
                ariaLabel="パート"
                value={keyOf(selected)}
                options={parts.map((p, i) => ({ v: keyOf(p), label: partLabels[i]! }))}
                onChange={(k) => onSelect(k)}
              />
            )}
            {!anchoring && (
              <div className="ml-auto flex items-center gap-2">
                {playing && !follow && (
                  <button type="button" className="btn btn-sm" onClick={() => setFollow(true)}>
                    いまの発言へ
                  </button>
                )}
                {canAnchor && (
                  <button
                    type="button"
                    className={cx("btn btn-sm", synced && "btn-quiet")}
                    onClick={() => onAnchoring(true)}
                  >
                    {synced ? "合わせ直す" : "ログと合わせる"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {anchoring && (
          <div className="flex items-center gap-2" aria-live="polite">
            <p className="min-w-0 flex-1 text-sm font-bold">合わせる発言を選んでいます</p>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => onAnchoring(false)}>
              やめる
            </button>
          </div>
        )}
      </div>

      {chapters.length > 0 && (
        <ol
          className="max-h-48 overflow-y-auto border-t border-base-300 px-2 py-2 lg:max-h-[min(24rem,40vh)]"
          aria-label="目次"
        >
          {chapters.map((c, i) => (
            <li key={`${c.at}-${i}`}>
              <button
                type="button"
                aria-current={i === chapterIdx ? "true" : undefined}
                onClick={() => jumpChapter(c.at, c.msgId)}
                className={cx(
                  "row-interactive flex w-full items-baseline gap-3 rounded-lg px-2 py-1.5 text-left text-sm",
                  i === chapterIdx && "bg-primary/10 font-bold",
                )}
              >
                <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-primary">
                  {formatClock(c.at)}
                </span>
                <span className="min-w-0 flex-1 break-words" data-user-content>
                  {c.label}
                </span>
                {c.ts !== undefined && (
                  <span className="shrink-0 text-xs tabular-nums text-ink3">{jstTime(c.ts)}</span>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * ログ（children）に録画を並べる。見てよい録画がなければ children をそのまま出す。
 * canEdit が真の録画は、ログの発言を選んで合わせられる（onMediaChange で保存する）。
 */
export function RecordingLogView({
  log,
  state,
  viewer,
  canEdit,
  onMediaChange,
  children,
}: {
  log: Log;
  state: State;
  viewer: MediaViewer;
  canEdit?: (m: SessionMedia) => boolean;
  onMediaChange?: (media: SessionMedia[]) => void;
  children: ReactNode;
}) {
  const media = useMemo(
    () =>
      visibleMedia(log.media, viewer).filter(
        (m) => MEDIA_KIND_MAP[m.kind].timed && recordingVideos(m).length > 0,
      ),
    [log.media, viewer],
  );
  const urls = useMemo(() => media.flatMap((m) => recordingVideos(m).map((v) => v.url)), [media]);
  const timings = useVideoTimings(urls);
  const videos = useMemo(
    () => media.flatMap((m) => recordingVideos(m, (url) => timings[url])),
    [media, timings],
  );
  const lines = useMemo<LogLine[]>(
    () =>
      log.channels
        .flatMap((c) => c.msgs)
        .filter((m) => m.ts > 0)
        .sort((a, b) => a.ts - b.ts),
    [log.channels],
  );
  const msgs = useMemo(
    () => new Map(log.channels.flatMap((c) => c.msgs.map((m) => [m.id, m]))),
    [log.channels],
  );

  const [selKey, setSelKey] = useState<string | null>(null);
  const [request, setRequest] = useState<PlayRequest | null>(null);
  const [anchoring, setAnchoring] = useState(false);
  const [anchorMsg, setAnchorMsg] = useState<{ msg: Msg; initial: string } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef<{ key: string; sec: number } | null>(null);
  const nonce = useRef(0);

  const selected =
    videos.find((v) => keyOf(v) === selKey) ?? videos.find((v) => v.startedAt !== undefined) ?? videos[0];

  const play = useCallback((v: RecordingVideo, at: number) => {
    const embed = detectMediaLink(v.url)?.embedUrl;
    setSelKey(keyOf(v));
    if (!embed) {
      window.open(urlAt(v.url, at), "_blank", "noopener,noreferrer");
      return;
    }
    nonce.current += 1;
    setRequest({ key: keyOf(v), at, nonce: nonce.current });
  }, []);

  // 時刻からの位置は、選んでいる録画を先に見る
  const pick = useCallback(
    (ts: number) => {
      if (!selected) return null;
      return (
        positionAt(
          videos.filter((v) => v.mediaId === selected.mediaId),
          ts,
        ) ?? positionAt(videos, ts)
      );
    },
    [videos, selected],
  );

  const sync = useMemo<RecordingSync>(
    () => ({
      clockAt: (ts) => {
        const p = pick(ts);
        return p ? formatClock(p.at) : null;
      },
      play: (ts) => {
        const p = pick(ts);
        if (p) play(p.video, p.at);
      },
      anchoring,
      anchor: (m) => {
        const msg = msgs.get(m.id) ?? m;
        // 再生中ならいまの位置、合わせてあればその発言のいまの位置を初めの値にする
        const playing = selected && timeRef.current?.key === keyOf(selected) ? timeRef.current.sec : null;
        const off = selected ? offsetIn(selected, msg.ts) : null;
        setAnchorMsg({
          msg,
          initial: playing !== null ? formatClock(playing) : off !== null ? formatClock(off) : "",
        });
      },
    }),
    [pick, play, anchoring, msgs, selected],
  );

  if (!selected) return <>{children}</>;
  const selMedia = media.find((m) => m.id === selected.mediaId)!;
  const canAnchor = Boolean(onMediaChange && canEdit?.(selMedia));
  return (
    <RecordingSyncContext.Provider value={sync}>
      <SplitLayout
        asideWidth="lg"
        stickyAside
        main={<div ref={rootRef}>{children}</div>}
        asideTop={
          <Dock
            media={media}
            videos={videos}
            lines={lines}
            selected={selected}
            onSelect={(k) => {
              setSelKey(k);
              setRequest(null);
            }}
            request={request}
            onPlay={play}
            onStop={() => setRequest(null)}
            canAnchor={canAnchor}
            anchoring={anchoring}
            onAnchoring={setAnchoring}
            rootRef={rootRef}
            timeRef={timeRef}
            state={state}
          />
        }
        aside={null}
      />
      {anchorMsg && (
        <AnchorModal
          msg={anchorMsg.msg}
          initial={anchorMsg.initial}
          onClose={() => setAnchorMsg(null)}
          onSave={(sec) => {
            const startedAt = anchorStart(anchorMsg.msg.ts, sec);
            onMediaChange?.(
              (log.media ?? []).map((x) =>
                x.id === selMedia.id ? withVideoStart(x, selected.part, startedAt) : x,
              ),
            );
            setAnchorMsg(null);
            setAnchoring(false);
          }}
        />
      )}
    </RecordingSyncContext.Provider>
  );
}
