import { useCallback, useState, type ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { todayStr } from "@shared/lib/time";
import { hapticImpact } from "../native/haptics";
import { shareJsonBackupFile } from "../native/native-share";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";
import { RADII } from "../theme/tokens";
import { Avatar } from "./identity";
import { IconAlert } from "./icons";
import { AppTopBar, Button } from "./ui";

function StatusBanners() {
  const { tokens } = useTheme();
  const { syncError, recoveryJson, dismissRecovery, retrySync } = useMobileStore();

  if (!syncError && !recoveryJson) return null;

  return (
    <View style={{ gap: 10, marginBottom: 16 }}>
      {syncError && (
        <View
          accessibilityRole="alert"
          style={[styles.banner, { backgroundColor: tokens.errorTint, borderColor: tokens.error }]}
        >
          <View style={styles.bannerHead}>
            <IconAlert size={18} color={tokens.error} />
            <Text style={[styles.bannerText, { color: tokens.ink }]}>{syncError}</Text>
          </View>
          <View style={styles.bannerActions}>
            <Button size="sm" variant="secondary" onPress={retrySync}>
              再試行
            </Button>
          </View>
        </View>
      )}
      {recoveryJson && (
        <View
          accessibilityRole="alert"
          style={[styles.banner, { backgroundColor: tokens.warningTint, borderColor: tokens.warning }]}
        >
          <View style={styles.bannerHead}>
            <IconAlert size={18} color={tokens.warning} />
            <Text style={[styles.bannerText, { color: tokens.ink }]}>
              別端末の更新と重なったため、この端末にあった変更をバックアップとして退避しました。
            </Text>
          </View>
          <View style={styles.bannerActions}>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => void shareJsonBackupFile(`takufu-recovery-${todayStr()}.json`, recoveryJson)}
            >
              バックアップを書き出す
            </Button>
            <Button size="sm" variant="quiet" onPress={dismissRecovery}>
              閉じる
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}

export function ScreenShell({
  children,
  contentStyle,
  withTopBar = true,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  withTopBar?: boolean;
}) {
  const { tokens } = useTheme();
  const { state, refreshNow, authUser } = useMobileStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const me = state.users[state.me];

  const onRefresh = useCallback(async () => {
    if (!authUser) return;
    hapticImpact("light");
    setRefreshing(true);
    try {
      await refreshNow();
    } finally {
      setRefreshing(false);
    }
  }, [authUser, refreshNow]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.ground }}>
      {withTopBar && me && (
        <AppTopBar onPressAvatar={() => router.push("/settings")} avatarNode={<Avatar u={me} size={30} />} />
      )}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          authUser ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={tokens.primary}
            />
          ) : undefined
        }
        contentContainerStyle={[
          {
            paddingHorizontal: 16,
            paddingTop: 18,
            paddingBottom: Math.max(36, insets.bottom + 24),
          },
          contentStyle,
        ]}
      >
        <StatusBanners />
        {children}
      </ScrollView>
    </View>
  );
}

export function ScreenFrame({ children, withTopBar = true }: { children: ReactNode; withTopBar?: boolean }) {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const router = useRouter();
  const me = state.users[state.me];

  return (
    <View style={{ flex: 1, backgroundColor: tokens.ground }}>
      {withTopBar && me && (
        <AppTopBar onPressAvatar={() => router.push("/settings")} avatarNode={<Avatar u={me} size={30} />} />
      )}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: RADII.md,
    padding: 12,
    gap: 10,
  },
  bannerHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  bannerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
