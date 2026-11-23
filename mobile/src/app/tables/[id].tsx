import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { unansweredCount } from "@shared/lib/schedule";
import { todayStr, sessionStart } from "@shared/lib/time";
import type { TableEvent } from "@shared/types";
import { EventDetailSheet, EventRow } from "../../components/EventComponents";
import { ScreenShell } from "../../components/ScreenShell";
import { SessionRow } from "../../components/SessionRow";
import { Avatar, AvatarStack, PlayerPicker, TableMark } from "../../components/identity";
import {
  IconCalendarTime,
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconSearch,
  IconX,
} from "../../components/icons";
import {
  BottomSheet,
  Button,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  InteractiveRow,
  NotFound,
  PageHead,
  SectionTitle,
  Surface,
  TextField,
} from "../../components/ui";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { RADII } from "../../theme/tokens";
import { sessionTitle } from "@shared/lib/session-scenario";

const SEARCH_THRESHOLD = 6;

export default function TableDetailScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const today = todayStr();

  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState("");
  const [openEvent, setOpenEvent] = useState<TableEvent | null>(null);

  const table = state.tables[id ?? ""];
  const sessions = useMemo(
    () =>
      table
        ? Object.values(state.logs)
            .filter((l) => l.tableId === table.id)
            .sort((a, b) => sessionStart(b) - sessionStart(a))
        : [],
    [state.logs, table],
  );
  const upcomingEvents = useMemo(
    () =>
      table
        ? Object.values(state.events ?? {})
            .filter((ev) => ev.status !== "poll" && ev.tableId === table.id && ev.date >= today)
            .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        : [],
    [state.events, table, today],
  );
  const polls = useMemo(
    () =>
      table
        ? Object.values(state.events ?? {}).filter((ev) => ev.status === "poll" && ev.tableId === table.id)
        : [],
    [state.events, table],
  );

  if (!table) {
    return (
      <ScreenShell>
        <PageHead title="卓" back={{ label: "卓" }} />
        <NotFound what="卓" />
      </ScreenShell>
    );
  }

  const users = table.memberIds
    .map((mid) => state.users[mid])
    .filter((u): u is NonNullable<typeof u> => Boolean(u));
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? sessions.filter((l) => sessionTitle(l, state.scenarios).toLowerCase().includes(needle))
    : sessions;
  const activeDetailEvent = openEvent ? (state.events[openEvent.id] ?? openEvent) : null;

  return (
    <ScreenShell>
      <PageHead
        back={{ label: "卓" }}
        lead={<TableMark table={table} size={56} />}
        title={table.name}
        sub={
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AvatarStack
                people={users.map((user) => ({ kind: "user", user }) as const)}
                size={24}
                max={6}
              />
              <Text style={{ flex: 1, fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                {users.map((u) => u.name).join("、")}
              </Text>
            </View>
            {table.note && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{table.note}</Text>}
          </View>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconPencil size={16} color={tokens.ink} />}
              onPress={() => setEditing(true)}
            >
              編集
            </Button>
            <Button
              variant="primary"
              icon={<IconPlus size={16} color={tokens.primaryContent} />}
              onPress={() => router.push({ pathname: "/upload", params: { table: table.id } })}
            >
              この卓で記録
            </Button>
          </>
        }
      />

      <View style={{ gap: 26 }}>
        <View>
          <SectionTitle>次の予定</SectionTitle>
          <Surface>
            {upcomingEvents.length === 0 && polls.length === 0 ? (
              <View style={styles.emptyEventRow}>
                <Text style={{ flex: 1, fontSize: 14, color: tokens.ink2 }}>
                  決まっている予定はありません。
                </Text>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<IconCalendarTime size={15} color={tokens.ink} />}
                  onPress={() => router.push("/calendar")}
                >
                  予定を立てる
                </Button>
              </View>
            ) : (
              <DividerList>
                {upcomingEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    ev={ev}
                    state={state}
                    showTable={false}
                    onPress={() => setOpenEvent(ev)}
                  />
                ))}
                {polls.map((ev) => {
                  const waiting = unansweredCount(ev, state.me) > 0;
                  return (
                    <InteractiveRow
                      key={ev.id}
                      onPress={() => router.push("/calendar")}
                      accessibilityLabel={ev.title}
                    >
                      <View style={styles.pollRow}>
                        <IconCalendarTime size={18} color={tokens.warning} />
                        <Text style={{ flex: 1, fontSize: 14, color: tokens.ink }} numberOfLines={1}>
                          <Text style={{ color: tokens.ink2 }}>日程調整中 </Text>
                          <Text style={{ fontWeight: "700" }}>{ev.title}</Text>
                        </Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: waiting ? "700" : "500",
                            color: waiting ? tokens.warning : tokens.ink2,
                          }}
                        >
                          {waiting ? "返事する" : "カレンダー"}
                        </Text>
                        <IconChevronRight size={16} color={tokens.ink3} />
                      </View>
                    </InteractiveRow>
                  );
                })}
              </DividerList>
            )}
          </Surface>
        </View>

        <View>
          <SectionTitle>遊んだセッション</SectionTitle>
          {sessions.length >= SEARCH_THRESHOLD && (
            <View
              style={[
                styles.searchWrap,
                { backgroundColor: tokens.surface, borderColor: tokens.border, marginBottom: 10 },
              ]}
            >
              <IconSearch size={16} color={tokens.ink3} />
              <TextField
                value={q}
                onChangeText={setQ}
                placeholder="この卓で検索"
                accessibilityLabel="この卓のセッションを検索"
                style={{ flex: 1, borderWidth: 0, minHeight: 38, paddingHorizontal: 4 }}
              />
              {q !== "" && (
                <IconButton accessibilityLabel="検索をクリア" onPress={() => setQ("")}>
                  <IconX size={15} color={tokens.ink2} />
                </IconButton>
              )}
            </View>
          )}

          {shown.length === 0 ? (
            <Surface>
              <EmptyState
                kind={needle ? "filtered" : "first"}
                title={needle ? undefined : "この卓の記録はまだありません"}
              />
            </Surface>
          ) : (
            <Surface>
              <DividerList>
                {shown.map((l) => (
                  <SessionRow
                    key={l.id}
                    log={l}
                    context="table"
                    onPress={() => router.push(`/sessions/${l.id}` as never)}
                  />
                ))}
              </DividerList>
            </Surface>
          )}
        </View>
      </View>

      {editing && (
        <EditTableSheet
          tableId={table.id}
          initialName={table.name}
          initialNote={table.note ?? ""}
          memberIds={table.memberIds}
          ownerId={table.ownerId}
          onClose={() => setEditing(false)}
          onAddMember={(uid2) =>
            update((s) => {
              s.tables[table.id]?.memberIds.push(uid2);
            })
          }
          onRemoveMember={(uid2) =>
            update((s) => {
              const target = s.tables[table.id];
              if (target) target.memberIds = target.memberIds.filter((m) => m !== uid2);
            })
          }
        />
      )}

      <EventDetailSheet
        event={activeDetailEvent}
        table={table}
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
          router.push({
            pathname: "/upload",
            params: { table: table.id, scenario: target.scenarioId ?? "" },
          });
        }}
      />
    </ScreenShell>
  );
}

function EditTableSheet({
  tableId,
  initialName,
  initialNote,
  memberIds,
  ownerId,
  onClose,
  onAddMember,
  onRemoveMember,
}: {
  tableId: string;
  initialName: string;
  initialNote: string;
  memberIds: string[];
  ownerId: string;
  onClose: () => void;
  onAddMember: (uid: string) => void;
  onRemoveMember: (uid: string) => void;
}) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const [name, setName] = useState(initialName);
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!name.trim()) {
      setError("卓名を入力してください");
      return;
    }
    update((s) => {
      const target = s.tables[tableId];
      if (!target) return;
      target.name = name.trim();
      target.note = note.trim() || undefined;
    });
    hapticSuccess();
    onClose();
  }

  return (
    <BottomSheet
      visible
      title="卓を編集"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={save}>
            保存
          </Button>
        </>
      }
    >
      <Field label="卓名" noMargin>
        <TextField
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
        />
        <FieldError text={error} />
      </Field>
      <Field label="メモ（任意）">
        <TextField value={note} onChangeText={setNote} />
      </Field>

      <View style={{ marginTop: 18, gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>メンバー</Text>
        <Surface>
          <DividerList>
            {memberIds.map((mid) => {
              const u = state.users[mid];
              if (!u) return null;
              return (
                <View key={mid} style={styles.editMemberRow}>
                  <Avatar u={u} size={28} />
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: tokens.ink }}>
                    {u.name}
                  </Text>
                  {mid === ownerId ? (
                    <Text style={{ fontSize: 12, color: tokens.ink3 }}>作成者</Text>
                  ) : (
                    <IconButton
                      accessibilityLabel={`${u.name}を卓から外す`}
                      onPress={() => onRemoveMember(mid)}
                    >
                      <IconX size={16} color={tokens.ink2} />
                    </IconButton>
                  )}
                </View>
              );
            })}
          </DividerList>
        </Surface>
        <PlayerPicker
          state={state}
          selected={[]}
          onChange={(ids) => ids.forEach(onAddMember)}
          exclude={memberIds}
          placeholder="メンバーを追加…"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  emptyEventRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 16,
  },
  pollRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 10,
    paddingRight: 2,
    gap: 4,
  },
  editMemberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 8,
  },
});
