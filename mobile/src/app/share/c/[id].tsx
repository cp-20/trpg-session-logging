import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS, carriedStats } from "@shared/data/systems";
import { carriedDeltas, currentCarriedValue } from "@shared/lib/character-growth";
import { fetchSharedCharacter, type SharedCharacterData } from "@shared/lib/cloud-state";
import { fmtDate } from "@shared/lib/time";
import type { Character, User } from "@shared/types";
import { ScreenShell } from "../../../components/ScreenShell";
import { CharAvatar } from "../../../components/identity";
import { IconLock, IconTrendingUp } from "../../../components/icons";
import {
  DividerList,
  EmptyState,
  MetaRow,
  PageHead,
  SectionTitle,
  Surface,
  SysBadge,
  WarmSkeleton,
} from "../../../components/ui";
import { isFirebaseConfigured } from "../../../lib/firebase-mobile";
import { getCachedSharedCharacter, setCachedSharedCharacter } from "../../../store/shared-cache";
import { useMobileStore } from "../../../store/mobile-store";
import { useTheme } from "../../../theme/ThemeProvider";

export default function ShareCharacterScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, authUser } = useMobileStore();
  const router = useRouter();
  const local = state.characters[id ?? ""];
  const cached = id ? (getCachedSharedCharacter(id)?.data ?? null) : null;

  const [remote, setRemote] = useState<SharedCharacterData | null>(cached);
  type Status = "idle" | "loading" | "missing" | "ready";
  const authUid = authUser?.uid ?? null;
  const hasLocal = Boolean(local);
  /* 自分のカルテは手元のものを出す。他人のカルテだけ共有先から読む */
  const ownView = Boolean(local && (!authUid || local.ownerId === authUid));
  const canFetch = Boolean(id) && isFirebaseConfigured;
  const statusOnRefetch = (prev: Status): Status => {
    if (ownView) return "idle";
    if (!canFetch) return hasLocal ? prev : "missing";
    return cached ? prev : "loading";
  };
  const [status, setStatus] = useState<Status>(() =>
    statusOnRefetch(ownView ? "idle" : cached ? "ready" : "loading"),
  );

  /* 読み込み直す条件が変わったら、描画中に表示を切り替える（Effect で切り替えると余分な描画が挟まる） */
  const fetchKey = JSON.stringify([id, authUid, ownView, hasLocal]);
  const [statusKey, setStatusKey] = useState(fetchKey);
  if (statusKey !== fetchKey) {
    setStatusKey(fetchKey);
    setStatus(statusOnRefetch(status));
  }

  useEffect(() => {
    if (ownView || !id || !isFirebaseConfigured) return;
    let alive = true;
    const hadCache = Boolean(getCachedSharedCharacter(id));
    fetchSharedCharacter(id)
      .then((data) => {
        if (!alive) return;
        if (data) {
          setRemote(data);
          setCachedSharedCharacter(id, data);
          setStatus("ready");
        } else if (!hasLocal) {
          setStatus("missing");
        }
      })
      .catch(() => {
        if (alive && !hadCache && !hasLocal) setStatus("missing");
      });
    return () => {
      alive = false;
    };
  }, [id, authUid, ownView, hasLocal]);

  if (status === "loading") {
    return (
      <ScreenShell withTopBar={false}>
        <View style={{ gap: 14, paddingTop: 12 }}>
          <WarmSkeleton height={96} lines={2} />
          <WarmSkeleton height={160} lines={3} />
        </View>
      </ScreenShell>
    );
  }

  let c: Character | undefined = local;
  let owner: User | undefined = local ? state.users[local.ownerId] : undefined;
  let publicLogs: Record<string, string> | undefined;

  if (remote && (!local || (authUser && local.ownerId !== authUser.uid))) {
    c = remote.character;
    owner = remote.owner;
    publicLogs = remote.publicLogs;
  }

  if (!c) {
    return (
      <ScreenShell>
        <PageHead title="キャラクター" back={{ label: "戻る" }} />
        <Surface>
          <EmptyState
            kind="permission"
            icon={<IconLock size={28} color={tokens.ink3} />}
            title="このカルテは非公開です"
          >
            持ち主が共有を有効にすると、このリンクで読めるようになります。
          </EmptyState>
        </Surface>
      </ScreenShell>
    );
  }

  const sys = SYSTEMS[c.systemId];
  const share = c.share;
  const isOwner = c.ownerId === state.me;

  if ((!share.enabled || share.scope === "private") && !isOwner) {
    return (
      <ScreenShell>
        <PageHead title="キャラクター" back={{ label: "戻る" }} />
        <Surface>
          <EmptyState
            kind="permission"
            icon={<IconLock size={28} color={tokens.ink3} />}
            title="このカルテは非公開です"
          >
            持ち主が共有を有効にすると、このリンクで読めるようになります。
          </EmptyState>
        </Surface>
      </ScreenShell>
    );
  }

  const sessionsAsc = [...c.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const sessions = [...sessionsAsc].reverse();
  const growth = [...c.growth].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScreenShell>
      {isOwner && (
        <Surface style={{ padding: 12, marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>共有ページのプレビュー</Text>
          {!share.enabled && (
            <Text style={{ fontSize: 12, color: tokens.warning, marginTop: 2 }}>
              共有は止まっています。ほかの人には見えません。
            </Text>
          )}
        </Surface>
      )}

      <PageHead
        back={{ label: "戻る" }}
        lead={<CharAvatar c={c} size={76} />}
        title={c.name}
        sub={
          <MetaRow>
            {c.archetype !== "" && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{c.archetype}</Text>}
            <SysBadge sys={sys} />
            {owner && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{`PL ${owner.name}`}</Text>}
          </MetaRow>
        }
      />

      {share.includeProfile && (c.bio !== "" || c.tags.length > 0) && (
        <View style={{ marginBottom: 18, gap: 6 }}>
          {c.bio !== "" && <Text style={{ fontSize: 15, lineHeight: 23, color: tokens.ink }}>{c.bio}</Text>}
          {c.tags.length > 0 && (
            <MetaRow>
              {c.tags.map((t) => (
                <Text key={t} style={{ fontSize: 13, color: tokens.ink2 }}>
                  #{t}
                </Text>
              ))}
            </MetaRow>
          )}
        </View>
      )}

      {share.includeStats && sys && carriedStats(sys).length > 0 && (
        <Surface style={{ marginBottom: 22 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {carriedStats(sys).map((st, idx) => (
              <View
                key={st.key}
                style={{
                  flex: 1,
                  minWidth: 100,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderLeftWidth: idx > 0 ? 1 : 0,
                  borderLeftColor: tokens.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: tokens.ink2 }}>{st.label}</Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: tokens.ink,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {currentCarriedValue(c, st.key) ?? "-"}
                  {st.max ? <Text style={{ fontSize: 13, color: tokens.ink2 }}>{` / ${st.max}`}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        </Surface>
      )}

      {share.includeSessions && sessions.length > 0 && (
        <View style={{ marginBottom: 22 }}>
          <SectionTitle>セッション履歴</SectionTitle>
          <Surface>
            <DividerList>
              {sessions.map((s) => {
                const slugOrNull = s.logId
                  ? publicLogs?.[s.logId] ||
                    (!remote && state.logs[s.logId]?.scope === "public"
                      ? state.logs[s.logId]?.slug
                      : undefined)
                  : undefined;
                return (
                  <View key={s.logId} style={{ padding: 16, gap: 6 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                        {s.title}
                      </Text>
                      <Text style={{ fontSize: 12, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                        {fmtDate(s.date)}
                      </Text>
                    </View>
                    {carriedDeltas(c.systemId, s.delta).length > 0 && (
                      <MetaRow>
                        {carriedDeltas(c.systemId, s.delta).map(({ key: k, ...d }) => {
                          const def = sys?.stats.find((x) => x.key === k);
                          const diff = d.after - d.before;
                          return (
                            <Text
                              key={k}
                              style={{ fontSize: 12, color: tokens.ink2, fontVariant: ["tabular-nums"] }}
                            >
                              {`${def?.label ?? k} ${d.before}→${d.after} `}
                              {diff !== 0 && (
                                <Text
                                  style={{
                                    color: diff < 0 ? tokens.error : tokens.success,
                                    fontWeight: "700",
                                  }}
                                >
                                  {diff > 0 ? `+${diff}` : diff}
                                </Text>
                              )}
                            </Text>
                          );
                        })}
                      </MetaRow>
                    )}
                    {slugOrNull && (
                      <Pressable onPress={() => router.push(`/share/l/${slugOrNull}` as never)}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.primary }}>
                          公開ログを読む
                        </Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </DividerList>
          </Surface>
        </View>
      )}

      {share.includeGrowth && growth.length > 0 && (
        <View>
          <SectionTitle>{`${sys?.growthLabel ?? "成長"}の履歴`}</SectionTitle>
          <Surface>
            <DividerList>
              {growth.map((g) => (
                <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 14 }}>
                  <IconTrendingUp size={16} color={tokens.success} />
                  <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>{g.skill}</Text>
                  <Text style={{ fontSize: 14, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                    {g.from} → <Text style={{ fontWeight: "700", color: tokens.success }}>{g.to}</Text>
                  </Text>
                  <Text
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: tokens.ink2,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {fmtDate(g.date)}
                  </Text>
                </View>
              ))}
            </DividerList>
          </Surface>
        </View>
      )}
    </ScreenShell>
  );
}
