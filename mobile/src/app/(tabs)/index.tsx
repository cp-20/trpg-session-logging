import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { fmtDateShort, todayStr } from "@shared/lib/format";
import {
  applyCandidateRsvp,
  applyConfirmCandidate,
  busyChecker,
  canConfirmPoll,
  myScheduleView,
  pollCandidates,
  relativeDayLabel,
} from "@shared/lib/schedule";
import { sessionStart } from "@shared/lib/time";
import type { Availability, TableEvent, TableEventCandidate } from "@shared/types";
import { EventDetailSheet, EventRow, PollReplySheet } from "../../components/EventComponents";
import { ScreenShell } from "../../components/ScreenShell";
import { SessionRow } from "../../components/SessionRow";
import { CharAvatar } from "../../components/identity";
import {
  IconChevronRight,
  IconClipboard,
  IconPlus,
  IconUpload,
  IconTable,
  IconX,
} from "../../components/icons";
import {
  Button,
  DividerList,
  EmptyState,
  IconButton,
  PageHead,
  SectionTitle,
  Surface,
} from "../../components/ui";
import { readClipboardSuggestion, type ClipboardSuggestion } from "../../native/clipboard-import";
import { fetchDeviceBusyDates, type DeviceBusySummary } from "../../native/native-calendar";
import { hapticSelection } from "../../native/haptics";
import { sessionsOfMe, useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { RADII } from "../../theme/tokens";

const RECENT_SESSIONS = 3;
const NEXT_EVENTS = 3;

function candidateSpan(ev: TableEvent): string {
  const dates = [...new Set(pollCandidates(ev).map((c) => c.date))].sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first) return "";
  return first === last ? fmtDateShort(first) : `${fmtDateShort(first)}〜${fmtDateShort(last!)}`;
}

export default function HomeScreen() {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const today = todayStr();

  const [openEvent, setOpenEvent] = useState<TableEvent | null>(null);
  const [replyPoll, setReplyPoll] = useState<TableEvent | null>(null);
  const [deviceBusy, setDeviceBusy] = useState<DeviceBusySummary | null>(null);
  const [clip, setClip] = useState<{ raw: string; suggestion: ClipboardSuggestion } | null>(null);
  const [dismissedClip, setDismissedClip] = useState<string | null>(null);

  const schedule = useMemo(() => myScheduleView(state, today), [state, today]);
  const recent = useMemo(
    () => [...sessionsOfMe(state)].sort((a, b) => sessionStart(b) - sessionStart(a)),
    [state],
  );
  const myChars = useMemo(() => {
    const lastPlayedDate = (char: (typeof state.characters)[string]) =>
      char.sessions.reduce<string | undefined>((m, s) => (!m || s.date > m ? s.date : m), undefined);
    return Object.values(state.characters)
      .filter((c) => c.ownerId === state.me)
      .sort((a, b) => (lastPlayedDate(b) ?? "").localeCompare(lastPlayedDate(a) ?? ""));
  }, [state.characters, state.me]);

  const hasTables = Object.values(state.tables).some(
    (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
  );
  const busyCheck = useMemo(
    () => busyChecker({ googleBusy: state.prefs.googleBusy }),
    [state.prefs.googleBusy],
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      readClipboardSuggestion()
        .then((res) => {
          if (!alive) return;
          if (res && res.raw !== dismissedClip) setClip(res);
          else setClip(null);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [dismissedClip]),
  );

  useEffect(() => {
    if (schedule.pollsNeedingReply.length === 0) return;
    const dates = [
      ...new Set(schedule.pollsNeedingReply.flatMap((ev) => pollCandidates(ev).map((c) => c.date))),
    ];
    fetchDeviceBusyDates(dates)
      .then((summary) => {
        if (summary) setDeviceBusy(summary);
      })
      .catch(() => {});
  }, [schedule.pollsNeedingReply]);

  const recordFromEvent = (ev: TableEvent) => {
    router.push({
      pathname: "/upload",
      params: { table: ev.tableId ?? "", scenario: ev.scenarioId ?? "" },
    });
  };

  function setCandidateRsvp(eventId: string, candidateId: string, value: Availability) {
    update((s) => applyCandidateRsvp(s, eventId, candidateId, value));
  }

  function confirmCandidate(eventId: string, cand: TableEventCandidate) {
    update((s) => applyConfirmCandidate(s, eventId, cand));
  }

  function applyClipboardSuggestion() {
    if (!clip) return;
    const { suggestion, raw } = clip;
    setDismissedClip(raw);
    setClip(null);
    if (suggestion.kind === "invite") {
      router.push(`/invite/${suggestion.token}` as never);
      return;
    }
    if (suggestion.kind === "shareLog") {
      router.push(`/share/l/${suggestion.slug}` as never);
      return;
    }
    if (suggestion.kind === "shareCharacter") {
      router.push(`/share/c/${suggestion.id}` as never);
      return;
    }
    if (suggestion.kind === "sheetUrl") {
      router.push({ pathname: "/characters", params: { sheetUrl: suggestion.url } });
      return;
    }
    if (suggestion.kind === "log") {
      router.push({ pathname: "/upload", params: { fromClipboard: "1" } });
    }
  }

  const activeReplyPoll = replyPoll ? (state.events[replyPoll.id] ?? replyPoll) : null;
  const activeDetailEvent = openEvent ? (state.events[openEvent.id] ?? openEvent) : null;
  const isNewUser = recent.length === 0 && myChars.length === 0 && !hasTables;

  return (
    <ScreenShell>
      <PageHead title="ホーム" />

      {clip && (
        <Surface style={{ padding: 14, marginBottom: 18 }}>
          <View style={styles.clipRow}>
            <IconClipboard size={18} color={tokens.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                {clip.suggestion.kind === "sheetUrl"
                  ? "コピーしたキャラシを取り込む"
                  : clip.suggestion.kind === "log"
                    ? `クリップボードのログ（${clip.suggestion.messageCount}行）を取り込む`
                    : clip.suggestion.kind === "invite"
                      ? "コピーしたセッション招待を開く"
                      : "コピーした共有ページを開く"}
              </Text>
              <Text style={{ fontSize: 12, color: tokens.ink2 }}>
                {clip.suggestion.kind === "sheetUrl" || clip.suggestion.kind === "log"
                  ? clip.suggestion.sourceLabel
                  : "卓譜のリンク"}
              </Text>
            </View>
            <Button size="sm" variant="secondary" onPress={applyClipboardSuggestion}>
              開く
            </Button>
            <IconButton
              accessibilityLabel="クリップボードの案内を閉じる"
              onPress={() => {
                setDismissedClip(clip.raw);
                setClip(null);
              }}
            >
              <IconX size={16} color={tokens.ink2} />
            </IconButton>
          </View>
        </Surface>
      )}

      {isNewUser ? (
        <Surface>
          <EmptyState
            icon={<IconUpload size={28} color={tokens.ink3} />}
            title="遊んだセッションを残しましょう"
            action={
              <>
                <Button
                  variant="primary"
                  icon={<IconUpload size={16} color={tokens.primaryContent} />}
                  onPress={() => router.push("/upload")}
                >
                  ログを取り込む
                </Button>
                <Button
                  variant="secondary"
                  icon={<IconTable size={16} color={tokens.ink} />}
                  onPress={() => router.push("/tables")}
                >
                  いつものメンバーで卓をつくる
                </Button>
              </>
            }
          >
            CCFOLIA・Udonarium のログを入れると、日時と参加者がそのまま記録になります。
          </EmptyState>
        </Surface>
      ) : (
        <View style={{ gap: 28 }}>
          {schedule.pollsNeedingReply.length > 0 && (
            <View>
              <SectionTitle>日程調整の返事</SectionTitle>
              <Surface>
                <DividerList>
                  {schedule.pollsNeedingReply.map((ev) => {
                    const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
                    return (
                      <View key={ev.id} style={styles.pollHomeRow}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}
                            numberOfLines={1}
                          >
                            {ev.title}
                          </Text>
                          <View style={styles.pollHomeMeta}>
                            {tb && (
                              <Text style={{ fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                                {tb.name}
                              </Text>
                            )}
                            <Text style={{ fontSize: 13, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                              候補 {candidateSpan(ev)}
                            </Text>
                          </View>
                        </View>
                        <Button size="sm" variant="secondary" onPress={() => setReplyPoll(ev)}>
                          返事する
                        </Button>
                      </View>
                    );
                  })}
                </DividerList>
              </Surface>
            </View>
          )}

          {(schedule.upcoming.length > 0 || hasTables) && (
            <View>
              <SectionTitle
                right={
                  schedule.upcoming.length > 0 && (
                    <Button
                      size="sm"
                      variant="quiet"
                      onPress={() => router.push("/calendar")}
                      icon={<IconChevronRight size={14} color={tokens.ink} />}
                    >
                      カレンダー
                    </Button>
                  )
                }
              >
                次の予定
              </SectionTitle>
              {schedule.upcoming.length > 0 ? (
                <Surface>
                  <DividerList>
                    {schedule.upcoming.slice(0, NEXT_EVENTS).map((ev) => {
                      const rel = relativeDayLabel(today, ev.date);
                      const urgent = rel === "今日" || rel === "あす";
                      return (
                        <EventRow
                          key={ev.id}
                          ev={ev}
                          state={state}
                          onPress={() => setOpenEvent(ev)}
                          trailing={
                            rel && (
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: urgent ? "700" : "500",
                                  color: urgent ? tokens.primary : tokens.ink2,
                                }}
                              >
                                {rel}
                              </Text>
                            )
                          }
                        />
                      );
                    })}
                  </DividerList>
                </Surface>
              ) : (
                <Surface style={{ padding: 14 }}>
                  <View style={styles.inlineEmpty}>
                    <Text style={{ flex: 1, fontSize: 14, color: tokens.ink2 }}>
                      決まっている予定はありません。
                    </Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<IconPlus size={14} color={tokens.ink} />}
                      onPress={() => router.push("/calendar")}
                    >
                      予定を立てる
                    </Button>
                  </View>
                </Surface>
              )}
            </View>
          )}

          {schedule.unrecorded.length > 0 && (
            <View>
              <SectionTitle>記録がまだの予定</SectionTitle>
              <Surface>
                <DividerList>
                  {schedule.unrecorded.map((ev) => (
                    <EventRow
                      key={ev.id}
                      ev={ev}
                      state={state}
                      muted
                      onPress={() => setOpenEvent(ev)}
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

          <View>
            <SectionTitle
              right={
                recent.length > RECENT_SESSIONS && (
                  <Button
                    size="sm"
                    variant="quiet"
                    onPress={() => router.push("/sessions")}
                    icon={<IconChevronRight size={14} color={tokens.ink} />}
                  >
                    すべて
                  </Button>
                )
              }
            >
              最近のセッション
            </SectionTitle>
            {recent.length > 0 ? (
              <Surface>
                <DividerList>
                  {recent.slice(0, RECENT_SESSIONS).map((l) => (
                    <SessionRow
                      key={l.id}
                      log={l}
                      onPress={() => router.push(`/sessions/${l.id}` as never)}
                    />
                  ))}
                </DividerList>
              </Surface>
            ) : (
              <Surface style={{ padding: 14 }}>
                <View style={styles.inlineEmpty}>
                  <Text style={{ flex: 1, fontSize: 14, color: tokens.ink2 }}>
                    まだ記録したセッションはありません。
                  </Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconUpload size={14} color={tokens.ink} />}
                    onPress={() => router.push("/upload")}
                  >
                    ログを取り込む
                  </Button>
                </View>
              </Surface>
            )}
          </View>

          {myChars.length > 0 && (
            <View>
              <SectionTitle
                right={
                  <Button
                    size="sm"
                    variant="quiet"
                    onPress={() => router.push("/characters")}
                    icon={<IconChevronRight size={14} color={tokens.ink} />}
                  >
                    すべて
                  </Button>
                }
              >
                自分のキャラクター
              </SectionTitle>
              <View style={styles.charGrid}>
                {myChars.slice(0, 4).map((c) => {
                  const last = c.sessions.reduce<string | undefined>(
                    (m, s) => (!m || s.date > m ? s.date : m),
                    undefined,
                  );
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        hapticSelection();
                        router.push(`/characters/${c.id}` as never);
                      }}
                      style={({ pressed }) => [
                        styles.charCard,
                        {
                          backgroundColor: pressed ? tokens.surfaceHover : tokens.surface,
                          borderColor: tokens.border,
                        },
                      ]}
                    >
                      <CharAvatar c={c} size={56} />
                      <Text
                        style={{ fontSize: 14, fontWeight: "700", color: tokens.ink, textAlign: "center" }}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                      <Text
                        style={{ fontSize: 12, color: tokens.ink2, textAlign: "center" }}
                        numberOfLines={1}
                      >
                        {last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      )}

      <PollReplySheet
        ev={activeReplyPoll}
        state={state}
        canConfirm={activeReplyPoll ? canConfirmPoll(activeReplyPoll, state) : false}
        busyCheck={busyCheck}
        deviceBusy={deviceBusy}
        onRsvp={(candId, val) => activeReplyPoll && setCandidateRsvp(activeReplyPoll.id, candId, val)}
        onConfirm={(cand) => activeReplyPoll && confirmCandidate(activeReplyPoll.id, cand)}
        onClose={() => setReplyPoll(null)}
      />

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
        onClose={() => setOpenEvent(null)}
        onRecordSession={() => {
          if (!activeDetailEvent) return;
          const target = activeDetailEvent;
          setOpenEvent(null);
          recordFromEvent(target);
        }}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  clipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pollHomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pollHomeMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    marginTop: 2,
  },
  inlineEmpty: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  charGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  charCard: {
    width: "48%",
    borderWidth: 1,
    borderRadius: RADII.md,
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
});
