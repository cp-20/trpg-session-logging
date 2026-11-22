import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { fmtDate, todayStr, uid, sessionStart } from "@shared/lib/time";
import type { State, Table, TableEvent } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { AvatarStack, PlayerPicker } from "../../components/identity";
import { IconChevronRight, IconPlus } from "../../components/icons";
import {
  BottomSheet,
  Button,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  InteractiveRow,
  MetaRow,
  PageHead,
  Surface,
  TextField,
} from "../../components/ui";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";

function tableUpcoming(state: State, tableId: string, today: string): TableEvent[] {
  return Object.values(state.events ?? {})
    .filter((ev) => ev.status !== "poll" && ev.tableId === tableId && ev.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

function tableLastPlayed(state: State, tableId: string): number {
  return Object.values(state.logs)
    .filter((l) => l.tableId === tableId)
    .reduce((m, l) => Math.max(m, sessionStart(l)), 0);
}

export default function TablesScreen() {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const today = todayStr();

  const [newTableOpen, setNewTableOpen] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tables = useMemo(() => {
    const mine = Object.values(state.tables).filter(
      (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
    );
    return mine.sort((a, b) => {
      const na = tableUpcoming(state, a.id, today)[0]?.date ?? "";
      const nb = tableUpcoming(state, b.id, today)[0]?.date ?? "";
      if (na && nb) return na.localeCompare(nb);
      if (na || nb) return na ? -1 : 1;
      return tableLastPlayed(state, b.id) - tableLastPlayed(state, a.id);
    });
  }, [state, today]);

  function createTable() {
    if (!name.trim()) {
      setError("卓名を入力してください");
      return;
    }
    const id = `t_${uid()}`;
    update((s) => {
      s.tables[id] = {
        id,
        name: name.trim(),
        ownerId: s.me,
        memberIds: [s.me, ...members],
        createdAt: new Date().toISOString(),
      };
    });
    setName("");
    setMembers([]);
    setError(null);
    setNewTableOpen(false);
    router.push(`/tables/${id}` as never);
  }

  return (
    <ScreenShell>
      <PageHead
        title="卓"
        actions={
          <Button
            variant="primary"
            icon={<IconPlus size={16} color={tokens.primaryContent} />}
            onPress={() => setNewTableOpen(true)}
          >
            卓を作成
          </Button>
        }
      />

      {tables.length === 0 ? (
        <Surface>
          <EmptyState
            kind="first"
            title="いつものメンバーで卓を作りましょう"
            action={
              <Button
                variant="primary"
                icon={<IconPlus size={16} color={tokens.primaryContent} />}
                onPress={() => setNewTableOpen(true)}
              >
                卓を作成
              </Button>
            }
          >
            いつものメンバーを卓にまとめておくと、記録と次の予定がメンバーに共有されます。
          </EmptyState>
        </Surface>
      ) : (
        <Surface>
          <DividerList>
            {tables.map((t: Table) => {
              const next = tableUpcoming(state, t.id, today)[0];
              const users = t.memberIds
                .map((id) => state.users[id])
                .filter((u): u is NonNullable<typeof u> => Boolean(u));
              return (
                <InteractiveRow
                  key={t.id}
                  onPress={() => router.push(`/tables/${t.id}` as never)}
                  accessibilityLabel={t.name}
                >
                  <View style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <View style={styles.membersRow}>
                        <AvatarStack
                          people={users.map((user) => ({ kind: "user", user }) as const)}
                          size={24}
                          max={6}
                        />
                        <Text style={{ flex: 1, fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                          {users.map((u) => u.name).join("、")}
                        </Text>
                      </View>
                      {(t.note || next) && (
                        <MetaRow>
                          {t.note && (
                            <Text style={{ fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                              {t.note}
                            </Text>
                          )}
                          {next && (
                            <Text style={{ fontSize: 13, color: tokens.ink }} numberOfLines={1}>
                              <Text style={{ fontWeight: "700", color: tokens.primary }}>次回 </Text>
                              {fmtDate(next.date)} {next.startTime} {next.title}
                            </Text>
                          )}
                        </MetaRow>
                      )}
                    </View>
                    <IconChevronRight size={18} color={tokens.ink3} />
                  </View>
                </InteractiveRow>
              );
            })}
          </DividerList>
        </Surface>
      )}

      <BottomSheet
        visible={newTableOpen}
        title="新しい卓を作る"
        onClose={() => setNewTableOpen(false)}
        footer={
          <>
            <Button variant="quiet" onPress={() => setNewTableOpen(false)}>
              キャンセル
            </Button>
            <Button variant="primary" onPress={createTable}>
              作成する
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
            placeholder="例: 廃校部"
          />
          <FieldError text={error} />
        </Field>
        <Field label="メンバー">
          <PlayerPicker state={state} selected={members} onChange={setMembers} exclude={[state.me]} />
        </Field>
      </BottomSheet>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
