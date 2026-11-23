import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SYSTEMS } from "@shared/data/systems";
import { recentSystemIds, systemOptions } from "@shared/lib/system-options";
import { evaluateShareGate } from "@shared/lib/share-gate";
import { fmtDur, sessionPlayMinutes, uid, sessionStart } from "@shared/lib/time";
import { directoryToScenario, scenarioFacts } from "@shared/lib/scenario-directory";
import { useDirectoryScenario } from "@shared/lib/use-scenario-directory";
import type { Scenario } from "@shared/types";
import { WEB_ORIGIN } from "../../lib/scenario-list";
import { ScreenShell } from "../../components/ScreenShell";
import { SessionRow } from "../../components/SessionRow";
import { IconCheck, IconExternal, IconEyeOff, IconPencil, IconPlus, IconSend } from "../../components/icons";
import {
  BottomSheet,
  Button,
  Combobox,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  MetaRow,
  NotFound,
  PageHead,
  ScenarioSystem,
  SectionTitle,
  Surface,
  TextField,
} from "../../components/ui";
import { openExternalUrl } from "../../native/native-share";
import { hapticSuccess } from "../../native/haptics";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";

function sourceFromUrl(url: string): Scenario["source"] {
  const u = url.trim();
  if (!u) return "manual";
  if (/booth\.pm/.test(u)) return "booth";
  if (/talto\.cc/.test(u)) return "talto";
  return "url";
}

function sourceLabel(sc: Scenario): string {
  return sc.source === "booth" ? "BOOTH" : sc.source === "talto" ? "TALTO" : "配布ページ";
}

export default function ScenarioDetailScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, update, authUser } = useMobileStore();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [editReqOpen, setEditReqOpen] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);

  /* 手元に写しがなければ（ほかの人が足したもの・TALTO のもの）共有シナリオ一覧から読む。人数・時間も共有シナリオ一覧から */
  const local = state.scenarios[id ?? ""];
  const { scenario: remote, loading: remoteLoading } = useDirectoryScenario(id, true, WEB_ORIGIN);
  const sc = useMemo(
    () => local ?? (remote ? directoryToScenario(remote, SYSTEMS) : undefined),
    [local, remote],
  );
  if (!sc) {
    return (
      <ScreenShell>
        <PageHead title="シナリオ" back={{ label: "シナリオ" }} />
        {remoteLoading ? null : <NotFound what="シナリオ" />}
      </ScreenShell>
    );
  }
  const facts = remote ? scenarioFacts(remote) : [];

  const allLogs = Object.values(state.logs)
    .filter((l) => l.scenarioId === sc.id)
    .sort((a, b) => sessionStart(b) - sessionStart(a));
  const visibleLogs = allLogs.filter((l) => evaluateShareGate(l, state.me).visible);
  const hasParticipated = allLogs.some((l) => l.ownerId === state.me || Boolean(l.players[state.me]));
  const durations = visibleLogs
    .map(sessionPlayMinutes)
    .filter((m) => m > 0)
    .sort((a, b) => a - b);
  const medDur = durations.length ? durations[Math.floor(durations.length / 2)] : null;
  const isAuthor = sc.claimedBy === state.me;
  const canEdit = isAuthor || sc.addedByUid === state.me;
  const needsSpoilerGuard = !canEdit && !hasParticipated && allLogs.length > 0;
  const pendingRequests = state.editRequests.filter((r) => r.scenarioId === sc.id && r.status === "pending");

  return (
    <ScreenShell>
      <PageHead
        back={{ label: "シナリオ" }}
        title={sc.title}
        sub={
          <MetaRow>
            <ScenarioSystem systemId={sc.systemId} systemLabel={remote?.systemLabel} />
            {sc.author !== "" && <Text style={{ fontSize: 13, color: tokens.ink2 }}>{sc.author}</Text>}
            {facts.map((f) => (
              <Text key={f} style={{ fontSize: 13, color: tokens.ink2 }}>
                {f}
              </Text>
            ))}
            {sc.sourceUrl && (
              <Pressable
                onPress={() => void openExternalUrl(sc.sourceUrl!)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.primary }}>
                  {sourceLabel(sc)}
                </Text>
                <IconExternal size={14} color={tokens.primary} />
              </Pressable>
            )}
            {medDur != null && (
              <Text style={{ fontSize: 13, color: tokens.ink2 }}>{`所要時間 約${fmtDur(medDur)}`}</Text>
            )}
            {hasParticipated && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <IconCheck size={14} color={tokens.success} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.success }}>通過済み</Text>
              </View>
            )}
          </MetaRow>
        }
        actions={
          <>
            {canEdit ? (
              <Button
                variant="secondary"
                icon={<IconPencil size={16} color={tokens.ink} />}
                onPress={() => setEditing(true)}
              >
                編集
              </Button>
            ) : !authUser ? (
              <Button
                variant="secondary"
                icon={<IconSend size={16} color={tokens.ink} />}
                onPress={() => setEditReqOpen(true)}
              >
                修正を提案
              </Button>
            ) : null}
            <Button
              variant="primary"
              icon={<IconPlus size={16} color={tokens.primaryContent} />}
              onPress={() => {
                // 記録に結ぶので、手元に写しを置く
                if (!local) update((st) => void (st.scenarios[sc.id] ??= sc));
                router.push({ pathname: "/upload", params: { scenario: sc.id } });
              }}
            >
              このシナリオで記録
            </Button>
          </>
        }
      />

      {pendingRequests.length > 0 && isAuthor && (
        <View
          style={{
            borderWidth: 1,
            borderColor: tokens.warning,
            backgroundColor: tokens.warningTint,
            borderRadius: 12,
            padding: 14,
            marginBottom: 18,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 14, color: tokens.ink }}>
            {pendingRequests.map((r) => state.users[r.uid]?.name ?? "ユーザー").join("・")}
            さんから情報の修正依頼が {pendingRequests.length} 件届いています。
          </Text>
          <View style={{ alignItems: "flex-start" }}>
            <Button
              size="sm"
              variant="secondary"
              onPress={() =>
                update((s) => {
                  s.editRequests.forEach((r) => {
                    if (r.scenarioId === sc.id) r.status = "accepted";
                  });
                })
              }
            >
              確認済みにする
            </Button>
          </View>
        </View>
      )}

      {(sc.description || sc.tags.length > 0) && (
        <View style={{ marginBottom: 20, gap: 6 }}>
          {sc.description && (
            <Text style={{ fontSize: 15, lineHeight: 23, color: tokens.ink }}>{sc.description}</Text>
          )}
          {sc.tags.length > 0 && (
            <MetaRow>
              {sc.tags.map((t) => (
                <Text key={t} style={{ fontSize: 13, color: tokens.ink2 }}>
                  #{t}
                </Text>
              ))}
            </MetaRow>
          )}
        </View>
      )}

      <SectionTitle
        right={
          needsSpoilerGuard && showSpoilers ? (
            <Button
              size="sm"
              variant="quiet"
              icon={<IconEyeOff size={14} color={tokens.ink} />}
              onPress={() => setShowSpoilers(false)}
            >
              隠す
            </Button>
          ) : undefined
        }
      >
        このシナリオのセッション
      </SectionTitle>

      {allLogs.length === 0 ? (
        <Surface>
          <EmptyState kind="first" title="このシナリオの記録はまだありません" />
        </Surface>
      ) : needsSpoilerGuard && !showSpoilers ? (
        <Surface>
          <EmptyState
            icon={<IconEyeOff size={28} color={tokens.ink3} />}
            title="ネタバレに配慮して隠しています"
            action={
              <Button size="sm" variant="secondary" onPress={() => setShowSpoilers(true)}>
                セッションを表示
              </Button>
            }
          >
            未通過のシナリオです。遊んだ卓や参加者を見ても大丈夫なら表示してください。
          </EmptyState>
        </Surface>
      ) : visibleLogs.length === 0 ? (
        <Surface>
          <EmptyState kind="permission" title="公開されているセッションはありません">
            このシナリオを遊んだ記録はありますが、参加したメンバーだけに共有されています。
          </EmptyState>
        </Surface>
      ) : (
        <Surface>
          <DividerList>
            {visibleLogs.map((l) => (
              <SessionRow
                key={l.id}
                log={l}
                context="scenario"
                onPress={() => router.push(`/sessions/${l.id}` as never)}
              />
            ))}
          </DividerList>
        </Surface>
      )}

      {editing && <EditScenarioSheet sc={sc} onClose={() => setEditing(false)} />}
      {editReqOpen && <EditRequestSheet scenarioId={sc.id} onClose={() => setEditReqOpen(false)} />}
    </ScreenShell>
  );
}

function EditScenarioSheet({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const { state, update } = useMobileStore();
  const [title, setTitle] = useState(sc.title);
  const [author, setAuthor] = useState(sc.author);
  const [systemId, setSystemId] = useState(sc.systemId);
  const [sourceUrl, setSourceUrl] = useState(sc.sourceUrl ?? "");
  const [description, setDescription] = useState(sc.description ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    update((s) => {
      // 共有シナリオ一覧から開いた自分のシナリオは、直す前に手元へ写しを置く
      const target = (s.scenarios[sc.id] ??= { ...sc });
      target.title = title.trim();
      target.author = author.trim();
      target.systemId = systemId;
      target.sourceUrl = sourceUrl.trim() || undefined;
      target.source = sourceFromUrl(sourceUrl);
      target.description = description.trim() || undefined;
    });
    hapticSuccess();
    onClose();
  }

  return (
    <BottomSheet
      visible
      title="シナリオを編集"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={save}>
            保存
          </Button>
        </>
      }
    >
      <Field label="タイトル" noMargin>
        <TextField value={title} onChangeText={setTitle} />
        <FieldError text={error} />
      </Field>
      <Field label="作者">
        <TextField value={author} onChangeText={setAuthor} />
      </Field>
      <Field label="システム">
        <Combobox
          ariaLabel="システム"
          value={systemId}
          onChange={setSystemId}
          options={systemOptions()}
          pinned={recentSystemIds(Object.values(state.logs))}
        />
      </Field>
      <Field label="配布ページ URL（任意）">
        <TextField value={sourceUrl} onChangeText={setSourceUrl} placeholder="https://booth.pm/..." />
      </Field>
      <Field label="概要（任意）">
        <TextField multiline value={description} onChangeText={setDescription} />
      </Field>
    </BottomSheet>
  );
}

function EditRequestSheet({ scenarioId, onClose }: { scenarioId: string; onClose: () => void }) {
  const { update } = useMobileStore();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!note.trim()) {
      setError("修正内容を入力してください");
      return;
    }
    update((s) => {
      s.editRequests.push({
        id: `req_${uid()}`,
        scenarioId,
        uid: s.me,
        at: new Date().toISOString(),
        note: note.trim(),
        status: "pending",
      });
    });
    hapticSuccess();
    onClose();
  }

  return (
    <BottomSheet
      visible
      title="情報の修正を依頼"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onPress={submit}>
            依頼を送る
          </Button>
        </>
      }
    >
      <Field label="修正してほしい内容" noMargin>
        <TextField multiline value={note} onChangeText={setNote} placeholder="URL や表記の違いなど" />
        <FieldError text={error} />
      </Field>
    </BottomSheet>
  );
}
