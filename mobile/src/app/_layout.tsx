import "../polyfills";
import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View, type AppStateStatus } from "react-native";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Button, LogoMark, Surface } from "../components/ui";
import { IconFingerprint } from "../components/icons";
import { authenticateWithBiometrics, isBiometricLockEnabled } from "../native/biometrics";
import { rescheduleSessionNotifications } from "../native/notifications";
import { MobileStoreProvider, useMobileStore } from "../store/mobile-store";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppNavigator() {
  const { tokens, isDark } = useTheme();
  const { state, authUser, authReady } = useMobileStore();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const [locked, setLocked] = useState(() => isBiometricLockEnabled());
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

  /* 認証・デモ状態に応じたゲート */
  useEffect(() => {
    if (!authReady) return;
    const topSeg = segments[0];
    const isPublicRoute = topSeg === "share" || topSeg === "invite" || topSeg === "sign-in";
    const entered = Boolean(authUser) || state.entered;

    if (!entered && !isPublicRoute) {
      router.replace("/sign-in");
    } else if (entered && pathname === "/sign-in") {
      router.replace("/");
    }
  }, [authReady, authUser, state.entered, segments, pathname, router]);

  /* 確定予定・未記録リマインダー通知の更新 */
  useEffect(() => {
    if (!authUser && !state.entered) return;
    void rescheduleSessionNotifications(state).catch(() => {});
  }, [state, authUser]);

  /* 通知タップ時の画面遷移 */
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        router.push(url as never);
      }
    });
    return () => sub.remove();
  }, [router]);

  /* バックグラウンド復帰時の生体認証ロック */
  useEffect(() => {
    let wasBackground = false;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "background") {
        wasBackground = true;
      } else if (next === "active" && wasBackground) {
        wasBackground = false;
        if (isBiometricLockEnabled()) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  async function handleUnlock() {
    if (unlocking) return;
    setUnlocking(true);
    try {
      const ok = await authenticateWithBiometrics();
      if (ok) setLocked(false);
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.ground }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.ground },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="upload" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="sessions/[id]" />
        <Stack.Screen name="tables/[id]" />
        <Stack.Screen name="characters/[id]" />
        <Stack.Screen name="scenarios/[id]" />
        <Stack.Screen name="scenarios/new" />
        <Stack.Screen name="users/[id]" />
        <Stack.Screen name="invite/[id]" />
        <Stack.Screen name="share/l/[slug]" />
        <Stack.Screen name="share/c/[id]" />
      </Stack>

      {locked && (
        <View style={[styles.lockOverlay, { backgroundColor: tokens.ground }]}>
          <Surface style={{ padding: 24, width: "100%", maxWidth: 340, alignItems: "center", gap: 14 }}>
            <LogoMark size={32} color={tokens.primary} />
            <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.ink }}>卓譜をロック中</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.ink2, textAlign: "center" }}>
              記録とシークレット情報を保護しています。生体認証で開きます。
            </Text>
            <Button
              variant="primary"
              fullWidth
              disabled={unlocking}
              icon={<IconFingerprint size={18} color={tokens.primaryContent} />}
              onPress={() => void handleUnlock()}
            >
              {unlocking ? "確認中…" : "ロックを解除"}
            </Button>
          </Surface>
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <MobileStoreProvider>
            <AppNavigator />
          </MobileStoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 100,
  },
});
