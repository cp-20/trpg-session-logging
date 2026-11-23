import { StyleSheet, Text, View } from "react-native";
import { SYSTEMS } from "@shared/data/systems";
import { fmtDur, sessionPlayMinutes, sessionDays } from "@shared/lib/time";
import type { Log } from "@shared/types";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";
import { AvatarStack } from "./identity";
import { DateBlock, InteractiveRow, MetaRow, SysBadge } from "./ui";
import { sessionTitle } from "@shared/lib/session-scenario";
import { roleLabel } from "@shared/lib/roles";

export function SessionRow({
  log,
  onPress,
  showKp = true,
  showMonth = true,
  context,
}: {
  log: Log;
  onPress: () => void;
  showKp?: boolean;
  showMonth?: boolean;
  context?: "table" | "scenario";
}) {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const tb = log.tableId ? state.tables[log.tableId] : null;
  const sys = SYSTEMS[log.systemId];
  const playMin = sessionPlayMinutes(log);

  const kp = state.users[log.ownerId];
  // セッションの呼び名はシナリオの題名。シナリオのページでは各行で繰り返さず、どの卓で遊んだかを見出しにする
  const heading =
    context === "scenario"
      ? (tb?.name ??
        (kp ? `${roleLabel(log.systemId, "GM")} ${kp.name}` : sessionTitle(log, state.scenarios)))
      : sessionTitle(log, state.scenarios);
  const showTable = Boolean(tb && context !== "table" && heading !== tb.name);
  const people = Object.entries(log.players)
    .filter(([uid]) => uid !== log.ownerId && state.users[uid])
    .map(([uid, p]) => {
      const ch = p.characterIds[0] ? state.characters[p.characterIds[0]] : undefined;
      return ch
        ? ({ kind: "char", char: ch } as const)
        : ({ kind: "user", user: state.users[uid]! } as const);
    });
  const names = people.map((p) => (p.kind === "char" ? p.char.name : p.user.name));

  return (
    <InteractiveRow onPress={onPress} accessibilityLabel={heading}>
      <View style={styles.row}>
        <DateBlock
          date={sessionDays(log)[0] ?? "2026-01-01"}
          times={log.sittings.length}
          showMonth={showMonth}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: tokens.ink }]} numberOfLines={2}>
            {heading}
          </Text>
          <MetaRow style={{ marginTop: 4 }}>
            <SysBadge sys={sys} />
            {showTable && tb && (
              <Text style={[styles.metaItem, { color: tokens.ink2 }]} numberOfLines={1}>
                {tb.name}
              </Text>
            )}
            {playMin > 0 && (
              <Text style={[styles.metaItem, styles.tabular, { color: tokens.ink2 }]}>{fmtDur(playMin)}</Text>
            )}
          </MetaRow>
          {(people.length > 0 || (showKp && kp)) && (
            <View style={styles.castRow}>
              <AvatarStack people={people} size={22} max={4} />
              <Text style={[styles.castText, { color: tokens.ink2 }]} numberOfLines={1}>
                {names.join("、")}
                {showKp && kp ? `${names.length ? "　" : ""}GM ${kp.name}` : ""}
              </Text>
            </View>
          )}
        </View>
      </View>
    </InteractiveRow>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  metaItem: {
    fontSize: 13,
    lineHeight: 18,
  },
  tabular: {
    fontVariant: ["tabular-nums"],
  },
  castRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  castText: {
    flex: 1,
    fontSize: 13,
  },
});
