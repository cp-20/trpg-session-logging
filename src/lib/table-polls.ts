/**
 * 卓の日程調整を卓のメンバーと共有する（`tablePolls/{eventId}`）。
 *
 * 日程調整は作った人の記録（users/{uid}/workspace）にある予定（TableEvent）だが、それだけでは
 * ほかのメンバーが自分のアカウントから回答できない。そこで、卓の予定になっている日程調整を
 * 共有の文書にも置き、回答はその文書に書く。
 *
 * どちらが正か（P3）:
 * - 候補・題名・顔ぶれ（定義）は、作った人の記録が正。作った人の端末が共有の文書へ書き出す
 * - 回答と確定は、共有の文書が正。各自が自分の回答だけを書き（規則で強制）、各自の記録へ取り込む
 * - 共有の文書がない日程調整（ログインしていない・卓のない個人の予定）は、これまでどおり記録だけで動く
 *
 * 前半は Firebase に依存しない純粋な処理（Discord の連携からも使う）、後半が Firestore の読み書き。
 * 規則は firestore.rules、検査は scripts/emulator-smoke.ts と table-polls.emulator.test.ts。
 */
import {
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDocFromServer,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getCloudFirestore } from "./cloud-state";
import type { Availability, State, TableEvent } from "../types";
import {
  answersMap,
  definitionKey,
  mergePollSnapshot,
  myAnswersOfEvent,
  myAnswersOfPoll,
  POLL_ANSWER_VALUES as ANSWERS,
  pollFromEvent,
  pruneResponses,
  TABLE_POLLS,
  type PollCandidate,
  type TablePoll,
} from "./table-polls-core";

export * from "./table-polls-core";

/* ================= Firestore ================= */

function database(): Firestore {
  const db = getCloudFirestore();
  if (!db) throw new Error("保存先に接続できません。");
  return db;
}

const pollRef = (db: Firestore, eventId: string) => doc(db, TABLE_POLLS, eventId);

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** 文書の中身を TablePoll に（壊れた値は落とす） */
export function parsePollDoc(id: string, data: DocumentData): TablePoll | null {
  const tableId = str(data.tableId);
  const ownerId = str(data.ownerId);
  if (!tableId || !ownerId || !Array.isArray(data.candidates)) return null;
  const candidates: PollCandidate[] = (data.candidates as unknown[]).flatMap((c) => {
    const r = c as Record<string, unknown>;
    const cid = str(r?.id);
    const date = str(r?.date);
    const startTime = str(r?.startTime);
    const endTime = str(r?.endTime);
    return cid && date && startTime && endTime !== undefined ? [{ id: cid, date, startTime, endTime }] : [];
  });
  const responses: TablePoll["responses"] = {};
  if (data.responses && typeof data.responses === "object") {
    for (const [uid, answers] of Object.entries(data.responses as Record<string, unknown>)) {
      if (!answers || typeof answers !== "object") continue;
      const ok = Object.entries(answers as Record<string, unknown>).filter((e): e is [string, Availability] =>
        ANSWERS.includes(e[1] as Availability),
      );
      if (ok.length > 0) responses[uid] = Object.fromEntries(ok);
    }
  }
  const d = data.discord as Record<string, unknown> | undefined;
  const discord =
    d && str(d.guildId) && str(d.channelId)
      ? {
          guildId: str(d.guildId)!,
          channelId: str(d.channelId)!,
          ...(str(d.messageId) ? { messageId: str(d.messageId) } : {}),
          ...(str(d.scheduledEventId) ? { scheduledEventId: str(d.scheduledEventId) } : {}),
        }
      : undefined;
  return {
    id,
    tableId,
    ownerId,
    ...(str(data.tableOwnerId) ? { tableOwnerId: str(data.tableOwnerId) } : {}),
    memberIds: Array.isArray(data.memberIds)
      ? data.memberIds.filter((m): m is string => typeof m === "string")
      : [],
    title: str(data.title) ?? "",
    ...(str(data.note) ? { note: str(data.note) } : {}),
    ...(str(data.systemId) ? { systemId: str(data.systemId) } : {}),
    candidates,
    responses,
    status: data.status === "confirmed" ? "confirmed" : "poll",
    ...(str(data.confirmedCandidateId) ? { confirmedCandidateId: str(data.confirmedCandidateId) } : {}),
    ...(discord ? { discord } : {}),
    ...(data.updatedAt instanceof Timestamp ? { updatedAt: data.updatedAt.toDate().toISOString() } : {}),
  };
}

function pollDoc(poll: TablePoll): DocumentData {
  return {
    tableId: poll.tableId,
    ownerId: poll.ownerId,
    ...(poll.tableOwnerId ? { tableOwnerId: poll.tableOwnerId } : {}),
    memberIds: poll.memberIds,
    title: poll.title,
    ...(poll.note ? { note: poll.note } : {}),
    ...(poll.systemId ? { systemId: poll.systemId } : {}),
    candidates: poll.candidates,
    responses: poll.responses,
    status: poll.status,
    ...(poll.confirmedCandidateId ? { confirmedCandidateId: poll.confirmedCandidateId } : {}),
    ...(poll.discord ? { discord: poll.discord } : {}),
    updatedAt: serverTimestamp(),
  };
}

/**
 * 日程調整を共有する（作った人だけ）。はじめて書くときは poll の回答をそのまま、
 * すでにあるときは文書の回答を残し（回答は文書が正）、日時を変えた候補への回答だけ落とす。
 * 確定と Discord の在りかも文書のものを残す
 */
export async function publishPoll(poll: TablePoll): Promise<void> {
  const db = database();
  const ref = pollRef(db, poll.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? parsePollDoc(snap.id, snap.data()) : null;
    const next: TablePoll = current
      ? {
          ...poll,
          responses: pruneResponses(current.responses, current.candidates, poll.candidates),
          status: current.status,
          confirmedCandidateId: current.confirmedCandidateId,
          discord: current.discord,
        }
      : poll;
    tx.set(ref, pollDoc(next));
  });
}

/** 1 件読む（読めない・ないときは null） */
export async function loadPoll(eventId: string): Promise<TablePoll | null> {
  const snap = await getDocFromServer(pollRef(database(), eventId)).catch((error) => {
    if (error?.code === "permission-denied") return null;
    throw error;
  });
  return snap?.exists() ? parsePollDoc(snap.id, snap.data()) : null;
}

/** 1 件を見張る（消えた・読めなくなったら null） */
export function watchPoll(
  eventId: string,
  onChange: (poll: TablePoll | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    pollRef(database(), eventId),
    (snap) => onChange(snap.exists() ? parsePollDoc(snap.id, snap.data()) : null),
    (error) => onError?.(error),
  );
}

/**
 * 自分が回答できる日程調整を見張る。complete はサーバーから読んだ全件か（端末の控えだけのときは false）
 */
export function watchMyPolls(
  uid: string,
  onChange: (polls: TablePoll[], meta: { complete: boolean }) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(database(), TABLE_POLLS), where("memberIds", "array-contains", uid));
  // 端末の控えから先に返したあと、サーバーで確かめ終えたことも知るため、メタデータの変化も受け取る
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) =>
      onChange(
        snap.docs.flatMap((d) => parsePollDoc(d.id, d.data()) ?? []),
        { complete: !snap.metadata.fromCache },
      ),
    (error) => onError?.(error),
  );
}

/** 自分の回答をまとめて書く（候補 id → 回答）。ほかの人の回答には触らない（規則でも強制） */
export async function answerPoll(
  uid: string,
  eventId: string,
  answers: Record<string, Availability>,
): Promise<void> {
  const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => ANSWERS.includes(v)));
  await updateDoc(
    pollRef(database(), eventId),
    new FieldPath("responses", uid),
    clean,
    "updatedAt",
    serverTimestamp(),
  );
}

/** 候補を確定する（作った人か卓の作成者）。回答はそのまま残す */
export async function confirmPoll(eventId: string, candidateId: string): Promise<void> {
  await updateDoc(pollRef(database(), eventId), {
    status: "confirmed",
    confirmedCandidateId: candidateId,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePoll(eventId: string): Promise<void> {
  await deleteDoc(pollRef(database(), eventId));
}

/* ================= 記録との同期（Web とアプリの保存処理から使う） ================= */

/**
 * 記録と共有の文書をつなぐ。React に依存しない。
 * - start(): 自分が回答できる文書を見張り、変わるたびに onRemote へ「記録をどう変えるか」を渡す
 * - push(state): 記録の変更（作った日程調整・自分の回答・確定・削除）を文書へ書き出す。記録を保存したあとに呼ぶ
 */
export class TablePollSync {
  private server = new Map<string, TablePoll>();
  private ready = false;
  /** 文書にある自分の回答（最後に読んだ・書いたもの） */
  private mine = new Map<string, string>();
  /** この画面を開いてから記録にあった、自分が作った卓の日程調整 */
  private owned = new Set<string>();

  constructor(
    private readonly uid: string,
    /** 記録の予定をどう変えるか。受け取った関数を最新の記録に当て、null でなければ events を置き換える */
    private readonly onRemote: (
      merge: (state: Pick<State, "tables" | "events">) => Record<string, TableEvent> | null,
    ) => void,
    private readonly opts: {
      onError?: (error: Error) => void;
      /** はじめてサーバーから読み終えたとき（記録にある日程調整をここで書き出す） */
      onReady?: () => void;
    } = {},
  ) {}

  private queue: Promise<void> = Promise.resolve();

  start(): Unsubscribe {
    return watchMyPolls(
      this.uid,
      (polls, { complete }) => {
        this.server = new Map(polls.map((p) => [p.id, p]));
        const first = complete && !this.ready;
        if (complete) this.ready = true;
        this.onRemote((state) => {
          const keepMine = new Set<string>();
          for (const p of polls) {
            const ev = state.events?.[p.id];
            const known = this.mine.get(p.id);
            if (ev && known !== undefined && myAnswersOfEvent(ev, this.uid) !== known) keepMine.add(p.id);
            else this.mine.set(p.id, myAnswersOfPoll(p, this.uid));
          }
          return mergePollSnapshot(state, this.uid, polls, {
            complete,
            keepMine,
            hold: this.pendingConfirms(state),
          });
        });
        if (first) this.opts.onReady?.();
      },
      (error) => this.opts.onError?.(error),
    );
  }

  /** 記録では確定したが、文書はまだ調整中のもの */
  private pendingConfirms(state: Pick<State, "tables" | "events">): Set<string> {
    const out = new Set<string>();
    for (const [id, poll] of this.server) {
      const ev = state.events?.[id];
      if (ev && ev.status === "confirmed" && poll.status === "poll") out.add(id);
    }
    return out;
  }

  /** 書き出しは 1 本ずつ（保存のたびと読み終えたときの両方から呼ばれる） */
  push(state: Pick<State, "tables" | "events">): Promise<void> {
    const run = this.queue.then(() => this.pushNow(state));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async pushNow(state: Pick<State, "tables" | "events">): Promise<void> {
    if (!this.ready) return;
    const events = state.events ?? {};
    const ownedNow = new Set<string>();
    for (const ev of Object.values(events)) {
      if (!ev.tableId) continue;
      const table = state.tables[ev.tableId];
      if (!table) continue;
      const server = this.server.get(ev.id);
      if (ev.createdBy === this.uid) {
        ownedNow.add(ev.id);
        if (ev.status === "poll") {
          const poll = pollFromEvent(ev, table, this.uid);
          if (!poll) continue;
          if (!server) {
            await publishPoll(poll);
            this.server.set(poll.id, poll);
            this.mine.set(poll.id, myAnswersOfPoll(poll, this.uid));
            continue;
          }
          if (server.status === "poll" && definitionKey(server) !== definitionKey(poll)) {
            await publishPoll(poll);
            const responses = pruneResponses(server.responses, server.candidates, poll.candidates);
            this.server.set(poll.id, { ...poll, responses });
          }
        }
      } else if (!server) {
        continue;
      }
      const shared = this.server.get(ev.id);
      if (!shared || shared.status !== "poll") continue;
      if (ev.status === "confirmed") {
        const cand = shared.candidates.find((c) => c.date === ev.date && c.startTime === ev.startTime);
        const allowed = shared.ownerId === this.uid || shared.tableOwnerId === this.uid;
        if (cand && allowed) {
          await confirmPoll(ev.id, cand.id);
          this.server.set(ev.id, { ...shared, status: "confirmed", confirmedCandidateId: cand.id });
        }
        continue;
      }
      const answers = myAnswersOfEvent(ev, this.uid);
      if (answers !== this.mine.get(ev.id) && shared.memberIds.includes(this.uid)) {
        await answerPoll(this.uid, ev.id, answersMap(ev, this.uid));
        this.mine.set(ev.id, answers);
      }
    }
    for (const id of this.owned) {
      if (ownedNow.has(id)) continue;
      const server = this.server.get(id);
      if (server?.ownerId === this.uid) {
        await deletePoll(id);
        this.server.delete(id);
      }
    }
    this.owned = ownedNow;
  }

  /** 文書を読み終えたか（書き出しは読み終えてから始める） */
  get isReady(): boolean {
    return this.ready;
  }
}
