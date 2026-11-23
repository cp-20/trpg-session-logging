/**
 * ログインした人の記録に紛れ込んだ体験版の見本（src/data/seed.ts）を取り除く。
 * 見本の ID は決まった文字列（u_mikan・t_haikou・s08 など）で、本物の記録の ID（乱数）とは重ならない。
 * 本人が持つもの（ownerId が本人）と、残る記録が結んでいるシナリオ・人は残す。
 */
import type { State } from "../types";

/** 見本の人。これがいなければ見本は入っていない（見本を読み込むまでもない） */
export const DEMO_USER_IDS: readonly string[] = [
  "u_mikan",
  "u_sora",
  "u_kai",
  "u_hina",
  "u_rin",
  "u_natsu",
  "u_makoto",
  "u_aoi",
  "u_yura",
  "u_yashimo",
  "u_sasa",
  "u_toma",
];

export function hasDemoData(state: State, uid: string): boolean {
  return DEMO_USER_IDS.some((id) => id !== uid && id in state.users);
}

export interface DemoCleanup {
  state: State;
  removed: number;
}

/** 見本（seed）と同じ ID のもののうち、本人のものでないものを除く */
export function stripDemoData(state: State, seed: State, uid: string): DemoCleanup {
  const next: State = structuredClone(state);
  let removed = 0;
  const drop = <T>(rec: Record<string, T>, seedRec: Record<string, T>, keep: (v: T) => boolean) => {
    for (const id of Object.keys(rec))
      if (id in seedRec && !keep(rec[id]!)) {
        delete rec[id];
        removed++;
      }
  };
  drop(next.logs, seed.logs, (l) => l.ownerId === uid);
  drop(next.tables, seed.tables, (t) => t.ownerId === uid);
  drop(next.characters, seed.characters, (c) => c.ownerId === uid);
  drop(next.events ?? {}, seed.events ?? {}, () => false);

  // 残る記録が結んでいるシナリオ・人は残す
  const usedScenarios = new Set(Object.values(next.logs).map((l) => l.scenarioId));
  drop(next.scenarios, seed.scenarios, (s) => s.addedByUid === uid || usedScenarios.has(s.id));
  const usedUsers = new Set<string>([uid]);
  for (const l of Object.values(next.logs)) {
    usedUsers.add(l.ownerId);
    for (const p of Object.keys(l.players)) usedUsers.add(p);
  }
  for (const t of Object.values(next.tables)) for (const m of t.memberIds) usedUsers.add(m);
  for (const c of Object.values(next.characters)) usedUsers.add(c.ownerId);
  drop(next.users, seed.users, (u) => usedUsers.has(u.id));

  const before = next.editRequests.length;
  next.editRequests = next.editRequests.filter((r) => r.scenarioId in next.scenarios);
  removed += before - next.editRequests.length;
  if (next.me !== uid) next.me = uid;
  return { state: next, removed };
}
