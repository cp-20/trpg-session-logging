import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoogleSignInButton } from "../components/identity";
import { Button, LogoMark } from "../components/ui";
import { isFirebaseConfigured, mobileAuthErrorMessage } from "../lib/firebase-mobile";
import { isGoogleSignInAvailable, signInWithGoogle } from "../lib/google-sign-in";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";

/* 最初の画面: 名前と一言、ログイン、サンプルの 3 つだけ。機能の紹介は置かない */
export default function SignInScreen() {
  const { tokens } = useTheme();
  const { enterDemo } = useMobileStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSignIn = isFirebaseConfigured && isGoogleSignInAvailable;

  async function handleGoogleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (cause) {
      setError(mobileAuthErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: tokens.ground,
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(24, insets.bottom + 16),
        },
      ]}
    >
      <View style={styles.hero}>
        <LogoMark size={56} color={tokens.primary} />
        <Text style={[styles.brandTitle, { color: tokens.ink }]}>卓譜</Text>
        <Text style={[styles.lead, { color: tokens.ink2 }]}>TRPG の卓の記録を、まとめて残せます。</Text>
      </View>

      <View style={styles.actions}>
        <GoogleSignInButton busy={busy} disabled={!canSignIn} onPress={() => void handleGoogleSignIn()} />
        {error && (
          <Text accessibilityRole="alert" style={[styles.note, { color: tokens.error }]}>
            {error}
          </Text>
        )}
        {!canSignIn && (
          <Text style={[styles.note, { color: tokens.ink2 }]}>
            ログインは準備中です。サンプルデータでお試しください。
          </Text>
        )}
        <Button
          variant="quiet"
          fullWidth
          disabled={busy}
          onPress={() => {
            enterDemo();
            router.replace("/");
          }}
        >
          サンプルデータで試す
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  actions: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    gap: 12,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
