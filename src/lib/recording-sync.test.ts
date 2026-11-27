import { describe, expect, it } from "vitest";
import {
  MAX_RECORDING_SECONDS,
  anchorStart,
  clockNearSittings,
  currentChapterIndex,
  currentLine,
  offsetIn,
  positionAt,
  readPlayerMessage,
  recordingVideos,
  timeAt,
  videoLabels,
  videoChapters,
  withVideoStart,
  type LogLine,
  type RecordingVideo,
} from "./recording-sync";
import type { SessionMedia } from "./session-media";

/** 日本時間の日時 → epoch 秒 */
const jst = (s: string) => Math.floor(Date.parse(`${s}+09:00`) / 1000);

const rec = (over: Partial<SessionMedia> = {}): SessionMedia => ({
  id: "md1",
  kind: "recording",
  title: "録画",
  url: "https://youtu.be/aaaaaaaaaaa",
  spoiler: false,
  scope: "members",
  addedBy: "u1",
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

const video = (over: Partial<RecordingVideo> = {}): RecordingVideo => ({
  mediaId: "md1",
  part: 0,
  url: "https://youtu.be/aaaaaaaaaaa",
  ...over,
});

describe("recordingVideos", () => {
  it("1 本目とパートを並べ、保存した開始時刻（合わせたもの）を配信の開始時刻より先に使う", () => {
    const m = rec({
      startedAt: 1000,
      parts: [
        { url: "https://youtu.be/bbbbbbbbbbb", label: "Part2" },
        { url: "https://youtu.be/ccccccccccc", startedAt: 9000 },
      ],
    });
    const timing = (url: string) =>
      url.includes("aaa")
        ? { startedAt: 1200, durationSec: 3600 }
        : url.includes("bbb")
          ? { startedAt: 5000 }
          : undefined;
    const vs = recordingVideos(m, timing);
    expect(vs.map((v) => [v.part, v.startedAt, v.durationSec, v.syncedBy, v.label])).toEqual([
      [0, 1000, 3600, "anchor", undefined],
      [1, 5000, undefined, "broadcast", "Part2"],
      [2, 9000, undefined, "anchor", undefined],
    ]);
  });

  it("URL のない録画はパートだけ、再生できないもの（卓報告）は空", () => {
    expect(recordingVideos(rec({ url: undefined, parts: [{ url: "https://youtu.be/x" }] }))).toHaveLength(1);
    expect(recordingVideos(rec({ kind: "report" }))).toEqual([]);
  });
});

describe("時刻と動画の位置の計算", () => {
  const v = video({ startedAt: jst("2026-11-20T21:00:00"), durationSec: 3 * 3600 });

  it("発言の時刻から動画の位置を、動画の位置から発言の時刻を出す（逆算で元に戻る）", () => {
    const ts = jst("2026-11-20T22:23:45");
    expect(offsetIn(v, ts)).toBe(3600 + 23 * 60 + 45);
    expect(timeAt(v, offsetIn(v, ts)!)).toBe(ts);
  });

  it("録画の前・長さの後・時刻のない発言は映っていない", () => {
    expect(offsetIn(v, jst("2026-11-20T20:59:59"))).toBeNull();
    expect(offsetIn(v, jst("2026-11-21T00:00:01"))).toBeNull();
    expect(offsetIn(v, 0)).toBeNull();
    expect(offsetIn(video(), jst("2026-11-20T22:00:00"))).toBeNull();
  });

  it("長さが分からなければ 16 時間までとみなす", () => {
    const open = video({ startedAt: 0 + 1_000_000 });
    expect(offsetIn(open, 1_000_000 + MAX_RECORDING_SECONDS)).toBe(MAX_RECORDING_SECONDS);
    expect(offsetIn(open, 1_000_000 + MAX_RECORDING_SECONDS + 1)).toBeNull();
  });

  it("日付をまたぐ配信（21:00 開始、翌 2:10 の発言）も引き算だけで決まる", () => {
    const night = video({ startedAt: jst("2026-11-20T21:00:00") });
    expect(offsetIn(night, jst("2026-11-21T02:10:00"))).toBe(5 * 3600 + 10 * 60);
  });

  it("タイムゾーンに依らない（UTC で書いた配信の開始と JST の発言が同じ瞬間なら 0 秒）", () => {
    const utc = Math.floor(Date.parse("2026-11-20T12:00:00Z") / 1000);
    expect(offsetIn(video({ startedAt: utc }), jst("2026-11-20T21:00:00"))).toBe(0);
  });
});

describe("positionAt（録画が複数・パートが複数）", () => {
  const night1 = jst("2026-11-20T21:00:00");
  const night2 = jst("2026-11-27T21:00:00");

  it("何夜かに分けて遊び、夜ごとに 1 本ずつ録画したとき、発言はその夜の録画に入る", () => {
    const vs = [
      video({ part: 0, startedAt: night1 - 300, durationSec: 4 * 3600 }),
      video({ part: 1, startedAt: night2 - 120, durationSec: 4 * 3600 }),
    ];
    expect(positionAt(vs, night1 + 600)).toMatchObject({ video: { part: 0 }, at: 900 });
    expect(positionAt(vs, night2 + 600)).toMatchObject({ video: { part: 1 }, at: 720 });
    // 2 つの夜の間（録画のない時間）はどれにも入らない
    expect(positionAt(vs, night1 + 5 * 3600)).toBeNull();
  });

  it("長さが分からないパートは、次のパートが始まったらそちらを選ぶ（休憩で録り直した録画）", () => {
    const vs = [video({ part: 0, startedAt: night1 }), video({ part: 1, startedAt: night1 + 7200 })];
    expect(positionAt(vs, night1 + 3600)).toMatchObject({ video: { part: 0 }, at: 3600 });
    expect(positionAt(vs, night1 + 7300)).toMatchObject({ video: { part: 1 }, at: 100 });
  });

  it("別の人の視点の録画（同じ時間帯）は、どちらの録画で見ても位置が出る", () => {
    const gm = video({ mediaId: "gm", startedAt: night1 });
    const pov = video({ mediaId: "pov", startedAt: night1 + 30 });
    expect(offsetIn(gm, night1 + 100)).toBe(100);
    expect(offsetIn(pov, night1 + 100)).toBe(70);
  });
});

describe("1 か所だけ合わせる・ずれの補正", () => {
  it("「この発言は動画の 1:23:45」から開始時刻が決まり、ほかの発言の位置も決まる", () => {
    const anchorTs = jst("2026-11-20T22:30:00");
    const start = anchorStart(anchorTs, 1 * 3600 + 23 * 60 + 45);
    expect(start).toBe(jst("2026-11-20T21:06:15"));
    const v = video({ startedAt: start });
    expect(offsetIn(v, anchorTs)).toBe(5025);
    expect(offsetIn(v, jst("2026-11-20T21:06:15"))).toBe(0);
  });

  it("ずれていたら、別の発言で合わせ直すと開始時刻ごと置き換わる", () => {
    // 最初は 21:00:00 の発言を 0:00 に合わせたが、実は動画では 0:03 だった
    const first = anchorStart(jst("2026-11-20T21:00:00"), 0);
    const fixed = anchorStart(jst("2026-11-20T22:00:00"), 3603);
    expect(fixed).toBe(first - 3);
    expect(offsetIn(video({ startedAt: fixed }), jst("2026-11-20T21:00:00"))).toBe(3);
  });

  it("合わせ直しは 1 本目・パートのどちらにも書き、消すこともできる", () => {
    const m = rec({ parts: [{ url: "https://youtu.be/b", label: "Part2" }] });
    const a = withVideoStart(m, 0, 500);
    expect(a.startedAt).toBe(500);
    const b = withVideoStart(a, 1, 900);
    expect(b.parts).toEqual([{ url: "https://youtu.be/b", label: "Part2", startedAt: 900 }]);
    expect(b.startedAt).toBe(500);
    const c = withVideoStart(b, 0, undefined);
    expect(c).not.toHaveProperty("startedAt");
    // URL のない録画は、パートが 0 本目
    const noMain = rec({ url: undefined, parts: [{ url: "https://youtu.be/b" }] });
    expect(withVideoStart(noMain, 0, 42).parts).toEqual([{ url: "https://youtu.be/b", startedAt: 42 }]);
  });
});

describe("clockNearSittings（時刻だけ書かれた録画の開始を日時にする）", () => {
  const sittings = [
    { start: jst("2026-11-20T21:10:00"), end: jst("2026-11-21T01:40:00") },
    { start: jst("2026-11-27T20:05:00"), end: jst("2026-11-27T23:30:00") },
  ];

  it("集まりの少し前の時刻は、その日", () => {
    expect(clockNearSittings("21:00", sittings)).toBe(jst("2026-11-20T21:00:00"));
    expect(clockNearSittings("20:00", sittings)).toBe(jst("2026-11-27T20:00:00"));
  });

  it("日付をまたいだ集まりの 0:30 は翌日、25:30 と書いても同じ", () => {
    expect(clockNearSittings("0:30", sittings)).toBe(jst("2026-11-21T00:30:00"));
    expect(clockNearSittings("24:30", sittings)).toBe(jst("2026-11-21T00:30:00"));
    expect(clockNearSittings("25:30", sittings)).toBe(jst("2026-11-21T01:30:00"));
  });

  it("秒まで書ける。読めない時刻・集まりがないときは null", () => {
    expect(clockNearSittings("21:00:30", sittings)).toBe(jst("2026-11-20T21:00:30"));
    expect(clockNearSittings("21:60", sittings)).toBeNull();
    expect(clockNearSittings("あとで", sittings)).toBeNull();
    expect(clockNearSittings("21:00", [])).toBeNull();
  });
});

describe("videoChapters（場面の見出しから目次）", () => {
  const start = jst("2026-11-20T21:00:00");
  const lines: LogLine[] = [
    { id: "a", ts: start + 120, type: "text", kind: "GM", text: "はじめます" },
    { id: "h1", ts: start + 600, type: "note", kind: "GM", text: "～昼1～" },
    { id: "s", ts: start + 650, type: "note", kind: "SYSTEM", text: "入室しました" },
    { id: "h2", ts: start + 3600, type: "note", kind: "GM", text: "～夜1～" },
    { id: "late", ts: start + 10 * 3600, type: "note", kind: "GM", text: "～翌日～" },
  ];

  it("見出しを動画の位置に直し、頭に見出しがなければ最初の発言を「はじめ」にする。ツールの知らせ・録画の外は入れない", () => {
    const v = video({ startedAt: start, durationSec: 2 * 3600 });
    expect(videoChapters(v, undefined, lines)).toEqual([
      { at: 120, label: "はじめ", msgId: "a", ts: start + 120 },
      { at: 600, label: "～昼1～", msgId: "h1", ts: start + 600 },
      { at: 3600, label: "～夜1～", msgId: "h2", ts: start + 3600 },
    ]);
  });

  it("利用者が書いた目次があればそちらを使い、そのパートのものだけ。合っていればログの時刻も付ける", () => {
    const v = video({ part: 1, startedAt: start });
    const manual = [
      { at: 0, label: "導入" },
      { at: 90, label: "戦闘", part: 2 },
    ];
    expect(videoChapters(v, manual, lines)).toEqual([{ at: 90, label: "戦闘", part: 2, ts: start + 90 }]);
    expect(videoChapters(video({ part: 1 }), manual, lines)).toEqual([{ at: 90, label: "戦闘", part: 2 }]);
  });

  it("合っていない動画には、見出しからの目次を作らない", () => {
    expect(videoChapters(video(), undefined, lines)).toEqual([]);
  });
});

describe("いまの行・いまの目次", () => {
  const lines = [{ ts: 10 }, { ts: 20 }, { ts: 20 }, { ts: 35 }];
  it("再生中の時刻以前で最後の発言", () => {
    expect(currentLine(lines, 5)).toBeNull();
    expect(currentLine(lines, 10)).toBe(lines[0]);
    expect(currentLine(lines, 25)).toBe(lines[2]);
    expect(currentLine(lines, 999)).toBe(lines[3]);
  });
  it("再生位置以前で最後の目次", () => {
    const ch = [{ at: 0 }, { at: 600 }, { at: 3600 }];
    expect(currentChapterIndex(ch, 599)).toBe(0);
    expect(currentChapterIndex(ch, 4000)).toBe(2);
    expect(currentChapterIndex([{ at: 60 }], 10)).toBe(-1);
  });
});

describe("readPlayerMessage（埋め込みの再生面の知らせ）", () => {
  it("YouTube の infoDelivery から再生位置を読む。よそのオリジンは読まない", () => {
    const msg = JSON.stringify({ event: "infoDelivery", info: { currentTime: 83.5, duration: 7200 } });
    expect(readPlayerMessage("youtube", "https://www.youtube-nocookie.com", msg)).toEqual({
      currentTime: 83.5,
      duration: 7200,
    });
    expect(readPlayerMessage("youtube", "https://evil.example", msg)).toBeNull();
    expect(readPlayerMessage("youtube", "https://www.youtube.com", "not json")).toBeNull();
    expect(readPlayerMessage("youtube", "https://www.youtube.com", '{"event":"onReady"}')).toBeNull();
  });

  it("ニコニコの playerMetadataChange はミリ秒", () => {
    const msg = {
      eventName: "playerMetadataChange",
      data: { playerMetadata: { currentTime: 61_000, duration: 3_600_000 } },
    };
    expect(readPlayerMessage("niconico", "https://embed.nicovideo.jp", msg)).toEqual({
      currentTime: 61,
      duration: 3600,
    });
    expect(readPlayerMessage("niconico", "https://www.youtube.com", msg)).toBeNull();
  });
});

describe("videoLabels（パートの呼び名）", () => {
  it("書いた名前、なければ録画した日（深夜 2 時は前の日の集まり）", () => {
    const vs = [
      video({ part: 0, startedAt: jst("2026-11-20T21:00:00") }),
      video({ part: 1, startedAt: jst("2026-11-28T02:00:00") }),
      video({ part: 2, startedAt: jst("2026-12-04T21:00:00"), label: "最終夜" }),
    ];
    expect(videoLabels(vs)).toEqual(["11/20", "11/27", "最終夜"]);
  });
  it("同じ日に何本もある・日が分からないなら Part 番号", () => {
    const night = jst("2026-11-20T21:00:00");
    expect(videoLabels([video({ startedAt: night }), video({ part: 1, startedAt: night + 7200 })])).toEqual([
      "Part1",
      "Part2",
    ]);
    expect(videoLabels([video(), video({ part: 1, startedAt: night })])).toEqual(["Part1", "Part2"]);
  });
});
