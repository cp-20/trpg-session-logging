import type { State, User, Table, Character, Scenario, Log, Channel, Provider } from "../types";
import generated from "./generated.json";
import { jstTime, jstDate, sessionMinutes, fmtDur, uid } from "../lib/time";

/** generated.json の logs はオブジェクト（Record）なので正しく扱う */
const g = generated as unknown as {
  users: (User & { id: string })[];
  tables: Table[];
  scenarios: Scenario[];
  logs: Record<string, Log>;
  characters: Character[];
};

export function seedState(): State {
  const users: Record<string, User> = {};
  g.users.forEach((u) => (users[u.id] = u));
  const tables: Record<string, Table> = {};
  g.tables.forEach((t) => (tables[t.id] = t));
  const scenarios: Record<string, Scenario> = {};
  g.scenarios.forEach((s) => (scenarios[s.id] = s));
  const characters: Record<string, Character> = {};
  Object.values(g.characters).forEach((c) => (characters[c.id] = c));
  const logs: Record<string, Log> = {};
  Object.values(g.logs).forEach((l) => (logs[l.id] = { ...l, slug: (l as unknown as { slug?: string }).slug ?? uid("s") }));
  return {
    me: "u_mikan",
    entered: false,
    prefs: { hideSelfOnShare: false },
    users,
    tables,
    characters,
    scenarios,
    logs,
    editRequests: [],
  };
}

/** アップロードフローのサンプルログ（シークレットチャンネル付きの実データを再利用） */
const sampleSource = Object.values(g.logs).find((l) => l.id === "s06") ?? Object.values(g.logs)[0];
export const SAMPLE_LOG: Channel[] = JSON.parse(JSON.stringify(sampleSource.channels));

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
