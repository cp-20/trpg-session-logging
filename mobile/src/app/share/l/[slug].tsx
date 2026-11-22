import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS } from "@shared/data/systems";
import {
  confirmPlayedLog,
  fetchSharedLog,
  getSharedLogAccess,
  type SharedLogData,
} from "@shared/lib/cloud-state";
import { evaluateShareGate, visibleShareMembers } from "@shared/lib/share-gate";
import { fmtDur, fmtSessionWhen, sessionPlayMinutes } from "@shared/lib/time";
import type { Log, State } from "@shared/types";
import { LogReader } from "../../../components/LogReader";
import { ScreenFrame, ScreenShell } from "../../../components/ScreenShell";
import { Avatar, CharAvatar } from "../../../components/identity";
import { IconBooks, IconExternal, IconEyeOff, IconLock } from "../../../components/icons";
import {
  Button,
  DividerList,
  EmptyState,
  InlineNotice,
  MetaRow,
  PageHead,
  SectionTitle,
  Surface,
  SysBadge,
  WarmSkeleton,
} from "../../../components/ui";
import { isFirebaseConfigured } from "../../../lib/firebase-mobile";
import { openExternalUrl } from "../../../native/native-share";
import { getCachedSharedLog, setCachedSharedLog } from "../../../store/shared-cache";
import { useMobileStore } from "../../../store/mobile-store";
import { useTheme } from "../../../theme/ThemeProvider";

export default function ShareLogScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { state, authUser } = useMobileStore();
  const localLog = Object.values(state.logs).find((l) => l.slug === slug || l.id === slug);

  if (localLog && (!authUser || localLog.ownerId === authUser.uid)) {
    return <ShareLogReader state={state} log={localLog} />;
  }
  return <RemoteShareLog slug={slug ?? ""} />;
}

function RemoteShareLog({ slug }: { slug: string }) {
  const { tokens } = useTheme();
  const { state, authUser } = useMobileStore();
  const router = useRouter();
  const cached = slug ? (getCachedSharedLog(slug)?.data ?? null) : null;

  const [shared, setShared] = useState<SharedLogData | null>(cached);
  const [scope, setScope] = useState<"members" | "passed" | "public" | null>(cached?.log.scope ?? null);
  type Status = "loading" | "missing" | "gate" | "ready" | "error";
  const canFetch = isFirebaseConfigured && Boolean(slug);
  /* 読み込み直すときの表示。手元に控えがあればそれを出したまま、なければ読み込み中にする */
  const statusOnRefetch = (prev: Status): Status => (!canFetch ? "missing" : cached ? prev : "loading");
  const [status, setStatus] = useState<Status>(() => statusOnRefetch(cached ? "ready" : "loading"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  /* 読み込み直す条件が変わったら、描画中に表示を切り替える（Effect で切り替えると余分な描画が挟まる） */
  const fetchKey = JSON.stringify([slug, authUser?.uid ?? null, retry]);
  const [statusKey, setStatusKey] = useState(fetchKey);
  if (statusKey !== fetchKey) {
    setStatusKey(fetchKey);
    setStatus(statusOnRefetch(status));
  }

  useEffect(() => {
    let alive = true;
    if (!isFirebaseConfigured || !slug) return;
    const hadCache = Boolean(getCachedSharedLog(slug));
    (async () => {
      try {
        const access = await getSharedLogAccess(slug);
        if (!alive) return;
        if (!access) {
          setShared(null);
          setStatus("missing");
          return;
        }
        setScope(access.scope);
        try {
          const data = await fetchSharedLog(slug);
          if (!alive) return;
          if (data) {
            setShared(data);
            setCachedSharedLog(slug, data);
            setStatus("ready");
          } else {
            setStatus("missing");
          }
        } catch (cause) {
          if (!alive) return;
          if ((cause as { code?: string }).code === "permission-denied") {
            setShared(null);
            setStatus("gate");
          } else {
            throw cause;
          }
        }
      } catch {
        if (!alive) return;
        if (!hadCache) {
          setError("共有ページを読み込めませんでした。通信状態を確認してください。");
          setStatus("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, authUser?.uid, retry]);

  if (status === "loading") {
    return (
      <ScreenShell withTopBar={false}>
        <View style={{ gap: 14, paddingTop: 12 }}>
          <WarmSkeleton height={96} lines={2} />
          <WarmSkeleton height={220} lines={4} />
        </View>
      </ScreenShell>
    );
  }

  if (status === "missing") {
    return (
      <ScreenShell>
        <PageHead title="共有ログ" back={{ label: "戻る" }} />
        <Surface>
          <EmptyState kind="permission" title="共有ページが見つかりません">
            リンクが間違っているか、記録が削除された可能性があります。
          </EmptyState>
        </Surface>
      </ScreenShell>
    );
  }

  if (status === "ready" && shared) {
    const view: State = {
      ...state,
      users: { ...state.users, ...shared.users },
      characters: {},
      logs: { [shared.log.id]: shared.log },
      scenarios: shared.scenario ? { [shared.scenario.id]: shared.scenario } : {},
    };
    return <ShareLogReader state={view} log={shared.log} serverAuthorized />;
  }

  return (
    <ScreenShell>
      <PageHead title="共有ログ" back={{ label: "戻る" }} />
      <Surface>
        <EmptyState
          kind="permission"
          icon={<IconLock size={28} color={tokens.ink3} />}
          title={scope === "passed" ? "プレイした人に共有された記録です" : "メンバー限定の記録です"}
          action={
            status === "error" ? (
              <Button variant="secondary" onPress={() => setRetry((n) => n + 1)}>
                もう一度読み込む
              </Button>
            ) : !authUser ? (
              <Button variant="primary" onPress={() => router.push("/sign-in")}>
                サインイン画面を開く
              </Button>
            ) : scope === "passed" ? (
              <Button
                variant="primary"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await confirmPlayedLog(slug);
                    setRetry((n) => n + 1);
                  } catch {
                    setError("記録を開けませんでした。もう一度お試しください。");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "確認中…" : "プレイ済みなので開く"}
              </Button>
            ) : undefined
          }
        >
          {status === "error"
            ? error
            : !authUser
              ? "Google でサインインすると、読めるかどうかを確認します。"
              : scope === "passed"
                ? "このシナリオをプレイ済みなら、記録を開けます。"
                : "参加者として登録されたアカウントでサインインしてください。"}
        </EmptyState>
        {error && status !== "error" && (
          <View style={{ padding: 16 }}>
            <InlineNotice text={error} tone="error" />
          </View>
        )}
      </Surface>
    </ScreenShell>
  );
}

function ShareLogReader({
  state,
  log,
  serverAuthorized = false,
}: {
  state: State;
  log: Log;
  serverAuthorized?: boolean;
}) {
  const { tokens } = useTheme();
  const router = useRouter();
  const [asPassed, setAsPassed] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const sys = SYSTEMS[log.systemId];
  const viewerId = state.entered ? state.me : null;
  const gateResult = evaluateShareGate(log, viewerId, { asPassed });
  const gate = serverAuthorized || gateResult.visible ? null : gateResult.reason;
  const visibleMembers = visibleShareMembers(log, {
    hideSelfOnShare: state.prefs.hideSelfOnShare,
    viewerId,
  });
  const kpUser = state.users[log.ownerId];
  const castMembers = visibleMembers.filter((u) => u !== log.ownerId);
  const playMin = sessionPlayMinutes(log);
  const shownImpressions = (log.impressions ?? []).filter((imp) => !imp.spoiler || showSpoilers);
  const spoilerCount = (log.impressions ?? []).filter((imp) => imp.spoiler).length;

  const headerSlot = (
    <View style={{ gap: 12, paddingTop: 14, paddingBottom: 8 }}>
      <PageHead
        back={{ label: "戻る" }}
        title={log.title}
        sub={
          <View style={{ gap: 4 }}>
            <MetaRow>
              <SysBadge sys={sys} />
              <Text style={{ fontSize: 13, color: tokens.ink, fontVariant: ["tabular-nums"] }}>
                {fmtSessionWhen(log)}
              </Text>
              {playMin > 0 && (
                <Text style={{ fontSize: 13, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                  {fmtDur(playMin)}
                </Text>
              )}
            </MetaRow>
            {sc && (
              <Pressable
                onPress={() => {
                  if (state.entered && !serverAuthorized) {
                    router.push(`/scenarios/${sc.id}` as never);
                  } else if (sc.sourceUrl) {
                    void openExternalUrl(sc.sourceUrl);
                  }
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <IconBooks size={14} color={tokens.primary} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.primary }}>{sc.title}</Text>
                {sc.sourceUrl && !(state.entered && !serverAuthorized) && (
                  <IconExternal size={13} color={tokens.primary} />
                )}
              </Pressable>
            )}
          </View>
        }
      />

      {(kpUser || castMembers.length > 0) && (
        <Surface style={{ padding: 14 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            {kpUser && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Avatar u={kpUser} size={32} />
                <View>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>{kpUser.name}</Text>
                  <Text style={{ fontSize: 11, color: tokens.primary, fontWeight: "700" }}>GM</Text>
                </View>
              </View>
            )}
            {castMembers.map((u) => {
              const user = state.users[u];
              if (!user) return null;
              const charId = log.players[u]?.characterIds[0];
              const char = charId ? state.characters[charId] : undefined;
              return (
                <View key={u} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {char ? <CharAvatar c={char} size={32} /> : <Avatar u={user} size={32} />}
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>
                      {char?.name ?? user.name}
                    </Text>
                    {char && <Text style={{ fontSize: 11, color: tokens.ink2 }}>{user.name}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </Surface>
      )}
    </View>
  );

  const footerSlot =
    shownImpressions.length > 0 || spoilerCount > 0 ? (
      <View style={{ marginTop: 22 }}>
        <SectionTitle
          right={
            spoilerCount > 0 ? (
              <Button
                size="sm"
                variant="quiet"
                icon={<IconEyeOff size={14} color={tokens.ink} />}
                onPress={() => setShowSpoilers((v) => !v)}
              >
                {showSpoilers ? "ネタバレ感想を隠す" : "ネタバレ感想も見る"}
              </Button>
            ) : undefined
          }
        >
          参加者の感想
        </SectionTitle>
        {shownImpressions.length > 0 ? (
          <Surface>
            <DividerList>
              {shownImpressions.map((imp) => {
                const author = state.users[imp.userId];
                return (
                  <View key={imp.id} style={{ padding: 14, gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>
                      {author?.name ?? "参加者"}
                    </Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.ink }}>{imp.text}</Text>
                  </View>
                );
              })}
            </DividerList>
          </Surface>
        ) : (
          <Surface style={{ padding: 14 }}>
            <Text style={{ fontSize: 13, color: tokens.ink2 }}>
              ネタバレを含む感想が {spoilerCount} 件あります。
            </Text>
          </Surface>
        )}
      </View>
    ) : undefined;

  if (gate) {
    return (
      <ScreenShell>
        {headerSlot}
        <Surface>
          <EmptyState
            kind="permission"
            icon={<IconLock size={28} color={tokens.ink3} />}
            title="この記録は閉じています"
            action={
              log.scope === "passed" ? (
                <Button variant="primary" onPress={() => setAsPassed(true)}>
                  プレイ済みなので開く
                </Button>
              ) : undefined
            }
          >
            {gate}
          </EmptyState>
        </Surface>
      </ScreenShell>
    );
  }

  return (
    <ScreenFrame>
      <LogReader log={log} state={state} headerSlot={headerSlot} footerSlot={footerSlot} />
    </ScreenFrame>
  );
}
