import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SYSTEM_LIST } from "@shared/data/systems";
import { systemOptions } from "@shared/lib/system-options";
import { todayStr, sessionStart, sessionDays } from "@shared/lib/time";
import type { Log } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { SessionRow } from "../../components/SessionRow";
import { IconPlus, IconSearch, IconUpload, IconX } from "../../components/icons";
import {
  Button,
  Combobox,
  DividerList,
  EmptyState,
  IconButton,
  PageHead,
  Surface,
  TextField,
} from "../../components/ui";
import { sessionsOfMe, useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { RADII } from "../../theme/tokens";

export default function SessionsScreen() {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");

  const myLogs = useMemo(() => sessionsOfMe(state), [state]);
  const usedSystems = useMemo(() => new Set(myLogs.map((l) => l.systemId)), [myLogs]);

  const logs = useMemo(() => {
    let list = [...myLogs];
    if (sys !== "all") list = list.filter((l) => l.systemId === sys);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((l) => {
        const sc = l.scenarioId ? state.scenarios[l.scenarioId]?.title : "";
        const tb = l.tableId ? state.tables[l.tableId]?.name : "";
        return [l.title, sc, tb].some((t) => t?.toLowerCase().includes(needle));
      });
    }
    return list.sort((a, b) => sessionStart(b) - sessionStart(a));
  }, [myLogs, q, sys, state.scenarios, state.tables]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Log[] }[] = [];
    const thisYear = Number(todayStr().slice(0, 4));
    for (const l of logs) {
      const [y, m] = (sessionDays(l)[0] ?? "2026-01-01").split("-").map(Number);
      const key = `${y}-${m}`;
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: y === thisYear ? `${m}月` : `${y}年${m}月`, items: [] };
        out.push(g);
      }
      g.items.push(l);
    }
    return out;
  }, [logs]);

  const sysOptions = useMemo(
    () => [
      { value: "all", label: "すべてのシステム" },
      ...systemOptions(SYSTEM_LIST.filter((s) => usedSystems.has(s.id))),
    ],
    [usedSystems],
  );

  if (myLogs.length === 0) {
    return (
      <ScreenShell>
        <PageHead title="セッション" />
        <Surface>
          <EmptyState
            kind="first"
            title="最初のセッションを記録しましょう"
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
                  icon={<IconPlus size={16} color={tokens.ink} />}
                  onPress={() => router.push({ pathname: "/upload", params: { manual: "1" } })}
                >
                  日時と参加者だけ記録
                </Button>
              </>
            }
          >
            CCFOLIA・Udonarium のログに対応しています。
          </EmptyState>
        </Surface>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <PageHead title="セッション" />

      <View style={styles.filterWrap}>
        <View style={[styles.searchWrap, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <IconSearch size={16} color={tokens.ink3} />
          <TextField
            value={q}
            onChangeText={setQ}
            placeholder="タイトル・シナリオ・卓で検索"
            accessibilityLabel="セッションを検索"
            style={{ flex: 1, borderWidth: 0, minHeight: 40, paddingHorizontal: 4 }}
          />
          {q !== "" && (
            <IconButton accessibilityLabel="検索をクリア" onPress={() => setQ("")}>
              <IconX size={15} color={tokens.ink2} />
            </IconButton>
          )}
        </View>
        {sysOptions.length > 2 && (
          <Combobox ariaLabel="システムで絞り込み" value={sys} options={sysOptions} onChange={setSys} />
        )}
      </View>

      {logs.length === 0 ? (
        <Surface>
          <EmptyState
            kind="filtered"
            action={
              <Button
                size="sm"
                variant="secondary"
                onPress={() => {
                  setQ("");
                  setSys("all");
                }}
              >
                絞り込みを解除
              </Button>
            }
          />
        </Surface>
      ) : (
        <View style={{ gap: 22 }}>
          {groups.map((g) => (
            <View key={g.key}>
              <Text style={[styles.eyebrow, { color: tokens.ink2 }]}>{g.label}</Text>
              <Surface>
                <DividerList>
                  {g.items.map((l) => (
                    <SessionRow
                      key={l.id}
                      log={l}
                      showMonth={false}
                      onPress={() => router.push(`/sessions/${l.id}` as never)}
                    />
                  ))}
                </DividerList>
              </Surface>
            </View>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filterWrap: {
    gap: 8,
    marginBottom: 18,
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
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
});
