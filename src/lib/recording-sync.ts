/**
 * ログと録画を時刻で結ぶ決まり（LLM や推測は使わない。時刻の足し引きと、発言の照合だけ）。
 *
 * ログの発言には時刻（epoch 秒）がある。録画 1 本ごとに「動画の 0 秒が何時だったか」（開始時刻）が分かれば、
 *   動画の位置 = 発言の時刻 − 開始時刻
 *   発言の時刻 = 開始時刻 + 動画の位置
 * の引き算・足し算で、どの発言が動画のどこかが決まる。開始時刻の出所は次の順:
 *   1. 利用者が 1 か所だけ合わせたもの（「この発言は動画の 1:23:45」→ 開始時刻 = 発言の時刻 − 1:23:45）。保存する
 *   2. 配信のアーカイブなら、サービスが載せている配信の開始時刻（YouTube の startDate）。毎回引くので保存しなくてよい
 * 録画が何本あっても（パート・別の人の視点）、1 本ずつ開始時刻を持つので、何夜かに分けて遊んだセッションでも
 * 発言ごとに「どの録画の何秒目か」が 1 つに決まる。
 */
import type { MediaChapter, SessionMedia } from "./session-media";
import { MEDIA_KIND_MAP } from "./session-media";
import { sittingDay, type Sitting } from "./sittings";

/** 長さが分からない録画を、開始からどこまでとみなすか */
export const MAX_RECORDING_SECONDS = 16 * 3600;

/** 再生できる 1 本（SessionMedia の 1 本目かパート） */
export interface RecordingVideo {
  mediaId: string;
  /** 0 始まりのパート番号（1 本目が 0） */
  part: number;
  url: string;
  label?: string;
  /** 動画の 0 秒の時刻（epoch 秒）。分からなければ undefined */
  startedAt?: number;
  /** 長さ（秒）。分からなければ undefined */
  durationSec?: number;
  /** startedAt を利用者が合わせたか（保存されている）、配信の開始時刻から取ったか */
  syncedBy?: "anchor" | "broadcast";
}

/** サービスから引ける、動画ごとの時刻の手がかり（/api/media-preview の startedAt・durationSec） */
export interface VideoTiming {
  startedAt?: number;
  durationSec?: number;
}

/** 1 本の SessionMedia を、再生できる動画の並びにする。保存した開始時刻（合わせたもの）は配信の開始時刻より先 */
export function recordingVideos(
  m: SessionMedia,
  timing: (url: string) => VideoTiming | undefined = () => undefined,
): RecordingVideo[] {
  if (!MEDIA_KIND_MAP[m.kind].timed) return [];
  const list = [
    ...(m.url ? [{ url: m.url, label: undefined as string | undefined, startedAt: m.startedAt }] : []),
    ...(m.parts ?? []).map((p) => ({ url: p.url, label: p.label, startedAt: p.startedAt })),
  ];
  return list.map((v, part) => {
    const t = timing(v.url);
    const startedAt = v.startedAt ?? t?.startedAt;
    return {
      mediaId: m.id,
      part,
      url: v.url,
      ...(v.label ? { label: v.label } : {}),
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(t?.durationSec ? { durationSec: t.durationSec } : {}),
      ...(v.startedAt !== undefined
        ? { syncedBy: "anchor" as const }
        : t?.startedAt !== undefined
          ? { syncedBy: "broadcast" as const }
          : {}),
    };
  });
}

/**
 * パートの呼び名。書いた名前がなければ、録画した日（夜ごとに録ったもの）。日付が分からない・同じ日に何本もあるなら Part1・Part2
 */
export function videoLabels(videos: readonly RecordingVideo[]): string[] {
  const day = (v: RecordingVideo) => (v.startedAt !== undefined ? sittingDay(v.startedAt) : undefined);
  const days = videos.map(day);
  const byDate = days.every((d, i) => d !== undefined && days.indexOf(d) === i);
  return videos.map((v, i) => {
    if (v.label) return v.label;
    const d = days[i];
    if (!byDate || !d) return `Part${v.part + 1}`;
    const [, mm, dd] = d.split("-");
    return `${Number(mm)}/${Number(dd)}`;
  });
}

/** その動画が時刻 ts を映しているなら、動画の何秒目か。映していなければ null */
export function offsetIn(v: RecordingVideo, ts: number): number | null {
  if (v.startedAt === undefined || !(ts > 0)) return null;
  const off = ts - v.startedAt;
  return off >= 0 && off <= (v.durationSec ?? MAX_RECORDING_SECONDS) ? off : null;
}

/**
 * 発言の時刻 ts を映している動画とその位置。同じ録画のパートが重なって見えるとき（長さが分からないとき）は、
 * 後から始まったパートを選ぶ（前のパートはそこで終わったとみなす）。
 */
export function positionAt(
  videos: readonly RecordingVideo[],
  ts: number,
): { video: RecordingVideo; at: number } | null {
  let best: { video: RecordingVideo; at: number } | null = null;
  for (const v of videos) {
    const at = offsetIn(v, ts);
    if (at === null) continue;
    if (!best || at < best.at) best = { video: v, at };
  }
  return best;
}

/** 動画の位置 sec が、ログの何時か。開始時刻が分からなければ null */
export function timeAt(v: RecordingVideo, sec: number): number | null {
  return v.startedAt === undefined ? null : v.startedAt + Math.max(0, sec);
}

/**
 * 「この発言は動画の sec 秒目」から開始時刻を決める（1 か所だけ合わせる）。ずれていたら、別の発言でもう一度合わせれば
 * 開始時刻ごと置き換わる（ずれの補正も同じ操作）
 */
export function anchorStart(msgTs: number, videoSec: number): number {
  return Math.round(msgTs - videoSec);
}

/** SessionMedia の part 本目の開始時刻を変えたもの（undefined で消す）。他の値はそのまま */
export function withVideoStart(m: SessionMedia, part: number, startedAt: number | undefined): SessionMedia {
  if (part === 0 && m.url) {
    const { startedAt: _old, ...rest } = m;
    return startedAt === undefined ? rest : { ...rest, startedAt };
  }
  const idx = m.url ? part - 1 : part;
  const parts = (m.parts ?? []).map((p, i) => {
    if (i !== idx) return p;
    const { startedAt: _old, ...rest } = p;
    return startedAt === undefined ? rest : { ...rest, startedAt };
  });
  return { ...m, parts };
}

const JST = 9 * 3600;

/**
 * 時刻だけ（"21:00"・"0:30"・"25:30"）で書かれた録画の開始を、遊んだ時間帯（sittings）に照らして日時にする。
 * 日付を書かせない（P2）。候補は各集まりの開始日とその翌日のその時刻で、集まりの時間帯（少し前から）に最も近いものを取る。
 * これで「21:00〜26:00 の回の 0:30 開始」は翌日の 0:30 になる。2 つの集まりに当てはまれば、開始に近いほう。
 * 集まりがなければ null
 */
export function clockNearSittings(raw: string, sittings: readonly Sitting[]): number | null {
  const m = raw.trim().match(/^(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?$/);
  if (!m || sittings.length === 0) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  if (h > 47 || min > 59 || sec > 59) return null;
  const clock = h * 3600 + min * 60 + sec;
  let best: { ts: number; dist: number; near: number } | null = null;
  for (const s of sittings) {
    const dayStart = Math.floor((s.start + JST) / 86400) * 86400 - JST;
    for (const base of [dayStart - 86400, dayStart, dayStart + 86400]) {
      const ts = base + clock;
      // 録画は集まりの少し前から回し始めることがある
      const from = s.start - 3 * 3600;
      const dist = ts < from ? from - ts : ts > s.end ? ts - s.end : 0;
      // 時間帯に入る候補が 2 つあれば、集まりの開始に近いほう
      const near = Math.abs(ts - s.start);
      if (!best || dist < best.dist || (dist === best.dist && near < best.near)) best = { ts, dist, near };
    }
  }
  return best && best.dist <= 12 * 3600 ? best.ts : null;
}

/* ---------- 場面の見出しから目次を作る ---------- */

export interface LogLine {
  id: string;
  ts: number;
  text?: string | null;
  type: string;
  kind: string;
}

export interface SyncedChapter extends MediaChapter {
  /** ログのその見出しの発言 */
  msgId?: string;
  /** ログの時刻 */
  ts?: number;
}

/**
 * 動画の目次。利用者が書いた目次（概要欄の写し）があればそれを使い、なければログの場面の見出し（取り込みで
 * note にした発言。src/lib/scene-headings.ts）を、その動画の位置に直して並べる。
 * 動画の頭に見出しがなければ、そのパートの最初の発言を「はじめ」にする。
 */
export function videoChapters(
  v: RecordingVideo,
  manual: readonly MediaChapter[] | undefined,
  lines: readonly LogLine[],
): SyncedChapter[] {
  const own = (manual ?? []).filter((c) => (c.part ?? 1) === v.part + 1);
  if (own.length > 0) {
    return own.map((c) => {
      const ts = timeAt(v, c.at);
      return { ...c, ...(ts !== null ? { ts } : {}) };
    });
  }
  if (v.startedAt === undefined) return [];
  const inside = lines
    .filter((l) => offsetIn(v, l.ts) !== null)
    .slice()
    .sort((a, b) => a.ts - b.ts);
  const heads = inside.filter((l) => l.type === "note" && l.kind !== "SYSTEM" && l.text?.trim());
  if (heads.length === 0) return [];
  const out: SyncedChapter[] = heads.map((l) => ({
    at: offsetIn(v, l.ts)!,
    label: l.text!.trim(),
    msgId: l.id,
    ts: l.ts,
  }));
  const first = inside[0]!;
  if (first.id !== heads[0]!.id) {
    out.unshift({ at: offsetIn(v, first.ts)!, label: "はじめ", msgId: first.id, ts: first.ts });
  }
  return out;
}

/** 再生中の時刻 ts のとき、ログで「いまの行」になる発言（ts 以前で最後のもの）。lines は時刻順 */
export function currentLine<T extends { ts: number }>(lines: readonly T[], ts: number): T | null {
  let lo = 0;
  let hi = lines.length - 1;
  let hit: T | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.ts <= ts) {
      hit = lines[mid]!;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit;
}

/** 再生中の位置 at の目次（at 以前で最後のもの）の番号。なければ -1 */
export function currentChapterIndex(chapters: readonly { at: number }[], at: number): number {
  let idx = -1;
  chapters.forEach((c, i) => {
    if (c.at <= at && (idx < 0 || c.at >= chapters[idx]!.at)) idx = i;
  });
  return idx;
}

/* ---------- 埋め込みの再生面との受け渡し ---------- */

export type PlayerService = "youtube" | "niconico" | "twitch";

/** 埋め込みの再生面から届いた知らせを読む。再生位置（秒）が分かれば返す。よその知らせは null */
export function readPlayerMessage(
  service: PlayerService,
  origin: string,
  data: unknown,
): { currentTime?: number; duration?: number } | null {
  if (service === "youtube") {
    if (!/^https:\/\/www\.youtube(?:-nocookie)?\.com$/.test(origin)) return null;
    let o: unknown = data;
    if (typeof data === "string") {
      try {
        o = JSON.parse(data);
      } catch {
        return null;
      }
    }
    const info = (o as { event?: unknown; info?: unknown } | null)?.info;
    if (!info || typeof info !== "object") return null;
    const { currentTime, duration } = info as { currentTime?: unknown; duration?: unknown };
    const out: { currentTime?: number; duration?: number } = {};
    if (typeof currentTime === "number" && Number.isFinite(currentTime)) out.currentTime = currentTime;
    if (typeof duration === "number" && duration > 0) out.duration = duration;
    return out.currentTime !== undefined || out.duration !== undefined ? out : null;
  }
  if (service === "niconico") {
    if (origin !== "https://embed.nicovideo.jp") return null;
    const o = data as { eventName?: unknown; data?: unknown } | null;
    if (!o || typeof o !== "object" || o.eventName !== "playerMetadataChange") return null;
    const meta = (o.data as { playerMetadata?: unknown } | null)?.playerMetadata ?? o.data;
    const { currentTime, duration } = (meta ?? {}) as { currentTime?: unknown; duration?: unknown };
    const out: { currentTime?: number; duration?: number } = {};
    // ニコニコはミリ秒
    if (typeof currentTime === "number" && Number.isFinite(currentTime)) out.currentTime = currentTime / 1000;
    if (typeof duration === "number" && duration > 0) out.duration = duration / 1000;
    return out.currentTime !== undefined || out.duration !== undefined ? out : null;
  }
  return null;
}
