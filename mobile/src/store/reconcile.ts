import type {
  Character,
  Log,
  Prefs,
  Scenario,
  SessionImpression,
  State,
  Table,
  TableEvent,
  TableEventCandidate,
  User,
} from "@shared/types";

export interface ReconcileResult {
  merged: State;
  hadConflict: boolean;
  conflictedEntities: string[];
}

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

function mergeRecordByKey<V>(
  base: Record<string, V> | undefined,
  local: Record<string, V> | undefined,
  remote: Record<string, V> | undefined,
  onConflict?: (key: string, b: V | undefined, l: V, r: V) => V,
): Record<string, V> {
  const keys = new Set([
    ...Object.keys(base ?? {}),
    ...Object.keys(local ?? {}),
    ...Object.keys(remote ?? {}),
  ]);
  const out: Record<string, V> = {};
  for (const k of keys) {
    const b = base?.[k];
    const l = local?.[k];
    const r = remote?.[k];
    const bJ = stableJson(b);
    const lJ = stableJson(l);
    const rJ = stableJson(r);

    if (lJ === rJ) {
      if (r !== undefined) out[k] = structuredClone(r);
      continue;
    }
    if (lJ === bJ) {
      if (r !== undefined) out[k] = structuredClone(r);
      continue;
    }
    if (rJ === bJ) {
      if (l !== undefined) out[k] = structuredClone(l);
      continue;
    }
    if (l !== undefined && r !== undefined) {
      out[k] = onConflict ? onConflict(k, b, l, r) : structuredClone(r);
    } else if (r !== undefined) {
      out[k] = structuredClone(r);
    } else if (l !== undefined) {
      out[k] = structuredClone(l);
    }
  }
  return out;
}

function mergeArrayById<T>(
  base: readonly T[] | undefined,
  local: readonly T[] | undefined,
  remote: readonly T[] | undefined,
  getId: (item: T) => string,
  mergeItem?: (b: T | undefined, l: T, r: T) => T,
): T[] {
  const toMap = (arr: readonly T[] | undefined) => {
    const rec: Record<string, T> = {};
    for (const item of arr ?? []) rec[getId(item)] = item;
    return rec;
  };
  const order = new Set<string>();
  for (const item of remote ?? []) order.add(getId(item));
  for (const item of local ?? []) order.add(getId(item));
  const merged = mergeRecordByKey(
    toMap(base),
    toMap(local),
    toMap(remote),
    mergeItem ? (_k, b, l, r) => mergeItem(b, l, r) : undefined,
  );
  const out: T[] = [];
  for (const id of order) {
    if (merged[id] !== undefined) out.push(merged[id]!);
  }
  return out;
}

function mergeScalarFields<T extends object>(
  base: T | undefined,
  local: T,
  remote: T,
  skipKeys: ReadonlySet<string>,
  onFieldConflict: (field: string) => void,
): T {
  const out = structuredClone(remote);
  const bRec = (base ?? {}) as Record<string, unknown>;
  const lRec = local as Record<string, unknown>;
  const rRec = remote as Record<string, unknown>;
  const oRec = out as Record<string, unknown>;

  const keys = new Set([...Object.keys(bRec), ...Object.keys(lRec), ...Object.keys(rRec)]);
  for (const k of keys) {
    if (skipKeys.has(k)) continue;
    const bJ = stableJson(bRec[k]);
    const lJ = stableJson(lRec[k]);
    const rJ = stableJson(rRec[k]);
    if (lJ === rJ || lJ === bJ) continue;
    if (rJ === bJ) {
      if (lRec[k] === undefined) delete oRec[k];
      else oRec[k] = structuredClone(lRec[k]);
    } else {
      onFieldConflict(k);
    }
  }
  return out;
}

function mergeTableEvent(
  id: string,
  b: TableEvent | undefined,
  l: TableEvent,
  r: TableEvent,
  recordConflict: (tag: string) => void,
): TableEvent {
  const merged = mergeScalarFields(b, l, r, new Set(["responses", "candidates"]), (field) =>
    recordConflict(`event:${id}.${field}`),
  );
  merged.responses = mergeRecordByKey(b?.responses, l.responses, r.responses);
  if (b?.candidates || l.candidates || r.candidates) {
    const mergedCandidates = mergeArrayById<TableEventCandidate>(
      b?.candidates,
      l.candidates,
      r.candidates,
      (c) => c.id,
      (bc, lc, rc) => {
        const mc = mergeScalarFields(bc, lc, rc, new Set(["responses"]), (field) =>
          recordConflict(`event:${id}.candidate.${lc.id}.${field}`),
        );
        mc.responses = mergeRecordByKey(bc?.responses, lc.responses, rc.responses);
        return mc;
      },
    );
    if (mergedCandidates.length > 0 && (l.status === "poll" || r.status === "poll")) {
      merged.candidates = mergedCandidates;
    } else {
      delete merged.candidates;
    }
  }
  return merged;
}

function mergeLog(
  id: string,
  b: Log | undefined,
  l: Log,
  r: Log,
  recordConflict: (tag: string) => void,
): Log {
  const merged = mergeScalarFields(b, l, r, new Set(["players", "speakerIcons", "impressions"]), (field) =>
    recordConflict(`log:${id}.${field}`),
  );
  merged.players = mergeRecordByKey(b?.players, l.players, r.players, (uid, bp, lp, rp) => {
    const mp = mergeScalarFields(bp, lp, rp, new Set(["characterIds"]), (field) =>
      recordConflict(`log:${id}.player.${uid}.${field}`),
    );
    const bChars = new Set(bp?.characterIds ?? []);
    const union = new Set([...rp.characterIds, ...lp.characterIds]);
    mp.characterIds = [...union].filter((cid) => {
      const inB = bChars.has(cid);
      const inL = lp.characterIds.includes(cid);
      const inR = rp.characterIds.includes(cid);
      if (!inB) return inL || inR;
      return inL && inR;
    });
    return mp;
  });
  const icons = mergeRecordByKey(b?.speakerIcons, l.speakerIcons, r.speakerIcons);
  if (Object.keys(icons).length > 0) merged.speakerIcons = icons;
  else delete merged.speakerIcons;

  if (b?.impressions || l.impressions || r.impressions) {
    merged.impressions = mergeArrayById<SessionImpression>(
      b?.impressions,
      l.impressions,
      r.impressions,
      (imp) => imp.id,
      (bi, li, ri) =>
        mergeScalarFields(bi, li, ri, new Set(), (field) =>
          recordConflict(`log:${id}.impression.${li.id}.${field}`),
        ),
    );
  }
  return merged;
}

function mergeCharacter(
  id: string,
  b: Character | undefined,
  l: Character,
  r: Character,
  recordConflict: (tag: string) => void,
): Character {
  const merged = mergeScalarFields(b, l, r, new Set(["stats", "sessions", "growth"]), (field) =>
    recordConflict(`character:${id}.${field}`),
  );
  merged.stats = mergeRecordByKey(b?.stats, l.stats, r.stats);
  merged.sessions = mergeArrayById(b?.sessions, l.sessions, r.sessions, (s) => s.logId);
  merged.growth = mergeArrayById(b?.growth, l.growth, r.growth, (g) => g.id);
  return merged;
}

function mergePrefs(b: Prefs | undefined, l: Prefs, r: Prefs, recordConflict: (tag: string) => void): Prefs {
  const merged = mergeScalarFields(b, l, r, new Set(["busyDates"]), (field) =>
    recordConflict(`prefs.${field}`),
  );
  const bBusy = new Set(b?.busyDates ?? []);
  const lBusy = new Set(l.busyDates ?? []);
  const rBusy = new Set(r.busyDates ?? []);
  const union = new Set([...rBusy, ...lBusy]);
  const nextBusy = [...union]
    .filter((d) => (!bBusy.has(d) ? lBusy.has(d) || rBusy.has(d) : lBusy.has(d) && rBusy.has(d)))
    .sort();
  if (nextBusy.length > 0) merged.busyDates = nextBusy;
  else delete merged.busyDates;
  return merged;
}

/**
 * 別端末更新とローカル未送信変更を、base（前回同期時点のスナップショット）を基準に
 * エンティティ・回答単位で 3-Way マージする純粋関数。
 */
export function reconcileWorkspaceStates(base: State | null, local: State, remote: State): ReconcileResult {
  const conflicts: string[] = [];
  const recordConflict = (tag: string) => {
    if (!conflicts.includes(tag)) conflicts.push(tag);
  };

  const merged: State = {
    me: remote.me || local.me,
    entered: local.entered || remote.entered,
    prefs: mergePrefs(base?.prefs, local.prefs, remote.prefs, recordConflict),
    users: mergeRecordByKey<User>(base?.users, local.users, remote.users, (id, bu, lu, ru) =>
      mergeScalarFields(bu, lu, ru, new Set(), () => recordConflict(`user:${id}`)),
    ),
    tables: mergeRecordByKey<Table>(base?.tables, local.tables, remote.tables, (id, bt, lt, rt) => {
      const mt = mergeScalarFields(bt, lt, rt, new Set(["memberIds"]), (field) =>
        recordConflict(`table:${id}.${field}`),
      );
      const bSet = new Set(bt?.memberIds ?? []);
      const union = new Set([...rt.memberIds, ...lt.memberIds]);
      mt.memberIds = [...union].filter((uid) =>
        !bSet.has(uid)
          ? lt.memberIds.includes(uid) || rt.memberIds.includes(uid)
          : lt.memberIds.includes(uid) && rt.memberIds.includes(uid),
      );
      return mt;
    }),
    characters: mergeRecordByKey<Character>(
      base?.characters,
      local.characters,
      remote.characters,
      (id, bc, lc, rc) => mergeCharacter(id, bc, lc, rc, recordConflict),
    ),
    scenarios: mergeRecordByKey<Scenario>(
      base?.scenarios,
      local.scenarios,
      remote.scenarios,
      (id, bs, ls, rs) =>
        mergeScalarFields(bs, ls, rs, new Set(), (field) => recordConflict(`scenario:${id}.${field}`)),
    ),
    logs: mergeRecordByKey<Log>(base?.logs, local.logs, remote.logs, (id, bl, ll, rl) =>
      mergeLog(id, bl, ll, rl, recordConflict),
    ),
    events: mergeRecordByKey<TableEvent>(base?.events, local.events, remote.events, (id, be, le, re) =>
      mergeTableEvent(id, be, le, re, recordConflict),
    ),
    editRequests: mergeArrayById(base?.editRequests, local.editRequests, remote.editRequests, (r) => r.id),
  };

  return {
    merged,
    hadConflict: conflicts.length > 0,
    conflictedEntities: conflicts,
  };
}
