import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS } from "@shared/data/systems";
import { evaluateShareGate } from "@shared/lib/share-gate";
import { fmtDateShort } from "@shared/lib/time";
import { ScreenShell } from "../../components/ScreenShell";
import { SessionRow } from "../../components/SessionRow";
import { Avatar, CharAvatar } from "../../components/identity";
import { IconLock, IconPencil } from "../../components/icons";
import {
  BottomSheet,
  Button,
  DividerList,
  EmptyState,
  Field,
  InteractiveRow,
  MetaRow,
  NotFound,
  PageHead,
  SectionTitle,
  Surface,
  SysBadge,
  TextField,
} from "../../components/ui";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";

export default function UserDetailScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");

  const u = state.users[id ?? ""];
  if (!u) {
    return (
      <ScreenShell>
        <PageHead title="プレイヤー" back={{ label: "戻る" }} />
        <NotFound what="プレイヤー" />
      </ScreenShell>
    );
  }

  const isMe = u.id === state.me;
  const isPrivate = u.profilePublic === false && !isMe;

  const chars = Object.values(state.characters).filter((c) => c.ownerId === u.id);
  const visibleLogs = Object.values(state.logs)
    .filter((l) => (l.ownerId === u.id || Boolean(l.players[u.id])) && evaluateShareGate(l, state.me).visible)
    .sort((a, b) => b.t0 - a.t0);

  return (
    <ScreenShell>
      <PageHead
        back={{ label: "戻る" }}
        lead={<Avatar u={u} size={68} />}
        title={u.name}
        actions={
          isMe ? (
            <Button
              variant="secondary"
              icon={<IconPencil size={16} color={tokens.ink} />}
              onPress={() => {
                setBioDraft(u.bio ?? "");
                setEditingBio(true);
              }}
            >
              自己紹介を編集
            </Button>
          ) : undefined
        }
      />

      {isPrivate ? (
        <Surface>
          <EmptyState
            kind="permission"
            icon={<IconLock size={28} color={tokens.ink3} />}
            title="プロフィールは非公開です"
          >
            本人の設定により非公開になっています。
          </EmptyState>
        </Surface>
      ) : (
        <View style={{ gap: 26 }}>
          {u.bio && <Text style={{ fontSize: 15, lineHeight: 23, color: tokens.ink }}>{u.bio}</Text>}

          <View>
            <SectionTitle>キャラクター</SectionTitle>
            {chars.length === 0 ? (
              <Surface>
                <EmptyState kind="first" title="キャラクターはまだいません" />
              </Surface>
            ) : (
              <Surface>
                <DividerList>
                  {chars.map((c) => {
                    const last = c.sessions.reduce<string | undefined>(
                      (m, s) => (!m || s.date > m ? s.date : m),
                      undefined,
                    );
                    return (
                      <InteractiveRow
                        key={c.id}
                        onPress={() => router.push(`/characters/${c.id}` as never)}
                        accessibilityLabel={c.name}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          <CharAvatar c={c} size={48} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>
                              {c.name}
                            </Text>
                            <MetaRow style={{ marginTop: 3 }}>
                              <SysBadge sys={SYSTEMS[c.systemId]} />
                              <Text style={{ fontSize: 12, color: tokens.ink2 }}>
                                {last ? `${fmtDateShort(last)} に遊んだ` : "まだ遊んでいない"}
                              </Text>
                            </MetaRow>
                          </View>
                        </View>
                      </InteractiveRow>
                    );
                  })}
                </DividerList>
              </Surface>
            )}
          </View>

          <View>
            <SectionTitle>参加したセッション</SectionTitle>
            {visibleLogs.length === 0 ? (
              <Surface>
                <EmptyState kind="first" title="表示できるセッションはありません" />
              </Surface>
            ) : (
              <Surface>
                <DividerList>
                  {visibleLogs.map((l) => (
                    <SessionRow
                      key={l.id}
                      log={l}
                      onPress={() => router.push(`/sessions/${l.id}` as never)}
                    />
                  ))}
                </DividerList>
              </Surface>
            )}
          </View>
        </View>
      )}

      <BottomSheet
        visible={editingBio}
        title="自己紹介を編集"
        onClose={() => setEditingBio(false)}
        footer={
          <>
            <Button variant="quiet" onPress={() => setEditingBio(false)}>
              キャンセル
            </Button>
            <Button
              variant="primary"
              onPress={() => {
                update((s) => {
                  if (s.users[s.me]) s.users[s.me]!.bio = bioDraft.trim() || undefined;
                });
                hapticSuccess();
                setEditingBio(false);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <Field label="自己紹介" noMargin>
          <TextField
            multiline
            value={bioDraft}
            onChangeText={setBioDraft}
            placeholder="よく遊ぶシステムや傾向など"
          />
        </Field>
      </BottomSheet>
    </ScreenShell>
  );
}
