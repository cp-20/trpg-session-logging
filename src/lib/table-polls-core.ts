/**
 * 卓の日程調整の共有文書（`tablePolls/{eventId}`）の、Firebase に依存しない純粋な処理。
 * ブラウザ（src/lib/table-polls.ts が再び書き出す）とサーバー（Discord の連携。ボットの利用者として firestore/lite で読む）の両方から使う。
 * ここでは firebase/firestore を読み込まない（サーバーにブラウザ用の SDK を入れない）。
 */
import { eventDurationMinutes, pollCandidates } from "./schedule";
import type { Availability, State, Table, TableEvent, TableEventCandidate } from "../types";

export const TABLE_POLLS = "tablePolls";
/** 規則（firestore.rules）と同じ上限 */
export const POLL_MEMBER_LIMIT = 50;
export const POLL_CANDIDATE_LIMIT = 30;
export const POLL_TITLE_LIMIT = 200;
export const POLL_NOTE_LIMIT = 2000;

/** 回答の値（文書を読むときの検査に使う） */
export const POLL_ANSWER_VALUES: readonly Availability[] = ["ok", "maybe", "ng"];
const ANSWERS = POLL_ANSWER_VALUES;

export interface PollCandidate {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** Discord に流した日程調整の在りか（Discord の連携が書く） */
export interface PollDiscordLink {
  guildId: string;
  channelId: string;
  messageId?: string;
  scheduledEventId?: string;
}

/** `tablePolls/{id}` の中身。id は予定（TableEvent）の id と同じ */
export interface TablePoll {
  id: string;
  tableId: string;
  /** 日程調整を作った人（予定の createdBy）。定義を書き換えられるのはこの人だけ */
  ownerId: string;
  /** 卓を作った人。作った人のほかに、この人も確定できる（canConfirmPoll と同じ） */
  tableOwnerId?: string;
  /** 回答できる Firebase の uid（作った人 + 卓の作成者 + 卓のメンバー） */
  memberIds: string[];
  title: string;
  note?: string;
  systemId?: string;
  candidates: PollCandidate[];
  /** uid → 候補 id → 回答 */
  responses: Record<string, Record<string, Availability>>;
  status: "poll" | "confirmed";
  confirmedCandidateId?: string;
  discord?: PollDiscordLink;
  /** 最後に書き換えた日時（ISO 8601。Firestore では Timestamp） */
  updatedAt?: string;
}

/* ================= 純粋な処理 ================= */

export type PollRejectReason = "not-member" | "no-candidate" | "closed";

/**
 * 1 人の 1 候補への回答を書き込む（value が null なら取り消す）。元の poll は変えない。
 * 回答できるのは memberIds の人だけ、確定したあとは受け付けない
 */
export function applyResponse(
  poll: TablePoll,
  uid: string,
  candidateId: string,
  value: Availability | null,
): { ok: true; poll: TablePoll } | { ok: false; reason: PollRejectReason } {
  if (!poll.memberIds.includes(uid)) return { ok: false, reason: "not-member" };
  if (poll.status !== "poll") return { ok: false, reason: "closed" };
  if (!poll.candidates.some((c) => c.id === candidateId)) return { ok: false, reason: "no-candidate" };
  const mine = { ...poll.responses[uid] };
  if (value) mine[candidateId] = value;
  else delete mine[candidateId];
  return { ok: true, poll: { ...poll, responses: { ...poll.responses, [uid]: mine } } };
}

export interface PollCandidateSummary {
  candidate: PollCandidate;
  ok: string[];
  maybe: string[];
  ng: string[];
  /** まだ回答していないメンバー */
  pending: string[];
  counts: { ok: number; maybe: number; ng: number; pending: number };
}

export interface PollSummary {
  candidates: PollCandidateSummary[];
  /** ◯ がいちばん多い候補（同数なら △ が多いほう、それも同じなら早いほう）。◯ も △ もなければ undefined */
  bestCandidateId?: string;
  /** 1 つでも回答したメンバー */
  respondedIds: string[];
}

/** 候補ごとの回答の集計（だれが ◯ / △ / × / 未回答か） */
export function summarizePoll(poll: Pick<TablePoll, "memberIds" | "candidates" | "responses">): PollSummary {
  const members = [...new Set(poll.memberIds)];
  const candidates = poll.candidates.map((candidate) => {
    const by = (v: Availability) => members.filter((id) => poll.responses[id]?.[candidate.id] === v);
    const ok = by("ok");
    const maybe = by("maybe");
    const ng = by("ng");
    const pending = members.filter((id) => !poll.responses[id]?.[candidate.id]);
    return {
      candidate,
      ok,
      maybe,
      ng,
      pending,
      counts: { ok: ok.length, maybe: maybe.length, ng: ng.length, pending: pending.length },
    };
  });
  let best: PollCandidateSummary | undefined;
  for (const c of candidates) {
    if (c.counts.ok + c.counts.maybe === 0) continue;
    if (
      !best ||
      c.counts.ok > best.counts.ok ||
      (c.counts.ok === best.counts.ok && c.counts.maybe > best.counts.maybe)
    )
      best = c;
  }
  return {
    candidates,
    bestCandidateId: best?.candidate.id,
    respondedIds: members.filter((id) => Object.keys(poll.responses[id] ?? {}).length > 0),
  };
}

/**
 * 記録の日程調整から共有する文書を作る。卓の予定になっている「調整中」のものだけ（それ以外は null）。
 * 回答は候補ごと → 人ごとに並べ替える
 */
export function pollFromEvent(event: TableEvent, table: Table, ownerUid: string): TablePoll | null {
  if (event.status !== "poll" || !event.tableId || event.tableId !== table.id) return null;
  const candidates = pollCandidates(event).slice(0, POLL_CANDIDATE_LIMIT);
  const memberIds = [...new Set([ownerUid, table.ownerId, ...table.memberIds])].slice(0, POLL_MEMBER_LIMIT);
  const responses: TablePoll["responses"] = {};
  for (const c of candidates) {
    for (const [uid, v] of Object.entries(c.responses)) {
      if (!ANSWERS.includes(v)) continue;
      (responses[uid] ??= {})[c.id] = v;
    }
  }
  const note = event.note?.trim().slice(0, POLL_NOTE_LIMIT);
  return {
    id: event.id,
    tableId: table.id,
    ownerId: ownerUid,
    tableOwnerId: table.ownerId,
    memberIds,
    title: event.title.slice(0, POLL_TITLE_LIMIT),
    ...(note ? { note } : {}),
    ...(table.systemId ? { systemId: table.systemId } : {}),
    candidates: candidates.map(({ id, date, startTime, endTime }) => ({ id, date, startTime, endTime })),
    responses,
    status: "poll",
  };
}

const sameSlot = (a: PollCandidate, b: PollCandidate) => a.date === b.date && a.startTime === b.startTime;

function confirmedCandidate(poll: TablePoll): PollCandidate | undefined {
  return poll.candidates.find((c) => c.id === poll.confirmedCandidateId);
}

function candidateResponses(poll: TablePoll, candidateId: string): Record<string, Availability> {
  const out: Record<string, Availability> = {};
  for (const [uid, answers] of Object.entries(poll.responses)) {
    const v = answers?.[candidateId];
    if (v && ANSWERS.includes(v)) out[uid] = v;
  }
  return out;
}

function confirmInto(event: TableEvent, poll: TablePoll, cand: PollCandidate): TableEvent {
  const { candidates: _drop, ...rest } = event;
  return {
    ...rest,
    status: "confirmed",
    date: cand.date,
    startTime: cand.startTime,
    endTime: cand.endTime,
    durationMin: eventDurationMinutes(cand.startTime, cand.endTime, event.durationMin),
    responses: candidateResponses(poll, cand.id),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 共有の文書の回答・確定を、作った人の記録の予定に映す（回答は共有の文書が正）。
 * - 候補は記録のもの（定義は記録が正）。日時が文書と同じ候補にだけ、文書の回答を入れる
 * - keepMineFor を渡すと、その人の回答は記録のものを残す（まだ書き出していない自分の回答を消さないため）
 * 変わるところがなければ同じ event を返す
 */
export function mergePollIntoEvent(event: TableEvent, poll: TablePoll, keepMineFor?: string): TableEvent {
  if (event.status === "confirmed") return event;
  if (poll.status === "confirmed") {
    const cand = confirmedCandidate(poll);
    return cand ? confirmInto(event, poll, cand) : event;
  }
  const byId = new Map(poll.candidates.map((c) => [c.id, c]));
  const candidates: TableEventCandidate[] = pollCandidates(event).map((c) => {
    const shared = byId.get(c.id);
    if (!shared || !sameSlot(shared, c)) return c;
    const responses = candidateResponses(poll, c.id);
    if (keepMineFor) {
      delete responses[keepMineFor];
      const mine = c.responses[keepMineFor];
      if (mine) responses[keepMineFor] = mine;
    }
    return { ...c, responses };
  });
  const next: TableEvent = { ...event, candidates, responses: {} };
  return same(next, event) ? event : next;
}

/**
 * ほかの人が作った日程調整を、自分の記録の予定として写す（回答・確定のために持つ）。
 * keepMineFor は mergePollIntoEvent と同じ
 */
export function eventFromPoll(poll: TablePoll, existing?: TableEvent, keepMineFor?: string): TableEvent {
  const first = poll.candidates[0];
  const base: TableEvent = {
    id: poll.id,
    tableId: poll.tableId,
    ...(existing?.scenarioId ? { scenarioId: existing.scenarioId } : {}),
    title: poll.title,
    status: "poll",
    date: first?.date ?? existing?.date ?? "",
    startTime: first?.startTime ?? existing?.startTime ?? "",
    endTime: first?.endTime ?? existing?.endTime ?? "",
    ...(first ? { durationMin: eventDurationMinutes(first.startTime, first.endTime) } : {}),
    ...(poll.note ? { note: poll.note } : {}),
    responses: {},
    candidates: poll.candidates.map((c) => ({ ...c, responses: candidateResponses(poll, c.id) })),
    createdBy: poll.ownerId,
  };
  if (keepMineFor && existing && existing.status === "poll") {
    const mineById = new Map(pollCandidates(existing).map((c) => [c.id, c]));
    for (const c of base.candidates!) {
      delete c.responses[keepMineFor];
      const old = mineById.get(c.id);
      const mine = old && sameSlot(old, c) ? old.responses[keepMineFor] : undefined;
      if (mine) c.responses[keepMineFor] = mine;
    }
  }
  const cand = poll.status === "confirmed" ? confirmedCandidate(poll) : undefined;
  const next = cand ? confirmInto(base, poll, cand) : base;
  return existing && same(next, existing) ? existing : next;
}

/** 写してよい日程調整か: 自分の記録にある卓のもので、作った人もその卓の人 */
function trusted(state: Pick<State, "tables">, uid: string, poll: TablePoll): boolean {
  const table = state.tables[poll.tableId];
  if (!table) return false;
  const inTable = (id: string) => table.ownerId === id || table.memberIds.includes(id);
  return inTable(uid) && inTable(poll.ownerId) && poll.memberIds.includes(uid);
}

/** ほかの人が作った、卓の予定（共有の文書を写したもの） */
export function isMirroredEvent(ev: TableEvent, uid: string): boolean {
  return Boolean(ev.tableId) && ev.createdBy !== uid;
}

/**
 * 共有の文書の一覧（自分が回答できるもの）を自分の記録の予定に取り込む。変わらなければ null。
 * - 自分が作ったもの: 回答と確定を映す（mergePollIntoEvent）。記録にないものは戻さない
 * - ほかの人が作ったもの: 写す（eventFromPoll）
 * - complete（サーバーから読んだ全件）のときは、もう一覧にない写しを消す
 * - keepMine の予定は、まだ書き出していない自分の回答を残す。hold の予定は触らない（確定を書き出す前）
 */
export function mergePollSnapshot(
  state: Pick<State, "tables" | "events">,
  uid: string,
  polls: readonly TablePoll[],
  opts: { complete: boolean; keepMine?: ReadonlySet<string>; hold?: ReadonlySet<string> },
): Record<string, TableEvent> | null {
  const events = { ...state.events };
  let changed = false;
  const seen = new Set<string>();
  for (const poll of polls) {
    if (!trusted(state, uid, poll)) continue;
    seen.add(poll.id);
    if (opts.hold?.has(poll.id)) continue;
    const existing = events[poll.id];
    const keep = opts.keepMine?.has(poll.id) ? uid : undefined;
    let next: TableEvent | undefined;
    if (poll.ownerId === uid) {
      if (!existing) continue;
      next = mergePollIntoEvent(existing, poll, keep);
    } else {
      if (existing && existing.createdBy !== poll.ownerId) continue;
      next = eventFromPoll(poll, existing, keep);
    }
    if (next !== existing) {
      events[poll.id] = next;
      changed = true;
    }
  }
  if (opts.complete) {
    for (const ev of Object.values(events)) {
      if (isMirroredEvent(ev, uid) && !seen.has(ev.id) && !opts.hold?.has(ev.id)) {
        delete events[ev.id];
        changed = true;
      }
    }
  }
  return changed ? events : null;
}

/** 自分の回答（候補 id → 回答）。候補の日時が同じかを比べるため、日時ごと持つ */
export function myAnswersOfEvent(ev: TableEvent, uid: string): string {
  const out: Record<string, string> = {};
  for (const c of pollCandidates(ev)) {
    const v = c.responses[uid];
    if (v) out[c.id] = v;
  }
  return JSON.stringify(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

export function myAnswersOfPoll(poll: TablePoll, uid: string): string {
  const ids = new Set(poll.candidates.map((c) => c.id));
  const out = Object.entries(poll.responses[uid] ?? {}).filter(
    ([id, v]) => ids.has(id) && ANSWERS.includes(v),
  );
  return JSON.stringify(out.sort(([a], [b]) => a.localeCompare(b)));
}

export function answersMap(ev: TableEvent, uid: string): Record<string, Availability> {
  return Object.fromEntries(
    pollCandidates(ev)
      .filter((c) => c.responses[uid])
      .map((c) => [c.id, c.responses[uid]!]),
  );
}

/** 作った人が書き出す定義（回答・確定・Discord は含めない） */
export function definitionKey(poll: TablePoll): string {
  return JSON.stringify([
    poll.tableId,
    poll.tableOwnerId ?? "",
    [...poll.memberIds].sort(),
    poll.title,
    poll.note ?? "",
    poll.systemId ?? "",
    poll.candidates,
  ]);
}

/**
 * 回答を共有の文書に書き直すとき、日時を変えた・消した候補への回答を落とす（別の日時への回答として残さない。
 * applyPollEdit と同じ）
 */
export function pruneResponses(
  responses: TablePoll["responses"],
  before: readonly PollCandidate[],
  after: readonly PollCandidate[],
): TablePoll["responses"] {
  const prev = new Map(before.map((c) => [c.id, c]));
  const keep = new Set(after.filter((c) => prev.has(c.id) && sameSlot(prev.get(c.id)!, c)).map((c) => c.id));
  const out: TablePoll["responses"] = {};
  for (const [uid, answers] of Object.entries(responses)) {
    const kept = Object.fromEntries(Object.entries(answers ?? {}).filter(([id]) => keep.has(id)));
    if (Object.keys(kept).length > 0) out[uid] = kept;
  }
  return out;
}
