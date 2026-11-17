import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link, useNavigate } from "../lib/router";
import { Controller, useForm } from "react-hook-form";
import {
  IconCalendarPlus,
  IconCalendarTime,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconExternal,
  IconPlus,
  IconUpload,
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
  PanelHead,
  SectionTitle,
  Seg,
  Select,
  cx,
  weekdayTone,
} from "../components/ui";
import { Avatar, AvatarStack } from "../components/identity";
import { getJapaneseHolidayName } from "../lib/holidays";
import { buildIcsCalendar, downloadIcs } from "../lib/ics";
import { buildFeedIcs, feedUrl, newFeedToken, publishFeed, revokeFeed } from "../lib/calendar-feed";
import {
  VALID_DATE,
  VALID_TIME,
  addDays,
  calendarSubscribeLinks,
  canConfirmPoll,
  computeEndTime,
  eventDurationMinutes,
  groupBy,
  monthCells,
  parseBusyDates,
  pollCandidates,
  pollMemberIds,
  quickWeekendDates,
  shiftYearMonth,
  unansweredCount,
} from "../lib/schedule";
import { fmtDate, fmtDur, sessionPlayMinutes, todayStr, uid } from "../lib/time";
import { useStore } from "../store";
import type { SelectOption } from "../components/ui";
import type { Availability, Log, Scenario, State, Table, TableEvent, TableEventCandidate } from "../types";

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

const MINUTE_OPTIONS = [
  { value: "0", label: "00分" },
  { value: "15", label: "15分" },
  { value: "30", label: "30分" },
  { value: "45", label: "45分" },
] as const;

/** 終わった予定のうち「記録がまだ」と促す期間 */
const UNRECORDED_LOOKBACK_DAYS = 30;

/** 月表示の予定名にポインタを留めてから補足を出すまでの時間（うっかり通過では出さない） */
const HOVER_DELAY_MS = 700;

type ExtendedTableEvent = TableEvent & {
  scenarioId?: string;
  durationMin?: number;
};

type ComposerState = { mode: "confirmed" | "poll"; date: string; anchor: "top" | "day" };

/* ============================================================
 * 一覧の部品（卓詳細からも使う）
 * ============================================================ */

/** 確定した予定の1行。押すと詳細を開く */
export function EventRow({
  ev,
  state,
  onOpen,
  showTable = true,
  trailing,
  muted,
}: {
  ev: ExtendedTableEvent;
  state: State;
  onOpen: () => void;
  showTable?: boolean;
  trailing?: ReactNode;
  muted?: boolean;
}) {
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  const sc = ev.scenarioId ? state.scenarios[ev.scenarioId] : undefined;
  const durMin = eventDurationMinutes(ev.startTime, ev.endTime, ev.durationMin);
  return (
    <div className="row-interactive flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
        aria-label={`${fmtDate(ev.date)} ${ev.title} の詳細`}
      >
        <DateBlock date={ev.date} muted={muted} />
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
        </span>
      </button>
      {trailing}
    </div>
  );
}

/* ============================================================
 * カレンダー画面
 *   返事待ちの日程調整 → これからの予定 → 調整中 → 記録がまだ → 月表示
 * ============================================================ */

export default function Calendar() {
  const { state, update } = useStore();
  const nav = useNavigate();
  const today = todayStr();
  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [tableFilter, setTableFilter] = useState("all");
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ExtendedTableEvent | null>(null);
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
  const upcomingEvents = confirmedEvents.filter((ev) => ev.date >= today);
  const pollsNeedingReply = activePolls.filter((ev) => unansweredCount(ev, state.me) > 0);
  const pollsAnswered = activePolls.filter((ev) => unansweredCount(ev, state.me) === 0);

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
            (l) => l.dates.includes(ev.date) && (!ev.tableId || !l.tableId || l.tableId === ev.tableId),
          ),
      )
      .reverse();
  }, [confirmedEvents, myLogs, today]);

  const busyDateSet = useMemo(() => new Set(state.prefs.busyDates ?? []), [state.prefs.busyDates]);

  const tableOptions = useMemo<SelectOption[]>(
    () => [{ value: "all", label: "すべての卓" }, ...myTables.map((t) => ({ value: t.id, label: t.name }))],
    [myTables],
  );
  const formTableOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "卓なし（個人の予定）" },
      ...myTables.map((t) => ({ value: t.id, label: t.name })),
    ],
    [myTables],
  );
  const scenarioOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "選択しない" },
      ...Object.values(state.scenarios)
        .sort((a, b) => a.title.localeCompare(b.title, "ja"))
        .map((s) => ({ value: s.id, label: s.title })),
    ],
    [state.scenarios],
  );
  const defaultTableId = tableFilter !== "all" ? tableFilter : (myTables[0]?.id ?? "");

  function setCandidateRsvp(eventId: string, candidateId: string, value: Availability) {
    update((s) => {
      const target = s.events?.[eventId];
      if (!target) return;
      if (target.candidates && target.candidates.length > 0) {
        const cand = target.candidates.find((c) => c.id === candidateId);
        if (cand) cand.responses[s.me] = value;
      } else {
        target.responses[s.me] = value;
      }
    });
  }

  function confirmCandidate(eventId: string, cand: TableEventCandidate) {
    update((s) => {
      const target = s.events?.[eventId] as ExtendedTableEvent | undefined;
      if (!target) return;
      target.status = "confirmed";
      target.date = cand.date;
      target.startTime = cand.startTime;
      target.endTime = cand.endTime;
      target.durationMin = eventDurationMinutes(cand.startTime, cand.endTime, target.durationMin);
      target.responses = { ...cand.responses };
      delete target.candidates;
    });
    setYm(cand.date.slice(0, 7));
    setSelectedDay(cand.date);
  }

  function recordFromEvent(ev: ExtendedTableEvent) {
    nav({ to: `/upload?table=${ev.tableId ?? ""}&scenario=${ev.scenarioId ?? ""}` });
  }

  function openComposer(mode: ComposerState["mode"], anchor: ComposerState["anchor"], date?: string) {
    const base = date ?? (selectedDay >= today ? selectedDay : today);
    setComposer({ mode, anchor, date: base });
  }

  const composerNode = (bare: boolean) =>
    composer && (
      <Composer
        key={`${composer.mode}-${composer.anchor}-${composer.date}`}
        bare={bare}
        mode={composer.mode}
        date={composer.date}
        today={today}
        tableOptions={formTableOptions}
        scenarioOptions={scenarioOptions}
        defaultTableId={defaultTableId}
        onClose={() => setComposer(null)}
        onCreated={(date) => {
          setYm(date.slice(0, 7));
          setSelectedDay(date);
          setComposer(null);
        }}
      />
    );

  const renderPolls = (polls: ExtendedTableEvent[]) => (
    <div className="space-y-4">
      {polls.map((ev) => (
        <PollCard
          key={ev.id}
          ev={ev}
          state={state}
          canConfirm={canConfirmPoll(ev, state)}
          busyDates={busyDateSet}
          onRsvp={(candId, v) => setCandidateRsvp(ev.id, candId, v)}
          onConfirm={(cand) => confirmCandidate(ev.id, cand)}
        />
      ))}
    </div>
  );

  const composerAtTop = composer?.anchor === "top";

  return (
    <>
      <PageHead
        title="カレンダー"
        actions={
          composerAtTop ? undefined : (
            <>
              <button type="button" className="btn" onClick={() => openComposer("poll", "top")}>
                <IconCalendarTime width={16} height={16} /> 日程調整をはじめる
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openComposer("confirmed", "top")}
              >
                <IconPlus width={16} height={16} /> 予定を追加
              </button>
            </>
          )
        }
      />

      {composerAtTop && <div className="mb-10">{composerNode(false)}</div>}

      <div className="space-y-10">
        {pollsNeedingReply.length > 0 && (
          <section aria-labelledby="sec-reply">
            <SectionTitle>
              <span id="sec-reply">返事を待っている日程調整</span>
            </SectionTitle>
            {renderPolls(pollsNeedingReply)}
          </section>
        )}

        <section aria-labelledby="sec-upcoming">
          <SectionTitle>
            <span id="sec-upcoming">これからの予定</span>
          </SectionTitle>
          {upcomingEvents.length === 0 ? (
            <div className="surface px-5 py-4 text-sm text-ink2">決まっている予定はありません。</div>
          ) : (
            <div className="surface list">
              {upcomingEvents.map((ev) => (
                <EventRow key={ev.id} ev={ev} state={state} onOpen={() => setSelectedEvent(ev)} />
              ))}
            </div>
          )}
        </section>

        {pollsAnswered.length > 0 && (
          <section aria-labelledby="sec-polls">
            <SectionTitle>
              <span id="sec-polls">調整中の日程</span>
            </SectionTitle>
            {renderPolls(pollsAnswered)}
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
                  onOpen={() => setSelectedEvent(ev)}
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

        <MonthCalendar
          ym={ym}
          today={today}
          selectedDay={selectedDay}
          onSelectDay={(d) => {
            setSelectedDay(d);
            if (composer?.anchor === "day") setComposer(null);
          }}
          onChangeMonth={setYm}
          tableFilter={tableFilter}
          tableOptions={myTables.length > 1 ? tableOptions : null}
          onChangeTableFilter={setTableFilter}
          events={confirmedEvents}
          polls={activePolls}
          logs={myLogs}
          state={state}
          onOpenEvent={setSelectedEvent}
          onOpenSync={() => setSyncOpen(true)}
          composer={composer?.anchor === "day" ? composerNode(true) : null}
          onAddOnDay={(mode, date) => openComposer(mode, "day", date)}
        />
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          table={selectedEvent.tableId ? state.tables[selectedEvent.tableId] : undefined}
          scenario={selectedEvent.scenarioId ? state.scenarios[selectedEvent.scenarioId] : undefined}
          today={today}
          onClose={() => setSelectedEvent(null)}
          onRecordSession={() => {
            const target = selectedEvent;
            setSelectedEvent(null);
            recordFromEvent(target);
          }}
        />
      )}

      {syncOpen && (
        <CalendarSyncDialog events={confirmedEvents} polls={activePolls} onClose={() => setSyncOpen(false)} />
      )}
    </>
  );
}

/* ============================================================
 * 日程調整カード: 候補日1件 = 1行。自分の返事を行内で選ぶ
 * ============================================================ */

function PollCard({
  ev,
  state,
  canConfirm,
  busyDates,
  onRsvp,
  onConfirm,
}: {
  ev: ExtendedTableEvent;
  state: State;
  canConfirm: boolean;
  busyDates: Set<string>;
  onRsvp: (candidateId: string, value: Availability) => void;
  onConfirm: (cand: TableEventCandidate) => void;
}) {
  const [showAnswers, setShowAnswers] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  const sc = ev.scenarioId ? state.scenarios[ev.scenarioId] : undefined;
  const organiser = state.users[ev.createdBy];
  const candidates = pollCandidates(ev);
  const memberIds = pollMemberIds(ev, state);
  const okCounts = candidates.map((c) => memberIds.filter((id) => c.responses[id] === "ok").length);
  const bestOk = Math.max(0, ...okCounts);

  return (
    <article className="surface" aria-label={ev.title}>
      <header className="px-4 pb-3 pt-4 sm:px-5">
        <h3 className="font-bold leading-snug">{ev.title}</h3>
        <div className="meta mt-0.5 text-xs sm:text-sm">
          {tb ? (
            <Link to={`/tables/${tb.id}`} className="hover:text-base-content hover:underline">
              {tb.name}
            </Link>
          ) : (
            <span>個人の予定</span>
          )}
          {sc && (
            <Link to={`/scenarios/${sc.id}`} className="hover:text-base-content hover:underline">
              {sc.title}
            </Link>
          )}
          {organiser && <span>主催 {organiser.name}</span>}
        </div>
        {ev.note && <p className="mt-1.5 text-sm leading-relaxed text-ink2">{ev.note}</p>}
      </header>

      <ul className="list border-t border-base-300">
        {candidates.map((cand, i) => {
          const my = cand.responses[state.me];
          const ok = okCounts[i]!;
          const maybe = memberIds.filter((id) => cand.responses[id] === "maybe").length;
          const ng = memberIds.filter((id) => cand.responses[id] === "ng").length;
          const pending = memberIds.length - ok - maybe - ng;
          const durMin = eventDurationMinutes(cand.startTime, cand.endTime, ev.durationMin);
          const label = `${fmtDate(cand.date)} ${cand.startTime}`;
          return (
            <li key={cand.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-52">
                <div className="flex flex-wrap items-center gap-x-2 font-semibold tabular-nums">
                  <span>
                    {fmtDate(cand.date)} {cand.startTime}–{cand.endTime}
                  </span>
                  {durMin > 0 && <span className="text-xs font-normal text-ink2">{fmtDur(durMin)}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink2 tabular-nums">
                  <span className={cx(ok === bestOk && ok > 0 && "font-bold text-success")}>
                    ◯ {ok}/{memberIds.length}人
                  </span>
                  {maybe > 0 && <span>△ {maybe}</span>}
                  {ng > 0 && <span>× {ng}</span>}
                  {pending > 0 && <span>未回答 {pending}</span>}
                  {busyDates.has(cand.date) && <span className="text-warning">自分の予定あり</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Seg<Availability>
                  size="sm"
                  ariaLabel={`${label} の自分の返事`}
                  value={(my ?? "") as Availability}
                  options={RSVP_OPTIONS}
                  onChange={(v) => onRsvp(cand.id, v)}
                />
                {canConfirm &&
                  (confirming === cand.id ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setConfirming(null);
                          onConfirm(cand);
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
                      この日で確定
                    </button>
                  ))}
              </div>
              {showAnswers && (
                <ul
                  className="flex basis-full flex-wrap gap-x-4 gap-y-1.5 text-xs"
                  aria-label={`${label} の回答`}
                >
                  {memberIds.map((id) => {
                    const u = state.users[id]!;
                    const r = cand.responses[id];
                    return (
                      <li key={id} className="inline-flex items-center gap-1.5">
                        <Avatar u={u} size={18} />
                        <span className={cx(id === state.me && "font-bold")}>{u.name}</span>
                        <span
                          className={cx(
                            "font-semibold",
                            r === "ok" ? "text-success" : r === "ng" ? "text-error" : "text-ink2",
                          )}
                        >
                          {r ? RSVP_SYMBOL[r] : "–"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-base-300 px-3 py-2 sm:px-4">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          aria-expanded={showAnswers}
          onClick={() => setShowAnswers((v) => !v)}
        >
          {showAnswers ? "回答の内訳を閉じる" : "みんなの回答を見る"}
        </button>
      </footer>
    </article>
  );
}

/* ============================================================
 * 月表示: 卓の絞り込みとカレンダー連携はここに付ける。
 * 予定名にポインタを留めると補足、押すと詳細。日を押すとその日の内容を下に出す。
 * ============================================================ */

type GridEntry =
  | { kind: "event"; key: string; ev: ExtendedTableEvent }
  | { kind: "poll"; key: string; ev: ExtendedTableEvent; cand: TableEventCandidate }
  | { kind: "log"; key: string; log: Log };

function entryLabel(e: GridEntry): string {
  if (e.kind === "event") return `${e.ev.startTime} ${e.ev.title}`;
  if (e.kind === "poll") return e.ev.title;
  return e.log.title;
}

function EntryCard({ entry, state }: { entry: GridEntry; state: State }) {
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
        <span className="block font-bold leading-snug">{l.title}</span>
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
  const start = entry.kind === "poll" ? entry.cand.startTime : ev.startTime;
  const end = entry.kind === "poll" ? entry.cand.endTime : ev.endTime;
  return (
    <span className="block">
      <span className="block font-bold leading-snug">{ev.title}</span>
      <span className="meta mt-0.5 text-xs">
        {entry.kind === "poll" && <span>日程調整の候補</span>}
        <span className="tabular-nums">
          {start}–{end}
        </span>
        <span>{tb ? tb.name : "個人の予定"}</span>
        {sc && <span>{sc.title}</span>}
      </span>
    </span>
  );
}

function MonthCalendar({
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
  onOpenSync,
  composer,
  onAddOnDay,
}: {
  ym: string;
  today: string;
  selectedDay: string;
  onSelectDay: (d: string) => void;
  onChangeMonth: (ym: string) => void;
  tableFilter: string;
  tableOptions: SelectOption[] | null;
  onChangeTableFilter: (v: string) => void;
  events: ExtendedTableEvent[];
  polls: ExtendedTableEvent[];
  logs: Log[];
  state: State;
  onOpenEvent: (ev: ExtendedTableEvent) => void;
  onOpenSync: () => void;
  composer: ReactNode;
  onAddOnDay: (mode: ComposerState["mode"], date: string) => void;
}) {
  const nav = useNavigate();
  const [year, month] = ym.split("-").map(Number);
  const cells = useMemo(() => monthCells(ym), [ym]);
  const entriesByDate = useMemo(() => {
    const inFilter = (tableId?: string) => tableFilter === "all" || tableId === tableFilter;
    const map = new Map<string, GridEntry[]>();
    const push = (d: string, e: GridEntry) => map.set(d, [...(map.get(d) ?? []), e]);
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
      (l) => l.dates,
    );
    for (const [d, ls] of byDate) for (const l of ls) push(d, { kind: "log", key: l.id, log: l });
    return map;
  }, [events, polls, logs, tableFilter]);

  const openEntry = (e: GridEntry) => {
    if (e.kind === "event") onOpenEvent(e.ev);
    else if (e.kind === "log") nav({ to: `/sessions/${e.log.id}` });
  };

  const dayEntries = entriesByDate.get(selectedDay) ?? [];
  const holiday = getJapaneseHolidayName(selectedDay);
  const isCurrentMonth = ym === today.slice(0, 7);

  return (
    <section aria-labelledby="sec-month">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="sec-month" className="text-base font-bold tabular-nums sm:text-lg">
          {year}年{month}月
        </h2>
        <div className="flex items-center">
          <button
            type="button"
            className="icon-btn"
            aria-label="前の月"
            onClick={() => onChangeMonth(shiftYearMonth(ym, -1))}
          >
            <IconChevronLeft width={18} height={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
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
            <Select
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
        <div className="grid grid-cols-7">
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
                  aria-pressed={isSelected}
                  aria-label={`${fmtDate(dayStr)}${holidayName ? ` ${holidayName}` : ""}${
                    entries.length ? `、${entries.map(entryLabel).join("、")}` : ""
                  }`}
                  onClick={() => onSelectDay(dayStr)}
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
                          onClick={() => (e.kind === "poll" ? onSelectDay(dayStr) : openEntry(e))}
                          className={cx(
                            "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs leading-tight",
                            e.kind === "event" &&
                              "bg-primary/10 font-semibold text-primary hover:bg-primary/15",
                            e.kind === "poll" &&
                              "border border-dashed border-warning/60 text-base-content/80 hover:bg-base-200",
                            e.kind === "log" && "bg-base-200 text-ink2 hover:bg-base-300/60",
                          )}
                        >
                          {entryLabel(e)}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-b-box border-t border-base-300 px-4 py-2 text-xs text-ink2">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" aria-hidden /> 予定
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" aria-hidden /> 日程調整の候補
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-base-content/40" aria-hidden /> 記録
          </span>
        </div>
      </div>

      {/* 選んだ日 */}
      <div className="surface mt-3" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
          <h3 className="min-w-0 flex-1 font-bold">
            {fmtDate(selectedDay)}
            {holiday && <span className="ml-2 text-sm font-normal text-error">{holiday}</span>}
          </h3>
          {!composer && selectedDay >= today && (
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
        {composer ? (
          <div className="border-t border-base-300 px-4 py-4 sm:px-5">{composer}</div>
        ) : dayEntries.length === 0 ? (
          <p className="border-t border-base-300 px-4 py-3 text-sm text-ink2 sm:px-5">
            予定も記録もありません。
          </p>
        ) : (
          <ul className="list border-t border-base-300 text-sm">
            {dayEntries.map((e) => {
              const dot =
                e.kind === "event" ? "bg-primary" : e.kind === "poll" ? "bg-warning" : "bg-base-content/40";
              const when =
                e.kind === "event"
                  ? `${e.ev.startTime}–${e.ev.endTime}`
                  : e.kind === "poll"
                    ? `${e.cand.startTime}–${e.cand.endTime}`
                    : fmtDur(sessionPlayMinutes(e.log));
              const title = e.kind === "log" ? e.log.title : e.ev.title;
              const tableId = e.kind === "log" ? e.log.tableId : e.ev.tableId;
              const body = (
                <>
                  <span className={cx("size-2 shrink-0 rounded-full", dot)} aria-hidden />
                  <span className="w-24 shrink-0 tabular-nums text-ink2">{when}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {title}
                    {e.kind === "poll" && <span className="ml-2 text-xs font-normal text-ink2">候補日</span>}
                  </span>
                  {tableId && state.tables[tableId] && (
                    <span className="hidden shrink-0 text-xs text-ink2 sm:inline">
                      {state.tables[tableId]!.name}
                    </span>
                  )}
                </>
              );
              return (
                <li key={e.key}>
                  {e.kind === "poll" ? (
                    <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">{body}</div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEntry(e)}
                      className="row-interactive flex w-full items-center gap-3 px-4 py-2.5 text-left sm:px-5"
                    >
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

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
 * 予定の追加と日程調整の作成（その場で開くパネル。モーダルにしない）
 * ============================================================ */

function Composer({
  bare,
  mode,
  date,
  today,
  tableOptions,
  scenarioOptions,
  defaultTableId,
  onClose,
  onCreated,
}: {
  /** 面の中に置くとき（その日の欄）は面を作らない */
  bare: boolean;
  mode: ComposerState["mode"];
  date: string;
  today: string;
  tableOptions: SelectOption[];
  scenarioOptions: SelectOption[];
  defaultTableId: string;
  onClose: () => void;
  onCreated: (date: string) => void;
}) {
  const formId = mode === "confirmed" ? "add-event-form" : "add-poll-form";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    ref.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={ref}
      role="region"
      aria-label={mode === "confirmed" ? "予定を追加" : "日程調整をはじめる"}
      className={cx(!bare && "surface p-4 sm:p-5")}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {!bare && <PanelHead title={mode === "confirmed" ? "予定を追加" : "日程調整をはじめる"} />}
      {mode === "confirmed" ? (
        <ConfirmedEventForm
          formId={formId}
          tableOptions={tableOptions}
          scenarioOptions={scenarioOptions}
          defaultTableId={defaultTableId}
          selectedDate={date}
          onCreated={onCreated}
        />
      ) : (
        <PollForm
          formId={formId}
          tableOptions={tableOptions}
          scenarioOptions={scenarioOptions}
          defaultTableId={defaultTableId}
          today={today}
          firstDate={date > today ? date : undefined}
          onCreated={onCreated}
        />
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          キャンセル [Esc]
        </button>
        <button type="submit" form={formId} className="btn btn-primary">
          {mode === "confirmed" ? "予定を登録" : "日程調整を作成"}
        </button>
      </div>
    </div>
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
  const hours = Math.floor(safeDuration / 60);
  const mins = Math.floor((safeDuration % 60) / 15) * 15;
  const isPreset = DURATION_PRESETS.some((p) => p.minutes === safeDuration);
  const [custom, setCustom] = useState(!isPreset);

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
            } else {
              setCustom(false);
              onChange(Number(v));
            }
          }}
        />
      </div>
      {custom && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            aria-label="予定時間（時間）"
            min={0}
            max={24}
            inputMode="numeric"
            className="input input-sm w-20 tabular-nums"
            value={hours}
            onChange={(e) => {
              const raw = Number(e.target.value);
              const nextHours = Number.isFinite(raw) ? Math.max(0, Math.min(24, Math.floor(raw))) : 0;
              onChange(nextHours * 60 + mins);
            }}
          />
          <span className="text-sm text-ink2">時間</span>
          <Select
            size="sm"
            ariaLabel="予定時間（分）"
            className="w-24"
            value={String(mins)}
            options={MINUTE_OPTIONS}
            onChange={(v) => onChange(hours * 60 + Number(v))}
          />
        </div>
      )}
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
  tableOptions: SelectOption[];
  scenarioOptions: SelectOption[];
  defaultTableId: string;
  selectedDate: string;
  onCreated: (date: string) => void;
}) {
  const { update } = useStore();
  const {
    register,
    control,
    handleSubmit,
    watch,
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

  const startTimeVal = watch("startTime");
  const durationVal = watch("durationMin");
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
          <input
            type="date"
            {...register("date", {
              validate: (v) => (VALID_DATE.test(v) ? true : "日付を選んでください。"),
            })}
            className={cx("input w-full", errors.date && "input-error")}
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

      <Field label="長さ" noMargin>
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
              <Select
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
              <Select
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
        <input {...register("note")} className="input w-full" placeholder="例: 探索者の調整や持ち物の連絡" />
      </Field>
    </form>
  );
}

interface DraftCandidate {
  id: string;
  date: string;
  startTime: string;
}

interface PollFormValues {
  tableId: string;
  scenarioId: string;
  title: string;
  startTime: string;
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
  tableOptions: SelectOption[];
  scenarioOptions: SelectOption[];
  defaultTableId: string;
  today: string;
  firstDate?: string;
  onCreated: (date: string) => void;
}) {
  const { update } = useStore();
  const quickDates = useMemo(() => quickWeekendDates(today), [today]);
  const [candidates, setCandidates] = useState<DraftCandidate[]>(() => [
    { id: `cand_${uid()}`, date: firstDate ?? quickDates.thisSat, startTime: "21:00" },
  ]);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PollFormValues>({
    mode: "onTouched",
    defaultValues: {
      tableId: defaultTableId,
      scenarioId: "",
      title: "",
      startTime: "21:00",
      durationMin: 180,
      note: "",
    },
  });

  const startTimeVal = watch("startTime");
  const durationVal = watch("durationMin");
  const prevStartRef = useRef("21:00");

  useEffect(() => {
    const trimmed = startTimeVal.trim();
    if (!VALID_TIME.test(trimmed) || trimmed === prevStartRef.current) return;
    const prevStart = prevStartRef.current;
    prevStartRef.current = trimmed;
    setCandidates((prev) => prev.map((c) => (c.startTime === prevStart ? { ...c, startTime: trimmed } : c)));
  }, [startTimeVal]);

  const defaultStart = VALID_TIME.test(startTimeVal.trim()) ? startTimeVal.trim() : "21:00";

  function addPresetDate(dateStr: string) {
    setCandidates((prev) =>
      prev.some((c) => c.date === dateStr)
        ? prev
        : [...prev, { id: `cand_${uid()}`, date: dateStr, startTime: defaultStart }].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
    );
    setCandidateError(null);
  }

  function addNextDayCandidate() {
    setCandidates((prev) => {
      const last = prev[prev.length - 1];
      const baseDate = last && VALID_DATE.test(last.date) ? last.date : today;
      return [
        ...prev,
        { id: `cand_${uid()}`, date: addDays(baseDate, 1), startTime: last?.startTime ?? defaultStart },
      ];
    });
    setCandidateError(null);
  }

  function updateCandidate(id: string, patch: Partial<DraftCandidate>) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setCandidateError(null);
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
    setCandidateError(null);
  }

  function onSubmit(values: PollFormValues) {
    if (candidates.length === 0) {
      setCandidateError("候補日を1件以上追加してください。");
      return;
    }
    for (const cand of candidates) {
      if (!VALID_DATE.test(cand.date)) {
        setCandidateError("すべての候補日の日付を選んでください。");
        return;
      }
      if (!VALID_TIME.test(cand.startTime.trim())) {
        setCandidateError("候補日の開始時刻を「21:00」の形で入力してください。");
        return;
      }
    }

    const builtCandidates: TableEventCandidate[] = candidates.map((c) => ({
      id: c.id,
      date: c.date,
      startTime: c.startTime.trim(),
      endTime: computeEndTime(c.startTime.trim(), values.durationMin),
      responses: {},
    }));
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
              <Select
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
              <Select
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
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
        <Field label="長さ" noMargin>
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
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-base-content/90">候補日</legend>
        <ul className="space-y-2">
          {candidates.map((cand, index) => {
            const candEnd = computeEndTime(cand.startTime, durationVal);
            return (
              <li key={cand.id} className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label={`候補日 ${index + 1}`}
                  className="input min-w-0 flex-1"
                  value={cand.date}
                  onChange={(e) => updateCandidate(cand.id, { date: e.target.value })}
                />
                <input
                  aria-label={`候補開始時刻 ${index + 1}`}
                  inputMode="numeric"
                  className="input w-20 shrink-0 tabular-nums"
                  value={cand.startTime}
                  onChange={(e) => updateCandidate(cand.id, { startTime: e.target.value })}
                  placeholder="21:00"
                />
                <span className="hidden w-16 shrink-0 text-xs text-ink2 tabular-nums sm:inline">
                  {candEnd ? `〜${candEnd}` : ""}
                </span>
                <button
                  type="button"
                  disabled={candidates.length <= 1}
                  aria-label={`候補日 ${index + 1} を削除`}
                  className="icon-btn disabled:opacity-30"
                  onClick={() => removeCandidate(cand.id)}
                >
                  <IconX width={16} height={16} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink2">追加:</span>
          <button
            type="button"
            className="btn btn-quiet btn-xs"
            onClick={() => addPresetDate(quickDates.thisSat)}
          >
            今週土曜
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-xs"
            onClick={() => addPresetDate(quickDates.thisSun)}
          >
            今週日曜
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-xs"
            onClick={() => addPresetDate(quickDates.nextSat)}
          >
            来週土曜
          </button>
          <button type="button" className="btn btn-quiet btn-xs" onClick={addNextDayCandidate}>
            <IconPlus width={12} height={12} /> 翌日
          </button>
        </div>
        <FieldError text={candidateError} />
      </fieldset>

      <Field label="メモ（任意）" noMargin>
        <input {...register("note")} className="input w-full" placeholder="例: 探索者の調整や持ち物の連絡" />
      </Field>
    </form>
  );
}

/* ============================================================
 * カレンダー連携: 卓譜の予定を自分のカレンダーへ / 自分の予定と照らし合わせる
 *   普段使わないのでダイアログにしまう。リンクを先に出し、使い方はその下に。
 * ============================================================ */

const GOOGLE_IMPORT_URL = "https://calendar.google.com/calendar/u/0/r/settings/export";

function CalendarSyncDialog({
  events,
  polls,
  onClose,
}: {
  events: ExtendedTableEvent[];
  polls: ExtendedTableEvent[];
  onClose: () => void;
}) {
  const { state, update, authUser } = useStore();
  const today = todayStr();
  const [manualDate, setManualDate] = useState(today);
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const feedToken = state.prefs.calendarFeedToken;
  const [busyError, setBusyError] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);
  const busyDates = useMemo(
    () => [...new Set(state.prefs.busyDates ?? [])].filter((d) => d >= today).sort(),
    [state.prefs.busyDates, today],
  );
  const busySet = new Set(state.prefs.busyDates ?? []);
  const links = authUser && feedToken ? calendarSubscribeLinks(feedUrl(location.origin, feedToken)) : null;

  /** 購読リンクを作る（作り直すときは古いリンクを無効にする） */
  async function createFeed() {
    if (!authUser) return;
    setFeedBusy(true);
    setFeedError(null);
    const token = newFeedToken();
    try {
      await publishFeed(token, authUser.uid, buildFeedIcs(state, today));
      if (feedToken) await revokeFeed(feedToken).catch(() => {});
      update((s) => {
        s.prefs.calendarFeedToken = token;
      });
    } catch {
      setFeedError("リンクを作れませんでした。通信状態を確かめて、もう一度押してください。");
    } finally {
      setFeedBusy(false);
    }
  }

  function saveFile() {
    const text = buildIcsCalendar(
      events.map((ev) => {
        const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
        return {
          uid: `${ev.id}@takufu`,
          title: tb ? `[${tb.name}] ${ev.title}` : ev.title,
          date: ev.date,
          startTime: ev.startTime,
          endTime: ev.endTime,
          description: ev.note,
        };
      }),
      "卓譜",
    );
    downloadIcs("takufu.ics", text);
  }

  function toggleBusy(date: string) {
    if (!VALID_DATE.test(date)) return;
    setBusyError(null);
    update((s) => {
      const next = new Set(s.prefs.busyDates ?? []);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      s.prefs.busyDates = [...next].sort();
    });
  }

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = parseBusyDates(await file.text());
      if (parsed.length === 0) {
        setBusyError(
          "このファイルから予定の日付を読み取れませんでした。カレンダーアプリから書き出したファイルを選んでください。",
        );
        return;
      }
      setBusyError(null);
      update((s) => {
        s.prefs.busyDates = [...new Set([...(s.prefs.busyDates ?? []), ...parsed])].sort();
      });
    } catch {
      setBusyError("ファイルを読み込めませんでした。");
    } finally {
      input.value = "";
    }
  }

  function markFreeCandidatesOk() {
    const ids = new Set(polls.map((ev) => ev.id));
    update((s) => {
      for (const ev of Object.values(s.events ?? {})) {
        if (!ids.has(ev.id)) continue;
        if (ev.candidates && ev.candidates.length > 0) {
          for (const c of ev.candidates)
            if (!busySet.has(c.date) && !c.responses[s.me]) c.responses[s.me] = "ok";
        } else if (!busySet.has(ev.date) && !ev.responses[s.me]) {
          ev.responses[s.me] = "ok";
        }
      }
    });
    setMarked(true);
  }

  const linkCls = "font-semibold text-base-content underline underline-offset-2";

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
        <h3 id="sync-out" className="font-bold">
          卓譜の予定を自分のカレンダーに表示する
        </h3>
        {links ? (
          <>
            <p className="mt-1 text-sm text-ink2">
              このリンクをカレンダーアプリに登録すると、確定した予定が自動で反映されます。
            </p>
            <div className="mt-3">
              <CopyBox text={links.feed} />
            </div>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed">
              <li>
                <b className="block">Google カレンダー</b>
                <a href={links.google} target="_blank" rel="noreferrer" className={linkCls}>
                  Google カレンダーで開く
                </a>
                を押し、開いた画面で「追加」を押します。スマートフォンのアプリからは登録できないので、パソコンで行います。
              </li>
              <li>
                <b className="block">Apple カレンダー（Mac・iPhone）</b>
                <a href={links.apple} className={linkCls}>
                  Apple カレンダーで開く
                </a>
                を押し、「照会」（iPhone では「登録」）を押します。iPhone ではこの画面を iPhone
                で開いてから押してください。
              </li>
            </ol>
            <p className="mt-4 text-sm text-ink2">
              リンクを知っている人は誰でも予定を見られます。他の人に知られたときは
              <button type="button" className={linkCls} onClick={createFeed} disabled={feedBusy}>
                リンクを作り直す
              </button>
              と、古いリンクは使えなくなります。リンクを登録できないアプリには、
              <button type="button" className={linkCls} onClick={saveFile}>
                予定をファイルに保存
              </button>
              して取り込みます。
            </p>
            <FieldError text={feedError} />
          </>
        ) : authUser ? (
          <>
            <p className="mt-1 text-sm text-ink2">
              リンクをカレンダーアプリに登録すると、卓譜で確定した予定が自動で反映されます。
            </p>
            <button type="button" className="btn btn-sm mt-3" onClick={createFeed} disabled={feedBusy}>
              {feedBusy ? "作成中…" : "リンクを作る"}
            </button>
            <FieldError text={feedError} />
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink2">
              サインインすると、予定が自動で反映されるリンクを作れます。お試し中は、確定した予定をファイルに保存してカレンダーアプリに取り込みます。
            </p>
            <button
              type="button"
              className="btn btn-sm mt-3"
              onClick={saveFile}
              disabled={events.length === 0}
            >
              <IconDownload width={15} height={15} /> 予定をファイルに保存
            </button>
            <ol className="mt-4 space-y-3 text-sm leading-relaxed">
              <li>
                <b className="block">Google カレンダー</b>
                パソコンで
                <a
                  href={GOOGLE_IMPORT_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={cx(linkCls, "mx-0.5")}
                >
                  Google カレンダーの取り込み画面
                  <IconExternal width={12} height={12} className="ml-0.5 inline" aria-hidden />
                </a>
                を開き、保存したファイルを選んで「インポート」を押します。
              </li>
              <li>
                <b className="block">Apple カレンダー（Mac）</b>
                保存したファイルを開き、追加先のカレンダーを選んで「OK」を押します。
              </li>
              <li>
                <b className="block">Apple カレンダー（iPhone）</b>
                保存したファイルを「ファイル」アプリでタップし、「すべてを追加」を押します。
              </li>
            </ol>
          </>
        )}
      </section>

      <section aria-labelledby="sync-in" className="mt-6 border-t border-base-300 pt-5">
        <h3 id="sync-in" className="font-bold">
          自分の予定と照らし合わせる
        </h3>
        <p className="mt-1 text-sm text-ink2">
          予定のある日は、日程調整の候補日に「自分の予定あり」と出ます。読み取るのは日付だけで、予定の内容は保存しません。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="btn btn-sm cursor-pointer">
            <IconUpload width={15} height={15} /> 自分のカレンダーのファイルを読み込む
            <input type="file" accept=".ics,text/calendar" className="sr-only" onChange={importFile} />
          </label>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink2">
          Google カレンダーのファイルは
          <a href={GOOGLE_IMPORT_URL} target="_blank" rel="noreferrer" className={cx(linkCls, "mx-0.5")}>
            書き出し画面
          </a>
          の「エクスポート」から保存します。
        </p>
        <FieldError text={busyError} />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="予定のある日"
            className="input input-sm"
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
          />
          <button type="button" className="btn btn-sm" onClick={() => toggleBusy(manualDate)}>
            {busySet.has(manualDate) ? "予定ありを外す" : "予定ありにする"}
          </button>
        </div>

        {busyDates.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="eyebrow">予定のある日</span>
              <button
                type="button"
                className="btn btn-quiet btn-xs ml-auto"
                onClick={() =>
                  update((s) => {
                    s.prefs.busyDates = [];
                  })
                }
              >
                すべて外す
              </button>
            </div>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 sm:grid-cols-3">
              {busyDates.map((d) => (
                <li
                  key={d}
                  className="flex items-center justify-between gap-1 border-b border-base-300 py-0.5 text-sm"
                >
                  <span className={cx("tabular-nums", weekdayTone(d) !== "text-ink2" && weekdayTone(d))}>
                    {fmtDate(d)}
                  </span>
                  <button
                    type="button"
                    className="icon-btn size-8"
                    aria-label={`${fmtDate(d)} の予定ありを外す`}
                    onClick={() => toggleBusy(d)}
                  >
                    <IconX width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {polls.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-base-300 pt-4">
            <span className="min-w-0 flex-1 text-sm">
              まだ返事していない候補日のうち、予定のない日に「◯ 参加可」と返事する
            </span>
            <button
              type="button"
              className={cx("btn btn-sm w-36", marked && "text-success")}
              onClick={markFreeCandidatesOk}
              disabled={marked}
            >
              {marked ? <IconCheck width={15} height={15} /> : <IconCalendarPlus width={15} height={15} />}
              {marked ? "返事した" : "まとめて返事"}
            </button>
          </div>
        )}
      </section>
    </Modal>
  );
}
