import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SYSTEMS, SYSTEM_LIST } from "@shared/data/systems";
import { systemOptions } from "@shared/lib/system-options";
import { evaluateShareGate } from "@shared/lib/share-gate";
import { ScreenShell } from "../../components/ScreenShell";
import { IconCheck, IconPlus, IconSearch, IconX } from "../../components/icons";
import {
  Button,
  Combobox,
  DividerList,
  EmptyState,
  IconButton,
  InteractiveRow,
  MetaRow,
  PageHead,
  Seg,
  Surface,
  SysBadge,
  TextField,
} from "../../components/ui";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { RADII } from "../../theme/tokens";
import { sessionStart } from "@shared/lib/sittings";

type PlayedFilter = "all" | "played" | "unplayed";

export default function ScenariosScreen() {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");
  const [played, setPlayed] = useState<PlayedFilter>("all");

  const rows = useMemo(() => {
    const viewer = state.entered ? state.me : null;
    return Object.values(state.scenarios).map((s) => {
      const logs = Object.values(state.logs).filter((l) => l.scenarioId === s.id);
      const visible = logs.filter((l) => evaluateShareGate(l, viewer).visible);
      const mine = logs.filter((l) => l.ownerId === state.me || Boolean(l.players[state.me]));
      const last = visible.reduce((m, l) => Math.max(m, sessionStart(l)), 0);
      return { s, mine, last };
    });
  }, [state.scenarios, state.logs, state.entered, state.me]);

  const usedSystems = useMemo(() => new Set(rows.map((r) => r.s.systemId)), [rows]);

  const list = useMemo(() => {
    let items = rows;
    if (sys !== "all") items = items.filter((r) => r.s.systemId === sys);
    if (played === "played") items = items.filter((r) => r.mine.length > 0);
    if (played === "unplayed") items = items.filter((r) => r.mine.length === 0);
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      items = items.filter((r) => (r.s.title + r.s.author + r.s.tags.join()).toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => b.last - a.last || a.s.title.localeCompare(b.s.title, "ja"));
  }, [rows, q, sys, played]);

  const filtered = q.trim() !== "" || sys !== "all" || played !== "all";

  return (
    <ScreenShell>
      <PageHead
        title="シナリオ"
        actions={
          <Button
            variant="primary"
            icon={<IconPlus size={16} color={tokens.primaryContent} />}
            onPress={() => router.push("/scenarios/new")}
          >
            シナリオを追加
          </Button>
        }
      />

      <View style={{ gap: 10, marginBottom: 16 }}>
        <View style={[styles.searchWrap, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
          <IconSearch size={16} color={tokens.ink3} />
          <TextField
            value={q}
            onChangeText={setQ}
            placeholder="タイトル・作者・キーワードで検索"
            accessibilityLabel="シナリオを検索"
            style={{ flex: 1, borderWidth: 0, minHeight: 40, paddingHorizontal: 4 }}
          />
          {q !== "" && (
            <IconButton accessibilityLabel="検索をクリア" onPress={() => setQ("")}>
              <IconX size={15} color={tokens.ink2} />
            </IconButton>
          )}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Seg<PlayedFilter>
            value={played}
            onChange={setPlayed}
            options={[
              { v: "all", label: "すべて" },
              { v: "played", label: "通過済み" },
              { v: "unplayed", label: "未通過" },
            ]}
          />
          {usedSystems.size > 1 && (
            <Combobox
              size="sm"
              ariaLabel="システムで絞り込み"
              value={sys}
              onChange={setSys}
              style={{ minWidth: 160, flex: 1 }}
              options={[
                { value: "all", label: "すべてのシステム" },
                ...systemOptions(SYSTEM_LIST.filter((x) => usedSystems.has(x.id))),
              ]}
            />
          )}
        </View>
      </View>

      {list.length === 0 ? (
        <Surface>
          <EmptyState
            kind={filtered ? "filtered" : "first"}
            title={filtered ? undefined : "シナリオがまだありません"}
            action={
              filtered ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setQ("");
                    setSys("all");
                    setPlayed("all");
                  }}
                >
                  絞り込みを解除
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={<IconPlus size={16} color={tokens.primaryContent} />}
                  onPress={() => router.push("/scenarios/new")}
                >
                  シナリオを追加
                </Button>
              )
            }
          />
        </Surface>
      ) : (
        <Surface>
          <DividerList>
            {list.map(({ s, mine }) => {
              const sysDef = SYSTEMS[s.systemId];
              return (
                <InteractiveRow
                  key={s.id}
                  onPress={() => router.push(`/scenarios/${s.id}` as never)}
                  accessibilityLabel={s.title}
                >
                  <View style={styles.row}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }} numberOfLines={2}>
                        {s.title}
                      </Text>
                      <MetaRow style={{ marginTop: 4 }}>
                        <SysBadge sys={sysDef} />
                        <Text style={{ fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                          {s.author}
                        </Text>
                      </MetaRow>
                    </View>
                    {mine.length > 0 && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <IconCheck size={14} color={tokens.success} />
                        <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.ink2 }}>通過済み</Text>
                      </View>
                    )}
                  </View>
                </InteractiveRow>
              );
            })}
          </DividerList>
        </Surface>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 10,
    paddingRight: 2,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
