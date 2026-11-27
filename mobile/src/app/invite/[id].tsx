import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS } from "@shared/data/systems";
import { acceptSharedInvite, getSharedInvite, type SharedInvite } from "@shared/lib/cloud-state";
import { mergeAcceptedShare } from "@shared/lib/accept-share";
import { fmtDates, sessionDays } from "@shared/lib/time";
import type { Msg } from "@shared/types";
import { ScreenShell } from "../../components/ScreenShell";
import { CharAvatar, characterAvatarSrc, userAvatarSrc } from "../../components/identity";
import { IconBooks, IconCheck, IconUserPlus } from "../../components/icons";
import {
  Button,
  Combobox,
  DividerList,
  InlineNotice,
  MetaRow,
  NotFound,
  PageHead,
  Surface,
  SysBadge,
  WarmSkeleton,
} from "../../components/ui";
import { mobileAuthErrorMessage } from "../../lib/firebase-mobile";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { sessionTitle } from "@shared/lib/session-scenario";

export default function ClaimInviteScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, authUser } = useMobileStore();
  if (!authUser || state.logs[id ?? ""]) {
    return <LocalClaimInvite logId={id ?? ""} />;
  }
  return <RemoteClaimInvite token={id ?? ""} />;
}

function RemoteClaimInvite({ token }: { token: string }) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const [invite, setInvite] = useState<SharedInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getSharedInvite(token)
      .then((value) => {
        if (alive) setInvite(value);
      })
      .catch(() => {
        if (alive) setError("招待を読み込めませんでした。通信状態を確認してください。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) {
    return (
      <ScreenShell withTopBar={false}>
        <View style={{ gap: 14, paddingTop: 20 }}>
          <WarmSkeleton height={90} lines={2} />
          <WarmSkeleton height={120} lines={3} />
        </View>
      </ScreenShell>
    );
  }

  if (!invite) {
    return (
      <ScreenShell>
        <PageHead title="招待を開けませんでした" back={{ label: "セッション" }} />
        <Surface style={{ padding: 18, gap: 14 }}>
          <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink2 }}>
            {error || "招待の有効期限が切れているか、共有が終了しています。招待した人に確認してください。"}
          </Text>
          <Button variant="secondary" onPress={() => router.replace("/sessions")}>
            セッション一覧へ
          </Button>
        </Surface>
      </ScreenShell>
    );
  }

  const sys = SYSTEMS[invite.systemId];

  return (
    <ScreenShell>
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.ink2, marginBottom: 4 }}>
        セッションへの招待
      </Text>
      <PageHead title={invite.title} sub={<MetaRow>{sys && <SysBadge sys={sys} />}</MetaRow>} />
      <Surface style={{ padding: 18, gap: 14 }}>
        <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink }}>
          参加すると、このセッションがあなたの記録に入り、ログを読めるようになります。参加はあとから外せます。
        </Text>
        <Button
          variant="primary"
          disabled={busy}
          icon={<IconUserPlus size={18} color={tokens.primaryContent} />}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              const { share, slug, ownerId } = await acceptSharedInvite(token);
              // 自分の記録や、知っている人・シナリオは上書きしない。入れられなければ何も変えずに知らせる（Web と同じ）
              mergeAcceptedShare(structuredClone(state), share, { slug, ownerId });
              update((s) => mergeAcceptedShare(s, share, { slug, ownerId }));
              hapticSuccess();
              router.replace(`/sessions/${share.log.id}` as never);
            } catch (cause) {
              setError(mobileAuthErrorMessage(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "参加しています…" : "このセッションに参加する"}
        </Button>
        <InlineNotice text={error} tone="error" />
      </Surface>
    </ScreenShell>
  );
}

function LocalClaimInvite({ logId }: { logId: string }) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const log = state.logs[logId];

  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [charId, setCharId] = useState("");
  const [joined, setJoined] = useState(false);

  const speakers = useMemo(() => {
    const seen = new Map<string, { name: string; kind: Msg["kind"] }>();
    log?.channels.forEach((c) =>
      c.msgs.forEach((m) => {
        if (!seen.has(m.sp)) seen.set(m.sp, { name: m.sp, kind: m.kind });
      }),
    );
    return [...seen.values()];
  }, [log?.channels]);

  const claimedBy = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(log?.players ?? {}).forEach(([uid2, p]) => {
      if (!p.linked) return;
      const user = state.users[uid2];
      if (user) map.set(user.name, user.name);
      p.characterIds.forEach((cid) => {
        const c = state.characters[cid];
        if (c && user) map.set(c.name, user.name);
      });
    });
    return map;
  }, [log?.players, state.characters, state.users]);

  if (!log) {
    return (
      <ScreenShell>
        <PageHead title="招待" back={{ label: "戻る" }} />
        <NotFound what="招待ページ" />
      </ScreenShell>
    );
  }

  const me = state.me;
  const already = log.players[me];
  const kp = state.users[log.ownerId];
  const scenario = log.scenarioId ? state.scenarios[log.scenarioId] : undefined;
  const sys = SYSTEMS[log.systemId];
  const myChars = Object.values(state.characters).filter(
    (c) => c.ownerId === me && c.systemId === log.systemId,
  );
  const playerSpeakers = speakers.filter((s) => s.kind === "PC" || s.kind === "PL");
  const unclaimed = playerSpeakers.filter((s) => !claimedBy.has(s.name));

  function join(withCharacter: string | null) {
    update((s) => {
      const target = s.logs[log.id];
      if (!target) return;
      target.players[me] = {
        linked: true,
        hidden: false,
        characterIds: withCharacter ? [withCharacter] : [],
      };
      if (selectedSpeaker) {
        const ch = withCharacter ? s.characters[withCharacter] : undefined;
        const icon = ch ? characterAvatarSrc(ch) : s.users[me] ? userAvatarSrc(s.users[me]!) : undefined;
        if (icon) target.speakerIcons = { ...target.speakerIcons, [selectedSpeaker]: icon };
      }
    });
    hapticSuccess();
    setJoined(true);
  }

  return (
    <ScreenShell>
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.ink2, marginBottom: 4 }}>
        セッションへの招待
      </Text>
      <PageHead
        title={sessionTitle(log, state.scenarios)}
        sub={
          <View style={{ gap: 4 }}>
            {kp && !joined && !already && (
              <Text style={{ fontSize: 14, color: tokens.ink }}>
                {`${kp.name}さんが、あなたをこのセッションの参加者に招待しています。`}
              </Text>
            )}
            <MetaRow>
              {sys && <SysBadge sys={sys} />}
              {sessionDays(log).length > 0 && (
                <Text style={{ fontSize: 13, color: tokens.ink2 }}>{fmtDates(sessionDays(log))}</Text>
              )}
              {scenario && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{scenario.title}</Text>}
            </MetaRow>
          </View>
        }
      />

      {joined || already ? (
        <Surface style={{ padding: 18, gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconCheck size={20} color={tokens.success} />
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.ink }}>参加しました</Text>
          </View>
          <Button variant="primary" onPress={() => router.replace(`/sessions/${log.id}` as never)}>
            セッションを見る
          </Button>
        </Surface>
      ) : (
        <View style={{ gap: 18 }}>
          {unclaimed.length > 0 && (
            <Surface>
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                  あなたの発言者を選ぶ（任意）
                </Text>
              </View>
              <View style={{ borderTopWidth: 1, borderTopColor: tokens.border }}>
                <DividerList>
                  {unclaimed.map((sp) => {
                    const active = selectedSpeaker === sp.name;
                    return (
                      <Pressable
                        key={sp.name}
                        onPress={() => setSelectedSpeaker(active ? null : sp.name)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          backgroundColor: active ? tokens.primaryTint : undefined,
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                          {sp.name}
                        </Text>
                        {active && <IconCheck size={18} color={tokens.primary} />}
                      </Pressable>
                    );
                  })}
                </DividerList>
              </View>
            </Surface>
          )}

          {myChars.length > 0 && (
            <Surface style={{ padding: 16, gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                参加したキャラクター（任意）
              </Text>
              <Combobox
                ariaLabel="参加したキャラクター"
                value={charId}
                onChange={setCharId}
                options={[
                  { value: "", label: "キャラクターなしで参加" },
                  ...myChars.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              {charId !== "" && state.characters[charId] && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <CharAvatar c={state.characters[charId]!} size={32} />
                  <Text style={{ fontSize: 14, color: tokens.ink }}>{state.characters[charId]!.name}</Text>
                </View>
              )}
            </Surface>
          )}

          <Button
            variant="primary"
            fullWidth
            icon={<IconUserPlus size={18} color={tokens.primaryContent} />}
            onPress={() => join(charId || null)}
          >
            このセッションに参加する
          </Button>
        </View>
      )}
    </ScreenShell>
  );
}
