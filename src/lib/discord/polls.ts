/**
 * 日程調整の共有文書（tablePolls/{eventId}）を Discord 側で扱うための純粋関数。
 * 文書の形は src/lib/discord/types.ts の PollDoc（src/lib/table-polls.ts と同じ）。
 */
import { eventDurationMinutes, slotRange } from "../schedule";
import { fmtSitting, type Sitting } from "../sittings";
import { applyResponse } from "../table-polls-core";
import type { PollAnswer, PollCandidate, PollDoc } from "./types";

export const POLL_ANSWERS: readonly PollAnswer[] = ["ok", "maybe", "ng"];
export const ANSWER_MARK: Record<PollAnswer, string> = { ok: "○", maybe: "△", ng: "×" };

export function isPollAnswer(v: unknown): v is PollAnswer {
  return v === "ok" || v === "maybe" || v === "ng";
}

/** 回答を受け付けているか（確定したあとは受け付けない） */
export function isOpenPoll(poll: Pick<PollDoc, "status">): boolean {
  return poll.status === "poll";
}

/** 回答できる人（memberIds に作った人・卓の作成者も入っている） */
export function canAnswerPoll(poll: Pick<PollDoc, "memberIds">, uid: string): boolean {
  return poll.memberIds.includes(uid);
}

/** 回答を書き込んだ新しい日程調整（元は変えない）。書けないときは null。判定は table-polls-core の applyResponse */
export function applyPollAnswer(
  poll: PollDoc,
  uid: string,
  candidateId: string,
  value: PollAnswer,
): PollDoc | null {
  const r = applyResponse(poll, uid, candidateId, value);
  return r.ok ? r.poll : null;
}

export type Tally = Record<PollAnswer, number>;

export function tallyCandidate(poll: Pick<PollDoc, "responses">, candidateId: string): Tally {
  const t: Tally = { ok: 0, maybe: 0, ng: 0 };
  for (const answers of Object.values(poll.responses)) {
    const v = answers?.[candidateId];
    if (isPollAnswer(v)) t[v]++;
  }
  return t;
}

/** 候補の時間帯（epoch 秒）。終わりが開始以前なら翌日。開始が 25:00 のような翌日表記でもよい */
export function candidateSitting(c: PollCandidate, durationMin?: number): Sitting | null {
  const minutes = eventDurationMinutes(c.startTime, c.endTime, durationMin);
  const range = slotRange(c.date, c.startTime, minutes);
  if (!range) return null;
  return { start: range.start / 1000, end: range.end / 1000 };
}

/** 「11月22日(日) 21:00〜翌1:00」 */
export function fmtCandidate(c: PollCandidate, durationMin?: number): string {
  const s = candidateSitting(c, durationMin);
  return s ? fmtSitting(s) : `${c.date} ${c.startTime}`;
}
