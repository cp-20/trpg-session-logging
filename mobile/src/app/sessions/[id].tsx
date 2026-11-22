import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SvgXml } from "react-native-svg";
import { SYSTEMS } from "@shared/data/systems";
import { userHref } from "@shared/lib/people";
import { recentSystemIds, systemOptions } from "@shared/lib/system-options";
import { buildReportCardSVG, xIntentUrl } from "@shared/external";
import { createSharedInvite, fetchSharedLog, revokeSharedMember } from "@shared/lib/cloud-state";
import {
  fmtDates,
  fmtSessionWhen,
  sessionDays,
  fmtDur,
  jstTime,
  sessionPlayMinutes,
  uid,
} from "@shared/lib/time";
import { sittingToFields, sittingsFromFields, type SittingFields } from "@shared/lib/sittings";
import type { Log, MsgKind } from "@shared/types";
import { LogReader } from "../../components/LogReader";
import { ScreenFrame, ScreenShell } from "../../components/ScreenShell";
import { Avatar, CharAvatar } from "../../components/identity";
import {
  IconBooks,
  IconBrandX,
  IconCalendarTime,
  IconDots,
  IconEyeOff,
  IconFileText,
  IconPencil,
  IconShare,
  IconTrash,
  IconUnlink,
  IconUpload,
  IconUserPlus,
  IconTable,
} from "../../components/icons";
import {
  BottomSheet,
  Button,
  Combobox,
  CopyBox,
  DividerList,
  EmptyState,
  Field,
  FieldError,
  IconButton,
  InlineNotice,
  MetaRow,
  NotFound,
  PageHead,
  SCOPE_META,
  ScopePicker,
  SectionTitle,
  Seg,
  SittingsInput,
  Surface,
  SysBadge,
  Tag,
  TextField,
  Toggle,
} from "../../components/ui";
import { hapticSelection, hapticSuccess } from "../../native/haptics";
import { openExternalUrl, shareTextOrUrl, shareViewAsPng } from "../../native/native-share";
import { useMobileStore } from "../../store/mobile-store";
import { useTheme } from "../../theme/ThemeProvider";
import { RADII } from "../../theme/tokens";
import { userFacingError } from "@shared/lib/user-error";

export default function SessionDetailScreen() {
  const { tokens } = useTheme();
  const { id, tab: tabParam } = useLocalSearchParams<{ id?: string; tab?: string }>();
  const { state, update, authUser } = useMobileStore();
  const router = useRouter();

  const [tab, setTab] = useState<"overview" | "timeline">(tabParam === "log" ? "timeline" : "overview");
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportCardOpen, setReportCardOpen] = useState(false);
  const [timelineRevealed, setTimelineRevealed] = useState(false);

  const log = state.logs[id ?? ""];

  useEffect(() => {
    if (!authUser || !log) return;
    let alive = true;
    fetchSharedLog(log.slug)
      .then((shared) => {
        if (!alive || !shared) return;
        const newcomers = Object.keys(shared.log.players).filter((u) => !log.players[u]);
        if (!newcomers.length) return;
        update((s) => {
          if (!s.logs[log.id]) return;
          for (const u of newcomers) {
            if (!s.users[u] && shared.users[u]) s.users[u] = shared.users[u];
            s.logs[log.id]!.players[u] ??= shared.log.players[u]!;
          }
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [authUser, log, update]);

  const speakers = useMemo(() => {
    if (!log) return [];
    const map = new Map<string, MsgKind>();
    log.channels.forEach((c) =>
      c.msgs.forEach((m) => {
        if (!map.has(m.sp)) map.set(m.sp, m.kind);
      }),
    );
    return Array.from(map.entries()).map(([sp, kind]) => ({ sp, kind }));
  }, [log]);

  if (!log) {
    return (
      <ScreenShell>
        <PageHead title="セッション" back={{ label: "セッション" }} />
        <NotFound what="セッション" />
      </ScreenShell>
    );
  }

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const tb = log.tableId ? state.tables[log.tableId] : null;
  const sys = SYSTEMS[log.systemId];
  const isOwner = log.ownerId === state.me;
  const isParticipant = isOwner || Boolean(log.players[state.me]);
  const playMin = sessionPlayMinutes(log);
  const totalMsgs = log.channels.reduce((n, c) => n + c.msgs.length, 0);
  const secretChannels = log.channels.filter((c) => c.secret);
  const canRead = isParticipant || timelineRevealed;

  const headBlock = (
    <View style={{ paddingTop: tab === "timeline" && log.hasLog && canRead ? 16 : 0 }}>
      <PageHead
        back={{ label: "セッション" }}
        title={log.title}
        sub={
          <View style={{ gap: 4 }}>
            <MetaRow>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <IconCalendarTime size={15} color={tokens.ink2} />
                <Text style={{ fontSize: 13, color: tokens.ink, fontVariant: ["tabular-nums"] }}>
                  {fmtSessionWhen(log)}
                </Text>
              </View>
              {playMin > 0 && (
                <Text style={{ fontSize: 13, color: tokens.ink2, fontVariant: ["tabular-nums"] }}>
                  {fmtDur(playMin)}
                </Text>
              )}
            </MetaRow>
            <MetaRow>
              <SysBadge sys={sys} />
              {sc && (
                <Pressable
                  onPress={() => router.push(`/scenarios/${sc.id}` as never)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <IconBooks size={14} color={tokens.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.primary }}>{sc.title}</Text>
                </Pressable>
              )}
              {tb && (
                <Pressable
                  onPress={() => router.push(`/tables/${tb.id}` as never)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <IconTable size={14} color={tokens.primary} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.primary }}>{tb.name}</Text>
                </Pressable>
              )}
            </MetaRow>
          </View>
        }
        actions={
          isOwner ? (
            <>
              <Button
                variant="secondary"
                icon={<IconPencil size={16} color={tokens.ink} />}
                onPress={() => setEditing(true)}
              >
                編集
              </Button>
              <Button
                variant="primary"
                icon={<IconShare size={16} color={tokens.primaryContent} />}
                onPress={() => setShareOpen(true)}
              >
                {`共有 · ${SCOPE_META[log.scope].label}`}
              </Button>
              <IconButton accessibilityLabel="その他の操作" onPress={() => setMenuOpen(true)}>
                <IconDots size={20} color={tokens.ink} />
              </IconButton>
            </>
          ) : undefined
        }
      />

      <View style={{ marginBottom: 16 }}>
        <Seg<"overview" | "timeline">
          value={tab}
          onChange={setTab}
          options={[
            { v: "overview", label: "概要" },
            { v: "timeline", label: log.hasLog ? `ログ（${totalMsgs}行）` : "ログ" },
          ]}
        />
      </View>
    </View>
  );

  const sheets = (
    <>
      <BottomSheet visible={menuOpen} title="その他の操作" onClose={() => setMenuOpen(false)}>
        <View style={{ gap: 10 }}>
          {!log.hasLog && (
            <Button
              variant="secondary"
              fullWidth
              icon={<IconUpload size={16} color={tokens.ink} />}
              onPress={() => {
                setMenuOpen(false);
                router.push({ pathname: "/upload", params: { log: log.id } });
              }}
            >
              ログを添付
            </Button>
          )}
          <Button
            variant="danger"
            fullWidth
            icon={<IconTrash size={16} color={tokens.error} />}
            onPress={() => {
              setMenuOpen(false);
              setConfirmDel(true);
            }}
          >
            記録を削除
          </Button>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={confirmDel}
        title="この記録を削除しますか？"
        onClose={() => setConfirmDel(false)}
        footer={
          <>
            <Button variant="quiet" onPress={() => setConfirmDel(false)}>
              キャンセル
            </Button>
            <Button
              variant="danger"
              onPress={() => {
                update((s) => {
                  delete s.logs[log.id];
                });
                setConfirmDel(false);
                router.replace("/sessions");
              }}
            >
              削除する
            </Button>
          </>
        }
      >
        <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink2 }}>
          「{log.title}」のログ・参加者の紐付け・感想が消えます。元に戻せません。
        </Text>
      </BottomSheet>

      {editing && <EditLogSheet log={log} onClose={() => setEditing(false)} />}

      {shareOpen && (
        <ShareSheet
          log={log}
          onClose={() => setShareOpen(false)}
          onOpenReportCard={() => {
            setShareOpen(false);
            setReportCardOpen(true);
          }}
        />
      )}

      {reportCardOpen && <ReportCardSheet log={log} onClose={() => setReportCardOpen(false)} />}
    </>
  );

  if (tab === "timeline" && log.hasLog && canRead) {
    return (
      <ScreenFrame>
        <LogReader
          log={log}
          state={state}
          isOwner={isOwner}
          headerSlot={headBlock}
          footerSlot={
            log.importedFrom ? (
              <Text style={{ fontSize: 12, color: tokens.ink3, marginTop: 12 }}>
                取り込んだファイル: {log.importedFrom}
              </Text>
            ) : undefined
          }
          onUpdateSpeaker={{
            speakers,
            onRoleChange: (sp, nextKind) => {
              update((s) => {
                s.logs[log.id]?.channels.forEach((c) =>
                  c.msgs.forEach((m) => {
                    if (m.sp === sp) m.kind = nextKind;
                  }),
                );
              });
            },
            onIconChange: (sp, iconSrc) => {
              update((s) => {
                const target = s.logs[log.id];
                if (!target) return;
                const nextIcons = { ...target.speakerIcons };
                if (iconSrc) nextIcons[sp] = iconSrc;
                else delete nextIcons[sp];
                target.speakerIcons = Object.keys(nextIcons).length ? nextIcons : undefined;
              });
            },
          }}
        />
        {sheets}
      </ScreenFrame>
    );
  }

  const mainChannel =
    log.channels.find((c) => !c.secret && (c.id === "main" || c.name === "メイン")) ??
    log.channels.find((c) => !c.secret) ??
    log.channels[0];
  const previewMsgs = mainChannel ? mainChannel.msgs.filter((m) => m.type !== "note").slice(0, 3) : [];

  return (
    <ScreenShell>
      {headBlock}

      {tab === "overview" ? (
        <View style={{ gap: 24 }}>
          <MembersSection log={log} />

          {log.hasLog && previewMsgs.length > 0 && canRead && (
            <View>
              <SectionTitle
                sub={
                  secretChannels.length > 0
                    ? `シークレット ${secretChannels.length} タブを含む全 ${totalMsgs} 行`
                    : `全 ${totalMsgs} 行`
                }
                right={
                  <Button size="sm" variant="secondary" onPress={() => setTab("timeline")}>
                    ログを読む
                  </Button>
                }
              >
                ログの冒頭
              </SectionTitle>
              <Surface>
                <DividerList>
                  {previewMsgs.map((m) => (
                    <View key={m.id} style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 2 }}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.ink }}>{m.sp}</Text>
                        <Text style={{ fontSize: 11, color: tokens.ink3, fontVariant: ["tabular-nums"] }}>
                          {jstTime(m.ts)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.ink2 }} numberOfLines={3}>
                        {m.roll ? `${m.roll.cmd} → ${m.roll.result}` : m.text}
                      </Text>
                    </View>
                  ))}
                </DividerList>
              </Surface>
            </View>
          )}

          <ImpressionsSection log={log} isParticipant={isParticipant} />

          {log.hasLog && <RollSummarySection log={log} />}
        </View>
      ) : !log.hasLog ? (
        <Surface>
          <EmptyState
            icon={<IconFileText size={28} color={tokens.ink3} />}
            title="ログはまだありません"
            action={
              isOwner ? (
                <Button
                  variant="primary"
                  icon={<IconUpload size={16} color={tokens.primaryContent} />}
                  onPress={() => router.push({ pathname: "/upload", params: { log: log.id } })}
                >
                  ログを添付
                </Button>
              ) : undefined
            }
          >
            日時と参加者だけが記録されています。
          </EmptyState>
        </Surface>
      ) : (
        <Surface>
          <EmptyState
            icon={<IconEyeOff size={28} color={tokens.ink3} />}
            title="ネタバレに配慮して閉じています"
            action={
              <Button variant="primary" onPress={() => setTimelineRevealed(true)}>
                ログを表示する
              </Button>
            }
          >
            参加していないセッションです。ログにはシナリオの内容が含まれます。
          </EmptyState>
        </Surface>
      )}

      {sheets}
    </ScreenShell>
  );
}

function MembersSection({ log }: { log: Log }) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const router = useRouter();
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const kp = state.users[log.ownerId];
  const entries = Object.entries(log.players).filter(([u]) => u !== log.ownerId && state.users[u]);
  const myEntry = log.players[state.me];

  return (
    <View>
      <SectionTitle>参加者</SectionTitle>
      <Surface>
        <DividerList>
          {kp && (
            <View style={styles.memberRow}>
              <Avatar u={kp} size={36} />
              <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => router.push(userHref(kp) as never)}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }}>{kp.name}</Text>
                <Text style={{ fontSize: 12, color: tokens.ink2 }}>GM</Text>
              </Pressable>
            </View>
          )}
          {entries.map(([uid2, link]) => {
            const u = state.users[uid2]!;
            const ch = link.characterIds[0] ? state.characters[link.characterIds[0]] : undefined;
            const isMe = uid2 === state.me;
            return (
              <View key={uid2} style={styles.memberRow}>
                {ch ? <CharAvatar c={ch} size={36} /> : <Avatar u={u} size={36} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {ch ? (
                    <Pressable onPress={() => router.push(`/characters/${ch.id}` as never)}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                        {ch.name}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => router.push(userHref(u) as never)}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                        {u.name}
                      </Text>
                    </Pressable>
                  )}
                  <Text style={{ fontSize: 12, color: tokens.ink2 }} numberOfLines={1}>
                    {ch
                      ? `${u.name}${link.hidden ? " · 共有ページで非表示" : ""}`
                      : link.hidden
                        ? "共有ページで非表示"
                        : "PL"}
                  </Text>
                </View>
                {isMe && (
                  <Button size="sm" variant="quiet" onPress={() => setConfirmUnlink(true)}>
                    外す
                  </Button>
                )}
              </View>
            );
          })}
          {myEntry && (
            <View style={styles.memberRow}>
              <Text style={{ flex: 1, fontSize: 14, color: tokens.ink }}>共有ページで自分の名前を隠す</Text>
              <Toggle
                label="共有ページで自分の名前を隠す"
                on={Boolean(myEntry.hidden)}
                onChange={(v) =>
                  update((s) => {
                    const p = s.logs[log.id]?.players[s.me];
                    if (p) p.hidden = v;
                  })
                }
              />
            </View>
          )}
        </DividerList>
      </Surface>

      <BottomSheet
        visible={confirmUnlink}
        title="参加の紐付けを外しますか？"
        onClose={() => setConfirmUnlink(false)}
        footer={
          <>
            <Button variant="quiet" onPress={() => setConfirmUnlink(false)}>
              キャンセル
            </Button>
            <Button
              variant="danger"
              icon={<IconUnlink size={15} color={tokens.error} />}
              onPress={() => {
                update((s) => {
                  delete s.logs[log.id]?.players[s.me];
                });
                setConfirmUnlink(false);
              }}
            >
              紐付けを外す
            </Button>
          </>
        }
      >
        <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink2 }}>
          あなたのセッション一覧から外れます。招待リンクからいつでもやり直せます。
        </Text>
      </BottomSheet>
    </View>
  );
}

function ImpressionsSection({ log, isParticipant }: { log: Log; isParticipant: boolean }) {
  const { tokens } = useTheme();
  const { state, update } = useMobileStore();
  const impressions = log.impressions ?? [];
  const [editingMine, setEditingMine] = useState(false);
  const [text, setText] = useState("");
  const [spoiler, setSpoiler] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const me = state.users[state.me];
  const latestByUser = new Map<string, (typeof impressions)[number]>();
  for (const imp of impressions) latestByUser.set(imp.userId, imp);
  const latestMine = latestByUser.get(state.me);
  const others = [...latestByUser.values()].filter(
    (imp) => imp.userId !== state.me && state.users[imp.userId],
  );
  const canWrite = isParticipant && Boolean(me);
  if (impressions.length === 0 && !canWrite) return null;

  function submit(existingId?: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setFormError("感想を入力してください。");
      return;
    }
    const impId = existingId ?? `imp_${uid()}`;
    update((s) => {
      const target = s.logs[log.id];
      if (!target) return;
      target.impressions ??= [];
      const existing = existingId ? target.impressions.find((x) => x.id === existingId) : undefined;
      if (existing) {
        existing.text = trimmed;
        existing.spoiler = spoiler;
        existing.createdAt = new Date().toISOString();
      } else {
        target.impressions.push({
          id: impId,
          userId: s.me,
          text: trimmed,
          createdAt: new Date().toISOString(),
          spoiler,
        });
      }
    });
    setEditingMine(false);
    setText("");
    setFormError(null);
    setRevealed((prev) => ({ ...prev, [impId]: true }));
    hapticSuccess();
  }

  function renderItem(imp: (typeof impressions)[number], canDelete: boolean, canEdit: boolean) {
    const author = state.users[imp.userId]!;
    const isOpen = !imp.spoiler || Boolean(revealed[imp.id]);
    return (
      <View key={imp.id} style={styles.impRow}>
        <Avatar u={author} size={32} />
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>{author.name}</Text>
            {imp.userId === log.ownerId && <Text style={{ fontSize: 12, color: tokens.ink3 }}>GM</Text>}
            <View style={{ marginLeft: "auto", flexDirection: "row", gap: 4 }}>
              {canEdit && (
                <Button
                  size="sm"
                  variant="quiet"
                  onPress={() => {
                    setText(imp.text);
                    setSpoiler(imp.spoiler);
                    setFormError(null);
                    setEditingMine(true);
                  }}
                >
                  編集
                </Button>
              )}
              {canDelete && isOpen && (
                <IconButton
                  accessibilityLabel="感想を削除"
                  onPress={() =>
                    update((s) => {
                      const t = s.logs[log.id];
                      if (t?.impressions) t.impressions = t.impressions.filter((x) => x.id !== imp.id);
                    })
                  }
                >
                  <IconTrash size={16} color={tokens.ink2} />
                </IconButton>
              )}
            </View>
          </View>
          {isOpen ? (
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 14, lineHeight: 21, color: tokens.ink }}>{imp.text}</Text>
              {imp.spoiler && <Text style={{ fontSize: 12, color: tokens.ink3 }}>ネタバレを含む感想</Text>}
            </View>
          ) : (
            <Pressable
              onPress={() => {
                hapticSelection();
                setRevealed((prev) => ({ ...prev, [imp.id]: true }));
              }}
              style={[styles.spoilerCover, { backgroundColor: tokens.ground }]}
            >
              <IconEyeOff size={16} color={tokens.ink2} />
              <Text style={{ fontSize: 13, color: tokens.ink2 }}>
                ネタバレを含む感想です。押すと表示します
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View>
      <SectionTitle>感想</SectionTitle>
      <Surface>
        <DividerList>
          {canWrite &&
            me &&
            (editingMine ? (
              <View style={{ padding: 16, gap: 10 }}>
                <TextField
                  multiline
                  value={text}
                  onChangeText={(v) => {
                    setText(v);
                    setFormError(null);
                  }}
                  placeholder="遊んでみてどうでしたか"
                />
                <FieldError text={formError} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Toggle label="ネタバレを含む" on={spoiler} onChange={setSpoiler} />
                    <Text style={{ fontSize: 13, color: tokens.ink2 }}>ネタバレを含む</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button size="sm" variant="quiet" onPress={() => setEditingMine(false)}>
                      キャンセル
                    </Button>
                    <Button size="sm" variant="primary" onPress={() => submit(latestMine?.id)}>
                      保存
                    </Button>
                  </View>
                </View>
              </View>
            ) : latestMine ? (
              renderItem(latestMine, true, true)
            ) : (
              <Pressable
                onPress={() => {
                  setText("");
                  setSpoiler(true);
                  setEditingMine(true);
                }}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}
              >
                <Avatar u={me} size={32} />
                <View style={[styles.impPlaceholder, { borderColor: tokens.border }]}>
                  <Text style={{ fontSize: 14, color: tokens.ink3 }}>ひとこと感想を書く</Text>
                </View>
              </Pressable>
            ))}
          {!canWrite && latestMine && renderItem(latestMine, true, false)}
          {others.map((imp) => renderItem(imp, log.ownerId === state.me, false))}
        </DividerList>
      </Surface>
    </View>
  );
}

function RollSummarySection({ log }: { log: Log }) {
  const { tokens } = useTheme();
  const rolls = log.channels.flatMap((c) => c.msgs).filter((m) => m.roll);
  if (rolls.length === 0) return null;
  const crits = rolls.filter((m) => /クリティカル|スペシャル/.test(m.roll!.result));
  const fumbles = rolls.filter((m) => /ファンブル/.test(m.roll!.result));
  if (crits.length === 0 && fumbles.length === 0) return null;

  return (
    <View>
      <SectionTitle>決定的な出目</SectionTitle>
      <Surface>
        <DividerList>
          {[...crits, ...fumbles].slice(0, 12).map((m) => (
            <View key={m.id} style={styles.rollSummaryRow}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }} numberOfLines={1}>
                {m.sp}
              </Text>
              <Text style={{ flex: 1, fontSize: 13, color: tokens.ink2 }} numberOfLines={1}>
                {m.roll!.cmd} ({m.roll!.dice})
              </Text>
              <Tag v={/ファンブル/.test(m.roll!.result) ? "danger" : "ok"}>{m.roll!.result}</Tag>
            </View>
          ))}
        </DividerList>
      </Surface>
    </View>
  );
}

function EditLogSheet({ log, onClose }: { log: Log; onClose: () => void }) {
  const { state, update } = useMobileStore();
  const [title, setTitle] = useState(log.title);
  const [systemId, setSystemId] = useState(log.systemId);
  const [scenarioId, setScenarioId] = useState(log.scenarioId ?? "");
  const [tableId, setTableId] = useState(log.tableId ?? "");
  const [sittings, setSittings] = useState<SittingFields[]>(() => log.sittings.map(sittingToFields));
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!title.trim()) {
      setError("タイトルを入力してください");
      return;
    }
    const parsed = sittingsFromFields(sittings);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    update((s) => {
      const target = s.logs[log.id];
      if (!target) return;
      target.title = title.trim();
      target.systemId = systemId;
      target.scenarioId = scenarioId || undefined;
      target.tableId = tableId || undefined;
      target.sittings = parsed.sittings;
    });
    hapticSuccess();
    onClose();
  }

  return (
    <BottomSheet
      visible
      title="セッションを編集"
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
      <Field label="シナリオ">
        <Combobox
          ariaLabel="シナリオ"
          value={scenarioId}
          onChange={setScenarioId}
          options={[
            { value: "", label: "未選択" },
            ...Object.values(state.scenarios).map((s) => ({ value: s.id, label: s.title })),
          ]}
        />
      </Field>
      <Field label="卓">
        <Combobox
          ariaLabel="卓"
          value={tableId}
          onChange={setTableId}
          options={[
            { value: "", label: "未選択" },
            ...Object.values(state.tables).map((t) => ({ value: t.id, label: t.name })),
          ]}
        />
      </Field>
      {!log.hasLog && (
        <>
          <Field label="遊んだ日時">
            <SittingsInput rows={sittings} onChange={setSittings} />
          </Field>
        </>
      )}
      <FieldError text={error} />
    </BottomSheet>
  );
}

function ShareSheet({
  log,
  onClose,
  onOpenReportCard,
}: {
  log: Log;
  onClose: () => void;
  onOpenReportCard: () => void;
}) {
  const { tokens } = useTheme();
  const { state, update, authUser } = useMobileStore();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";
  const shareUrl = `${origin}/share/l/${log.slug}`;

  async function issueInvite() {
    if (!authUser) {
      setInviteUrl(`${origin}/invite/${log.id}`);
      return;
    }
    setInviteBusy(true);
    setInviteError(null);
    try {
      const token = await createSharedInvite(log, state);
      setInviteUrl(`${origin}/invite/${token}`);
    } catch (cause) {
      setInviteError(userFacingError(cause, "招待リンクを作成できませんでした。"));
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <BottomSheet
      visible
      title="共有と招待"
      onClose={onClose}
      footer={
        <Button variant="quiet" onPress={onClose}>
          閉じる
        </Button>
      }
    >
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>公開範囲</Text>
          <ScopePicker
            value={log.scope}
            onChange={(v) =>
              update((s) => {
                if (s.logs[log.id]) s.logs[log.id]!.scope = v;
              })
            }
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>共有リンク</Text>
          <CopyBox text={shareUrl} />
          <Button
            variant="secondary"
            icon={<IconShare size={16} color={tokens.ink} />}
            onPress={() => void shareTextOrUrl(log.title, log.title, shareUrl)}
          >
            リンクを共有シートで送る
          </Button>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 14, gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>参加者の招待</Text>
          {inviteUrl ? (
            <>
              <CopyBox text={inviteUrl} />
              <Button
                variant="secondary"
                icon={<IconUserPlus size={16} color={tokens.ink} />}
                onPress={() => void shareTextOrUrl("卓譜の招待", `「${log.title}」への招待です`, inviteUrl)}
              >
                招待リンクを送る
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              disabled={inviteBusy}
              icon={<IconUserPlus size={16} color={tokens.ink} />}
              onPress={() => void issueInvite()}
            >
              {inviteBusy ? "作成中…" : "招待リンクを作る"}
            </Button>
          )}
          <InlineNotice text={inviteError} tone="error" />
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 14, gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>卓報告カード</Text>
          <Button
            variant="primary"
            icon={<IconBrandX size={16} color={tokens.primaryContent} />}
            onPress={onOpenReportCard}
          >
            画像を作って投稿する
          </Button>
        </View>

        {Object.keys(log.players).filter((u) => u !== log.ownerId).length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 14, gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.ink }}>参加中のメンバー</Text>
            {Object.keys(log.players)
              .filter((u) => u !== log.ownerId && state.users[u])
              .map((u) => (
                <View key={u} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar u={state.users[u]!} size={26} />
                  <Text style={{ flex: 1, fontSize: 14, color: tokens.ink }}>{state.users[u]!.name}</Text>
                  <Button
                    size="sm"
                    variant="quiet"
                    onPress={async () => {
                      if (authUser) await revokeSharedMember(log.slug, u).catch(() => {});
                      update((s) => {
                        delete s.logs[log.id]?.players[u];
                      });
                    }}
                  >
                    外す
                  </Button>
                </View>
              ))}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

function ReportCardSheet({ log, onClose }: { log: Log; onClose: () => void }) {
  const { tokens } = useTheme();
  const { state } = useMobileStore();
  const cardRef = useRef<ComponentRef<typeof View> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : undefined;
  const sys = SYSTEMS[log.systemId];
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.lolipop-now.app";
  const shareUrl = `${origin}/share/l/${log.slug}`;

  const data = useMemo(
    () => ({
      scenarioTitle: sc?.title,
      scenarioEmoji: sc?.emoji,
      title: log.title,
      dateLabel: fmtDates(sessionDays(log)),
      systemName: sys?.name ?? "汎用・その他",
      playerCount: Object.keys(log.players).length || 1,
      shareUrl,
    }),
    [log, sc?.emoji, sc?.title, shareUrl, sys?.name],
  );
  const svg = useMemo(() => buildReportCardSVG(data), [data]);

  async function sharePng() {
    setBusy(true);
    setError(null);
    try {
      await shareViewAsPng(cardRef, `takufu-report-${log.slug}.png`);
    } catch (cause) {
      setError(userFacingError(cause, "画像を書き出せませんでした。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet
      visible
      title="卓報告カード"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>
            閉じる
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            icon={<IconShare size={16} color={tokens.ink} />}
            onPress={() => void sharePng()}
          >
            {busy ? "書き出し中…" : "画像を共有"}
          </Button>
          <Button
            variant="primary"
            icon={<IconBrandX size={16} color={tokens.primaryContent} />}
            onPress={() => void openExternalUrl(xIntentUrl(data))}
          >
            X で投稿
          </Button>
        </>
      }
    >
      <View ref={cardRef} collapsable={false} style={[styles.reportWrap, { borderColor: tokens.border }]}>
        <SvgXml xml={svg} width="100%" height={190} />
      </View>
      <InlineNotice text={error} tone="error" />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  impRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  impPlaceholder: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADII.sm,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  spoilerCover: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rollSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reportWrap: {
    borderWidth: 1,
    borderRadius: RADII.md,
    overflow: "hidden",
    marginBottom: 10,
  },
});
