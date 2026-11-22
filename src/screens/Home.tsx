/**
 * ホーム。開いたときに「今、自分に関係あること」を上から順に並べる。
 *   返事待ちの日程調整 → 2カラム（右: 次の予定・自分のキャラクター / 左: 記録待ち・最近のセッション）
 * 幅の要らない短い一覧を右列に集めて、右列だけ早く終わって余白が余るのを防ぐ。モバイルでは次の予定を先頭に出す。
 * 件数や合計の数字は出さない。何もない区画は出さない。
 */
import { useMemo, useState } from "react";
import { AvatarStack, CharAvatar } from "../components/identity";
import { IconChevronRight, IconPlus, IconUpload, IconTable } from "../components/icons";
import { EmptyState, PageHead, SectionTitle, SplitLayout } from "../components/ui";
import { fmtDateShort, todayStr } from "../lib/format";
import { Link, useNavigate } from "../lib/router";
import { myScheduleView, pollCandidates, relativeDayLabel } from "../lib/schedule";
import { sessionsOfMe, useStore } from "../store";
import type { TableEvent, User } from "../types";
import { EventDetailModal, EventRow, PollDetailModal } from "./Calendar";
import { lastPlayed } from "./Characters";
import { carriedValues } from "../lib/character-growth";
import { SessionRow } from "./Sessions";
import { sessionStart } from "../lib/sittings";

const RECENT_SESSIONS = 6;
const NEXT_EVENTS = 3;

function SeeAll({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="btn btn-quiet btn-sm">
      {label}
      <IconChevronRight width={14} height={14} />
    </Link>
  );
}

/** 候補日の範囲（11/27〜12/4）。1 件なら日付だけ */
function candidateSpan(ev: TableEvent): string {
  const dates = [...new Set(pollCandidates(ev).map((c) => c.date))].sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first) return "";
  return first === last ? fmtDateShort(first) : `${fmtDateShort(first)}〜${fmtDateShort(last!)}`;
}

export default function Home() {
  const { state } = useStore();
  const nav = useNavigate();
  const today = todayStr();
  const [openEvent, setOpenEvent] = useState<TableEvent | null>(null);
  const [answerPollId, setAnswerPollId] = useState<string | null>(null);

  const schedule = useMemo(() => myScheduleView(state, today), [state, today]);
  const recent = useMemo(
    () => [...sessionsOfMe(state)].sort((a, b) => sessionStart(b) - sessionStart(a)),
    [state],
  );
  const myChars = useMemo(
    () =>
      Object.values(state.characters)
        .filter((c) => c.ownerId === state.me)
        .sort((a, b) => (lastPlayed(b) ?? "").localeCompare(lastPlayed(a) ?? "")),
    [state.characters, state.me],
  );
  const hasTables = useMemo(
    () => Object.values(state.tables).some((t) => t.memberIds.includes(state.me) || t.ownerId === state.me),
    [state.tables, state.me],
  );
  const answerPoll = answerPollId
    ? schedule.pollsNeedingReply.find((ev) => ev.id === answerPollId)
    : undefined;

  const recordFromEvent = (ev: TableEvent) =>
    nav({ to: `/upload?table=${ev.tableId ?? ""}&scenario=${ev.scenarioId ?? ""}` });

  const isNewUser = recent.length === 0 && myChars.length === 0 && !hasTables;
  if (isNewUser) {
    return (
      <>
        <PageHead title="ホーム" />
        <div className="surface">
          <EmptyState
            icon={<IconUpload width={28} height={28} />}
            title="遊んだセッションを残しましょう"
            action={
              <>
                <Link to="/upload" className="btn btn-primary">
                  <IconUpload width={16} height={16} /> ログを取り込む
                </Link>
                <Link to="/tables" className="btn">
                  <IconTable width={16} height={16} /> いつものメンバーで卓をつくる
                </Link>
              </>
            }
          >
            CCFOLIA・Udonarium のログを入れると、日時と参加者がそのまま記録になります。
          </EmptyState>
        </div>
      </>
    );
  }

  const nextSection =
    schedule.upcoming.length > 0 || hasTables ? (
      <section aria-labelledby="home-next">
        <SectionTitle right={schedule.upcoming.length > 0 && <SeeAll to="/calendar" label="カレンダー" />}>
          <span id="home-next">次の予定</span>
        </SectionTitle>
        {schedule.upcoming.length > 0 ? (
          <div className="surface list">
            {schedule.upcoming.slice(0, NEXT_EVENTS).map((ev, idx) => {
              const rel = relativeDayLabel(today, ev.date);
              const urgent = rel === "今日" || rel === "あす";
              let avatars: ReturnType<typeof AvatarStack> | undefined;
              if (idx === 0) {
                const okUsers = Object.entries(ev.responses)
                  .filter(([, r]) => r === "ok")
                  .map(([uid]) => state.users[uid])
                  .filter((u): u is User => Boolean(u));
                const tbUsers =
                  okUsers.length > 0
                    ? okUsers
                    : (ev.tableId ? (state.tables[ev.tableId]?.memberIds ?? []) : [])
                        .map((uid) => state.users[uid])
                        .filter((u): u is User => Boolean(u));
                if (tbUsers.length > 0) {
                  avatars = (
                    <AvatarStack
                      people={tbUsers.map((user) => ({ kind: "user", user }) as const)}
                      size={20}
                      max={5}
                    />
                  );
                }
              }
              return (
                <EventRow
                  key={ev.id}
                  ev={ev}
                  state={state}
                  highlight={urgent}
                  avatars={avatars}
                  onOpen={() => setOpenEvent(ev)}
                  metaRight={
                    rel && (
                      <span
                        className={
                          urgent ? "shrink-0 text-sm font-bold text-primary" : "shrink-0 text-sm text-ink2"
                        }
                      >
                        {rel}
                      </span>
                    )
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className="surface flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
            <p className="min-w-0 flex-1 text-sm text-ink2">決まっている予定はありません。</p>
            <Link to="/calendar" className="btn btn-sm">
              <IconPlus width={14} height={14} /> 予定を立てる
            </Link>
          </div>
        )}
      </section>
    ) : null;

  const mainColumn = (
    <div className="space-y-8">
      {schedule.unrecorded.length > 0 && (
        <section aria-labelledby="home-unrecorded">
          <SectionTitle>
            <span id="home-unrecorded">記録がまだの予定</span>
          </SectionTitle>
          <div className="surface list">
            {schedule.unrecorded.map((ev) => (
              <EventRow
                key={ev.id}
                ev={ev}
                state={state}
                muted
                onOpen={() => setOpenEvent(ev)}
                trailing={
                  <button type="button" className="btn btn-sm shrink-0" onClick={() => recordFromEvent(ev)}>
                    記録する
                  </button>
                }
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="home-recent">
        <SectionTitle right={recent.length > RECENT_SESSIONS && <SeeAll to="/sessions" label="すべて" />}>
          <span id="home-recent">最近のセッション</span>
        </SectionTitle>
        {recent.length > 0 ? (
          <div className="surface list">
            {recent.slice(0, RECENT_SESSIONS).map((l) => (
              <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} />
            ))}
          </div>
        ) : (
          <div className="surface flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
            <p className="min-w-0 flex-1 text-sm text-ink2">まだ記録したセッションはありません。</p>
            <Link to="/upload" className="btn btn-primary btn-sm">
              <IconUpload width={14} height={14} /> ログを取り込む
            </Link>
          </div>
        )}
      </section>
    </div>
  );

  const asideColumn =
    myChars.length > 0 ? (
      <section aria-labelledby="home-chars">
        <SectionTitle right={<SeeAll to="/characters" label="すべて" />}>
          <span id="home-chars">自分のキャラクター</span>
        </SectionTitle>
        <ul className="surface list">
          {myChars.slice(0, 4).map((c) => {
            const last = lastPlayed(c);
            /* 卓をまたいで続く値（SAN など）だけ。続かない値（共鳴・幸運・HP）は出さない（P3） */
            const mainStat = carriedValues(c)[0];
            return (
              <li key={c.id}>
                <Link
                  to={`/characters/${c.id}`}
                  className="row-interactive flex items-center gap-3.5 px-4 py-3 sm:px-5"
                >
                  <CharAvatar c={c} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold leading-snug">{c.name}</div>
                    {c.archetype && <div className="truncate text-xs text-ink2">{c.archetype}</div>}
                    <div className="meta mt-0.5 text-xs tabular-nums">
                      {mainStat && (
                        <span>
                          {mainStat.label} <b className="text-base-content">{mainStat.value}</b>
                        </span>
                      )}
                      <span>{last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    ) : null;

  return (
    <>
      <PageHead title="ホーム" />

      {schedule.pollsNeedingReply.length > 0 && (
        <section aria-labelledby="home-polls" className="mb-8">
          <SectionTitle>
            <span id="home-polls">日程調整の返事</span>
          </SectionTitle>
          <div className="surface list">
            {schedule.pollsNeedingReply.map((ev) => {
              const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
              return (
                <div key={ev.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold leading-snug">{ev.title}</div>
                    <div className="meta mt-0.5 text-xs sm:text-sm">
                      {tb && <span className="max-w-40 truncate">{tb.name}</span>}
                      <span className="tabular-nums">候補 {candidateSpan(ev)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm shrink-0"
                    onClick={() => setAnswerPollId(ev.id)}
                  >
                    返事する
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {nextSection || asideColumn ? (
        <SplitLayout
          asideWidth="lg"
          main={mainColumn}
          asideTop={nextSection ?? undefined}
          aside={asideColumn}
        />
      ) : (
        mainColumn
      )}

      {answerPoll && (
        <PollDetailModal
          key={answerPoll.id}
          event={answerPoll}
          state={state}
          initialMode="answer"
          onClose={() => setAnswerPollId(null)}
        />
      )}
      {openEvent && (
        <EventDetailModal
          event={openEvent}
          table={openEvent.tableId ? state.tables[openEvent.tableId] : undefined}
          scenario={openEvent.scenarioId ? state.scenarios[openEvent.scenarioId] : undefined}
          today={today}
          onClose={() => setOpenEvent(null)}
          onRecordSession={() => recordFromEvent(openEvent)}
        />
      )}
    </>
  );
}
