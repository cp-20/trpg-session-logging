import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { todayStr } from "@shared/lib/time";
import { userHref } from "@shared/lib/people";
import { ScreenShell } from "../components/ScreenShell";
import { DiscordAccountRow } from "../components/DiscordAccountRow";
import { Avatar, ProviderIcon } from "../components/identity";
import { IconBell, IconDownload, IconFingerprint, IconRefresh, IconUpload } from "../components/icons";
import {
  BottomSheet,
  Button,
  DividerList,
  InlineNotice,
  PageHead,
  SectionTitle,
  Seg,
  SettingRow,
  Surface,
  Toggle,
} from "../components/ui";
import { signOutAccount } from "../lib/firebase-mobile";
import { isBiometricAvailable, isBiometricLockEnabled, setBiometricLockEnabled } from "../native/biometrics";
import { pickAndImportBackupJson } from "../native/file-import";
import { hapticSuccess } from "../native/haptics";
import {
  areRemindersEnabled,
  rescheduleSessionNotifications,
  setRemindersEnabled,
} from "../native/notifications";
import { shareJsonBackupFile } from "../native/native-share";
import { useMobileStore } from "../store/mobile-store";
import { useTheme, type ThemeMode } from "../theme/ThemeProvider";
import { userFacingError } from "@shared/lib/user-error";

export default function SettingsScreen() {
  const { tokens } = useTheme();
  const { mode, setMode } = useTheme();
  const {
    state,
    update,
    authUser,
    syncStatus,
    hasPendingOutbox,
    syncError,
    refreshNow,
    enterDemo,
    exitDemo,
    resetDemo,
    exportData,
    importData,
  } = useMobileStore();
  const router = useRouter();
  const me = state.users[state.me]!;

  const [demoPicker, setDemoPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricOn, setBiometricOn] = useState(() => isBiometricLockEnabled());
  const [remindersOn, setRemindersOn] = useState(() => areRemindersEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    isBiometricAvailable()
      .then(setBiometricAvailable)
      .catch(() => {});
  }, []);

  const x = me.accounts.find((a) => a.provider === "x" && a.status === "linked");
  const google = me.accounts.find((a) => a.provider === "google");

  const syncText = authUser
    ? syncStatus === "offline"
      ? "オフラインのため、変更はこの端末に一時保存されています。"
      : hasPendingOutbox || syncStatus === "syncing"
        ? "変更をクラウドへ同期しています…"
        : "記録はアカウントに保存され、Web と同じデータを開けます。"
    : "お試し中の記録は、この端末だけに保存されます。";

  async function toggleBiometric(next: boolean) {
    const ok = await setBiometricLockEnabled(next);
    if (!ok && next) {
      setError("この端末では生体認証を利用できません。");
      return;
    }
    setError(null);
    setBiometricOn(next);
  }

  async function toggleReminders(next: boolean) {
    const ok = await setRemindersEnabled(next);
    if (!ok && next) {
      setError("通知の許可が必要です。端末の設定を確認してください。");
      return;
    }
    setError(null);
    setRemindersOn(next);
    if (next) await rescheduleSessionNotifications(state).catch(() => {});
  }

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      if (authUser) await signOutAccount();
      else exitDemo();
      router.replace("/sign-in");
    } catch (cause) {
      setError(userFacingError(cause, "サインアウトできませんでした。"));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportBackup() {
    setError(null);
    try {
      const imported = await pickAndImportBackupJson();
      if (!imported) return;
      importData(imported);
      hapticSuccess();
    } catch (cause) {
      setError(userFacingError(cause, "ファイルを読み込めませんでした。"));
    }
  }

  return (
    <ScreenShell>
      <PageHead title="設定" back={{ label: "戻る" }} />

      <View style={{ gap: 26 }}>
        <View>
          <SectionTitle>アカウント</SectionTitle>
          <Surface>
            <DividerList>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 16 }}>
                <Avatar u={me} size={48} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                    {me.name}
                  </Text>
                  <Text style={{ fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                    {authUser ? me.email || google?.displayName : "サンプルデータでお試し中"}
                  </Text>
                </View>
                <Button size="sm" variant="secondary" onPress={() => router.push(userHref(me) as never)}>
                  プロフィール
                </Button>
              </View>

              {!authUser && (
                <SettingRow
                  title="表示する利用者"
                  desc="サンプルの別の利用者になって、見え方を確かめられます。"
                >
                  <Button size="sm" variant="secondary" onPress={() => setDemoPicker(true)}>
                    デモ利用者を切替
                  </Button>
                </SettingRow>
              )}

              <DiscordAccountRow />

              <SettingRow
                icon={<ProviderIcon provider="x" size={26} />}
                title="X"
                desc={
                  authUser
                    ? x?.displayName || (x ? me.name : "連携は Web 版から行います")
                    : "サンプルでは連携できません"
                }
              />

              <SettingRow title={authUser ? "サインアウト" : "お試しを終える"}>
                <Button size="sm" variant="secondary" disabled={busy} onPress={() => void handleSignOut()}>
                  {authUser ? "サインアウト" : "最初の画面へ"}
                </Button>
              </SettingRow>
            </DividerList>
          </Surface>
        </View>

        <View>
          <SectionTitle>表示</SectionTitle>
          <Surface>
            <SettingRow title="外観" desc="「端末に合わせる」は OS のライト・ダーク設定に従います。">
              <Seg<ThemeMode>
                value={mode}
                onChange={setMode}
                options={[
                  { v: "light", label: "ライト" },
                  { v: "system", label: "端末に合わせる" },
                  { v: "dark", label: "ダーク" },
                ]}
              />
            </SettingRow>
          </Surface>
        </View>

        <View>
          <SectionTitle>端末の機能</SectionTitle>
          <Surface>
            <DividerList>
              <SettingRow
                icon={<IconBell size={20} color={tokens.ink2} />}
                title="セッション通知"
                desc="予定の開始1時間前と、終了翌朝の記録リマインダーを通知します。"
              >
                <Toggle label="セッション通知" on={remindersOn} onChange={(v) => void toggleReminders(v)} />
              </SettingRow>
              <SettingRow
                icon={<IconFingerprint size={20} color={tokens.ink2} />}
                title="生体認証ロック"
                desc={
                  biometricAvailable
                    ? "アプリを開き直したときに顔認証・指紋認証を求めます。"
                    : "この端末の生体認証が設定されていないため使えません。"
                }
              >
                <Toggle
                  label="生体認証ロック"
                  disabled={!biometricAvailable && !biometricOn}
                  on={biometricOn}
                  onChange={(v) => void toggleBiometric(v)}
                />
              </SettingRow>
            </DividerList>
          </Surface>
        </View>

        <View>
          <SectionTitle>プライバシー</SectionTitle>
          <Surface>
            <DividerList>
              <SettingRow
                title="プロフィールを公開"
                desc="オフにすると、ほかの人からプロフィール・キャラクター・参加セッションが見えなくなります。"
              >
                <Toggle
                  label="プロフィールを公開"
                  on={me.profilePublic !== false}
                  onChange={(value) =>
                    update((s) => {
                      s.users[s.me]!.profilePublic = value;
                    })
                  }
                />
              </SettingRow>
              <SettingRow
                title="共有ページで名前を隠す"
                desc="参加したセッションの共有ページに、あなたの名前を出しません。"
              >
                <Toggle
                  label="共有ページで名前を隠す"
                  on={state.prefs.hideSelfOnShare}
                  onChange={(value) =>
                    update((s) => {
                      s.prefs.hideSelfOnShare = value;
                      Object.values(s.logs).forEach((log) => {
                        if (log.players[s.me]) log.players[s.me]!.hidden = value;
                      });
                    })
                  }
                />
              </SettingRow>
            </DividerList>
          </Surface>
        </View>

        <View>
          <SectionTitle sub={syncText}>データ</SectionTitle>
          <Surface>
            <DividerList>
              {authUser && (
                <SettingRow
                  title="クラウド同期"
                  desc={syncError ?? "最新の状態を取得して未送信の変更を送ります。"}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconRefresh size={15} color={tokens.ink} />}
                    onPress={() => void refreshNow()}
                  >
                    今すぐ同期
                  </Button>
                </SettingRow>
              )}
              <SettingRow
                title="バックアップ"
                desc="すべての記録を1つのファイルに保存したり、保存したファイルから戻したりします。"
              >
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconDownload size={15} color={tokens.ink} />}
                    onPress={() => void shareJsonBackupFile(`takufu-data-${todayStr()}.json`, exportData())}
                  >
                    書き出す
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<IconUpload size={15} color={tokens.ink} />}
                    onPress={() => void handleImportBackup()}
                  >
                    読み込む
                  </Button>
                </View>
              </SettingRow>
              {!authUser && (
                <SettingRow title="サンプルを初期状態に戻す" desc="この端末で加えた変更をすべて消します。">
                  <Button size="sm" variant="danger" onPress={() => setConfirmReset(true)}>
                    初期状態に戻す
                  </Button>
                </SettingRow>
              )}
            </DividerList>
          </Surface>
          <View style={{ marginTop: 10 }}>
            <InlineNotice text={error} tone="error" />
          </View>
        </View>
      </View>

      <BottomSheet visible={demoPicker} title="表示する利用者" onClose={() => setDemoPicker(false)}>
        <DividerList>
          {["u_mikan", "u_sora", "u_kai", "u_hina", "u_rin"]
            .filter((uid2) => state.users[uid2])
            .map((uid2) => {
              const u = state.users[uid2]!;
              const active = uid2 === state.me;
              return (
                <Pressable
                  key={uid2}
                  onPress={() => {
                    enterDemo(uid2);
                    setDemoPicker(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 10,
                    backgroundColor: active ? tokens.primaryTint : undefined,
                  }}
                >
                  <Avatar u={u} size={34} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                    {u.name}
                  </Text>
                  {active && (
                    <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.primary }}>表示中</Text>
                  )}
                </Pressable>
              );
            })}
        </DividerList>
      </BottomSheet>

      <BottomSheet
        visible={confirmReset}
        title="サンプルを初期状態に戻しますか？"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button variant="quiet" onPress={() => setConfirmReset(false)}>
              キャンセル
            </Button>
            <Button
              variant="danger"
              onPress={() => {
                resetDemo();
                setConfirmReset(false);
              }}
            >
              初期状態に戻す
            </Button>
          </>
        }
      >
        <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink2 }}>
          この端末で加えた変更が消えます。必要な記録は、先に書き出してください。
        </Text>
      </BottomSheet>
    </ScreenShell>
  );
}
