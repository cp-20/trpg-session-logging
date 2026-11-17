/**
 * ホーム。開いたときに「今、自分に関係あること」を上から順に並べる。
 *   返事待ちの日程調整 → 次の予定 → 記録がまだの予定 → 最近のセッション → 自分のキャラクター
 * 件数や合計の数字は出さない。何もない区画は出さない。
 */
import { useMemo, useState } from "react";
import { CharAvatar } from "../components/identity";
import { IconChevronRight, IconPlus, IconUpload, IconUsersGroup } from "../components/icons";
import { EmptyState, PageHead, SectionTitle } from "../components/ui";
import { fmtDateShort, todayStr } from "../lib/format";
import { Link, useNavigate } from "../lib/router";
import { myScheduleView, pollCandidates, relativeDayLabel } from "../lib/schedule";
import { sessionsOfMe, useStore } from "../store";
import type { TableEvent } from "../types";
import { EventDetailModal, EventRow } from "./Calendar";
import { lastPlayed } from "./Characters";
import { SessionRow } from "./Sessions";

const RECENT_SESSIONS = 3;
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

  const schedule = useMemo(() => myScheduleView(state, today), [state, today]);
  const recent = useMemo(() => [...sessionsOfMe(state)].sort((a, b) => b.t0 - a.t0), [state]);
  const myChars = useMemo(
    () =>
      Object.values(state.characters)
        .filter((c) => c.ownerId === state.me)
        .sort((a, b) => (lastPlayed(b) ?? "").localeCompare(lastPlayed(a) ?? "")),
    [state.characters, state.me],
  );
  const hasTables = Object.values(state.tables).some(
    (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
  );

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
                  <IconUsersGroup width={16} height={16} /> いつものメンバーで卓をつくる
                </Link>
              </>
            }
          >
            CCFOLIA・Udonarium・テキストのログを入れると、日時と参加者がそのまま記録になります。
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="ホーム" />

      <div className="space-y-10">
        {schedule.pollsNeedingReply.length > 0 && (
          <section aria-labelledby="home-polls">
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
                    <Link to="/calendar" className="btn btn-sm shrink-0">
                      返事する
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(schedule.upcoming.length > 0 || hasTables) && (
          <section aria-labelledby="home-next">
            <SectionTitle
              right={schedule.upcoming.length > 0 && <SeeAll to="/calendar" label="カレンダー" />}
            >
              <span id="home-next">次の予定</span>
            </SectionTitle>
            {schedule.upcoming.length > 0 ? (
              <div className="surface list">
                {schedule.upcoming.slice(0, NEXT_EVENTS).map((ev) => {
                  const rel = relativeDayLabel(today, ev.date);
                  return (
                    <EventRow
                      key={ev.id}
                      ev={ev}
                      state={state}
                      onOpen={() => setOpenEvent(ev)}
                      trailing={
                        rel && (
                          <span
                            className={
                              rel === "今日" || rel === "あす"
                                ? "shrink-0 text-sm font-bold text-primary"
                                : "shrink-0 text-sm text-ink2"
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
        )}

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

        {myChars.length > 0 && (
          <section aria-labelledby="home-chars">
            <SectionTitle right={<SeeAll to="/characters" label="すべて" />}>
              <span id="home-chars">自分のキャラクター</span>
            </SectionTitle>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {myChars.slice(0, 4).map((c) => {
                const last = lastPlayed(c);
                return (
                  <li key={c.id}>
                    <Link
                      to={`/characters/${c.id}`}
                      className="card-interactive h-full items-center gap-2 px-3 py-4 text-center"
                    >
                      <CharAvatar c={c} size={56} />
                      <span className="w-full min-w-0">
                        <span className="block truncate text-sm font-bold">{c.name}</span>
                        <span className="block truncate text-xs text-ink2">
                          {last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

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
