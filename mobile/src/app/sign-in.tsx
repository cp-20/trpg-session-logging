import { useEffect, useState, useTransition } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProviderIcon } from "../components/identity";
import { IconFileText, IconIdBadge, IconLock } from "../components/icons";
import { Button, LogoMark, Surface } from "../components/ui";
import {
  googleAuthClientIds,
  isFirebaseConfigured,
  isGoogleOAuthConfigured,
  mobileAuthErrorMessage,
  signInWithGoogleIdToken,
  signInWithGoogleWebPopup,
} from "../lib/firebase-mobile";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";

WebBrowser.maybeCompleteAuthSession();

const POINTS = [
  {
    Icon: IconFileText,
    title: "ログを取り込んで記録",
    body: "CCFOLIA・Udonarium・テキストのログから、日時と発言者を読み取ります。",
  },
  {
    Icon: IconIdBadge,
    title: "探索者ごとの履歴",
    body: "参加したセッションと成長の記録を、キャラクターごとに並べます。",
  },
  {
    Icon: IconLock,
    title: "共有範囲はセッションごと",
    body: "メンバー限定・プレイした人・公開から選んで、リンクで共有します。",
  },
];

export default function SignInScreen() {
  const { tokens } = useTheme();
  const { enterDemo } = useMobileStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prompting, setPrompting] = useState(false);
  /* 認可画面から戻った後のサインインは Transition の待機状態で表す（Effect から余分な描画を起こさない） */
  const [exchanging, startExchange] = useTransition();
  const busy = prompting || exchanging;
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: googleAuthClientIds.iosClientId || "unset",
    androidClientId: googleAuthClientIds.androidClientId || "unset",
    webClientId: googleAuthClientIds.webClientId || "unset",
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params?.id_token;
    if (!idToken) return;
    startExchange(async () => {
      try {
        await signInWithGoogleIdToken(idToken);
        setError(null);
      } catch (cause) {
        setError(mobileAuthErrorMessage(cause));
      }
    });
  }, [response]);

  async function handleGoogleSignIn() {
    setPrompting(true);
    setError(null);
    try {
      if (Platform.OS === "web") {
        await signInWithGoogleWebPopup();
      } else {
        await promptAsync();
      }
    } catch (cause) {
      setError(mobileAuthErrorMessage(cause));
    } finally {
      setPrompting(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.ground }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + 32,
          paddingBottom: Math.max(32, insets.bottom + 24),
        },
      ]}
    >
      <View style={styles.brandRow}>
        <LogoMark size={32} color={tokens.primary} />
        <Text style={[styles.brandTitle, { color: tokens.ink }]}>卓譜</Text>
      </View>

      <Text style={[styles.lead, { color: tokens.ink }]}>
        TRPGのセッションログ・探索者・卓の記録をまとめて残します。
      </Text>

      <Surface style={{ padding: 20, marginTop: 22 }}>
        <Text style={[styles.cardTitle, { color: tokens.ink }]}>はじめる</Text>
        <Text style={[styles.cardDesc, { color: tokens.ink2 }]}>
          記録はアカウントに保存され、Web と同じデータを開けます。
        </Text>

        <View style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            fullWidth
            disabled={
              busy ||
              !isFirebaseConfigured ||
              (Platform.OS !== "web" && (!isGoogleOAuthConfigured || !request))
            }
            icon={<ProviderIcon provider="google" size={20} />}
            onPress={() => void handleGoogleSignIn()}
          >
            {busy ? "サインイン中…" : "Google でサインイン"}
          </Button>
        </View>

        {error && (
          <Text accessibilityRole="alert" style={[styles.errorText, { color: tokens.error }]}>
            {error}
          </Text>
        )}

        {(!isFirebaseConfigured || (Platform.OS !== "web" && !isGoogleOAuthConfigured)) && (
          <Text style={[styles.hintText, { color: tokens.ink2 }]}>
            サインイン設定がまだありません。サンプルデータでお試しください。
          </Text>
        )}

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: tokens.border }]} />
          <Text style={{ fontSize: 12, color: tokens.ink3 }}>または</Text>
          <View style={[styles.dividerLine, { backgroundColor: tokens.border }]} />
        </View>

        <Button
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={() => {
            enterDemo();
            router.replace("/");
          }}
        >
          サンプルデータをそのまま見る
        </Button>
        <Text style={[styles.hintText, { color: tokens.ink2 }]}>
          登録は不要です。変更はこの端末にだけ保存されます。
        </Text>
      </Surface>

      <View style={{ gap: 16, marginTop: 28 }}>
        {POINTS.map(({ Icon, title, body }) => (
          <View key={title} style={styles.pointRow}>
            <View style={[styles.pointIcon, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
              <Icon size={18} color={tokens.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>{title}</Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.ink2, marginTop: 2 }}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  lead: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "700",
    marginTop: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  pointIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
