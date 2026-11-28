import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "../lib/router";
import { Controller, useForm, useWatch } from "react-hook-form";
import {
  IconCalendar,
  IconCalendarTime,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconX,
} from "../components/icons";
import {
  CopyBox,
  DateBlock,
  Field,
  FieldError,
  HoverCard,
  Modal,
  PageHead,
  SectionTitle,
  Seg,
  Combobox,
  Select,
  SplitLayout,
  cx,
  weekdayTone,
  DateInput,
} from "../components/ui";
import { Avatar, AvatarStack } from "../components/identity";
import { GoogleBusySettings } from "../components/google-busy";
import { features } from "../lib/features";
import { getJapaneseHolidayName } from "../lib/holidays";
import { buildFeedIcs, feedUrl, newFeedToken, publishFeed, revokeFeed } from "../lib/calendar-feed";
import {
  VALID_DATE,
  VALID_TIME,
  addDays,
  applyConfirmCandidate,
  applyPollAnswers,
  applyPollEdit,
  confirmedOwnPlans,
  googleBusyPlans,
  planFinder,
  planTimeText,
  plansByDate,
  calendarSubscribeLinks,
  canConfirmPoll,
  canEditPoll,
  computeEndTime,
  eventDurationMinutes,
  groupBy,
  hasBusySource,
  monthCells,
  pollCandidates,
  pollDurationMinutes,
  pollMemberIds,
  quickWeekendDates,
  type OwnPlan,
  relativeDayLabel,
  shiftYearMonth,
  unansweredCount,
} from "../lib/schedule";
import { fmtDate, fmtDur, sessionPlayMinutes, todayStr, uid, sessionDays } from "../lib/time";
import { useStore } from "../store";
import type { ComboboxOption } from "../components/ui";
import type { Availability, Log, Scenario, State, Table, TableEvent, TableEventCandidate } from "../types";
import { sessionTitle } from "../lib/session-scenario";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const RSVP_SYMBOL: Record<Availability, string> = { ok: "◯", maybe: "△", ng: "×" };

const RSVP_OPTIONS: { v: Availability; label: string }[] = [
  { v: "ok", label: "◯ 参加可" },
  { v: "maybe", label: "△ 未定" },
  { v: "ng", label: "× 不可" },
];

const DURATION_PRESETS = [
  { minutes: 120, label: "2時間" },
  { minutes: 180, label: "3時間" },
  { minutes: 240, label: "4時間" },
  { minutes: 300, label: "5時間" },
] as const;

/** 「その他」の長さ: 30 分刻みで 30 分〜12 時間。時間と分を別の欄に分けない（1 つで選べる） */
const DURATION_CHOICES = Array.from({ length: 24 }, (_, i) => (i + 1) * 30).map((m) => ({
  value: String(m),
  label: fmtDur(m),
}));

/** 終わった予定のうち「記録がまだ」と促す期間 */
const UNRECORDED_LOOKBACK_DAYS = 30;

/** 月表示の予定名にポインタを留めてから補足を出すまでの時間（うっかり通過では出さない） */
const HOVER_DELAY_MS = 850;

type ExtendedTableEvent = TableEvent & {
  scenarioId?: string;
  durationMin?: number;
};

type ComposerState = { mode: "confirmed" | "poll"; date: string };

/* ============================================================
 * 一覧の部品（卓詳細からも使う）
 * ============================================================ */

/** 確定した予定の1行。押すと詳細を開く */
export function EventRow({
  ev,
  state,
  onOpen,
  showTable = true,
  metaRight,
  trailing,
  muted,
  highlight,
  avatars,
}: {
  ev: ExtendedTableEvent;
  state: State;
  onOpen: () => void;
  showTable?: boolean;
  /** クリック領域（ボタン内）の右端に置く補足表示（日付ラベルや出欠集計など） */
  metaRight?: ReactNode;
  /** 別の操作ボタン（「記録する」等）を行の右端に置く場合だけ使う */
  trailing?: ReactNode;
  muted?: boolean;
  highlight?: boolean;
  avatars?: ReactNode;
}) {
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  const sc = ev.scenarioId ? state.scenarios[ev.scenarioId] : undefined;
  const durMin = eventDurationMinutes(ev.startTime, ev.endTime, ev.durationMin);
  return (
    <div className="row-interactive flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <DateBlock date={ev.date} muted={muted} highlight={highlight} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold leading-snug">{ev.title}</span>
          <span className="meta mt-0.5 text-xs sm:text-sm">
            <span className="tabular-nums">
              {ev.startTime}–{ev.endTime}
              {durMin > 0 ? `（${fmtDur(durMin)}）` : ""}
            </span>
            {showTable && tb && <span className="max-w-40 truncate">{tb.name}</span>}
            {sc && <span className="max-w-48 truncate">{sc.title}</span>}
          </span>
          {avatars && <span className="mt-1.5 flex items-center">{avatars}</span>}
        </span>
        {metaRight}
      </button>
      {trailing}
    </div>
  );
}

/* ============================================================
 * カレンダー画面
 *   返事待ちの日程調整 → メイン2カラム（左: 月カレンダー / 右: 予定・調整中・未記録）
 * ============================================================ */

export default function Calendar() {
  const { state } = useStore();
  const nav = useNavigate();
  const today = todayStr();
  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [tableFilter, setTableFilter] = useState("all");
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pollTarget, setOpenPoll] = useState<{ id: string; mode: "view" | "answer" } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const myTables = useMemo(
    () => Object.values(state.tables).filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me),
    [state.tables, state.me],
  );
  const myTableIds = useMemo(() => new Set(myTables.map((t) => t.id)), [myTables]);

  /** 自分に関係する予定・日程調整（卓のもの + 自分が作った・返事した個人の予定） */
  const myEvents = useMemo(() => {
    const all = Object.values(state.events ?? {}) as ExtendedTableEvent[];
    return all
      .filter((ev) =>
        ev.tableId
          ? myTableIds.has(ev.tableId)
          : ev.createdBy === state.me || Boolean(ev.responses[state.me]),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [state.events, state.me, myTableIds]);

  const activePolls = useMemo(() => myEvents.filter((ev) => ev.status === "poll"), [myEvents]);
  const confirmedEvents = useMemo(() => myEvents.filter((ev) => ev.status !== "poll"), [myEvents]);
  const upcomingEvents = useMemo(
    () => confirmedEvents.filter((ev) => ev.date >= today),
    [confirmedEvents, today],
  );
  const pollsNeedingReply = useMemo(
    () => activePolls.filter((ev) => unansweredCount(ev, state.me) > 0),
    [activePolls, state.me],
  );
  const pollsAnswered = useMemo(
    () => activePolls.filter((ev) => unansweredCount(ev, state.me) === 0),
    [activePolls, state.me],
  );

  const selectedEvent = useMemo(
    () => (selectedEventId ? (myEvents.find((ev) => ev.id === selectedEventId) ?? null) : null),
    [selectedEventId, myEvents],
  );
  const openPoll = useMemo(
    () => (pollTarget ? (activePolls.find((ev) => ev.id === pollTarget.id) ?? null) : null),
    [pollTarget, activePolls],
  );

  const myLogs = useMemo(
    () => Object.values(state.logs).filter((l) => l.ownerId === state.me || Boolean(l.players[state.me])),
    [state.logs, state.me],
  );

  /** 終わったのに記録がない予定（同じ日に同じ卓の記録がないもの） */
  const unrecordedEvents = useMemo(() => {
    const from = addDays(today, -UNRECORDED_LOOKBACK_DAYS);
    return confirmedEvents
      .filter((ev) => ev.date < today && ev.date >= from)
      .filter(
        (ev) =>
          !myLogs.some(
            (l) =>
              sessionDays(l).includes(ev.date) && (!ev.tableId || !l.tableId || l.tableId === ev.tableId),
          ),
      )
      .reverse();
  }, [confirmedEvents, myLogs, today]);

  const tableOptions = useMemo<ComboboxOption[]>(
    () => [{ value: "all", label: "すべての卓" }, ...myTables.map((t) => ({ value: t.id, label: t.name }))],
    [myTables],
  );
  const formTableOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "", label: "卓なし（個人の予定）" },
      ...myTables.map((t) => ({ value: t.id, label: t.name })),
    ],
    [myTables],
  );
  const scenarioOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "", label: "選択しない" },
      ...Object.values(state.scenarios)
        .sort((a, b) => a.title.localeCompare(b.title, "ja"))
        .map((s) => ({ value: s.id, label: s.title, keywords: [s.author] })),
    ],
    [state.scenarios],
  );
  const defaultTableId = tableFilter !== "all" ? tableFilter : (myTables[0]?.id ?? "");

  function showConfirmed(cand: TableEventCandidate) {
    setYm(cand.date.slice(0, 7));
    setSelectedDay(cand.date);
  }

  function recordFromEvent(ev: ExtendedTableEvent) {
    nav({ to: `/upload?table=${ev.tableId ?? ""}&scenario=${ev.scenarioId ?? ""}` });
  }

  function openComposer(mode: ComposerState["mode"], date?: string) {
    const base = date ?? (selectedDay >= today ? selectedDay : today);
    setComposer({ mode, date: base });
  }

  const composerFormId = composer?.mode === "confirmed" ? "add-event-form" : "add-poll-form";

  return (
    <>
      <PageHead
        title="カレンダー"
        actions={
          <>
            <button type="button" className="btn" onClick={() => openComposer("poll")}>
              <IconCalendarTime width={16} height={16} /> 日程調整をはじめる
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openComposer("confirmed")}>
              <IconPlus width={16} height={16} /> 予定を追加
            </button>
          </>
        }
      />

      {pollsNeedingReply.length > 0 && (
        <section aria-labelledby="sec-reply" className="mb-8">
          <SectionTitle>
            <span id="sec-reply">返事を待っている日程調整</span>
          </SectionTitle>
          <div className="space-y-4">
            {pollsNeedingReply.map((ev) => (
              <PollCard
                key={ev.id}
                ev={ev}
                state={state}
                onOpen={(mode) => setOpenPoll({ id: ev.id, mode })}
              />
            ))}
          </div>
        </section>
      )}

      <SplitLayout
        asideWidth="lg"
        main={
          <MonthCalendar
            ym={ym}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            onChangeMonth={setYm}
            tableFilter={tableFilter}
            tableOptions={myTables.length > 1 ? tableOptions : null}
            onChangeTableFilter={setTableFilter}
            events={confirmedEvents}
            polls={activePolls}
            logs={myLogs}
            state={state}
            onOpenEvent={(ev) => setSelectedEventId(ev.id)}
            onOpenPoll={(ev) => setOpenPoll({ id: ev.id, mode: "view" })}
            onOpenSync={() => setSyncOpen(true)}
            onAddOnDay={(mode, date) => openComposer(mode, date)}
          />
        }
        aside={
          <div className="space-y-8">
            <section aria-labelledby="sec-upcoming">
              <SectionTitle>
                <span id="sec-upcoming">これからの予定</span>
              </SectionTitle>
              {upcomingEvents.length === 0 ? (
                <div className="surface px-5 py-4 text-sm text-ink2">決まっている予定はありません。</div>
              ) : (
                <div className="surface list">
                  {upcomingEvents.map((ev) => {
                    const rel = relativeDayLabel(today, ev.date);
                    const urgent = rel === "今日" || rel === "あす";
                    return (
                      <EventRow
                        key={ev.id}
                        ev={ev}
                        state={state}
                        highlight={urgent}
                        onOpen={() => setSelectedEventId(ev.id)}
                        metaRight={
                          rel && (
                            <span
                              className={cx(
                                "shrink-0 text-xs sm:text-sm",
                                urgent ? "font-bold text-primary" : "text-ink2",
                              )}
                            >
                              {rel}
                            </span>
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>

            {pollsAnswered.length > 0 && (
              <section aria-labelledby="sec-polls">
                <SectionTitle>
                  <span id="sec-polls">調整中の日程</span>
                </SectionTitle>
                <div className="surface list">
                  {pollsAnswered.map((ev) => {
                    const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
                    const cands = pollCandidates(ev);
                    const memberIds = pollMemberIds(ev, state);
                    const topCand = [...cands].sort(
                      (a, b) =>
                        memberIds.filter((id) => b.responses[id] === "ok").length -
                        memberIds.filter((id) => a.responses[id] === "ok").length,
                    )[0];
                    const topOk = topCand
                      ? memberIds.filter((id) => topCand.responses[id] === "ok").length
                      : 0;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setOpenPoll({ id: ev.id, mode: "view" })}
                        className="row-interactive flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold leading-snug">{ev.title}</div>
                          <div className="meta mt-0.5 text-xs">
                            {tb && <span className="max-w-32 truncate">{tb.name}</span>}
                            {topCand && (
                              <span className="tabular-nums">
                                最多 {fmtDate(topCand.date)}（◯ {topOk}/{memberIds.length}）
                              </span>
                            )}
                          </div>
                        </div>
                        <IconChevronRight width={16} height={16} className="shrink-0 text-ink3" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {unrecordedEvents.length > 0 && (
              <section aria-labelledby="sec-unrecorded">
                <SectionTitle>
                  <span id="sec-unrecorded">記録がまだの予定</span>
                </SectionTitle>
                <div className="surface list">
                  {unrecordedEvents.map((ev) => (
                    <EventRow
                      key={ev.id}
                      ev={ev}
                      state={state}
                      muted
                      onOpen={() => setSelectedEventId(ev.id)}
                      trailing={
                        <button
                          type="button"
                          className="btn btn-sm shrink-0"
                          onClick={() => recordFromEvent(ev)}
                        >
                          記録する
                        </button>
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        }
      />

      {composer && (
        <Modal
          title={composer.mode === "confirmed" ? "予定を追加" : "日程調整をはじめる"}
          wide={composer.mode === "poll"}
          onClose={() => setComposer(null)}
          foot={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setComposer(null)}>
                キャンセル
              </button>
              <button type="submit" form={composerFormId} className="btn btn-primary">
                {composer.mode === "confirmed" ? "予定を登録" : "日程調整を作成"}
              </button>
            </>
          }
        >
          {composer.mode === "confirmed" ? (
            <ConfirmedEventForm
              formId={composerFormId}
              tableOptions={formTableOptions}
              scenarioOptions={scenarioOptions}
              defaultTableId={defaultTableId}
              selectedDate={composer.date}
              onCreated={(date) => {
                setYm(date.slice(0, 7));
                setSelectedDay(date);
                setComposer(null);
              }}
            />
          ) : (
            <PollForm
              formId={composerFormId}
              tableOptions={formTableOptions}
              scenarioOptions={scenarioOptions}
              defaultTableId={defaultTableId}
              today={today}
              firstDate={composer.date > today ? composer.date : undefined}
              onCreated={(date) => {
                setYm(date.slice(0, 7));
                setSelectedDay(date);
                setComposer(null);
              }}
            />
          )}
        </Modal>
      )}

      {openPoll && (
        <PollDetailModal
          key={openPoll.id}
          event={openPoll}
          state={state}
          initialMode={pollTarget?.mode}
          onConfirmed={showConfirmed}
          onClose={() => setOpenPoll(null)}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          table={selectedEvent.tableId ? state.tables[selectedEvent.tableId] : undefined}
          scenario={selectedEvent.scenarioId ? state.scenarios[selectedEvent.scenarioId] : undefined}
          today={today}
          onClose={() => setSelectedEventId(null)}
          onRecordSession={() => {
            const target = selectedEvent;
            setSelectedEventId(null);
            recordFromEvent(target);
          }}
        />
      )}

      {syncOpen && <CalendarSyncDialog onClose={() => setSyncOpen(false)} />}
    </>
  );
}

/* ============================================================
 * 日程調整: 閲覧（既定）/ 自分の回答 / 編集 を分ける。
 *   候補は開始だけが違い、長さは日程調整に 1 つだけ持つ。
 * ============================================================ */

/** 取り込み済みの Google の時間帯。機能を切っている間は、残っていても照らし合わせに使わない */
function useGoogleBusy() {
  const { state } = useStore();
  return features.googleCalendar ? state.prefs.googleBusy : undefined;
}

/** 自分の予定（Google の時間帯と、卓譜で確定した予定）と照らし合わせる関数 */
export function useOwnPlans(): {
  find: (date: string, startTime: string, durationMin: number) => OwnPlan[];
  hasSource: boolean;
} {
  const { state } = useStore();
  const googleBusy = useGoogleBusy();
  const { events, tables, me } = state;
  return useMemo(() => {
    const confirmed = confirmedOwnPlans({ events, tables, me });
    return {
      find: planFinder([...googleBusyPlans({ googleBusy }), ...confirmed].sort((a, b) => a.start - b.start)),
      hasSource: hasBusySource({ googleBusy }) || confirmed.length > 0,
    };
  }, [googleBusy, events, tables, me]);
}

/** 自分の予定の 1 行（時間と題）。題のないもの（Google の時間帯）は時間だけ */
function ownPlanText(p: OwnPlan, date: string): string {
  return p.label ? `${planTimeText(p, date)} ${p.label}` : planTimeText(p, date);
}

type PollMode = "view" | "answer" | "edit";

function candidateTally(cand: TableEventCandidate, memberIds: string[]) {
  const ok = memberIds.filter((id) => cand.responses[id] === "ok").length;
  const maybe = memberIds.filter((id) => cand.responses[id] === "maybe").length;
  const ng = memberIds.filter((id) => cand.responses[id] === "ng").length;
  return { ok, maybe, ng, pending: memberIds.length - ok - maybe - ng };
}

/** 候補の日時。長さは日程調整全体で 1 つなので、候補には開始だけを出す */
function candidateLabel(cand: Pick<TableEventCandidate, "date" | "startTime">): string {
  // 候補は開始だけを持つ（長さは日程調整に 1 つ）。「21:00〜」で始まりだと分かるようにする
  return `${fmtDate(cand.date)} ${cand.startTime}〜`;
}

/** 日時の列の見出し。候補は開始だけを書くので、長さはここで 1 度だけ示す */
function pollDurationHead(durMin: number): string {
  return durMin > 0 ? `開始から${fmtDur(durMin)}` : "候補日";
}

/**
 * 候補日の表（閲覧用）。行が候補日、列がメンバー。だれがいつ来られるかを縦にも横にも見比べられるようにそろえる。
 * 自分の列は先頭に置いて薄い地で示す。押して返事はしない（返事は「回答する」から）
 */
function PollCandidateView({
  ev,
  state,
  ownPlans,
  compact = false,
  canConfirm = false,
  onConfirm,
}: {
  ev: ExtendedTableEvent;
  state: State;
  ownPlans: (cand: TableEventCandidate) => OwnPlan[];
  /** カレンダーの返事待ちカード用。確定を省く */
  compact?: boolean;
  canConfirm?: boolean;
  onConfirm?: (cand: TableEventCandidate) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const candidates = pollCandidates(ev);
  const memberIds = pollMemberIds(ev, state);
  const ordered = memberIds.includes(state.me)
    ? [state.me, ...memberIds.filter((id) => id !== state.me)]
    : memberIds;
  const tallies = candidates.map((c) => candidateTally(c, memberIds));
  const bestOk = Math.max(0, ...tallies.map((t) => t.ok));
  const withConfirm = !compact && canConfirm && Boolean(onConfirm);
  const cell = "px-1 py-2.5 text-center align-middle";
  const mine = (id: string) => id === state.me && "bg-primary/5";

  return (
    // 人数が多いと横に送れる。欄そのものにフォーカスできるようにし、開いたとき右端のボタンへ送られて自分の列が隠れるのを防ぐ
    <div
      role="region"
      aria-label="候補日と回答"
      tabIndex={0}
      className="overflow-x-auto rounded-b-box border-t border-base-300"
    >
      <table className="w-full border-collapse text-sm tabular-nums" aria-label="候補日">
        <thead>
          <tr className="border-b border-base-300 text-xs text-ink2">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-base-100 py-2 pl-4 pr-3 text-left font-medium sm:pl-5"
            >
              {pollDurationHead(pollDurationMinutes(ev))}
            </th>
            <th
              scope="col"
              className={cx(cell, "hidden min-w-12 whitespace-nowrap font-medium sm:table-cell")}
            >
              <span aria-hidden>◯</span>
              <span className="sr-only">参加できる人数</span>
            </th>
            {ordered.map((id) => {
              const u = state.users[id]!;
              return (
                <th key={id} scope="col" className={cx(cell, "px-0 font-medium", mine(id))}>
                  <span className="mx-auto flex w-10 flex-col items-center gap-1 sm:w-14">
                    <Avatar u={u} size={22} />
                    <span className={cx("w-full truncate", id === state.me && "font-bold text-base-content")}>
                      {u.name}
                    </span>
                  </span>
                </th>
              );
            })}
            {/* 余った幅はここに寄せ、日時と回答を離さない */}
            <th scope="col" className="w-full pr-4 sm:pr-5">
              {withConfirm && <span className="sr-only">確定</span>}
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((cand, i) => {
            const t = tallies[i]!;
            const label = candidateLabel(cand);
            const isBest = t.ok === bestOk && t.ok > 0;
            return (
              <tr key={cand.id} className="border-b border-base-300 last:border-b-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-base-100 py-2.5 pl-4 pr-3 text-left sm:pl-5"
                >
                  <span className={cx("block sm:inline", isBest ? "font-bold" : "font-medium")}>
                    {fmtDate(cand.date)}
                  </span>{" "}
                  <span className={cx("block sm:inline", isBest ? "font-bold" : "font-medium")}>
                    {cand.startTime}〜
                  </span>
                </th>
                <td
                  className={cx(
                    cell,
                    "hidden whitespace-nowrap sm:table-cell",
                    isBest ? "font-bold" : "text-ink2",
                  )}
                >
                  {t.ok}
                  <span className="text-xs font-normal text-ink2">/{memberIds.length}</span>
                </td>
                {ordered.map((id) => {
                  const r = cand.responses[id];
                  return (
                    <td
                      key={id}
                      className={cx(
                        cell,
                        mine(id),
                        r === "ok"
                          ? "font-bold text-base-content"
                          : r === "ng"
                            ? "font-semibold text-error"
                            : "text-ink2",
                      )}
                    >
                      {r ? RSVP_SYMBOL[r] : "–"}
                      {!r && <span className="sr-only">未回答</span>}
                      {/* 自分の列の中に出すので、だれの予定かを書かなくても分かる */}
                      {id === state.me && ownPlans(cand).length > 0 && (
                        <span className="mt-0.5 flex items-center justify-center gap-0.5 whitespace-nowrap text-xs font-medium text-ink2">
                          <IconCalendar width={12} height={12} aria-hidden />
                          <span aria-hidden>予定</span>
                          <span className="sr-only">自分の予定あり</span>
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap py-1.5 pl-2 pr-4 text-right sm:pr-5">
                  {withConfirm &&
                    (confirming === cand.id ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setConfirming(null);
                            onConfirm?.(cand);
                          }}
                        >
                          確定する
                        </button>
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm"
                          onClick={() => setConfirming(null)}
                        >
                          やめる
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        aria-label={`${label} で確定`}
                        onClick={() => setConfirming(cand.id)}
                      >
                        確定
                      </button>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 候補と重なる自分の予定。返事を決める材料なので、時間と題まで出す */
function OwnPlanLines({ plans, date }: { plans: readonly OwnPlan[]; date: string }) {
  if (plans.length === 0) return null;
  return (
    <ul aria-label="自分の予定" className="mt-1 space-y-0.5 text-xs text-ink2">
      {plans.slice(0, 2).map((p, i) => (
        <li key={i} className="flex items-center gap-1">
          <IconCalendar width={13} height={13} className="shrink-0" aria-hidden />
          <span className="shrink-0 font-medium">自分の予定</span>
          <span className="min-w-0 truncate tabular-nums">{ownPlanText(p, date)}</span>
        </li>
      ))}
      {plans.length > 2 && <li>ほか{plans.length - 2}件</li>}
    </ul>
  );
}

/** 自分の回答（回答画面）。保存するまで書き込まない */
function PollAnswerList({
  ev,
  answers,
  ownPlans,
  hasBusySource: hasSource,
  onChange,
}: {
  ev: ExtendedTableEvent;
  answers: Record<string, Availability>;
  ownPlans: (cand: TableEventCandidate) => OwnPlan[];
  hasBusySource: boolean;
  onChange: (next: Record<string, Availability>) => void;
}) {
  const candidates = pollCandidates(ev);
  const fillable = candidates.filter((c) => !answers[c.id] && ownPlans(c).length === 0).map((c) => c.id);
  return (
    <>
      {pollDurationMinutes(ev) > 0 && (
        <div className="border-t border-base-300 px-4 py-2 text-xs font-medium text-ink2 sm:px-5">
          {pollDurationHead(pollDurationMinutes(ev))}
        </div>
      )}
      <ul className="list border-t border-base-300" aria-label="自分の回答">
        {candidates.map((cand) => {
          const label = candidateLabel(cand);
          return (
            <li key={cand.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-40">
                <div className="font-semibold tabular-nums">{label}</div>
                <OwnPlanLines plans={ownPlans(cand)} date={cand.date} />
              </div>
              <Seg<Availability>
                size="sm"
                ariaLabel={`${label} の自分の返事`}
                value={(answers[cand.id] ?? "") as Availability}
                options={RSVP_OPTIONS}
                onChange={(v) => onChange({ ...answers, [cand.id]: v })}
              />
            </li>
          );
        })}
      </ul>
      {fillable.length > 0 && (
        <div className="flex border-t border-base-300 px-3 py-2 sm:px-4">
          <button
            type="button"
            className="btn btn-quiet btn-sm ml-auto"
            onClick={() => onChange({ ...answers, ...Object.fromEntries(fillable.map((id) => [id, "ok"])) })}
          >
            <IconCheck width={14} height={14} aria-hidden />
            {hasSource ? "予定と重ならない候補をすべて◯" : "未回答をすべて◯"}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * 日程調整の「どこで・何を」。卓の画面では卓名を省く。作った人は判断に使わないので出さない（P5）。
 * 長さは候補日の列の見出し（pollDurationHead）に出す。1 つだけ離して置かない
 */
function PollMeta({
  event,
  state,
  inTable,
  onNavigate,
}: {
  event: ExtendedTableEvent;
  state: State;
  inTable?: boolean;
  onNavigate?: () => void;
}) {
  const tb = event.tableId ? state.tables[event.tableId] : undefined;
  const sc = event.scenarioId ? state.scenarios[event.scenarioId] : undefined;
  if (inTable && !sc) return null;
  return (
    <div className="meta text-xs sm:text-sm">
      {inTable ? null : tb ? (
        <Link
          to={`/tables/${tb.id}`}
          onClick={onNavigate}
          className="hover:text-base-content hover:underline"
        >
          {tb.name}
        </Link>
      ) : (
        <span>個人の予定</span>
      )}
      {sc && (
        <Link
          to={`/scenarios/${sc.id}`}
          onClick={onNavigate}
          className="hover:text-base-content hover:underline"
        >
          {sc.title}
        </Link>
      )}
    </div>
  );
}

/** カレンダー上部の「返事を待っている日程調整」。閲覧だけを出し、返事はモーダルで */
function PollCard({
  ev,
  state,
  onOpen,
}: {
  ev: ExtendedTableEvent;
  state: State;
  onOpen: (mode: Exclude<PollMode, "edit">) => void;
}) {
  const { find } = useOwnPlans();
  const durMin = pollDurationMinutes(ev);
  return (
    <article className="surface" aria-label={ev.title}>
      <header className="flex flex-wrap items-start gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-snug">{ev.title}</h3>
          <div className="mt-0.5">
            <PollMeta event={ev} state={state} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => onOpen("view")}>
            詳しく見る
          </button>
          <button type="button" className="btn btn-sm" onClick={() => onOpen("answer")}>
            回答する
          </button>
        </div>
      </header>
      <PollCandidateView ev={ev} state={state} compact ownPlans={(c) => find(c.date, c.startTime, durMin)} />
    </article>
  );
}

/** 調整中の日程詳細モーダル（カレンダー・卓詳細・ホームの共通ビュー） */
export function PollDetailModal({
  event,
  state,
  initialMode = "view",
  inTable,
  onClose,
  onConfirmed,
}: {
  event: ExtendedTableEvent;
  state: State;
  /** 卓の画面から開いたとき（卓名を省く） */
  inTable?: boolean;
  /** 「返事する」から開いたときは回答画面から始める */
  initialMode?: Exclude<PollMode, "edit">;
  onClose: () => void;
  onConfirmed?: (cand: TableEventCandidate) => void;
}) {
  const { update } = useStore();
  const { find, hasSource } = useOwnPlans();
  const [mode, setMode] = useState<PollMode>(initialMode);
  const durMin = pollDurationMinutes(event);
  const ownPlans = (c: TableEventCandidate) => find(c.date, c.startTime, durMin);
  const canManage = canConfirmPoll(event, state);
  const canEdit = canEditPoll(event, state);
  const myAnswers = () =>
    Object.fromEntries(
      pollCandidates(event)
        .filter((c) => c.responses[state.me])
        .map((c) => [c.id, c.responses[state.me]!]),
    ) as Record<string, Availability>;
  const [answers, setAnswers] = useState<Record<string, Availability>>(myAnswers);
  const answeredAll = pollCandidates(event).every((c) => c.responses[state.me]);
  const editFormId = `poll-edit-${event.id}`;

  function startAnswer() {
    setAnswers(myAnswers());
    setMode("answer");
  }

  function saveAnswers() {
    update((s) => applyPollAnswers(s, event.id, answers));
    setMode("view");
  }

  function confirm(cand: TableEventCandidate) {
    update((s) => applyConfirmCandidate(s, event.id, cand));
    onConfirmed?.(cand);
    onClose();
  }

  // 段ごとにボタンへ key を付ける。付けないと、押した「編集」の DOM が同じ位置の送信ボタンに
  // 使い回され、押した直後に編集フォームが送信されてしまう
  const foot =
    mode === "view" ? (
      <>
        <button key="close" type="button" className="btn btn-quiet" onClick={onClose}>
          閉じる
        </button>
        {canEdit && (
          <button key="edit" type="button" className="btn" onClick={() => setMode("edit")}>
            <IconPencil width={16} height={16} /> 編集
          </button>
        )}
        <button key="answer" type="button" className="btn btn-primary" onClick={startAnswer}>
          {answeredAll ? "回答を直す" : "回答する"}
        </button>
      </>
    ) : mode === "answer" ? (
      <>
        <button key="answer-cancel" type="button" className="btn btn-quiet" onClick={() => setMode("view")}>
          キャンセル
        </button>
        <button key="answer-save" type="button" className="btn btn-primary" onClick={saveAnswers}>
          回答を保存
        </button>
      </>
    ) : (
      <>
        <button key="edit-cancel" type="button" className="btn btn-quiet" onClick={() => setMode("view")}>
          キャンセル
        </button>
        <button key="edit-save" type="submit" form={editFormId} className="btn btn-primary">
          保存
        </button>
      </>
    );

  return (
    <Modal
      title={mode === "edit" ? "日程調整を編集" : mode === "answer" ? `${event.title}に回答` : event.title}
      wide
      onClose={onClose}
      foot={foot}
    >
      {mode === "edit" ? (
        <PollEditForm formId={editFormId} event={event} onSaved={() => setMode("view")} />
      ) : (
        <>
          <PollMeta event={event} state={state} inTable={inTable} onNavigate={onClose} />
          {mode === "view" && event.note && (
            <p data-user-content className="mt-2 text-sm leading-relaxed text-ink2">
              {event.note}
            </p>
          )}
          <div
            className={cx(
              "-mx-5 -mb-5 sm:-mx-6",
              inTable && !event.scenarioId && !(mode === "view" && event.note) ? "-mt-5" : "mt-4",
            )}
          >
            {mode === "view" ? (
              <PollCandidateView
                ev={event}
                state={state}
                ownPlans={ownPlans}
                canConfirm={canManage}
                onConfirm={confirm}
              />
            ) : (
              <PollAnswerList
                ev={event}
                answers={answers}
                ownPlans={ownPlans}
                hasBusySource={hasSource}
                onChange={setAnswers}
              />
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/** 日程調整の編集（作った人・卓の作成者だけ）。作成と同じ部品で、長さは 1 つ・候補は開始だけ */
function PollEditForm({
  formId,
  event,
  onSaved,
}: {
  formId: string;
  event: ExtendedTableEvent;
  onSaved: () => void;
}) {
  const { update } = useStore();
  const today = todayStr();
  const [title, setTitle] = useState(event.title);
  const [note, setNote] = useState(event.note ?? "");
  const [durationMin, setDurationMin] = useState(pollDurationMinutes(event) || 180);
  const [candidates, setCandidates] = useState<DraftCandidate[]>(() =>
    pollCandidates(event).map((c) => ({ id: c.id, date: c.date, startTime: c.startTime })),
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const changedAnswered = pollCandidates(event).some(
    (c) =>
      Object.keys(c.responses).length > 0 &&
      !candidates.some((d) => d.id === c.id && d.date === c.date && d.startTime.trim() === c.startTime),
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("タイトルを入力してください。");
      return;
    }
    const err = validateCandidates(candidates);
    if (err) {
      setCandidateError(err);
      return;
    }
    update((s) => applyPollEdit(s, event.id, { title, note, durationMin, candidates }));
    onSaved();
  }

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="タイトル" noMargin>
        <input
          className={cx("input w-full", titleError && "input-error")}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleError(null);
          }}
        />
        <FieldError text={titleError} />
      </Field>
      <Field label="所要時間" noMargin>
        <DurationPicker durationMin={durationMin} onChange={setDurationMin} />
      </Field>
      <CandidateEditor
        candidates={candidates}
        onChange={(next) => {
          setCandidates(next);
          setCandidateError(null);
        }}
        today={today}
        error={candidateError}
      />
      {changedAnswered && (
        <p className="text-sm text-ink2">日時を変えた候補と消した候補の回答はなくなります。</p>
      )}
      <Field label="メモ（任意）" noMargin>
        <input className="input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </form>
  );
}

/* ============================================================
 * 月表示: 卓の絞り込みとカレンダー連携はここに付ける。
 * 予定名にポインタを留めると補足、押すと詳細。日を押すとその日の内容を下に出す。
 * ============================================================ */

type GridEntry =
  | { kind: "event"; key: string; ev: ExtendedTableEvent }
  | { kind: "poll"; key: string; ev: ExtendedTableEvent; cand: TableEventCandidate }
  | { kind: "log"; key: string; log: Log }
  | { kind: "own"; key: string; date: string; plans: OwnPlan[] };

/** 種類を示す語。凡例を置かず、印の横にこの語を出して分からせる（確定した予定は時刻が付くので語なし） */
function entryKindWord(e: GridEntry): string | null {
  return e.kind === "poll" ? "候補" : e.kind === "log" ? "記録" : e.kind === "own" ? "自分" : null;
}

function entryTitle(e: GridEntry, scenarios: State["scenarios"]): string {
  if (e.kind === "event") return `${e.ev.startTime} ${e.ev.title}`;
  if (e.kind === "own") return e.plans.map((p) => planTimeText(p, e.date)).join("、");
  return e.kind === "poll" ? e.ev.title : sessionTitle(e.log, scenarios);
}

function entryLabel(e: GridEntry, scenarios: State["scenarios"]): string {
  const word = entryKindWord(e);
  return word ? `${word} ${entryTitle(e, scenarios)}` : entryTitle(e, scenarios);
}

function EntryCard({ entry, state }: { entry: GridEntry; state: State }) {
  if (entry.kind === "own") {
    return (
      <span className="block">
        <span className="block font-bold leading-snug">自分の予定</span>
        {entry.plans.map((p, i) => (
          <span key={i} className="block text-xs tabular-nums text-ink2">
            {planTimeText(p, entry.date)}
          </span>
        ))}
      </span>
    );
  }
  if (entry.kind === "log") {
    const l = entry.log;
    const tb = l.tableId ? state.tables[l.tableId] : undefined;
    const people = Object.entries(l.players)
      .filter(([u]) => u !== l.ownerId && state.users[u])
      .map(([u, p]) => {
        const c = p.characterIds[0] ? state.characters[p.characterIds[0]] : undefined;
        return c ? ({ kind: "char", char: c } as const) : ({ kind: "user", user: state.users[u]! } as const);
      });
    return (
      <span className="block">
        <span className="block font-bold leading-snug">{sessionTitle(l, state.scenarios)}</span>
        <span className="meta mt-0.5 text-xs">
          <span>記録</span>
          {tb && <span>{tb.name}</span>}
          <span className="tabular-nums">{fmtDur(sessionPlayMinutes(l))}</span>
        </span>
        {people.length > 0 && (
          <span className="mt-2 flex items-center gap-2 text-xs text-ink2">
            <AvatarStack people={people} size={20} />
            <span className="min-w-0">
              {people.map((p) => (p.kind === "char" ? p.char.name : p.user.name)).join("、")}
            </span>
          </span>
        )}
      </span>
    );
  }
  const ev = entry.ev;
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  const sc = ev.scenarioId ? state.scenarios[ev.scenarioId] : undefined;
  return (
    <span className="block">
      <span className="block font-bold leading-snug">{ev.title}</span>
      <span className="meta mt-0.5 text-xs">
        {entry.kind === "poll" && <span>日程調整の候補</span>}
        <span className="tabular-nums">
          {entry.kind === "poll" ? `${entry.cand.startTime} 開始` : `${ev.startTime}–${ev.endTime}`}
        </span>
        <span>{tb ? tb.name : "個人の予定"}</span>
        {sc && <span>{sc.title}</span>}
      </span>
    </span>
  );
}

const MonthCalendar = memo(function MonthCalendar({
  ym,
  today,
  selectedDay,
  onSelectDay,
  onChangeMonth,
  tableFilter,
  tableOptions,
  onChangeTableFilter,
  events,
  polls,
  logs,
  state,
  onOpenEvent,
  onOpenPoll,
  onOpenSync,
  onAddOnDay,
}: {
  ym: string;
  today: string;
  selectedDay: string;
  onSelectDay: (d: string) => void;
  onChangeMonth: (ym: string) => void;
  tableFilter: string;
  tableOptions: ComboboxOption[] | null;
  onChangeTableFilter: (v: string) => void;
  events: ExtendedTableEvent[];
  polls: ExtendedTableEvent[];
  logs: Log[];
  state: State;
  onOpenEvent: (ev: ExtendedTableEvent) => void;
  onOpenPoll: (ev: ExtendedTableEvent) => void;
  onOpenSync: () => void;
  onAddOnDay: (mode: ComposerState["mode"], date: string) => void;
}) {
  const nav = useNavigate();
  const gridRef = useRef<HTMLDivElement>(null);
  const pendingFocusDay = useRef<string | null>(null);
  const [year, month] = ym.split("-").map(Number);
  const cells = useMemo(() => monthCells(ym), [ym]);
  const selectedInMonth = selectedDay.startsWith(`${ym}-`);
  const googleBusy = useGoogleBusy();
  const entriesByDate = useMemo(() => {
    const inFilter = (tableId?: string) => tableFilter === "all" || tableId === tableFilter;
    const map = new Map<string, GridEntry[]>();
    const push = (d: string, e: GridEntry) => {
      const arr = map.get(d);
      if (arr) arr.push(e);
      else map.set(d, [e]);
    };
    for (const ev of events) if (inFilter(ev.tableId)) push(ev.date, { kind: "event", key: ev.id, ev });
    for (const ev of polls) {
      if (!inFilter(ev.tableId)) continue;
      const seen = new Set<string>();
      for (const cand of pollCandidates(ev)) {
        if (seen.has(cand.date)) continue;
        seen.add(cand.date);
        push(cand.date, { kind: "poll", key: `${ev.id}-${cand.id}`, ev, cand });
      }
    }
    const byDate = groupBy(
      logs.filter((l) => inFilter(l.tableId)),
      (l) => sessionDays(l),
    );
    for (const [d, ls] of byDate) for (const l of ls) push(d, { kind: "log", key: l.id, log: l });
    // 自分の Google カレンダーの時間帯（題は読まない）。卓の予定の後ろに 1 日 1 行で添える
    for (const [d, plans] of plansByDate(googleBusyPlans({ googleBusy })))
      push(d, { kind: "own", key: `own-${d}`, date: d, plans });
    return map;
  }, [events, polls, logs, tableFilter, googleBusy]);

  const openEntry = (e: GridEntry) => {
    if (e.kind === "event") onOpenEvent(e.ev);
    else if (e.kind === "poll") onOpenPoll(e.ev);
    else if (e.kind === "log") nav({ to: `/sessions/${e.log.id}` });
  };

  const dayEntries = entriesByDate.get(selectedDay) ?? [];
  const holiday = getJapaneseHolidayName(selectedDay);
  const isCurrentMonth = ym === today.slice(0, 7);

  useEffect(() => {
    const targetDay = pendingFocusDay.current;
    if (!targetDay) return;
    pendingFocusDay.current = null;
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${targetDay}"]`)?.focus();
    });
  }, [ym, selectedDay]);

  const moveCalendarFocus = (targetDay: string) => {
    pendingFocusDay.current = targetDay;
    const targetYm = targetDay.slice(0, 7);
    if (targetYm !== ym) onChangeMonth(targetYm);
    onSelectDay(targetDay);
  };

  const handleDayKeyDown = (e: React.KeyboardEvent, dayStr: string, col: number, day: number) => {
    let nextDay: string | null = null;
    if (e.key === "ArrowLeft") nextDay = addDays(dayStr, -1);
    else if (e.key === "ArrowRight") nextDay = addDays(dayStr, 1);
    else if (e.key === "ArrowUp") nextDay = addDays(dayStr, -7);
    else if (e.key === "ArrowDown") nextDay = addDays(dayStr, 7);
    else if (e.key === "Home") nextDay = addDays(dayStr, -col);
    else if (e.key === "End") nextDay = addDays(dayStr, 6 - col);
    else if (e.key === "PageUp" || e.key === "PageDown") {
      const targetYm = shiftYearMonth(ym, e.key === "PageUp" ? -1 : 1);
      const [ny, nm] = targetYm.split("-").map(Number);
      const maxD = new Date(Date.UTC(ny!, nm!, 0)).getUTCDate();
      nextDay = `${targetYm}-${String(Math.min(day, maxD)).padStart(2, "0")}`;
    }
    if (!nextDay) return;
    e.preventDefault();
    moveCalendarFocus(nextDay);
  };

  return (
    <section aria-labelledby="sec-month">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="sec-month" className="text-base font-bold tabular-nums sm:text-lg">
          {year}年{month}月
        </h2>
        <div className="flex items-center">
          <button
            type="button"
            className="icon-btn size-9"
            aria-label="前の月"
            onClick={() => onChangeMonth(shiftYearMonth(ym, -1))}
          >
            <IconChevronLeft width={18} height={18} />
          </button>
          <button
            type="button"
            className="icon-btn size-9"
            aria-label="次の月"
            onClick={() => onChangeMonth(shiftYearMonth(ym, 1))}
          >
            <IconChevronRight width={18} height={18} />
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              className="btn btn-quiet btn-sm ml-1"
              onClick={() => {
                onChangeMonth(today.slice(0, 7));
                onSelectDay(today);
              }}
            >
              今月
            </button>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {tableOptions && (
            <Combobox
              size="sm"
              ariaLabel="カレンダーに表示する卓"
              value={tableFilter}
              options={tableOptions}
              onChange={onChangeTableFilter}
              className="min-w-0 flex-1 sm:w-48 sm:flex-none"
            />
          )}
          <button type="button" className="btn btn-sm shrink-0" onClick={onOpenSync}>
            <IconCalendarTime width={15} height={15} /> カレンダー連携
          </button>
        </div>
      </div>

      <div className="surface">
        <div className="grid grid-cols-7 rounded-t-box border-b border-base-300 bg-base-200/50 text-center text-xs font-bold">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={cx("py-2", i === 0 ? "text-error" : i === 6 ? "text-info" : "text-ink2")}>
              {w}
            </div>
          ))}
        </div>
        <div ref={gridRef} className="grid grid-cols-7">
          {cells.map((day, idx) => {
            const col = idx % 7;
            const edge = cx(col !== 6 && "border-r", idx < cells.length - 7 && "border-b", "border-base-300");
            if (day === null) {
              return <div key={`empty-${idx}`} className={cx("min-h-12 bg-base-200/30 sm:min-h-24", edge)} />;
            }
            const dayStr = `${ym}-${String(day).padStart(2, "0")}`;
            const entries = entriesByDate.get(dayStr) ?? [];
            const holidayName = getJapaneseHolidayName(dayStr);
            const isToday = dayStr === today;
            const isSelected = dayStr === selectedDay;
            const isTabTarget = selectedInMonth ? isSelected : day === 1;
            const has = (k: GridEntry["kind"]) => entries.some((e) => e.kind === k);
            const alignRight = col >= 4;
            return (
              <div
                key={dayStr}
                className={cx(
                  "relative min-h-12 min-w-0 p-1 transition-colors sm:min-h-24 sm:p-1.5",
                  edge,
                  isSelected ? "bg-primary/[0.07]" : "hover:bg-base-200/60",
                )}
              >
                {/* マス全体が「この日を選ぶ」ボタン。予定名のボタンはその上に重ねる */}
                <button
                  type="button"
                  data-calendar-day={dayStr}
                  tabIndex={isTabTarget ? 0 : -1}
                  aria-pressed={isSelected}
                  aria-label={`${fmtDate(dayStr)}${holidayName ? ` ${holidayName}` : ""}${
                    entries.length ? `、${entries.map((e) => entryLabel(e, state.scenarios)).join("、")}` : ""
                  }`}
                  onClick={() => onSelectDay(dayStr)}
                  onKeyDown={(e) => handleDayKeyDown(e, dayStr, col, day)}
                  className="absolute inset-0 rounded-none"
                />
                <div className="pointer-events-none relative flex min-w-0 flex-col items-center gap-1 sm:items-stretch">
                  <span className="flex min-w-0 items-center gap-1">
                    <span
                      className={cx(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                        isToday
                          ? "bg-primary text-primary-content"
                          : cx(isSelected && "ring-2 ring-primary/60", weekdayTone(dayStr)),
                      )}
                    >
                      {day}
                    </span>
                    {holidayName && (
                      <span className="hidden truncate text-xs text-error sm:inline">{holidayName}</span>
                    )}
                  </span>
                  {entries.length > 0 && (
                    <span className="flex gap-0.5 sm:hidden" aria-hidden>
                      {has("event") && <span className="size-1.5 rounded-full bg-primary" />}
                      {has("poll") && <span className="size-1.5 rounded-full bg-warning" />}
                      {has("log") && <span className="size-1.5 rounded-full bg-base-content/40" />}
                      {has("own") && <span className="size-1.5 rounded-full border border-base-content/50" />}
                    </span>
                  )}
                  <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {entries.slice(0, 3).map((e) => (
                      <HoverCard
                        key={e.key}
                        delay={HOVER_DELAY_MS}
                        card={<EntryCard entry={e} state={state} />}
                        align={alignRight ? "right" : "left"}
                        className="pointer-events-auto block min-w-0"
                      >
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={entryLabel(e, state.scenarios)}
                          onClick={() => (e.kind === "own" ? onSelectDay(dayStr) : openEntry(e))}
                          className={cx(
                            "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs leading-tight",
                            // 地は不透明に混ぜた色にする。半透明だと選んだ日（今日）の升の色と重なって濃くなり、文字のコントラストが足りなくなる
                            e.kind === "event" &&
                              "bg-[color-mix(in_oklab,oklch(var(--p))_10%,oklch(var(--b1)))] font-semibold text-primary hover:bg-[color-mix(in_oklab,oklch(var(--p))_15%,oklch(var(--b1)))]",
                            e.kind === "poll" &&
                              "border border-dashed border-warning/60 text-base-content/80 hover:bg-base-200",
                            e.kind === "log" && "bg-base-200 text-ink2 hover:bg-base-300/60",
                            e.kind === "own" && "text-ink2 hover:bg-base-200",
                          )}
                        >
                          {entryKindWord(e) && (
                            <span className="mr-1 font-semibold text-ink2">{entryKindWord(e)}</span>
                          )}
                          {/* 狭いマスでは始まりだけ。終わりまでは選んだ日の一覧で */}
                          {e.kind === "own"
                            ? `${planTimeText(e.plans[0]!, e.date).split("〜")[0]}${e.plans.length > 1 ? " ほか" : ""}`
                            : entryTitle(e, state.scenarios)}
                        </button>
                      </HoverCard>
                    ))}
                    {entries.length > 3 && (
                      <span className="px-1.5 text-xs text-ink2">ほか{entries.length - 3}件</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 選んだ日 */}
      <div className="surface mt-3" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <h3 className="min-w-0 flex-1 font-bold">
            {fmtDate(selectedDay)}
            {holiday && <span className="ml-2 text-sm font-normal text-error">{holiday}</span>}
          </h3>
          {selectedDay >= today && (
            <>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => onAddOnDay("poll", selectedDay)}
              >
                この日を候補に日程調整
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => onAddOnDay("confirmed", selectedDay)}
              >
                <IconPlus width={15} height={15} /> この日に予定を追加
              </button>
            </>
          )}
        </div>
        {dayEntries.length === 0 ? (
          <p className="border-t border-base-300 px-4 py-3 text-sm text-ink2 sm:px-5">
            予定も記録もありません。
          </p>
        ) : (
          <ul className="list border-t border-base-300 text-sm">
            {dayEntries.map((e) => {
              if (e.kind === "own")
                return (
                  <li key={e.key} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                    <span
                      className="size-2 shrink-0 rounded-full border border-base-content/50"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 tabular-nums text-ink2">
                      <span className="mr-2 font-semibold">自分の予定</span>
                      {entryTitle(e, state.scenarios)}
                    </span>
                    <span className="hidden shrink-0 text-xs text-ink2 sm:inline">Google カレンダー</span>
                  </li>
                );
              const dot =
                e.kind === "event" ? "bg-primary" : e.kind === "poll" ? "bg-warning" : "bg-base-content/40";
              const when =
                e.kind === "event"
                  ? `${e.ev.startTime}–${e.ev.endTime}`
                  : e.kind === "poll"
                    ? `${e.cand.startTime} 開始`
                    : fmtDur(sessionPlayMinutes(e.log));
              const title = e.kind === "log" ? sessionTitle(e.log, state.scenarios) : e.ev.title;
              const tableId = e.kind === "log" ? e.log.tableId : e.ev.tableId;
              return (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => openEntry(e)}
                    className="row-interactive flex w-full items-center gap-3 px-4 py-2.5 text-left sm:px-5"
                  >
                    <span className={cx("size-2 shrink-0 rounded-full", dot)} aria-hidden />
                    <span className="w-24 shrink-0 tabular-nums text-ink2">{when}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {entryKindWord(e) && (
                        <span className="mr-1.5 font-semibold text-ink2">{entryKindWord(e)}</span>
                      )}
                      {title}
                    </span>
                    {tableId && state.tables[tableId] && (
                      <span className="hidden shrink-0 text-xs text-ink2 sm:inline">
                        {state.tables[tableId]!.name}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
});

/* ============================================================
 * 予定の詳細（確定した予定）
 * ============================================================ */

export function EventDetailModal({
  event,
  table,
  scenario,
  today,
  onClose,
  onRecordSession,
}: {
  event: ExtendedTableEvent;
  table?: Table;
  scenario?: Scenario;
  today: string;
  onClose: () => void;
  onRecordSession: () => void;
}) {
  const { state } = useStore();
  const durMin = eventDurationMinutes(event.startTime, event.endTime, event.durationMin);
  const isPast = event.date < today;
  const attendees = Object.entries(event.responses).filter(([id]) => state.users[id]);

  return (
    <Modal
      title={event.title}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className={cx("btn", isPast && "btn-primary")} onClick={onRecordSession}>
            この予定のセッションを記録
          </button>
        </>
      }
    >
      <dl className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-ink2">日時</dt>
        <dd className="font-semibold tabular-nums">
          {fmtDate(event.date)} {event.startTime}–{event.endTime}
          {durMin > 0 && <span className="ml-2 font-normal text-ink2">{fmtDur(durMin)}</span>}
          {isPast && <span className="ml-2 font-normal text-ink2">終了</span>}
        </dd>
        <dt className="text-ink2">卓</dt>
        <dd>
          {table ? (
            <Link to={`/tables/${table.id}`} onClick={onClose} className="font-semibold hover:underline">
              {table.name}
            </Link>
          ) : (
            "個人の予定"
          )}
        </dd>
        {scenario && (
          <>
            <dt className="text-ink2">シナリオ</dt>
            <dd>
              <Link
                to={`/scenarios/${scenario.id}`}
                onClick={onClose}
                className="font-semibold hover:underline"
              >
                {scenario.title}
              </Link>
            </dd>
          </>
        )}
        {attendees.length > 0 && (
          <>
            <dt className="text-ink2">参加</dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-1">
              {attendees.map(([id, r]) => (
                <span key={id} className="inline-flex items-center gap-1.5">
                  <Avatar u={state.users[id]!} size={18} />
                  {state.users[id]!.name}
                  <span
                    className={cx(
                      "text-xs",
                      r === "ok" ? "text-success" : r === "ng" ? "text-error" : "text-ink2",
                    )}
                  >
                    {RSVP_SYMBOL[r]}
                  </span>
                </span>
              ))}
            </dd>
          </>
        )}
        {event.note && (
          <>
            <dt className="text-ink2">メモ</dt>
            <dd data-user-content className="whitespace-pre-wrap leading-relaxed">
              {event.note}
            </dd>
          </>
        )}
      </dl>
    </Modal>
  );
}

/* ============================================================
 * 入力フォーム
 * ============================================================ */

function DurationPicker({
  durationMin,
  onChange,
  error,
}: {
  durationMin: number;
  onChange: (nextMinutes: number) => void;
  error?: string;
}) {
  const safeDuration = Number.isFinite(durationMin) ? Math.max(0, durationMin) : 180;
  const isPreset = DURATION_PRESETS.some((p) => p.minutes === safeDuration);
  const [custom, setCustom] = useState(!isPreset);
  // 30 分刻みに丸めて、選択肢にない値（古い 15 分刻み）でも空欄にしない
  const customValue = String(Math.min(720, Math.max(30, Math.round(safeDuration / 30) * 30)));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Seg<string>
          size="sm"
          ariaLabel="予定時間"
          value={custom ? "custom" : String(safeDuration)}
          options={[
            ...DURATION_PRESETS.map((p) => ({ v: String(p.minutes), label: p.label })),
            { v: "custom", label: "その他" },
          ]}
          onChange={(v) => {
            if (v === "custom") {
              setCustom(true);
              onChange(Number(customValue));
            } else {
              setCustom(false);
              onChange(Number(v));
            }
          }}
        />
        {custom && (
          <Select
            size="sm"
            ariaLabel="予定時間"
            className="w-36"
            value={customValue}
            options={DURATION_CHOICES}
            onChange={(v) => onChange(Number(v))}
          />
        )}
      </div>
      <FieldError text={error} />
    </div>
  );
}

interface ConfirmedFormValues {
  tableId: string;
  scenarioId: string;
  title: string;
  date: string;
  startTime: string;
  durationMin: number;
  note: string;
}

function ConfirmedEventForm({
  formId,
  tableOptions,
  scenarioOptions,
  defaultTableId,
  selectedDate,
  onCreated,
}: {
  formId: string;
  tableOptions: ComboboxOption[];
  scenarioOptions: ComboboxOption[];
  defaultTableId: string;
  selectedDate: string;
  onCreated: (date: string) => void;
}) {
  const { update } = useStore();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmedFormValues>({
    mode: "onTouched",
    defaultValues: {
      tableId: defaultTableId,
      scenarioId: "",
      title: "",
      date: selectedDate,
      startTime: "21:00",
      durationMin: 180,
      note: "",
    },
  });

  const startTimeVal = useWatch({ control, name: "startTime" });
  const durationVal = useWatch({ control, name: "durationMin" });
  const computedEnd = computeEndTime(startTimeVal, durationVal);

  function onSubmit(values: ConfirmedFormValues) {
    const endTime = computeEndTime(values.startTime, values.durationMin);
    if (!endTime) return;
    const id = `ev_${uid()}`;
    const nextEvent: ExtendedTableEvent = {
      id,
      tableId: values.tableId,
      scenarioId: values.scenarioId || undefined,
      title: values.title.trim(),
      status: "confirmed",
      date: values.date,
      startTime: values.startTime.trim(),
      endTime,
      durationMin: values.durationMin,
      note: values.note.trim() || undefined,
      responses: {},
      createdBy: "",
    };
    update((s) => {
      s.events ??= {};
      nextEvent.responses = { [s.me]: "ok" };
      nextEvent.createdBy = s.me;
      s.events[id] = nextEvent;
    });
    onCreated(values.date);
  }

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label="タイトル" noMargin>
        <input
          {...register("title", {
            validate: (v) => (v.trim().length > 0 ? true : "予定のタイトルを入力してください。"),
          })}
          className={cx("input w-full", errors.title && "input-error")}
          placeholder="例: 次回セッション / キャラ作成会"
        />
        <FieldError text={errors.title?.message} />
      </Field>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="日付" noMargin>
          <DateInput
            {...register("date", {
              validate: (v) => (VALID_DATE.test(v) ? true : "日付を選んでください。"),
            })}
            className="w-full"
            invalid={Boolean(errors.date)}
          />
          <FieldError text={errors.date?.message} />
        </Field>
        <Field label="開始" noMargin>
          <input
            {...register("startTime", {
              validate: (v) => (VALID_TIME.test(v.trim()) ? true : "「21:00」の形で入力してください。"),
            })}
            inputMode="numeric"
            className={cx("input w-full tabular-nums", errors.startTime && "input-error")}
            placeholder="21:00"
          />
          <FieldError text={errors.startTime?.message} />
        </Field>
      </div>

      <Field label="所要時間" noMargin>
        <Controller
          control={control}
          name="durationMin"
          rules={{
            validate: (v) =>
              Number.isFinite(v) && v >= 15 && v <= 1440 ? true : "15分〜24時間で指定してください。",
          }}
          render={({ field }) => (
            <DurationPicker
              durationMin={field.value}
              onChange={(next) => field.onChange(next)}
              error={errors.durationMin?.message}
            />
          )}
        />
        {computedEnd && durationVal >= 15 && (
          <span className="mt-1.5 text-xs text-ink2 tabular-nums">
            {startTimeVal}–{computedEnd}（{fmtDur(durationVal)}）
          </span>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="卓" noMargin>
          <Controller
            control={control}
            name="tableId"
            render={({ field }) => (
              <Combobox
                ariaLabel="卓"
                className="w-full"
                value={field.value}
                onChange={field.onChange}
                options={tableOptions}
              />
            )}
          />
        </Field>
        <Field label="シナリオ（任意）" noMargin>
          <Controller
            control={control}
            name="scenarioId"
            render={({ field }) => (
              <Combobox
                ariaLabel="シナリオ"
                className="w-full"
                value={field.value}
                onChange={field.onChange}
                options={scenarioOptions}
              />
            )}
          />
        </Field>
      </div>

      <Field label="メモ（任意）" noMargin>
        <input
          {...register("note")}
          className="input w-full"
          placeholder="例: キャラクターの調整や持ち物の連絡"
        />
      </Field>
    </form>
  );
}

interface DraftCandidate {
  id: string;
  date: string;
  startTime: string;
}

function validateCandidates(candidates: readonly DraftCandidate[]): string | null {
  if (candidates.length === 0) return "候補日を1件以上追加してください。";
  for (const cand of candidates) {
    if (!VALID_DATE.test(cand.date)) return "すべての候補日の日付を選んでください。";
    if (!VALID_TIME.test(cand.startTime.trim())) return "候補の開始時刻を「21:00」の形で入力してください。";
  }
  return null;
}

/** 候補日の入力（作成・編集で共用）。長さは別の欄で 1 つだけ決め、候補ごとには開始だけを入れる */
function CandidateEditor({
  candidates,
  onChange,
  today,
  error,
}: {
  candidates: DraftCandidate[];
  onChange: (next: DraftCandidate[]) => void;
  today: string;
  error: string | null;
}) {
  const quickDates = useMemo(() => quickWeekendDates(today), [today]);
  const lastStart = (() => {
    const t = candidates[candidates.length - 1]?.startTime.trim() ?? "";
    return VALID_TIME.test(t) ? t : "21:00";
  })();

  function addDate(dateStr: string) {
    if (candidates.some((c) => c.date === dateStr)) return;
    onChange(
      [...candidates, { id: `cand_${uid()}`, date: dateStr, startTime: lastStart }].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
  }

  function addNextDay() {
    const last = candidates[candidates.length - 1];
    const baseDate = last && VALID_DATE.test(last.date) ? last.date : today;
    onChange([...candidates, { id: `cand_${uid()}`, date: addDays(baseDate, 1), startTime: lastStart }]);
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-base-content/90">候補（日付と開始時刻）</legend>
      <ul className="space-y-2">
        {candidates.map((cand, index) => (
          <li key={cand.id} className="flex items-center gap-2">
            <DateInput
              aria-label={`候補日 ${index + 1}`}
              className="min-w-0 flex-1"
              value={cand.date}
              onChange={(e) =>
                onChange(candidates.map((c) => (c.id === cand.id ? { ...c, date: e.target.value } : c)))
              }
            />
            <input
              aria-label={`候補開始時刻 ${index + 1}`}
              inputMode="numeric"
              className="input w-24 shrink-0 tabular-nums"
              value={cand.startTime}
              onChange={(e) =>
                onChange(candidates.map((c) => (c.id === cand.id ? { ...c, startTime: e.target.value } : c)))
              }
              placeholder="21:00"
            />
            <button
              type="button"
              disabled={candidates.length <= 1}
              aria-label={`候補日 ${index + 1} を削除`}
              className="icon-btn disabled:opacity-30"
              onClick={() => onChange(candidates.filter((c) => c.id !== cand.id))}
            >
              <IconX width={16} height={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-ink2">追加:</span>
        <button type="button" className="btn btn-quiet btn-xs" onClick={() => addDate(quickDates.thisSat)}>
          今週土曜
        </button>
        <button type="button" className="btn btn-quiet btn-xs" onClick={() => addDate(quickDates.thisSun)}>
          今週日曜
        </button>
        <button type="button" className="btn btn-quiet btn-xs" onClick={() => addDate(quickDates.nextSat)}>
          来週土曜
        </button>
        <button type="button" className="btn btn-quiet btn-xs" onClick={addNextDay}>
          <IconPlus width={12} height={12} /> 翌日
        </button>
      </div>
      <FieldError text={error} />
    </fieldset>
  );
}

interface PollFormValues {
  tableId: string;
  scenarioId: string;
  title: string;
  durationMin: number;
  note: string;
}

function PollForm({
  formId,
  tableOptions,
  scenarioOptions,
  defaultTableId,
  today,
  firstDate,
  onCreated,
}: {
  formId: string;
  tableOptions: ComboboxOption[];
  scenarioOptions: ComboboxOption[];
  defaultTableId: string;
  today: string;
  firstDate?: string;
  onCreated: (date: string) => void;
}) {
  const { update } = useStore();
  const [candidates, setCandidates] = useState<DraftCandidate[]>(() => [
    { id: `cand_${uid()}`, date: firstDate ?? quickWeekendDates(today).thisSat, startTime: "21:00" },
  ]);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PollFormValues>({
    mode: "onTouched",
    defaultValues: {
      tableId: defaultTableId,
      scenarioId: "",
      title: "",
      durationMin: 180,
      note: "",
    },
  });

  function onSubmit(values: PollFormValues) {
    const err = validateCandidates(candidates);
    if (err) {
      setCandidateError(err);
      return;
    }
    const builtCandidates: TableEventCandidate[] = candidates
      .map((c) => ({
        id: c.id,
        date: c.date,
        startTime: c.startTime.trim(),
        endTime: computeEndTime(c.startTime.trim(), values.durationMin),
        responses: {},
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    const first = builtCandidates[0]!;
    const id = `ev_${uid()}`;
    const nextPoll: ExtendedTableEvent = {
      id,
      tableId: values.tableId,
      scenarioId: values.scenarioId || undefined,
      title: values.title.trim(),
      status: "poll",
      date: first.date,
      startTime: first.startTime,
      endTime: first.endTime,
      durationMin: values.durationMin,
      note: values.note.trim() || undefined,
      responses: {},
      candidates: builtCandidates,
      createdBy: "",
    };

    update((s) => {
      s.events ??= {};
      nextPoll.createdBy = s.me;
      nextPoll.candidates = builtCandidates.map((c) => ({ ...c, responses: { [s.me]: "ok" } }));
      s.events[id] = nextPoll;
    });
    onCreated(first.date);
  }

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field label="タイトル" noMargin>
        <input
          {...register("title", {
            validate: (v) => (v.trim().length > 0 ? true : "タイトルを入力してください。"),
          })}
          className={cx("input w-full", errors.title && "input-error")}
          placeholder="例: 次回セッションの日程"
        />
        <FieldError text={errors.title?.message} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="卓" noMargin>
          <Controller
            control={control}
            name="tableId"
            render={({ field }) => (
              <Combobox
                ariaLabel="卓"
                className="w-full"
                value={field.value}
                onChange={field.onChange}
                options={tableOptions}
              />
            )}
          />
        </Field>
        <Field label="シナリオ（任意）" noMargin>
          <Controller
            control={control}
            name="scenarioId"
            render={({ field }) => (
              <Combobox
                ariaLabel="シナリオ"
                className="w-full"
                value={field.value}
                onChange={field.onChange}
                options={scenarioOptions}
              />
            )}
          />
        </Field>
      </div>

      <Field label="所要時間" noMargin>
        <Controller
          control={control}
          name="durationMin"
          rules={{
            validate: (v) =>
              Number.isFinite(v) && v >= 15 && v <= 1440 ? true : "15分〜24時間で指定してください。",
          }}
          render={({ field }) => (
            <DurationPicker
              durationMin={field.value}
              onChange={(next) => field.onChange(next)}
              error={errors.durationMin?.message}
            />
          )}
        />
      </Field>

      <CandidateEditor
        candidates={candidates}
        onChange={(next) => {
          setCandidates(next);
          setCandidateError(null);
        }}
        today={today}
        error={candidateError}
      />

      <Field label="メモ（任意）" noMargin>
        <input
          {...register("note")}
          className="input w-full"
          placeholder="例: キャラクターの調整や持ち物の連絡"
        />
      </Field>
    </form>
  );
}

/* ============================================================
 * カレンダー連携（普段使わないのでダイアログにしまう）
 *   卓譜の予定を自分のカレンダーへ（購読リンク）/ 自分の予定と照らし合わせる（Google の空き時間）。
 *   アプリごとの登録のしかたは、要る人が開くガイドにする
 * ============================================================ */

function CalendarSyncDialog({ onClose }: { onClose: () => void }) {
  const { state, update, authUser } = useStore();
  const today = todayStr();
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const feedToken = state.prefs.calendarFeedToken;
  const origin = typeof location !== "undefined" ? location.origin : "";
  const activeToken = authUser ? feedToken : "demo";
  const links = activeToken ? calendarSubscribeLinks(feedUrl(origin, activeToken)) : null;

  /** 購読リンクを作る（作り直すときは古いリンクを無効にする） */
  async function createFeed() {
    if (!authUser) return;
    setFeedBusy(true);
    setFeedError(null);
    const token = newFeedToken();
    try {
      // 古いリンクを先に止める。止められなければ作り直さない（古いリンクが知らないうちに生き残らないように）
      if (feedToken) await revokeFeed(feedToken);
      await publishFeed(token, authUser.uid, buildFeedIcs(state, today));
      update((s) => {
        s.prefs.calendarFeedToken = token;
      });
    } catch {
      setFeedError("リンクを作れませんでした。通信状態を確かめて、もう一度お試しください。");
    } finally {
      setFeedBusy(false);
    }
  }

  return (
    <Modal
      title="カレンダー連携"
      wide
      onClose={onClose}
      foot={
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          閉じる
        </button>
      }
    >
      <section aria-labelledby="sync-out">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 id="sync-out" className="min-w-0 flex-1 font-bold">
            卓譜の予定を自分のカレンダーに表示する
          </h3>
          <button type="button" className="btn btn-quiet btn-sm -mr-2" onClick={() => setGuideOpen(true)}>
            登録のしかた
          </button>
        </div>
        {links ? (
          <>
            {!authUser && <p className="mt-1 text-sm text-ink2">お試し中はサンプルの予定のリンクです。</p>}
            <div className="mt-3">
              <CopyBox text={links.feed} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={links.google} target="_blank" rel="noreferrer" className="btn btn-sm">
                Google カレンダーに追加
              </a>
              <a href={links.apple} className="btn btn-sm">
                Apple カレンダーに追加
              </a>
              {authUser && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm sm:ml-auto"
                  onClick={createFeed}
                  disabled={feedBusy}
                >
                  {feedBusy ? "作り直し中…" : "リンクを作り直す"}
                </button>
              )}
            </div>
          </>
        ) : (
          <button type="button" className="btn btn-sm mt-3" onClick={createFeed} disabled={feedBusy}>
            {feedBusy ? "作成中…" : "リンクを作る"}
          </button>
        )}
        <FieldError text={feedError} />
      </section>

      {features.googleCalendar && (
        <section aria-labelledby="sync-in" className="mt-6 border-t border-base-300 pt-5">
          <h3 id="sync-in" className="mb-3 font-bold">
            自分の予定と照らし合わせる
          </h3>
          <GoogleBusySettings frame="plain" />
        </section>
      )}

      {guideOpen && <SubscribeGuide onClose={() => setGuideOpen(false)} />}
    </Modal>
  );
}

/** アプリごとの登録のしかた。要る人だけが開く */
function SubscribeGuide({ onClose }: { onClose: () => void }) {
  const steps: { app: string; body: string }[] = [
    {
      app: "Google カレンダー",
      body: "パソコンで「Google カレンダーに追加」を押し、開いた画面で「追加」を押します。スマートフォンのアプリからは登録できません。",
    },
    {
      app: "Apple カレンダー（Mac・iPhone）",
      body: "登録する端末でこの画面を開き、「Apple カレンダーに追加」→「照会」（iPhone では「登録」）を押します。",
    },
    {
      app: "そのほかのアプリ",
      body: "リンクをコピーして、アプリの「URL で購読」や「照会カレンダーを追加」に貼り付けます。",
    },
  ];
  return (
    <Modal
      title="登録のしかた"
      onClose={onClose}
      foot={
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          閉じる
        </button>
      }
    >
      <div data-guide className="grid gap-4 text-sm leading-relaxed">
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.app}>
              <b className="block">{s.app}</b>
              <span className="text-ink2">{s.body}</span>
            </li>
          ))}
        </ol>
        <p className="border-t border-base-300 pt-3 text-ink2">
          確定した予定が自動で反映されます。リンクを知っている人は誰でも予定を見られるので、知られたときは「リンクを作り直す」を押してください。古いリンクは使えなくなります。
        </p>
      </div>
    </Modal>
  );
}
