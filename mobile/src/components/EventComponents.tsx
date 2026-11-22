import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { eventDurationMinutes, pollCandidates, pollMemberIds, type BusyCheck } from "@shared/lib/schedule";
import { fmtDate, fmtDur } from "@shared/lib/time";
import type { Availability, Scenario, State, Table, TableEvent, TableEventCandidate } from "@shared/types";
import { hasTimeConflictWithDevice, type DeviceBusySummary } from "../native/native-calendar";
import { hapticSelection } from "../native/haptics";
import { useTheme } from "../theme/ThemeProvider";
import { Avatar } from "./identity";
import { BottomSheet, Button, DateBlock, DividerList, InteractiveRow, MetaRow, Seg, Surface } from "./ui";

const RSVP_SYMBOL: Record<Availability, string> = { ok: "◯", maybe: "△", ng: "×" };

const RSVP_OPTIONS: { v: Availability; label: string }[] = [
  { v: "ok", label: "◯ 参加可" },
  { v: "maybe", label: "△ 未定" },
  { v: "ng", label: "× 不可" },
];

export function EventRow({
  ev,
  state,
  onPress,
  showTable = true,
  trailing,
  muted,
}: {
  ev: TableEvent;
  state: State;
  onPress: () => void;
  showTable?: boolean;
  trailing?: ReactNode;
  muted?: boolean;
}) {
  const { tokens } = useTheme();
  const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
  const sc = ev.scenarioId ? state.scenarios[ev.scenarioId] : undefined;
  const durMin = eventDurationMinutes(ev.startTime, ev.endTime, ev.durationMin);

  return (
    <InteractiveRow onPress={onPress} accessibilityLabel={`${fmtDate(ev.date)} ${ev.title} の詳細`}>
      <View style={styles.eventRow}>
        <DateBlock date={ev.date} muted={muted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.eventTitle, { color: tokens.ink }]} numberOfLines={2}>
            {ev.title}
          </Text>
          <MetaRow style={{ marginTop: 3 }}>
            <Text style={[styles.metaText, styles.tabular, { color: tokens.ink2 }]}>
              {ev.startTime}–{ev.endTime}
              {durMin > 0 ? `（${fmtDur(durMin)}）` : ""}
            </Text>
            {showTable && tb && (
              <Text style={[styles.metaText, { color: tokens.ink2 }]} numberOfLines={1}>
                {tb.name}
              </Text>
            )}
            {sc && (
              <Text style={[styles.metaText, { color: tokens.ink2 }]} numberOfLines={1}>
                {sc.title}
              </Text>
            )}
          </MetaRow>
        </View>
        {trailing}
      </View>
    </InteractiveRow>
  );
}

export function PollCard({
  ev,
  state,
  canConfirm,
  busyCheck,
  deviceBusy,
  onRsvp,
  onConfirm,
}: {
  ev: TableEvent;
  state: State;
  canConfirm: boolean;
  /** Google カレンダーの空き時間（Web の設定で許可したときだけ）との重なり */
  busyCheck: BusyCheck;
  deviceBusy?: DeviceBusySummary | null;
  onRsvp: (candidateId: string, value: Availability) => void;
  onConfirm: (cand: TableEventCandidate) => void;
}) {
  const { tokens } = useTheme();
  const router = useRouter();
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
    <Surface>
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
        <Text style={[styles.eventTitle, { color: tokens.ink }]}>{ev.title}</Text>
        <MetaRow style={{ marginTop: 4 }}>
          {tb ? (
            <Pressable onPress={() => router.push(`/tables/${tb.id}`)}>
              <Text style={[styles.metaText, { color: tokens.primary, fontWeight: "600" }]}>{tb.name}</Text>
            </Pressable>
          ) : (
            <Text style={[styles.metaText, { color: tokens.ink2 }]}>個人の予定</Text>
          )}
          {sc && (
            <Pressable onPress={() => router.push(`/scenarios/${sc.id}`)}>
              <Text style={[styles.metaText, { color: tokens.primary, fontWeight: "600" }]}>{sc.title}</Text>
            </Pressable>
          )}
          {organiser && <Text style={[styles.metaText, { color: tokens.ink2 }]}>主催 {organiser.name}</Text>}
        </MetaRow>
        {ev.note && (
          <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.ink2, marginTop: 6 }}>{ev.note}</Text>
        )}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: tokens.border }}>
        <DividerList>
          {candidates.map((cand, i) => {
            const my = cand.responses[state.me];
            const ok = okCounts[i]!;
            const maybe = memberIds.filter((id) => cand.responses[id] === "maybe").length;
            const ng = memberIds.filter((id) => cand.responses[id] === "ng").length;
            const pending = memberIds.length - ok - maybe - ng;
            const durMin = eventDurationMinutes(cand.startTime, cand.endTime, ev.durationMin);
            const deviceConflict = hasTimeConflictWithDevice(
              deviceBusy ?? null,
              cand.date,
              cand.startTime,
              cand.endTime,
            );

            return (
              <View key={cand.id} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
                <View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8 }}>
                    <Text style={[styles.candDate, styles.tabular, { color: tokens.ink }]}>
                      {fmtDate(cand.date)} {cand.startTime}–{cand.endTime}
                    </Text>
                    {durMin > 0 && <Text style={{ fontSize: 12, color: tokens.ink2 }}>{fmtDur(durMin)}</Text>}
                  </View>
                  <MetaRow style={{ marginTop: 3 }}>
                    <Text
                      style={[
                        styles.tallyText,
                        styles.tabular,
                        {
                          color: ok === bestOk && ok > 0 ? tokens.success : tokens.ink2,
                          fontWeight: ok === bestOk && ok > 0 ? "700" : "500",
                        },
                      ]}
                    >
                      ◯ {ok}/{memberIds.length}人
                    </Text>
                    {maybe > 0 && (
                      <Text style={[styles.tallyText, styles.tabular, { color: tokens.ink2 }]}>
                        △ {maybe}
                      </Text>
                    )}
                    {ng > 0 && (
                      <Text style={[styles.tallyText, styles.tabular, { color: tokens.ink2 }]}>× {ng}</Text>
                    )}
                    {pending > 0 && (
                      <Text style={[styles.tallyText, styles.tabular, { color: tokens.ink2 }]}>
                        未回答 {pending}
                      </Text>
                    )}
                    {(deviceConflict || busyCheck(cand.date, cand.startTime, durMin)) && (
                      <Text style={[styles.tallyText, { color: tokens.warning, fontWeight: "700" }]}>
                        {deviceConflict ? "端末の予定あり" : "自分の予定あり"}
                      </Text>
                    )}
                  </MetaRow>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <Seg<Availability>
                    size="sm"
                    value={(my ?? "") as Availability}
                    options={RSVP_OPTIONS}
                    onChange={(v) => onRsvp(cand.id, v)}
                  />
                  {canConfirm &&
                    (confirming === cand.id ? (
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Button
                          size="sm"
                          variant="primary"
                          onPress={() => {
                            setConfirming(null);
                            onConfirm(cand);
                          }}
                        >
                          確定する
                        </Button>
                        <Button size="sm" variant="quiet" onPress={() => setConfirming(null)}>
                          やめる
                        </Button>
                      </View>
                    ) : (
                      <Button size="sm" variant="quiet" onPress={() => setConfirming(cand.id)}>
                        この日で確定
                      </Button>
                    ))}
                </View>

                {showAnswers && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, paddingTop: 2 }}>
                    {memberIds.map((id) => {
                      const u = state.users[id]!;
                      const r = cand.responses[id];
                      const rColor = r === "ok" ? tokens.success : r === "ng" ? tokens.error : tokens.ink2;
                      return (
                        <View key={id} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                          <Avatar u={u} size={18} />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: id === state.me ? "700" : "500",
                              color: tokens.ink,
                            }}
                          >
                            {u.name}
                          </Text>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: rColor }}>
                            {r ? RSVP_SYMBOL[r] : "–"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </DividerList>
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: tokens.border,
          paddingHorizontal: 12,
          paddingVertical: 8,
          alignItems: "flex-start",
        }}
      >
        <Button size="sm" variant="quiet" onPress={() => setShowAnswers((v) => !v)}>
          {showAnswers ? "回答の内訳を閉じる" : "みんなの回答を見る"}
        </Button>
      </View>
    </Surface>
  );
}

export function PollReplySheet({
  ev,
  state,
  canConfirm,
  busyCheck,
  deviceBusy,
  onRsvp,
  onConfirm,
  onClose,
}: {
  ev: TableEvent | null;
  state: State;
  canConfirm: boolean;
  busyCheck: BusyCheck;
  deviceBusy?: DeviceBusySummary | null;
  onRsvp: (candidateId: string, value: Availability) => void;
  onConfirm: (cand: TableEventCandidate) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      visible={Boolean(ev)}
      title={ev?.title ?? "日程調整"}
      onClose={onClose}
      footer={
        <Button variant="quiet" onPress={onClose}>
          閉じる
        </Button>
      }
    >
      {ev && (
        <PollCard
          ev={ev}
          state={state}
          canConfirm={canConfirm}
          busyCheck={busyCheck}
          deviceBusy={deviceBusy}
          onRsvp={onRsvp}
          onConfirm={(cand) => {
            onConfirm(cand);
            onClose();
          }}
        />
      )}
    </BottomSheet>
  );
}

export function EventDetailSheet({
  event,
  table,
  scenario,
  today,
  state,
  onRsvp,
  onClose,
  onRecordSession,
}: {
  event: TableEvent | null;
  table?: Table;
  scenario?: Scenario;
  today: string;
  state: State;
  onRsvp?: (value: Availability) => void;
  onClose: () => void;
  onRecordSession?: () => void;
}) {
  const { tokens } = useTheme();
  const router = useRouter();
  if (!event) return null;

  const isPast = event.date < today;
  const my = event.responses[state.me];
  const durMin = eventDurationMinutes(event.startTime, event.endTime, event.durationMin);

  return (
    <BottomSheet
      visible={Boolean(event)}
      title={event.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            閉じる
          </Button>
          {isPast && onRecordSession && (
            <Button variant="primary" onPress={onRecordSession}>
              この予定を記録する
            </Button>
          )}
        </>
      }
    >
      <View style={{ gap: 14 }}>
        <MetaRow>
          <Text style={[styles.candDate, styles.tabular, { color: tokens.ink }]}>
            {fmtDate(event.date)} {event.startTime}–{event.endTime}
          </Text>
          {durMin > 0 && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{fmtDur(durMin)}</Text>}
        </MetaRow>

        <MetaRow>
          {table && (
            <Pressable
              onPress={() => {
                hapticSelection();
                onClose();
                router.push(`/tables/${table.id}`);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.primary }}>{table.name}</Text>
            </Pressable>
          )}
          {scenario && (
            <Pressable
              onPress={() => {
                hapticSelection();
                onClose();
                router.push(`/scenarios/${scenario.id}`);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.primary }}>{scenario.title}</Text>
            </Pressable>
          )}
        </MetaRow>

        {event.note && <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink }}>{event.note}</Text>}

        {!isPast && onRsvp && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink2 }}>自分の参加</Text>
            <Seg<Availability>
              size="sm"
              value={(my ?? "") as Availability}
              options={RSVP_OPTIONS}
              onChange={onRsvp}
            />
          </View>
        )}

        {Object.keys(event.responses).length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink2 }}>参加メンバー</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {Object.entries(event.responses).map(([uid, av]) => {
                const u = state.users[uid];
                if (!u) return null;
                return (
                  <View key={uid} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Avatar u={u} size={22} />
                    <Text style={{ fontSize: 13, color: tokens.ink }}>{u.name}</Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: av === "ok" ? tokens.success : av === "ng" ? tokens.error : tokens.ink2,
                      }}
                    >
                      {RSVP_SYMBOL[av]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  metaText: {
    fontSize: 13,
    lineHeight: 18,
  },
  tabular: {
    fontVariant: ["tabular-nums"],
  },
  candDate: {
    fontSize: 15,
    fontWeight: "700",
  },
  tallyText: {
    fontSize: 12,
  },
});
