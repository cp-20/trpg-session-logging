import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { buildFeedIcs, feedUrl, newFeedToken, publishFeed, revokeFeed } from "@shared/lib/calendar-feed";
import { getJapaneseHolidayName } from "@shared/lib/holidays";
import {
  VALID_DATE,
  VALID_TIME,
  addDays,
  applyCandidateRsvp,
  applyConfirmCandidate,
  busyChecker,
  calendarSubscribeLinks,
  canConfirmPoll,
  computeEndTime,
  groupBy,
  monthCells,
  pollCandidates,
  quickWeekendDates,
  shiftYearMonth,
  unansweredCount,
} from "@shared/lib/schedule";
import { fmtDate, fmtDur, sessionPlayMinutes, todayStr, uid, sessionDays } from "@shared/lib/time";
import type { Availability, Log, TableEvent, TableEventCandidate } from "@shared/types";
import { EventDetailSheet, EventRow, PollCard } from "../../components/EventComponents";
import { ScreenShell } from "../../components/ScreenShell";
import { AvatarStack } from "../../components/identity";
import {
  IconCalendarPlus,
  IconCalendarTime,
  IconChevronLeft,
  IconChevronRight,
  IconExternal,
  IconPlus,
  IconX,
} from "../../components/icons";
import {
  BottomSheet,
  Button,
  Combobox,
  CopyBox,
  DividerList,
  Field,
  FieldError,
  IconButton,
  InlineNotice,
  MetaRow,
  PageHead,
  SectionTitle,
  type ComboboxOption,
  Surface,
  TextField,
  weekdayToneColor,
} from "../../components/ui";
import {
  fetchDeviceBusyDates,
  syncConfirmedEventsToDeviceCalendar,
  type DeviceBusySummary,
} from "../../native/native-calendar";
import { openExternalUrl } from "../../native/native-share";
import { hapticSelection, hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { userFacingError } from "@shared/lib/user-error";
import { sessionTitle } from "@shared/lib/session-scenario";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const UNRECORDED_LOOKBACK_DAYS = 30;
const DURATION_PRESETS = [
  { minutes: 120, label: "2時間" },
  { minutes: 180, label: "3時間" },
  { minutes: 240, label: "4時間" },
  { minutes: 300, label: "5時間" },
] as const;

type GridEntry =
  | { kind: "event"; key: string; ev: TableEvent }
  | { kind: "poll"; key: string; ev: TableEvent; cand: TableEventCandidate }
  | { kind: "log"; key: string; log: Log };

export default function CalendarScreen() {
  const { tokens } = useTheme();
  const { state, update, authUser } = useMobileStore();
  const router = useRouter();
  const today = todayStr();

  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  const [tableFilter, setTableFilter] = useState("all");
  const [composerMode, setComposerMode] = useState<"confirmed" | "poll" | null>(null);
  const [composerDate, setComposerDate] = useState(today);
  const [selectedEvent, setSelectedEvent] = useState<TableEvent | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState<DeviceBusySummary | null>(null);

  const myTables = useMemo(
    () => Object.values(state.tables).filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me),
    [state.tables, state.me],
  );
  const myTableIds = useMemo(() => new Set(myTables.map((t) => t.id)), [myTables]);

  const myEvents = useMemo(() => {
    const all = Object.values(state.events ?? {});
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

  useEffect(() => {
    if (activePolls.length === 0) return;
    const dates = [...new Set(activePolls.flatMap((ev) => pollCandidates(ev).map((c) => c.date)))];
    fetchDeviceBusyDates(dates)
      .then((summary) => {
        if (summary) setDeviceBusy(summary);
      })
      .catch(() => {});
  }, [activePolls]);

  const busyCheck = useMemo(
    () => busyChecker({ googleBusy: state.prefs.googleBusy }),
    [state.prefs.googleBusy],
  );
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
        .map((s) => ({ value: s.id, label: s.title })),
    ],
    [state.scenarios],
  );
  const defaultTableId = tableFilter !== "all" ? tableFilter : (myTables[0]?.id ?? "");

  function setCandidateRsvp(eventId: string, candidateId: string, value: Availability) {
    update((s) => applyCandidateRsvp(s, eventId, candidateId, value));
  }

  function confirmCandidate(eventId: string, cand: TableEventCandidate) {
    update((s) => applyConfirmCandidate(s, eventId, cand));
    setYm(cand.date.slice(0, 7));
    setSelectedDay(cand.date);
    hapticSuccess();
  }

  function openComposer(mode: "confirmed" | "poll", date?: string) {
    setComposerDate(date ?? (selectedDay >= today ? selectedDay : today));
    setComposerMode(mode);
  }

  const recordFromEvent = (ev: TableEvent) => {
    router.push({
      pathname: "/upload",
      params: { table: ev.tableId ?? "", scenario: ev.scenarioId ?? "" },
    });
  };

  /* ---------- 月表示セル ---------- */
  const [year, month] = ym.split("-").map(Number);
  const cells = useMemo(() => monthCells(ym), [ym]);
  const entriesByDate = useMemo(() => {
    const inFilter = (tableId?: string) => tableFilter === "all" || tableId === tableFilter;
    const map = new Map<string, GridEntry[]>();
    const push = (d: string, e: GridEntry) => map.set(d, [...(map.get(d) ?? []), e]);
    for (const ev of confirmedEvents) {
      if (inFilter(ev.tableId)) push(ev.date, { kind: "event", key: ev.id, ev });
    }
    for (const ev of activePolls) {
      if (!inFilter(ev.tableId)) continue;
      const seen = new Set<string>();
      for (const cand of pollCandidates(ev)) {
        if (seen.has(cand.date)) continue;
        seen.add(cand.date);
        push(cand.date, { kind: "poll", key: `${ev.id}-${cand.id}`, ev, cand });
      }
    }
    const byDate = groupBy(
      myLogs.filter((l) => inFilter(l.tableId)),
      (l) => sessionDays(l),
    );
    for (const [d, ls] of byDate) for (const l of ls) push(d, { kind: "log", key: l.id, log: l });
    return map;
  }, [confirmedEvents, activePolls, myLogs, tableFilter]);

  const dayEntries = entriesByDate.get(selectedDay) ?? [];
  const selectedHoliday = getJapaneseHolidayName(selectedDay);
  const isCurrentMonth = ym === today.slice(0, 7);
  const activeDetailEvent = selectedEvent ? (state.events[selectedEvent.id] ?? selectedEvent) : null;

  return (
    <ScreenShell>
      <PageHead
        title="カレンダー"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconCalendarTime size={16} color={tokens.ink} />}
              onPress={() => openComposer("poll")}
            >
              日程調整をはじめる
            </Button>
            <Button
              variant="primary"
              icon={<IconPlus size={16} color={tokens.primaryContent} />}
              onPress={() => openComposer("confirmed")}
            >
              予定を追加
            </Button>
          </>
        }
      />

      <View style={{ gap: 28 }}>
        {pollsNeedingReply.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionTitle>返事を待っている日程調整</SectionTitle>
            {pollsNeedingReply.map((ev) => (
              <PollCard
                key={ev.id}
                ev={ev}
                state={state}
                canConfirm={canConfirmPoll(ev, state)}
                busyCheck={busyCheck}
                deviceBusy={deviceBusy}
                onRsvp={(candId, v) => setCandidateRsvp(ev.id, candId, v)}
                onConfirm={(cand) => confirmCandidate(ev.id, cand)}
              />
            ))}
          </View>
        )}

        <View>
          <SectionTitle>これからの予定</SectionTitle>
          {upcomingEvents.length === 0 ? (
            <Surface style={{ padding: 16 }}>
              <Text style={{ fontSize: 14, color: tokens.ink2 }}>決まっている予定はありません。</Text>
            </Surface>
          ) : (
            <Surface>
              <DividerList>
                {upcomingEvents.map((ev) => (
                  <EventRow key={ev.id} ev={ev} state={state} onPress={() => setSelectedEvent(ev)} />
                ))}
              </DividerList>
            </Surface>
          )}
        </View>

        {pollsAnswered.length > 0 && (
          <View style={{ gap: 10 }}>
            <SectionTitle>調整中の日程</SectionTitle>
            {pollsAnswered.map((ev) => (
              <PollCard
                key={ev.id}
                ev={ev}
                state={state}
                canConfirm={canConfirmPoll(ev, state)}
                busyCheck={busyCheck}
                deviceBusy={deviceBusy}
                onRsvp={(candId, v) => setCandidateRsvp(ev.id, candId, v)}
                onConfirm={(cand) => confirmCandidate(ev.id, cand)}
              />
            ))}
          </View>
        )}

        {unrecordedEvents.length > 0 && (
          <View>
            <SectionTitle>記録がまだの予定</SectionTitle>
            <Surface>
              <DividerList>
                {unrecordedEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    ev={ev}
                    state={state}
                    muted
                    onPress={() => setSelectedEvent(ev)}
                    trailing={
                      <Button size="sm" variant="secondary" onPress={() => recordFromEvent(ev)}>
                        記録する
                      </Button>
                    }
                  />
                ))}
              </DividerList>
            </Surface>
          </View>
        )}

        {/* 月表示 */}
        <View style={{ gap: 10 }}>
          <View style={styles.monthHead}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={[styles.monthTitle, { color: tokens.ink }]}>
                {year}年{month}月
              </Text>
              <IconButton accessibilityLabel="前の月" onPress={() => setYm(shiftYearMonth(ym, -1))}>
                <IconChevronLeft size={18} color={tokens.ink} />
              </IconButton>
              <IconButton accessibilityLabel="次の月" onPress={() => setYm(shiftYearMonth(ym, 1))}>
                <IconChevronRight size={18} color={tokens.ink} />
              </IconButton>
              {!isCurrentMonth && (
                <Button
                  size="sm"
                  variant="quiet"
                  onPress={() => {
                    setYm(today.slice(0, 7));
                    setSelectedDay(today);
                  }}
                >
                  今月
                </Button>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {myTables.length > 1 && (
                <Combobox
                  size="sm"
                  ariaLabel="カレンダーに表示する卓"
                  value={tableFilter}
                  options={tableOptions}
                  onChange={setTableFilter}
                  style={{ flex: 1 }}
                />
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={<IconCalendarTime size={15} color={tokens.ink} />}
                onPress={() => setSyncOpen(true)}
              >
                カレンダー連携
              </Button>
            </View>
          </View>

          <Surface>
            <View
              style={[
                styles.weekHeader,
                { backgroundColor: tokens.ground, borderBottomColor: tokens.border },
              ]}
            >
              {WEEKDAYS.map((w, i) => (
                <View key={w} style={styles.weekCell}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: i === 0 ? tokens.error : i === 6 ? tokens.info : tokens.ink2,
                    }}
                  >
                    {w}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.gridWrap}>
              {cells.map((day, idx) => {
                const isLastCol = idx % 7 === 6;
                const isLastRow = idx >= cells.length - 7;
                const cellBorders = {
                  borderRightWidth: isLastCol ? 0 : StyleSheet.hairlineWidth,
                  borderBottomWidth: isLastRow ? 0 : StyleSheet.hairlineWidth,
                  borderColor: tokens.border,
                };
                if (day === null) {
                  return (
                    <View
                      key={`empty-${idx}`}
                      style={[styles.dayCell, cellBorders, { backgroundColor: tokens.ground }]}
                    />
                  );
                }
                const dayStr = `${ym}-${String(day).padStart(2, "0")}`;
                const entries = entriesByDate.get(dayStr) ?? [];
                const isToday = dayStr === today;
                const isSelected = dayStr === selectedDay;
                const hasEvent = entries.some((e) => e.kind === "event");
                const hasPoll = entries.some((e) => e.kind === "poll");
                const hasLog = entries.some((e) => e.kind === "log");

                return (
                  <Pressable
                    key={dayStr}
                    onPress={() => {
                      hapticSelection();
                      setSelectedDay(dayStr);
                    }}
                    style={[
                      styles.dayCell,
                      cellBorders,
                      isSelected && { backgroundColor: tokens.primaryTint },
                    ]}
                  >
                    <View style={[styles.dayNumCircle, isToday && { backgroundColor: tokens.primary }]}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: isToday || isSelected ? "700" : "500",
                          fontVariant: ["tabular-nums"],
                          color: isToday ? tokens.primaryContent : weekdayToneColor(dayStr, tokens),
                        }}
                      >
                        {day}
                      </Text>
                    </View>
                    <View style={styles.dotRow}>
                      {hasEvent && <View style={[styles.dot, { backgroundColor: tokens.primary }]} />}
                      {hasPoll && <View style={[styles.dot, { backgroundColor: tokens.warning }]} />}
                      {hasLog && <View style={[styles.dot, { backgroundColor: tokens.ink2 }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Surface>

          {/* 選択日の詳細 */}
          <Surface>
            <View style={styles.selectedDayHead}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                  {fmtDate(selectedDay)}
                  {selectedHoliday ? ` · ${selectedHoliday}` : ""}
                </Text>
              </View>
              <Button
                size="sm"
                variant="quiet"
                icon={<IconCalendarPlus size={14} color={tokens.ink} />}
                onPress={() => openComposer("confirmed", selectedDay)}
              >
                この日に追加
              </Button>
            </View>
            {dayEntries.length === 0 ? (
              <View
                style={{
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: tokens.border,
                  padding: 16,
                }}
              >
                <Text style={{ fontSize: 14, color: tokens.ink2 }}>予定はありません。</Text>
              </View>
            ) : (
              <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border }}>
                <DividerList>
                  {dayEntries.map((entry) => {
                    if (entry.kind === "log") {
                      const l = entry.log;
                      const tb = l.tableId ? state.tables[l.tableId] : undefined;
                      const people = Object.entries(l.players)
                        .filter(([u]) => u !== l.ownerId && state.users[u])
                        .map(([u, p]) => {
                          const c = p.characterIds[0] ? state.characters[p.characterIds[0]] : undefined;
                          return c
                            ? ({ kind: "char", char: c } as const)
                            : ({ kind: "user", user: state.users[u]! } as const);
                        });
                      return (
                        <Pressable
                          key={entry.key}
                          onPress={() => {
                            hapticSelection();
                            router.push(`/sessions/${l.id}` as never);
                          }}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}
                        >
                          <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                            {sessionTitle(l, state.scenarios)}
                          </Text>
                          <MetaRow>
                            <Text style={{ fontSize: 12, color: tokens.ink2 }}>記録</Text>
                            {tb && <Text style={{ fontSize: 12, color: tokens.ink2 }}>{tb.name}</Text>}
                            <Text style={{ fontSize: 12, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                              {fmtDur(sessionPlayMinutes(l))}
                            </Text>
                          </MetaRow>
                          {people.length > 0 && (
                            <View
                              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
                            >
                              <AvatarStack people={people} size={20} />
                              <Text style={{ fontSize: 12, color: tokens.ink2 }} numberOfLines={1}>
                                {people
                                  .map((p) => (p.kind === "char" ? p.char.name : p.user.name))
                                  .join("、")}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    }
                    const ev = entry.ev;
                    const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
                    const start = entry.kind === "poll" ? entry.cand.startTime : ev.startTime;
                    const end = entry.kind === "poll" ? entry.cand.endTime : ev.endTime;
                    return (
                      <Pressable
                        key={entry.key}
                        onPress={() => {
                          hapticSelection();
                          if (entry.kind === "event") setSelectedEvent(ev);
                        }}
                        style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 3 }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>{ev.title}</Text>
                        <MetaRow>
                          {entry.kind === "poll" && (
                            <Text style={{ fontSize: 12, color: tokens.warning, fontWeight: "700" }}>
                              日程調整の候補
                            </Text>
                          )}
                          <Text style={{ fontSize: 12, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                            {start}–{end}
                          </Text>
                          <Text style={{ fontSize: 12, color: tokens.ink2 }}>
                            {tb ? tb.name : "個人の予定"}
                          </Text>
                        </MetaRow>
                      </Pressable>
                    );
                  })}
                </DividerList>
              </View>
            )}
          </Surface>
        </View>
      </View>

      {composerMode && (
        <ComposerSheet
          mode={composerMode}
          initialDate={composerDate}
          today={today}
          tableOptions={formTableOptions}
          scenarioOptions={scenarioOptions}
          defaultTableId={defaultTableId}
          onClose={() => setComposerMode(null)}
          onCreated={(date) => {
            setYm(date.slice(0, 7));
            setSelectedDay(date);
            setComposerMode(null);
            hapticSuccess();
          }}
        />
      )}

      <EventDetailSheet
        event={activeDetailEvent}
        table={activeDetailEvent?.tableId ? state.tables[activeDetailEvent.tableId] : undefined}
        scenario={activeDetailEvent?.scenarioId ? state.scenarios[activeDetailEvent.scenarioId] : undefined}
        today={today}
        state={state}
        onRsvp={(val) => {
          if (!activeDetailEvent) return;
          update((s) => {
            const target = s.events[activeDetailEvent.id];
            if (target) target.responses[s.me] = val;
          });
        }}
        onClose={() => setSelectedEvent(null)}
        onRecordSession={() => {
          if (!activeDetailEvent) return;
          const target = activeDetailEvent;
          setSelectedEvent(null);
          recordFromEvent(target);
        }}
      />

      {syncOpen && (
        <CalendarSyncSheet
          events={confirmedEvents}
          isSignedIn={Boolean(authUser)}
          onClose={() => setSyncOpen(false)}
        />
      )}
    </ScreenShell>
  );
}

function ComposerSheet({
  mode,
  initialDate,
  today,
  tableOptions,
  scenarioOptions,
  defaultTableId,
  onClose,
  onCreated,
}: {
  mode: "confirmed" | "poll";
  initialDate: string;
  today: string;
  tableOptions: ComboboxOption[];
  scenarioOptions: ComboboxOption[];
  defaultTableId: string;
  onClose: () => void;
  onCreated: (date: string) => void;
}) {
  const { tokens } = useTheme();
  const { update } = useMobileStore();
  const [title, setTitle] = useState("");
  const [tableId, setTableId] = useState(defaultTableId);
  const [scenarioId, setScenarioId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [dates, setDates] = useState<string[]>([initialDate]);
  const [startTime, setStartTime] = useState("21:00");
  const [durationMin, setDurationMin] = useState(180);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const weekend = useMemo(() => quickWeekendDates(today), [today]);

  function addCandidateDate(d: string) {
    if (!VALID_DATE.test(d) || dates.includes(d)) return;
    setDates((prev) => [...prev, d].sort());
  }

  function submit() {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    if (!VALID_TIME.test(startTime.trim())) {
      setError("開始時刻は 21:00 のように入力してください");
      return;
    }
    const endTime = computeEndTime(startTime.trim(), durationMin);
    if (mode === "confirmed") {
      if (!VALID_DATE.test(date)) {
        setError("日付は YYYY-MM-DD で入力してください");
        return;
      }
      const id = `ev_${uid()}`;
      update((s) => {
        s.events ??= {};
        s.events[id] = {
          id,
          tableId: tableId || undefined,
          scenarioId: scenarioId || undefined,
          title: title.trim(),
          status: "confirmed",
          date,
          startTime: startTime.trim(),
          endTime,
          durationMin,
          note: note.trim() || undefined,
          responses: { [s.me]: "ok" },
          createdBy: s.me,
        };
      });
      onCreated(date);
      return;
    }

    const cleanDates = dates.filter((d) => VALID_DATE.test(d));
    if (cleanDates.length === 0) {
      setError("候補日を 1 つ以上入力してください");
      return;
    }
    const id = `ev_${uid()}`;
    const sorted = [...cleanDates].sort();
    update((s) => {
      s.events ??= {};
      s.events[id] = {
        id,
        tableId: tableId || undefined,
        scenarioId: scenarioId || undefined,
        title: title.trim(),
        status: "poll",
        date: sorted[0]!,
        startTime: startTime.trim(),
        endTime,
        durationMin,
        note: note.trim() || undefined,
        responses: { [s.me]: "ok" },
        candidates: sorted.map((d, idx) => ({
          id: `c_${uid()}${idx}`,
          date: d,
          startTime: startTime.trim(),
          endTime,
          responses: { [s.me]: "ok" },
        })),
        createdBy: s.me,
      };
    });
    onCreated(sorted[0]!);
  }

  return (
    <BottomSheet
      visible
      title={mode === "poll" ? "日程調整をはじめる" : "予定を追加"}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={submit}>
            {mode === "poll" ? "候補を提示する" : "予定を追加する"}
          </Button>
        </>
      }
    >
      <View style={{ gap: 4 }}>
        <Field label="タイトル" noMargin>
          <TextField
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setError(null);
            }}
            placeholder="例: 廃校の十三時間目 第3夜"
          />
        </Field>

        <Field label="卓">
          <Combobox ariaLabel="卓" value={tableId} options={tableOptions} onChange={setTableId} />
        </Field>

        {scenarioOptions.length > 1 && (
          <Field label="シナリオ（任意）">
            <Combobox
              ariaLabel="シナリオ"
              value={scenarioId}
              options={scenarioOptions}
              onChange={setScenarioId}
            />
          </Field>
        )}

        {mode === "confirmed" ? (
          <Field label="日付">
            <TextField value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          </Field>
        ) : (
          <Field label="候補日">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              <Button size="sm" variant="quiet" onPress={() => addCandidateDate(weekend.thisSat)}>
                今週土曜 ({weekend.thisSat.slice(5)})
              </Button>
              <Button size="sm" variant="quiet" onPress={() => addCandidateDate(weekend.thisSun)}>
                今週日曜 ({weekend.thisSun.slice(5)})
              </Button>
              <Button size="sm" variant="quiet" onPress={() => addCandidateDate(weekend.nextSat)}>
                来週土曜 ({weekend.nextSat.slice(5)})
              </Button>
            </View>
            <View style={{ gap: 8 }}>
              {dates.map((d, idx) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TextField
                    value={d}
                    onChangeText={(val) => setDates((prev) => prev.map((x, i) => (i === idx ? val : x)))}
                    placeholder="YYYY-MM-DD"
                    style={{ flex: 1 }}
                  />
                  {dates.length > 1 && (
                    <IconButton
                      accessibilityLabel={`候補日 ${idx + 1} を削除`}
                      onPress={() => setDates((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <IconX size={16} color={tokens.ink2} />
                    </IconButton>
                  )}
                </View>
              ))}
              <View style={{ alignItems: "flex-start" }}>
                <Button
                  size="sm"
                  variant="quiet"
                  icon={<IconPlus size={14} color={tokens.ink} />}
                  onPress={() => {
                    const last = dates.at(-1) || today;
                    addCandidateDate(addDays(last, 1));
                  }}
                >
                  候補日を増やす
                </Button>
              </View>
            </View>
          </Field>
        )}

        <Field label="開始時刻（JST）">
          <TextField
            value={startTime}
            onChangeText={setStartTime}
            placeholder="21:00"
            style={{ width: 120 }}
          />
        </Field>

        <Field label="所要時間">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DURATION_PRESETS.map((p) => {
              const active = durationMin === p.minutes;
              return (
                <Button
                  key={p.minutes}
                  size="sm"
                  variant={active ? "secondary" : "quiet"}
                  onPress={() => setDurationMin(p.minutes)}
                >
                  {p.label}
                </Button>
              );
            })}
          </View>
        </Field>

        <Field label="メモ（任意）">
          <TextField value={note} onChangeText={setNote} placeholder="集合場所や持ち物など" />
        </Field>

        <FieldError text={error} />
      </View>
    </BottomSheet>
  );
}

function CalendarSyncSheet({
  events,
  isSignedIn,
  onClose,
}: {
  events: TableEvent[];
  isSignedIn: boolean;
  onClose: () => void;
}) {
  const { tokens } = useTheme();
  const { state, update, authUser } = useMobileStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceResult, setDeviceResult] = useState<{ added: number; total: number } | null>(null);

  const feedToken = state.prefs.calendarFeedToken;
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";
  const url = feedToken ? feedUrl(origin, feedToken) : null;
  const links = url ? calendarSubscribeLinks(url) : null;

  async function syncToDevice() {
    setBusy(true);
    setError(null);
    try {
      const res = await syncConfirmedEventsToDeviceCalendar(events, state);
      setDeviceResult(res);
      hapticSuccess();
    } catch (cause) {
      setError(userFacingError(cause, "端末のカレンダーと連携できませんでした。"));
    } finally {
      setBusy(false);
    }
  }

  async function issueFeed() {
    if (!authUser) return;
    setBusy(true);
    setError(null);
    try {
      const prev = state.prefs.calendarFeedToken;
      const nextToken = newFeedToken();
      await publishFeed(nextToken, authUser.uid, buildFeedIcs(state, todayStr()));
      if (prev) await revokeFeed(prev).catch(() => {});
      update((s) => {
        s.prefs.calendarFeedToken = nextToken;
      });
    } catch {
      setError("購読リンクを作成できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      visible
      title="カレンダー連携"
      onClose={onClose}
      footer={
        <Button variant="quiet" onPress={onClose}>
          閉じる
        </Button>
      }
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
            端末のカレンダーへ直接追加
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.ink2 }}>
            確定している予定をこの端末の「卓譜」カレンダーへ書き込みます。開始1時間前の通知も付きます。
          </Text>
          <Button
            variant="primary"
            disabled={busy || events.length === 0}
            icon={<IconCalendarPlus size={16} color={tokens.primaryContent} />}
            onPress={() => void syncToDevice()}
          >
            {busy ? "書き込み中…" : "この端末のカレンダーに同期"}
          </Button>
          {deviceResult && (
            <Text style={{ fontSize: 13, color: tokens.ink2 }}>
              {deviceResult.added > 0
                ? `${deviceResult.added}件の予定を端末カレンダーに追加しました（全${deviceResult.total}件）。`
                : `新しい追加はありません（全${deviceResult.total}件同期済み）。`}
            </Text>
          )}
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 16, gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>購読リンクで自動更新</Text>
          {!isSignedIn ? (
            <Text style={{ fontSize: 13, color: tokens.ink2 }}>
              Google でログインすると、外部カレンダー用の購読リンクを発行します。
            </Text>
          ) : links ? (
            <>
              <CopyBox text={links.feed} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<IconExternal size={14} color={tokens.ink} />}
                  onPress={() => void openExternalUrl(links.google)}
                >
                  Googleカレンダーで開く
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<IconExternal size={14} color={tokens.ink} />}
                  onPress={() => void openExternalUrl(links.apple)}
                >
                  Appleカレンダーで開く
                </Button>
              </View>
            </>
          ) : (
            <Button size="sm" variant="secondary" disabled={busy} onPress={() => void issueFeed()}>
              購読リンクを作る
            </Button>
          )}
        </View>

        <InlineNotice text={error} tone="error" />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  monthHead: {
    gap: 10,
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginRight: 4,
  },
  weekHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  weekCell: {
    width: "14.2857%",
    alignItems: "center",
    paddingVertical: 8,
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.2857%",
    minHeight: 50,
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 6,
    gap: 4,
  },
  dayNumCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  dotRow: {
    flexDirection: "row",
    gap: 3,
    height: 6,
    alignItems: "center",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  selectedDayHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
