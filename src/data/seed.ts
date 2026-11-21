import type { State, User, Table, Character, Scenario, Log, Channel, Provider, TableEvent } from "../types";
import generated from "./generated.json";
import { jstTime, jstDate, sessionMinutes, fmtDur, uid } from "../lib/time";
import { DEMO_SHEETS } from "./demo-sheets";

/** generated.json の logs はオブジェクト（Record）なので正しく扱う */
const g = generated as unknown as {
  users: (User & { id: string })[];
  tables: Table[];
  scenarios: Scenario[];
  logs: Record<string, Log>;
  characters: Character[];
  events?: Record<string, TableEvent>;
};

export function seedState(): State {
  const users: Record<string, User> = {};
  g.users.forEach((u) => (users[u.id] = u));
  const tables: Record<string, Table> = {};
  g.tables.forEach((t) => (tables[t.id] = t));
  const scenarios: Record<string, Scenario> = {};
  g.scenarios.forEach((s) => (scenarios[s.id] = s));
  const characters: Record<string, Character> = {};
  Object.values(g.characters).forEach((c) => {
    /* 共有は既定でオフ。キャラシから取り込んだサンプルは、そのサイトの JSON から作る */
    const demo = DEMO_SHEETS[c.id];
    characters[c.id] = {
      ...c,
      share: { ...c.share, enabled: false, scope: "private" },
      ...(demo ? demo(c) : {}),
    };
  });
  const logs: Record<string, Log> = {};
  Object.values(g.logs).forEach(
    (l) => (logs[l.id] = { ...l, slug: (l as unknown as { slug?: string }).slug ?? uid("s") }),
  );
  // 関連するもの（録画・配信・卓報告・絵など）の見本。深淵の呼び声（GM: みかん）に付ける
  const s02 = logs.s02;
  if (s02) {
    s02.media = [
      {
        id: "md_s02_rec",
        kind: "recording",
        title: "第一夜 録画",
        url: "https://www.youtube.com/watch?v=takufuDemo1",
        parts: [{ url: "https://www.youtube.com/watch?v=takufuDemo2", label: "Part2（休憩後）" }],
        spoiler: true,
        scope: "members",
        startedAt: s02.t0,
        chapters: [
          { at: 0, label: "導入・自己紹介" },
          { at: 1520, label: "漁村に到着" },
          { at: 5400, label: "灯台の地下" },
          { at: 600, label: "クライマックス", part: 2 },
        ],
        consent: true,
        addedBy: "u_mikan",
        createdAt: "2026-09-27T10:00:00Z",
      },
      {
        id: "md_s02_hidden",
        kind: "recording",
        title: "HO2 秘匿パート",
        url: "https://drive.google.com/file/d/takufu-demo/view",
        spoiler: true,
        scope: "people",
        audience: ["u_sora"],
        povUserId: "u_sora",
        expiresAt: "2026-12-31",
        consent: true,
        addedBy: "u_mikan",
        createdAt: "2026-09-27T10:05:00Z",
      },
      {
        id: "md_s02_report",
        kind: "report",
        title: "卓報告",
        url: "https://x.com/takufu_demo/status/1",
        spoiler: false,
        scope: "public",
        addedBy: "u_mikan",
        createdAt: "2026-09-26T15:00:00Z",
      },
      {
        id: "md_s02_impression",
        kind: "impression",
        title: "ネタバレ感想（合言葉はシナリオ名）",
        url: "https://fusetter.com/tw/takufu-demo",
        spoiler: true,
        scope: "passed",
        addedBy: "u_mikan",
        createdAt: "2026-09-27T01:00:00Z",
      },
      {
        id: "md_s02_art",
        kind: "art",
        title: "エンドカード",
        url: "https://poipiku.com/0000000/0000000.html",
        credits: "絵: そら",
        spoiler: true,
        scope: "passed",
        addedBy: "u_mikan",
        createdAt: "2026-09-28T12:00:00Z",
      },
    ];
  }
  const events: Record<string, TableEvent> = {};
  if (g.events) {
    Object.values(g.events).forEach((e) => (events[e.id] = e));
  }
  return {
    me: "u_mikan",
    entered: false,
    prefs: { hideSelfOnShare: false, onboardingDone: true },
    users,
    tables,
    characters,
    scenarios,
    logs,
    events,
    editRequests: [],
  };
}

/** アップロードフローのサンプルログ（シークレットチャンネル付きの実データを再利用） */
const sampleSource = Object.values(g.logs).find((l) => l.id === "s06") ?? Object.values(g.logs)[0];
export const SAMPLE_LOG: Channel[] = JSON.parse(JSON.stringify(sampleSource.channels));
export const SAMPLE_SPEAKER_ICONS: Record<string, string> = JSON.parse(
  JSON.stringify(sampleSource.speakerIcons ?? {}),
);

function summarizeSample() {
  const all = SAMPLE_LOG.flatMap((c) => c.msgs);
  return {
    file: "shokuidokoro_log.json",
    msgs: all.length,
    rolls: all.filter((m) => m.type === "roll").length,
    notes: all.filter((m) => m.type === "note").length,
    secretLines: SAMPLE_LOG.filter((c) => c.secret).reduce((a, c) => a + c.msgs.length, 0),
    channels: SAMPLE_LOG.map((c) => `${c.name}${c.secret ? "(シークレット)" : ""}`),
    speakers: [...new Set(all.map((m) => m.sp))].slice(0, 6),
    duration: fmtDur(sessionMinutes(all[0].ts, all[all.length - 1].ts)),
    dates: [...new Set(all.map((m) => jstDate(m.ts)))],
    start: jstTime(all[0].ts),
    end: jstTime(all[all.length - 1].ts),
  };
}
export const SAMPLE_SUMMARY = summarizeSample();

export type { Provider };
