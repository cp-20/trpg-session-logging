/**
 * はじめの設定。初めてログインした人に、ユーザー ID・表示名・アイコンを 1 つずつ決めてもらう（P15。Web の /welcome と同じ手順）。
 * ID だけは飛ばせない（プロフィールの URL とアイコンの種で、あとから変えられないため）。表示名とアイコンは飛ばすと今の値のまま。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { claimHandle, fetchHandleOwner, fetchOwnHandle } from "@shared/lib/cloud-people";
import {
  alternateHandle,
  HANDLE_MAX,
  handleProblem,
  normalizeHandle,
  suggestHandle,
} from "@shared/lib/handle";
import { identiconDataUri } from "@shared/lib/identicon";
import { handleTakenLocally } from "@shared/lib/people";
import { Avatar, AvatarImage } from "../components/identity";
import { Button, LogoMark, Surface, TextField } from "../components/ui";
import { pickAvatarImageDataUrl } from "../native/file-import";
import { hapticSuccess } from "../native/haptics";
import { useMobileStore } from "../store/mobile-store";
import { useTheme } from "../theme/ThemeProvider";
import { RADII } from "../theme/tokens";
import { userFacingError } from "@shared/lib/user-error";

type WelcomeStep = "id" | "name" | "icon" | "done";
const STEPS: readonly { key: Exclude<WelcomeStep, "done">; label: string }[] = [
  { key: "id", label: "ユーザー ID" },
  { key: "name", label: "表示名" },
  { key: "icon", label: "アイコン" },
];

const HANDLE_TAKEN = "この ID はほかの人が使っています";

export default function WelcomeScreen() {
  const { state, update, authUser } = useMobileStore();
  const router = useRouter();
  const me = state.users[state.me];
  const [step, setStep] = useState<WelcomeStep>(me?.handle ? "name" : "id");

  // 別の端末で ID を決めていて、記録の保存がまだ追いついていないとき
  const uid = authUser?.uid;
  const hasHandle = Boolean(me?.handle);
  const onboardingDone = Boolean(state.prefs.onboardingDone);
  useEffect(() => {
    if (!uid || hasHandle) return;
    let alive = true;
    fetchOwnHandle(uid)
      .then((handle) => {
        if (!alive || !handle) return;
        update((s) => {
          s.users[s.me]!.handle = handle;
        });
        if (onboardingDone) router.replace("/");
        else setStep("name");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, hasHandle, onboardingDone, update, router]);

  if (!me) return null;

  const finish = () => {
    update((s) => {
      s.prefs.onboardingDone = true;
    });
    hapticSuccess();
    setStep("done");
  };

  return (
    <WelcomeFrame step={step}>
      {step === "id" && <HandleStep onDone={() => setStep("name")} />}
      {step === "name" && (
        <NameStep onBack={me.handle ? undefined : () => setStep("id")} onDone={() => setStep("icon")} />
      )}
      {step === "icon" && <IconStep onBack={() => setStep("name")} onDone={finish} />}
      {step === "done" && <DoneStep />}
    </WelcomeFrame>
  );
}

function WelcomeFrame({ step, children }: { step: WelcomeStep; children: ReactNode }) {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const index = step === "done" ? STEPS.length : STEPS.findIndex((s) => s.key === step);
  return (
    <View style={{ flex: 1, backgroundColor: tokens.ground }}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 10, backgroundColor: tokens.surface, borderBottomColor: tokens.border },
        ]}
      >
        <LogoMark size={22} />
        <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }}>卓譜</Text>
        <View style={{ flex: 1 }} />
        {step !== "done" && (
          <View
            accessible
            accessibilityLabel={`はじめの設定 ${index + 1} / ${STEPS.length}: ${STEPS[index]?.label ?? ""}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            {STEPS.map((s, i) => (
              <View
                key={s.key}
                style={[styles.stepBar, { backgroundColor: i <= index ? tokens.primary : tokens.border }]}
              />
            ))}
            <Text style={{ fontSize: 13, color: tokens.ink2, fontVariant: ["tabular-nums"], marginLeft: 4 }}>
              {index + 1} / {STEPS.length}
            </Text>
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 28, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** 一歩ぶんの面: 見出し・中身・下の操作（戻る / スキップ / 次へ） */
function WelcomeCard({
  title,
  lead,
  children,
  onBack,
  onSkip,
  primary,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  primary: ReactNode;
}) {
  const { tokens } = useTheme();
  return (
    <Surface>
      <View style={{ padding: 20 }}>
        <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "700", color: tokens.ink }}>
          {title}
        </Text>
        <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 21, color: tokens.ink2 }}>{lead}</Text>
        <View style={{ marginTop: 20 }}>{children}</View>
      </View>
      <View style={[styles.cardFooter, { borderTopColor: tokens.border }]}>
        {onBack && (
          <Button variant="quiet" onPress={onBack}>
            戻る
          </Button>
        )}
        <View style={{ flex: 1 }} />
        {onSkip && (
          <Button variant="quiet" onPress={onSkip}>
            スキップ
          </Button>
        )}
        {primary}
      </View>
    </Surface>
  );
}

type HandleStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "error"; text: string };

/** 入力した ID が使えるか。形を確かめ、ログインしていれば少し待ってから保存先に問い合わせる */
function useHandleStatus(
  handle: string,
  uid: string,
  remote: boolean,
  takenLocally: (h: string) => boolean,
): HandleStatus {
  const problem = handle ? handleProblem(handle) : null;
  const local: HandleStatus | null = !handle
    ? { kind: "idle" }
    : problem
      ? { kind: "error", text: problem }
      : takenLocally(handle)
        ? { kind: "error", text: HANDLE_TAKEN }
        : null;
  const needsRemote = remote && !local;
  const [checked, setChecked] = useState<{ handle: string; status: HandleStatus } | null>(null);
  useEffect(() => {
    if (!needsRemote) return;
    let alive = true;
    const timer = setTimeout(() => {
      fetchHandleOwner(handle)
        .then((owner) => {
          if (alive)
            setChecked({
              handle,
              status: owner && owner !== uid ? { kind: "error", text: HANDLE_TAKEN } : { kind: "ok" },
            });
        })
        .catch(() => {
          if (alive)
            setChecked({
              handle,
              status: { kind: "error", text: "確かめられませんでした。通信状態を確認してください" },
            });
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [needsRemote, handle, uid]);
  if (local) return local;
  if (!remote) return { kind: "ok" };
  return checked?.handle === handle ? checked.status : { kind: "checking" };
}

function HandleStep({ onDone }: { onDone: () => void }) {
  const { tokens } = useTheme();
  const { state, update, authUser } = useMobileStore();
  const me = state.users[state.me]!;
  const remote = Boolean(authUser);
  const suggested = useMemo(
    () => suggestHandle({ email: me.email ?? authUser?.email ?? undefined, name: me.name, uid: me.id }),
    [me.email, me.name, me.id, authUser?.email],
  );
  const takenLocally = useMemo(() => (h: string) => handleTakenLocally(state, h), [state]);
  // はじめの候補が使われていたら、末尾に数字を足した候補に替える（入力し始めたら触らない）
  const [draft, setDraft] = useState(() => {
    for (let i = 0; i <= 3; i++) {
      const candidate = i === 0 ? suggested : alternateHandle(suggested, i);
      if (!takenLocally(candidate)) return candidate;
    }
    return suggested;
  });
  const touched = useRef(false);
  const uid = authUser?.uid;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void (async () => {
      for (let i = 0; i <= 3; i++) {
        const candidate = i === 0 ? suggested : alternateHandle(suggested, i);
        const owner: string | null = await fetchHandleOwner(candidate).catch((): string => uid);
        if (!alive) return;
        if (!owner || owner === uid) {
          if (!touched.current) setDraft(candidate);
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, suggested]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = normalizeHandle(draft);
  const status = useHandleStatus(handle, me.id, remote, takenLocally);

  async function submit() {
    if (status.kind !== "ok" || busy) return;
    setBusy(true);
    setError(null);
    try {
      let fixed = handle;
      if (authUser) {
        const res = await claimHandle(authUser.uid, handle);
        if (!res.ok && res.reason === "taken") {
          setError(HANDLE_TAKEN);
          return;
        }
        fixed = res.handle ?? handle;
      }
      update((s) => {
        s.users[s.me]!.handle = fixed;
      });
      onDone();
    } catch {
      setError("ID を保存できませんでした。通信状態を確認して、もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? (status.kind === "error" ? status.text : null);
  return (
    <WelcomeCard
      title="ユーザー ID を決めましょう"
      lead="プロフィールの URL とアイコンになり、あとから変えられません。"
      primary={
        <Button
          variant="primary"
          disabled={status.kind !== "ok" || busy}
          icon={busy ? <ActivityIndicator size="small" color={tokens.primaryContent} /> : undefined}
          onPress={() => void submit()}
        >
          この ID にする
        </Button>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
        <AvatarImage uri={identiconDataUri(handleProblem(handle) ? me.id : handle, "user")} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={[
              styles.handleBox,
              { backgroundColor: tokens.surface, borderColor: message ? tokens.error : tokens.border },
            ]}
          >
            <Text style={{ fontSize: 15, color: tokens.ink2 }}>@</Text>
            <TextField
              value={draft}
              onChangeText={(v) => {
                touched.current = true;
                setError(null);
                setDraft(v);
              }}
              accessibilityLabel="ユーザー ID"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              spellCheck={false}
              maxLength={HANDLE_MAX + 1}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              style={{ flex: 1, borderWidth: 0, minHeight: 42, paddingHorizontal: 4 }}
            />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            style={{ marginTop: 6, minHeight: 20, fontSize: 13, color: message ? tokens.error : tokens.ink2 }}
          >
            {message ??
              (status.kind === "checking"
                ? "確かめています…"
                : status.kind === "ok"
                  ? `/users/${handle}`
                  : "半角の英小文字・数字・_ で 3〜20 文字")}
          </Text>
        </View>
      </View>
    </WelcomeCard>
  );
}

function NameStep({ onBack, onDone }: { onBack?: () => void; onDone: () => void }) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const me = state.users[state.me]!;
  const [name, setName] = useState(me.name);
  const trimmed = name.trim();
  const save = () => {
    if (!trimmed) return;
    update((s) => {
      s.users[s.me]!.name = trimmed.slice(0, 50);
    });
    onDone();
  };
  return (
    <WelcomeCard
      title="表示名を決めましょう"
      lead="一緒に遊ぶ人に見える名前で、いつでも変えられます。"
      onBack={onBack}
      onSkip={onDone}
      primary={
        <Button variant="primary" disabled={!trimmed} onPress={save}>
          次へ
        </Button>
      }
    >
      <TextField
        value={name}
        onChangeText={setName}
        accessibilityLabel="表示名"
        maxLength={50}
        autoComplete="nickname"
        textContentType="nickname"
        returnKeyType="next"
        onSubmitEditing={save}
        style={!trimmed ? { borderColor: tokens.error } : undefined}
      />
      <Text style={{ marginTop: 6, fontSize: 13, color: tokens.ink2 }}>
        <Text style={{ fontWeight: "700", color: tokens.ink }}>{trimmed || "（未入力）"}</Text>
        {`  @${me.handle ?? ""}`}
      </Text>
    </WelcomeCard>
  );
}

function IconStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { tokens } = useTheme();
  const { state, update, authUser } = useMobileStore();
  const me = state.users[state.me]!;
  const google = authUser?.photoURL ?? undefined;
  // はじめは生成した画像。Google の画像は選んだときだけ使う
  const [image, setImage] = useState(me.image && me.image !== google ? me.image : "");
  const [error, setError] = useState<string | null>(null);
  const save = (value: string) => {
    update((s) => {
      s.users[s.me]!.image = value;
    });
    onDone();
  };
  async function pick() {
    setError(null);
    try {
      const dataUrl = await pickAvatarImageDataUrl();
      if (dataUrl) setImage(dataUrl);
    } catch (e) {
      setError(userFacingError(e, "画像を読み込めませんでした。"));
    }
  }
  return (
    <WelcomeCard
      title="アイコンを選びましょう"
      lead="ID から作った印が既定で、好きな画像にも替えられます。"
      onBack={onBack}
      onSkip={() => save("")}
      primary={
        <Button variant="primary" onPress={() => save(image)}>
          はじめる
        </Button>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Avatar u={{ ...me, image: image || undefined }} size={72} />
        <View style={{ flex: 1, gap: 8, alignItems: "flex-start" }}>
          <Button size="sm" variant="secondary" onPress={() => void pick()}>
            画像を選ぶ
          </Button>
          {google && image !== google && (
            <Button size="sm" variant="secondary" onPress={() => setImage(google)}>
              Google の画像を使う
            </Button>
          )}
          {image !== "" && (
            <Button size="sm" variant="quiet" onPress={() => setImage("")}>
              ID の印に戻す
            </Button>
          )}
        </View>
      </View>
      {error && (
        <Text accessibilityRole="alert" style={{ marginTop: 10, fontSize: 13, color: tokens.error }}>
          {error}
        </Text>
      )}
    </WelcomeCard>
  );
}

function DoneStep() {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const router = useRouter();
  const me = state.users[state.me]!;
  return (
    <Surface>
      <View style={{ padding: 24, alignItems: "center", gap: 12 }}>
        <Avatar u={me} size={72} />
        <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: "700", color: tokens.ink }}>
          卓譜の準備ができました
        </Text>
        <Text style={{ fontSize: 14, color: tokens.ink2 }}>
          <Text style={{ fontWeight: "700", color: tokens.ink }}>{me.name}</Text>
          {`  @${me.handle ?? ""}`}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink2, textAlign: "center" }}>
          記録とプロフィールは、一緒に遊んだ人に見えます。
        </Text>
        <View style={{ alignSelf: "stretch", gap: 8, marginTop: 8 }}>
          <Button variant="primary" onPress={() => router.replace("/")}>
            ホームを開く
          </Button>
          <Button variant="secondary" onPress={() => router.replace("/upload")}>
            セッションのログを取り込む
          </Button>
          <Button variant="secondary" onPress={() => router.replace("/characters")}>
            キャラシを取り込む
          </Button>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  stepBar: {
    width: 22,
    height: 5,
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  handleBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: RADII.sm,
    paddingLeft: 12,
  },
});
