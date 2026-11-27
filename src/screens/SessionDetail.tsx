import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { carriedDeltas } from "../lib/character-growth";
import { Link, useNavigate, useParams, useSearchParam } from "../lib/router";
import { useStore } from "../store";
import {
  CopyBox,
  EmptyState,
  Field,
  FieldError,
  InlineNotice,
  Menu,
  Modal,
  NotFound,
  PageHead,
  ScopeLabel,
  ScopePicker,
  Seg,
  StatChange,
  SectionTitle,
  Combobox,
  SplitLayout,
  SittingsInput,
  SysBadge,
  Toggle,
  cx,
} from "../components/ui";
import { Avatar, CharAvatar, PlayerPicker, SpeakerConfigGrid } from "../components/identity";
import { LogReaderBar, SessionTimeline, TimelineFilter } from "../components/timeline";
import { SessionMediaSection } from "../components/media";
import { RecordingLogView } from "../components/recording-dock";
import { SYSTEMS } from "../data/systems";
import { roleLabel } from "../lib/roles";
import { isGoodRoll, rollOutcomes, rollTone } from "../lib/roll-tone";
import { userHref } from "../lib/people";
import { fmtDates, fmtDur, fmtSessionWhen, sessionDays, sessionPlayMinutes, uid } from "../lib/time";
import { sittingToFields, sittingsFromFields, type SittingFields } from "../lib/sittings";
import type { Character, Log, MsgKind, Scope, SecretTabsScope } from "../types";
import type { SessionMedia } from "../lib/session-media";
import {
  IconBooks,
  IconBrandX,
  IconCalendarTime,
  IconCheck,
  IconExternal,
  IconEyeOff,
  IconFileText,
  IconLink,
  IconLock,
  IconPencil,
  IconShare,
  IconTrash,
  IconUnlink,
  IconUpload,
  IconUserPlus,
  IconTable,
  IconX,
} from "../components/icons";
import { reportTweetText, xIntentUrl } from "../external";
import {
  parseReportOptions,
  REPORT_DEFAULTS,
  REPORT_OPTIONS_KEY,
  reportCardChoices,
  reportCardFromSession,
  type ReportCard,
  type ReportCardOptions,
} from "../lib/report-card";
import {
  createSharedInvite,
  fetchSharedLog,
  revokeSharedMember,
  type SharedLogData,
} from "../lib/cloud-state";
import { sessionTitle } from "../lib/session-scenario";

export default function SessionDetail() {
  const { id } = useParams<{ id?: string }>();
  const { state, update, authUser } = useStore();
  const nav = useNavigate();
  const tab: "timeline" | "overview" = useSearchParam("tab") === "log" ? "timeline" : "overview";
  /** タブは URL（?tab=log）に持たせ、ログへのリンクを共有できるようにする。履歴は積まない */
  const setTab = (next: "timeline" | "overview") =>
    nav({
      to: `/sessions/${id}`,
      search: next === "timeline" ? { tab: "log" } : {},
      replace: true,
    });
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [reportCard, setReportCard] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>({ query: "", channel: "all" });
  const [iconConfigOpen, setIconConfigOpen] = useState(false);
  const [timelineRevealed, setTimelineRevealed] = useState(false);

  /* 共有先で増えた参加者を取り込む。取得し直すのは記録・共有先・ログインが変わったときだけで、
     手元の参加者一覧は取得が返ってきた時点の最新を読む */
  const syncLogId = state.logs[id ?? ""]?.id;
  const syncSlug = state.logs[id ?? ""]?.slug;
  const authUid = authUser?.uid;
  const mergeSharedPlayers = useEffectEvent((logId: string, shared: SharedLogData) => {
    const log = state.logs[logId];
    if (!log) return;
    const newcomers = Object.keys(shared.log.players).filter((uid) => !log.players[uid]);
    if (!newcomers.length) return;
    update((s) => {
      if (!s.logs[logId]) return;
      for (const uid of newcomers) {
        if (!s.users[uid] && shared.users[uid]) s.users[uid] = shared.users[uid];
        s.logs[logId].players[uid] ??= shared.log.players[uid];
      }
    });
  });
  useEffect(() => {
    if (!authUid || !syncLogId || !syncSlug) return;
    let alive = true;
    fetchSharedLog(syncSlug)
      .then((shared) => {
        if (alive && shared) mergeSharedPlayers(syncLogId, shared);
      })
      .catch(() => {
        /* A new record may not have been published yet. */
      });
    return () => {
      alive = false;
    };
  }, [authUid, syncLogId, syncSlug]);

  const log = state.logs[id ?? ""];
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

  if (!log) return <NotFound what="セッション" />;

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const tb = log.tableId ? state.tables[log.tableId] : null;
  const sys = SYSTEMS[log.systemId];
  const isOwner = log.ownerId === state.me;
  const isParticipant = isOwner || Boolean(log.players[state.me]);
  const playMin = useMemo(() => sessionPlayMinutes(log), [log]);
  const totalMsgs = useMemo(() => log.channels.reduce((n, c) => n + c.msgs.length, 0), [log.channels]);
  const secretChannels = useMemo(() => log.channels.filter((c) => c.secret), [log.channels]);
  const canRead = isParticipant || timelineRevealed;
  const mediaViewer = useMemo(
    () => ({ viewerId: state.me, isMember: isParticipant, hasPassed: isParticipant }),
    [state.me, isParticipant],
  );
  const setMedia = (media: SessionMedia[]) =>
    update((s) => {
      const target = s.logs[log.id];
      if (target) target.media = media;
    });

  const { previewLog, hasRolls } = useMemo(() => {
    const mainChannel =
      log.channels.find((c) => !c.secret && (c.id === "main" || c.name === "メイン")) ??
      log.channels.find((c) => !c.secret) ??
      log.channels[0];
    const previewMsgs = mainChannel ? mainChannel.msgs.filter((m) => m.type !== "note").slice(0, 4) : [];
    const nextPreviewLog: Log | null =
      log.hasLog && mainChannel && previewMsgs.length > 0
        ? { ...log, channels: [{ ...mainChannel, msgs: previewMsgs }] }
        : null;
    const rolls = log.hasLog && log.channels.some((c) => c.msgs.some((m) => m.type === "roll"));
    return { previewLog: nextPreviewLog, hasRolls: rolls };
  }, [log]);
  // 共有範囲は見出しのメタ情報、操作は「共有」ボタンと共有モーダルにまとめる。横の欄に共有だけの区画を作らない
  const showOverviewAside = hasRolls;

  const openTimeline = () => {
    setTab("timeline");
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <PageHead
        back={{ to: "/sessions", label: "セッション" }}
        title={sessionTitle(log, state.scenarios)}
        sub={
          <div className="space-y-1">
            <div className="meta text-ink">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <IconCalendarTime width={15} height={15} className="shrink-0 text-ink2" aria-hidden />
                {fmtSessionWhen(log)}
              </span>
              {playMin > 0 && <span className="tabular-nums text-ink2">{fmtDur(playMin)}</span>}
            </div>
            <div className="meta">
              <SysBadge sys={sys} />
              {sc && (
                <Link
                  to={`/scenarios/${sc.id}`}
                  className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                >
                  <IconBooks width={14} height={14} className="shrink-0" aria-hidden />
                  {sc.title}
                </Link>
              )}
              {tb && (
                <Link
                  to={`/tables/${tb.id}`}
                  className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                >
                  <IconTable width={14} height={14} className="shrink-0" aria-hidden />
                  {tb.name}
                </Link>
              )}
              <ScopeLabel scope={log.scope} />
            </div>
          </div>
        }
        actions={
          isOwner ? (
            <>
              <button className="btn" onClick={() => setEditing(true)}>
                <IconPencil width={16} height={16} /> 編集
              </button>
              <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
                <IconShare width={16} height={16} /> 共有
              </button>
              <Menu
                label="その他の操作"
                items={[
                  {
                    label: "Xで卓報告",
                    icon: <IconBrandX width={15} height={15} aria-hidden />,
                    onSelect: () => setReportCard(true),
                  },
                  ...(!log.hasLog
                    ? [
                        {
                          label: "ログを添付",
                          icon: <IconUpload width={15} height={15} aria-hidden />,
                          onSelect: () => nav({ to: `/upload?log=${log.id}` }),
                        },
                      ]
                    : []),
                  {
                    label: "記録を削除",
                    danger: true,
                    icon: <IconTrash width={15} height={15} aria-hidden />,
                    onSelect: () => setConfirmDel(true),
                  },
                ]}
              />
            </>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="表示の切り替え" className="tabs">
        {(
          [
            ["overview", "概要"],
            ["timeline", "ログ"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`panel-${value}`}
            id={`tab-${value}`}
            className={cx("tab", tab === value && "tab-active")}
            onClick={() => setTab(value)}
          >
            {label}
            {value === "timeline" && log.hasLog && (
              <span className="ml-1.5 text-xs font-medium text-ink3 tabular-nums">{totalMsgs}行</span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
        {tab === "overview" &&
          (() => {
            const overviewMain = (
              <div className="space-y-8">
                <MembersTab log={log} />

                {previewLog && canRead && (
                  <section aria-label="ログの冒頭">
                    <SectionTitle
                      sub={
                        secretChannels.length > 0
                          ? `シークレット ${secretChannels.length} タブを含む全 ${totalMsgs} 行`
                          : `全 ${totalMsgs} 行`
                      }
                    >
                      ログの冒頭
                    </SectionTitle>
                    <div className="surface overflow-hidden">
                      <div className="relative px-1 pt-2 pb-10 sm:px-2">
                        <SessionTimeline
                          log={previewLog}
                          state={state}
                          mode="own"
                          filter={{ query: "", channel: "all" }}
                        />
                        <div
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-base-100 via-base-100/85 to-transparent"
                          aria-hidden
                        />
                      </div>
                      <button
                        type="button"
                        onClick={openTimeline}
                        className="row-interactive flex w-full items-center justify-center border-t border-base-300 px-4 py-3 text-sm font-semibold text-primary"
                      >
                        ログをすべて読む（全{totalMsgs}行）
                      </button>
                    </div>
                  </section>
                )}

                <SessionMediaSection
                  log={log}
                  state={state}
                  editable={isParticipant}
                  viewer={mediaViewer}
                  onChange={setMedia}
                  onReadWithLog={log.hasLog && canRead ? openTimeline : undefined}
                />

                <ImpressionsSection log={log} isParticipant={isParticipant} />
              </div>
            );

            const overviewAside = showOverviewAside ? (
              <div className="space-y-8">{hasRolls && <RollSummarySection log={log} />}</div>
            ) : null;

            return overviewAside ? (
              <SplitLayout asideWidth="md" main={overviewMain} aside={overviewAside} />
            ) : (
              <div>{overviewMain}</div>
            );
          })()}
      </div>

      <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline" hidden={tab !== "timeline"}>
        {tab === "timeline" && (
          <div>
            {log.hasLog ? (
              !canRead ? (
                <div className="surface">
                  <EmptyState
                    icon={<IconEyeOff width={28} height={28} />}
                    title="ネタバレに配慮して閉じています"
                    action={
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setTimelineRevealed(true)}
                      >
                        ログを表示する
                      </button>
                    }
                  >
                    参加していないセッションです。ログにはシナリオの内容が含まれます。
                  </EmptyState>
                </div>
              ) : (
                <RecordingLogView
                  log={log}
                  state={state}
                  viewer={mediaViewer}
                  canEdit={(m) => isParticipant && (m.addedBy === state.me || log.ownerId === state.me)}
                  onMediaChange={setMedia}
                >
                  <LogReaderBar
                    log={log}
                    state={state}
                    filter={filter}
                    onChange={setFilter}
                    stickyClassName="sticky top-14 lg:top-0 z-20"
                    rightSlot={
                      isOwner && speakers.length > 0 ? (
                        <button
                          type="button"
                          className="btn btn-quiet btn-sm ml-auto"
                          aria-expanded={iconConfigOpen}
                          onClick={() => setIconConfigOpen((v) => !v)}
                        >
                          発言者の表示
                        </button>
                      ) : undefined
                    }
                  />
                  {isOwner && iconConfigOpen && speakers.length > 0 && (
                    <section className="surface mb-4 p-4 sm:p-5" aria-label="発言者のアイコンと役割">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h2 className="text-sm font-bold">発言者のアイコンと役割</h2>
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet"
                          onClick={() => setIconConfigOpen(false)}
                        >
                          閉じる
                        </button>
                      </div>
                      <SpeakerConfigGrid
                        systemId={log.systemId}
                        speakers={speakers}
                        speakerIcons={log.speakerIcons ?? {}}
                        state={state}
                        onRoleChange={(sp, nextKind) => {
                          update((s) => {
                            s.logs[log.id].channels.forEach((c) =>
                              c.msgs.forEach((m) => {
                                if (m.sp === sp) m.kind = nextKind;
                              }),
                            );
                          });
                        }}
                        onIconChange={(sp, iconSrc) => {
                          update((s) => {
                            const target = s.logs[log.id];
                            const nextIcons = { ...target.speakerIcons };
                            if (iconSrc) nextIcons[sp] = iconSrc;
                            else delete nextIcons[sp];
                            target.speakerIcons = Object.keys(nextIcons).length ? nextIcons : undefined;
                          });
                        }}
                      />
                    </section>
                  )}
                  <div className="surface px-1 py-2 sm:px-3 sm:py-3">
                    <SessionTimeline log={log} state={state} mode="own" filter={filter} />
                  </div>
                  {log.importedFrom && (
                    <p className="mt-3 text-xs text-ink3">取り込んだファイル: {log.importedFrom}</p>
                  )}
                </RecordingLogView>
              )
            ) : (
              <div className="surface">
                <EmptyState
                  kind="first"
                  icon={<IconFileText width={28} height={28} />}
                  title="ログはまだありません"
                  action={
                    isOwner ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => nav({ to: `/upload?log=${log.id}` })}
                      >
                        <IconUpload width={16} height={16} /> ログを添付
                      </button>
                    ) : undefined
                  }
                >
                  日時と参加者だけが記録されています。
                </EmptyState>
              </div>
            )}
          </div>
        )}
      </div>

      {editing && <EditLogModal log={log} onClose={() => setEditing(false)} />}
      {confirmDel && (
        <Modal
          title="この記録を削除しますか？"
          onClose={() => setConfirmDel(false)}
          foot={
            <>
              <button className="btn btn-quiet" onClick={() => setConfirmDel(false)}>
                キャンセル
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  update((s) => {
                    delete s.logs[log.id];
                  });
                  nav({ to: "/sessions" });
                }}
              >
                削除する
              </button>
            </>
          }
        >
          <p className="text-sm text-ink2">
            「{sessionTitle(log, state.scenarios)}」のログ・参加者の紐付け・感想が消えます。元に戻せません。
          </p>
        </Modal>
      )}
      {reportCard && <ReportCardModal log={log} onClose={() => setReportCard(false)} />}
      {shareOpen && (
        <ShareModal
          log={log}
          onClose={() => setShareOpen(false)}
          onOpenReportCard={() => {
            setShareOpen(false);
            setReportCard(true);
          }}
        />
      )}
    </>
  );
}

/* ---------- 参加者のひとこと感想 ---------- */
function ImpressionsSection({ log, isParticipant }: { log: Log; isParticipant: boolean }) {
  const { state, update } = useStore();
  const impressions = log.impressions ?? [];
  const [editingMine, setEditingMine] = useState(false);
  const [text, setText] = useState("");
  const [spoiler, setSpoiler] = useState(true);
  const [revealedImpressions, setRevealedImpressions] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function startEdit(initialText = "", initialSpoiler = true) {
    setText(initialText);
    setSpoiler(initialSpoiler);
    setFormError(null);
    setEditingMine(true);
  }

  function submitImpression(existingId?: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setFormError("感想を入力してください。");
      return;
    }
    setFormError(null);
    const id = existingId ?? `imp_${uid()}`;
    update((s) => {
      const target = s.logs[log.id];
      if (!target) return;
      target.impressions ??= [];
      const existing = existingId ? target.impressions.find((imp) => imp.id === existingId) : undefined;
      if (existing) {
        existing.text = trimmed;
        existing.spoiler = spoiler;
        existing.createdAt = new Date().toISOString();
      } else {
        target.impressions.push({
          id,
          userId: s.me,
          text: trimmed,
          createdAt: new Date().toISOString(),
          spoiler,
        });
      }
    });
    setEditingMine(false);
    setText("");
    setSpoiler(true);
    setRevealedImpressions((prev) => ({ ...prev, [id]: true }));
  }

  function removeImpression(impId: string) {
    update((s) => {
      const target = s.logs[log.id];
      if (!target?.impressions) return;
      target.impressions = target.impressions.filter((imp) => imp.id !== impId);
    });
  }

  const me = state.users[state.me];
  /** 感想は参加者ごとに 1 件（最新）だけを見せる。ブログのコメント欄にはしない */
  const latestByUser = new Map<string, (typeof impressions)[number]>();
  for (const imp of impressions) latestByUser.set(imp.userId, imp);
  const latestMine = latestByUser.get(state.me);
  const others = [...latestByUser.values()].filter(
    (imp) => imp.userId !== state.me && state.users[imp.userId],
  );
  const canWrite = isParticipant && Boolean(me);
  if (impressions.length === 0 && !canWrite) return null;

  const authorLine = (authorId: string) => {
    const author = state.users[authorId]!;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Link to={userHref(author)} className="truncate text-sm font-bold hover:text-primary">
          {author.name}
        </Link>
        {authorId === log.ownerId && (
          <span className="text-xs text-ink3">{roleLabel(log.systemId, "GM")}</span>
        )}
      </div>
    );
  };

  const renderImpression = (imp: (typeof impressions)[number], canDelete: boolean, canEdit: boolean) => {
    const isRevealed = !imp.spoiler || Boolean(revealedImpressions[imp.id]);
    const author = state.users[imp.userId]!;
    return (
      <div key={imp.id} className="flex gap-3 px-4 py-4 sm:px-5">
        <Avatar u={author} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            {authorLine(imp.userId)}
            <div className="-my-2 flex shrink-0 items-center">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-sm btn-quiet"
                  onClick={() => startEdit(imp.text, imp.spoiler)}
                >
                  編集
                </button>
              )}
              {canDelete && isRevealed && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="感想を削除"
                  onClick={() => removeImpression(imp.id)}
                >
                  <IconTrash width={16} height={16} />
                </button>
              )}
            </div>
          </div>
          {isRevealed ? (
            <>
              <p data-user-content className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {imp.text}
              </p>
              {imp.spoiler && <p className="mt-1 text-xs text-ink3">ネタバレを含む感想</p>}
            </>
          ) : (
            <button
              type="button"
              className="mt-1.5 flex w-full items-center gap-2 rounded-lg bg-base-200 px-3 py-2.5 text-left text-sm text-ink2 transition-colors hover:text-base-content"
              onClick={() => setRevealedImpressions((prev) => ({ ...prev, [imp.id]: true }))}
            >
              <IconEyeOff width={16} height={16} aria-hidden />
              ネタバレを含む感想です。押すと表示します
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section aria-label="感想">
      <SectionTitle>感想</SectionTitle>
      <div className="surface list">
        {canWrite &&
          me &&
          (editingMine ? (
            <div className="flex gap-3 px-4 py-4 sm:px-5">
              <Avatar u={me} size={32} />
              <div className="min-w-0 flex-1 space-y-2.5">
                <textarea
                  className="textarea w-full text-sm leading-relaxed"
                  rows={3}
                  aria-label="ひとこと感想"
                  placeholder="遊んでみてどうでしたか"
                  value={text}
                  autoFocus
                  onChange={(e) => {
                    setText(e.target.value);
                    setFormError(null);
                  }}
                />
                <FieldError text={formError} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Toggle showLabel label="ネタバレを含む" on={spoiler} onChange={setSpoiler} />
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() => {
                        setEditingMine(false);
                        setFormError(null);
                      }}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => submitImpression(latestMine?.id)}
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : latestMine ? (
            renderImpression(latestMine, true, true)
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar u={me} size={32} />
              <button
                type="button"
                className="flex h-10 flex-1 items-center rounded-lg border border-base-300 bg-base-100 px-3 text-left text-sm text-ink3 transition-colors hover:border-base-content/25"
                onClick={() => startEdit("", true)}
              >
                ひとこと感想を書く
              </button>
            </div>
          ))}
        {!canWrite && latestMine && renderImpression(latestMine, true, false)}
        {others.map((imp) => renderImpression(imp, log.ownerId === state.me, false))}
      </div>
    </section>
  );
}

/* ---------- 参加者 ---------- */
function MembersTab({ log }: { log: Log }) {
  const { state, update, authUser } = useStore();
  const [editingMembers, setEditingMembers] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const ids = Object.keys(log.players);
  const plIds = ids.filter((u) => u !== log.ownerId);
  const kpUser = state.users[log.ownerId];
  const kpLink = log.players[log.ownerId];
  const kpChar = kpLink?.linked ? state.characters[kpLink.characterIds[0] ?? ""] : undefined;
  const kpSessRec = kpChar?.sessions.find((s) => s.logId === log.id);
  const kpChars = useMemo(() => {
    const map = new Map<string, Character[]>();
    for (const c of Object.values(state.characters)) {
      if (c.systemId !== log.systemId) continue;
      const arr = map.get(c.ownerId);
      if (arr) arr.push(c);
      else map.set(c.ownerId, [c]);
    }
    return map;
  }, [state.characters, log.systemId]);
  const ownerChars = kpChars.get(log.ownerId) ?? [];

  function addParticipant(uid2: string) {
    update((s) => {
      s.logs[log.id].players[uid2] = { linked: true, hidden: false, characterIds: [] };
    });
  }

  async function removeParticipant(uid2: string) {
    setRemovingUid(uid2);
    setRemoveError(null);
    try {
      if (authUser) {
        await revokeSharedMember(log.slug, uid2);
      }
      update((s) => {
        delete s.logs[log.id].players[uid2];
      });
    } catch {
      setRemoveError("参加者を外せませんでした。もう一度お試しください。");
    } finally {
      setRemovingUid(null);
    }
  }

  const isKpView = log.ownerId === state.me;
  const canEditAny = isKpView || Boolean(log.players[state.me]);

  // 増減は続く値（carry）だけ。HP・MP・幸運のように卓ごとに戻る値は出さない（P3）
  const deltaText = (delta: Record<string, { before: number; after: number }>) =>
    carriedDeltas(log.systemId, delta).map((d) => (
      <StatChange key={d.key} label={d.label} before={d.before} after={d.after} />
    ));

  return (
    <section aria-label="参加者">
      <SectionTitle
        right={
          canEditAny ? (
            <button
              type="button"
              className={cx("btn btn-sm", !editingMembers && "btn-quiet")}
              aria-pressed={editingMembers}
              onClick={() => setEditingMembers((v) => !v)}
            >
              {editingMembers ? (
                <>
                  <IconCheck width={15} height={15} /> 編集を終える
                </>
              ) : (
                <>
                  <IconPencil width={15} height={15} /> 参加者を編集
                </>
              )}
            </button>
          ) : undefined
        }
      >
        参加者
        <span className="ml-1.5 text-sm font-medium text-ink3 tabular-nums">{ids.length}人</span>
      </SectionTitle>

      {editingMembers && (
        <p className="mb-3 flex items-center gap-1.5 text-sm text-ink2" role="status">
          <IconLock width={14} height={14} className="shrink-0" aria-hidden />
          {isKpView
            ? "参加者の追加・外す操作と、全員のキャラクターを変えられます。"
            : "変えられるのは、あなたの行だけです。"}
        </p>
      )}
      <FieldError text={removeError} />

      <div
        className={cx(
          "surface list",
          editingMembers && "ring-2 ring-primary/30 ring-offset-2 ring-offset-base-200",
        )}
      >
        {kpUser && (
          <div
            className={cx(
              "px-4 py-3.5 transition-opacity sm:px-5",
              editingMembers && !isKpView && "opacity-55",
            )}
          >
            <div className="flex items-center gap-3">
              {kpChar ? <CharAvatar c={kpChar} size={44} /> : <Avatar u={kpUser} size={44} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {kpChar ? (
                    <Link to={`/characters/${kpChar.id}`} className="font-bold hover:text-primary">
                      {kpChar.name}
                    </Link>
                  ) : (
                    <Link to={userHref(kpUser)} className="font-bold hover:text-primary">
                      {kpUser.name}
                    </Link>
                  )}
                  <span className="text-xs font-semibold text-primary">{roleLabel(log.systemId, "GM")}</span>
                  {kpLink?.hidden && <span className="text-xs text-ink3">共有ページでは非表示</span>}
                </div>
                {kpSessRec && carriedDeltas(log.systemId, kpSessRec.delta).length > 0 && (
                  <div className="meta mt-0.5 text-xs text-base-content">{deltaText(kpSessRec.delta)}</div>
                )}
              </div>
              {kpChar && (
                <Link
                  to={userHref(kpUser)}
                  className="flex shrink-0 items-center gap-1.5 text-sm text-ink2 hover:text-base-content"
                >
                  <Avatar u={kpUser} size={20} />
                  {kpUser.name}
                </Link>
              )}
            </div>
            {editingMembers && isKpView && kpLink && (
              <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-14">
                <>
                  <Combobox
                    size="sm"
                    ariaLabel={`${kpUser.name}のキャラクター`}
                    className="w-56 max-w-full"
                    value={kpLink.characterIds[0] ?? ""}
                    onChange={(v) => {
                      update((s) => {
                        s.logs[log.id].players[log.ownerId].characterIds = v ? [v] : [];
                      });
                    }}
                    options={[
                      { value: "", label: `キャラクターなし（${roleLabel(log.systemId, "GM")}のみ）` },
                      ...ownerChars.map((c) => ({ value: c.id, label: c.name })),
                    ]}
                  />
                  <Toggle
                    showLabel
                    on={kpLink.hidden}
                    onChange={(v) => {
                      update((s) => {
                        s.logs[log.id].players[log.ownerId].hidden = v;
                      });
                    }}
                    label="共有ページで非表示"
                  />
                </>
              </div>
            )}
          </div>
        )}

        {plIds.map((u) => {
          const p = log.players[u];
          const user = state.users[u];
          if (!user || !p) return null;
          const char = p.linked ? state.characters[p.characterIds[0] ?? ""] : undefined;
          const sessRec = char?.sessions.find((s) => s.logId === log.id);
          const myChars = kpChars.get(u) ?? [];
          const isRemoving = removingUid === u;
          const canEditThis = isKpView || u === state.me;

          return (
            <div
              key={u}
              className={cx(
                "px-4 py-3.5 transition-opacity sm:px-5",
                (isRemoving || (editingMembers && !canEditThis)) && "opacity-55",
                isRemoving && "pointer-events-none",
              )}
            >
              <div className="flex items-center gap-3">
                {char ? <CharAvatar c={char} size={44} /> : <Avatar u={user} size={44} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {char ? (
                      <Link to={`/characters/${char.id}`} className="font-bold hover:text-primary">
                        {char.name}
                      </Link>
                    ) : (
                      <Link to={userHref(user)} className="font-bold hover:text-primary">
                        {user.name}
                      </Link>
                    )}
                    {char?.archetype && <span className="truncate text-xs text-ink2">{char.archetype}</span>}
                    {!char && (
                      <span className="text-xs text-ink3">
                        {p.linked ? "キャラクター未設定" : "名前のみ"}
                      </span>
                    )}
                    {p.hidden && <span className="text-xs text-ink3">共有ページでは非表示</span>}
                  </div>
                  {sessRec && carriedDeltas(log.systemId, sessRec.delta).length > 0 && (
                    <div className="meta mt-0.5 text-xs text-base-content">{deltaText(sessRec.delta)}</div>
                  )}
                </div>
                {char && (
                  <Link
                    to={userHref(user)}
                    className="flex shrink-0 items-center gap-1.5 text-sm text-ink2 hover:text-base-content"
                  >
                    <Avatar u={user} size={20} />
                    <span className="max-w-24 truncate">{user.name}</span>
                  </Link>
                )}
                {isRemoving && <InlineNotice text="更新中…" tone="pending" />}
              </div>

              {editingMembers && canEditThis && (
                <div className="mt-3 flex flex-wrap items-center gap-2 sm:pl-14">
                  <>
                    {p.linked ? (
                      <Combobox
                        size="sm"
                        ariaLabel={`${user.name}のキャラクター`}
                        className="w-56 max-w-full"
                        value={p.characterIds[0] ?? ""}
                        onChange={(v) => {
                          update((s) => {
                            s.logs[log.id].players[u].characterIds = v ? [v] : [];
                          });
                        }}
                        options={[
                          { value: "", label: "キャラクター未設定" },
                          ...myChars.map((c) => ({ value: c.id, label: c.name })),
                        ]}
                      />
                    ) : null}
                    <Toggle
                      showLabel
                      on={p.hidden}
                      onChange={(v) => {
                        update((s) => {
                          s.logs[log.id].players[u].hidden = v;
                        });
                      }}
                      label="共有ページで非表示"
                    />
                    <div className="ml-auto flex items-center gap-1">
                      {p.linked ? (
                        <button
                          className="btn btn-sm btn-quiet btn-danger"
                          onClick={() => {
                            update((s) => {
                              s.logs[log.id].players[u].linked = false;
                            });
                          }}
                        >
                          <IconUnlink width={15} height={15} /> 紐付けを解除
                        </button>
                      ) : (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            update((s) => {
                              s.logs[log.id].players[u].linked = true;
                            });
                          }}
                        >
                          <IconLink width={15} height={15} /> 紐付ける
                        </button>
                      )}
                      {isKpView && (
                        <button
                          className="icon-btn"
                          aria-label={`${user.name}を参加者から外す`}
                          disabled={isRemoving}
                          onClick={() => removeParticipant(u)}
                        >
                          <IconX width={18} height={18} />
                        </button>
                      )}
                    </div>
                  </>
                </div>
              )}
            </div>
          );
        })}

        {plIds.length === 0 && !editingMembers && (
          <p className="px-4 py-4 text-sm text-ink2 sm:px-5">ほかの参加者はまだいません。</p>
        )}

        {editingMembers &&
          (isKpView ? (
            <div className="space-y-3 bg-base-200/40 px-4 py-4 sm:px-5">
              <h3 className="text-sm font-bold">参加者を追加</h3>
              {/* 名前で人を探させない（P14）。候補は卓のメンバー。卓にいない人は下の招待リンクで */}
              <PlayerPicker
                state={state}
                selected={[]}
                onChange={(added) => added.forEach(addParticipant)}
                exclude={ids}
                tableId={log.tableId}
                quickLabel={
                  log.tableId && state.tables[log.tableId]
                    ? `${state.tables[log.tableId]!.name}のメンバー`
                    : "卓のメンバー"
                }
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="grow text-sm text-ink2">
                  卓譜にまだいない人には、招待リンクを送ってください。
                </span>
                <button
                  className="btn btn-sm"
                  disabled={inviting}
                  onClick={async () => {
                    setInviting(true);
                    setInviteError(null);
                    try {
                      const token = authUser ? await createSharedInvite(log, state) : log.id;
                      const url = `${location.origin}/invite/${token}`;
                      setInviteUrl(url);
                      if (!authUser) {
                        await navigator.clipboard.writeText(url).catch(() => {});
                      }
                    } catch {
                      setInviteError("招待リンクを作成できませんでした。もう一度お試しください。");
                    } finally {
                      setInviting(false);
                    }
                  }}
                >
                  <IconUserPlus width={15} height={15} />
                  {inviting ? "作成中…" : "参加者の招待リンクを作る"}
                </button>
              </div>
              {inviteUrl && <CopyBox text={inviteUrl} />}
              <FieldError text={inviteError} />
            </div>
          ) : null)}
      </div>
    </section>
  );
}

/* ---------- ダイスロール集計 ---------- */
function RollSummarySection({ log }: { log: Log }) {
  const { totalRolls, dist, bySp, maxDist } = useMemo(() => {
    const nextBySp: Record<string, { crit: number; fumble: number; fail: number; ok: number; spec: number }> =
      {};
    const nextDist: Record<string, number> = {};
    let count = 0;
    for (const c of log.channels) {
      for (const m of c.msgs) {
        if (m.type !== "roll" || !m.roll) continue;
        /* 繰り返しロールは 1 回ずつ数える */
        for (const { result } of rollOutcomes(m.roll)) {
          count++;
          /* 合計値や表の結果のように判定の無いロールは、回数にだけ数える */
          const tone = rollTone(result);
          if (!tone) continue;
          nextBySp[m.sp] ??= { crit: 0, fumble: 0, fail: 0, ok: 0, spec: 0 };
          const row = nextBySp[m.sp];
          if (tone === "crit") row.crit++;
          else if (tone === "fumble") row.fumble++;
          else if (tone === "special") row.spec++;
          else if (tone === "fail") row.fail++;
          else row.ok++;
          nextDist[result] = (nextDist[result] ?? 0) + 1;
        }
      }
    }
    return {
      totalRolls: count,
      dist: nextDist,
      bySp: nextBySp,
      maxDist: Math.max(1, ...Object.values(nextDist)),
    };
  }, [log.channels]);

  if (totalRolls === 0) return null;

  return (
    <section aria-label="ダイスロール">
      <SectionTitle>
        ダイスロール
        <span className="ml-1.5 text-sm font-medium text-ink3 tabular-nums">{totalRolls}回</span>
      </SectionTitle>
      <div className="surface">
        <div className="px-4 py-4 sm:px-5">
          <h3 className="eyebrow mb-3">結果</h3>
          <ul className="grid grid-cols-[fit-content(10rem)_minmax(3rem,1fr)_auto] items-center gap-x-3 gap-y-2 text-sm">
            {Object.entries(dist)
              .sort((x, y) => y[1] - x[1])
              .map(([k, n]) => (
                <li key={k} className="contents">
                  <span className="break-words">{k}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-base-200">
                    <span
                      className={cx(
                        "block h-full rounded-full",
                        isGoodRoll(k)
                          ? "bg-success"
                          : rollTone(k) === "fumble"
                            ? "bg-error"
                            : "bg-base-content/35",
                      )}
                      style={{ width: `${(n / maxDist) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums text-ink2">{n}</span>
                </li>
              ))}
          </ul>
        </div>
        {/* 名前が長くても横にあふれないよう、列は成功・失敗だけにし、まれなクリティカル・ファンブルは名前の下に出す */}
        <div className="border-t border-base-300 px-4 py-4 sm:px-5">
          <h3 className="eyebrow mb-2">発言者ごと</h3>
          <table className="w-full table-fixed text-sm tabular-nums">
            <thead>
              <tr className="whitespace-nowrap text-xs text-ink2">
                <th scope="col" className="py-1 text-left font-medium">
                  発言者
                </th>
                <th scope="col" className="w-9 py-1 text-right font-medium">
                  成功
                </th>
                <th scope="col" className="w-9 py-1 text-right font-medium">
                  失敗
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySp).map(([sp, v]) => (
                <tr key={sp} className="border-t border-base-200 align-baseline">
                  <th scope="row" className="py-1.5 text-left font-normal">
                    <span className="block font-semibold [overflow-wrap:anywhere]" data-user-content>
                      {sp}
                    </span>
                    {(v.crit > 0 || v.fumble > 0) && (
                      <span className="meta text-xs">
                        {v.crit > 0 && <span className="font-bold text-success">クリティカル {v.crit}</span>}
                        {v.fumble > 0 && <span className="font-bold text-error">ファンブル {v.fumble}</span>}
                      </span>
                    )}
                  </th>
                  <td className="py-1.5 text-right">{v.ok + v.spec}</td>
                  <td className="py-1.5 text-right text-ink2">{v.fail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- 編集 ---------- */
function EditLogModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const { state, update } = useStore();
  const [tableId, setTableId] = useState(log.tableId ?? "");
  const [scenarioId, setScenarioId] = useState(log.scenarioId);
  const [sittings, setSittings] = useState<SittingFields[]>(() => log.sittings.map(sittingToFields));
  const [error, setError] = useState<{ index: number; text: string } | null>(null);

  function save() {
    const parsed = sittingsFromFields(sittings);
    if (!parsed.ok) {
      setError({ index: parsed.index, text: parsed.error });
      return;
    }
    update((s) => {
      const l = s.logs[log.id];
      l.tableId = tableId || undefined;
      l.scenarioId = scenarioId;
      if (s.scenarios[scenarioId]) l.systemId = s.scenarios[scenarioId].systemId;
      l.sittings = parsed.sittings;
    });
    onClose();
  }

  return (
    <Modal
      title="セッションを編集"
      onClose={onClose}
      wide
      foot={
        <>
          <button className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="卓">
          <Combobox
            className="w-full"
            ariaLabel="卓"
            value={tableId}
            onChange={setTableId}
            options={[
              { value: "", label: "選択しない" },
              ...Object.values(state.tables).map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        </Field>
        <Field label="シナリオ">
          <Combobox
            className="w-full"
            ariaLabel="シナリオ"
            value={scenarioId}
            onChange={(v) => v && setScenarioId(v)}
            options={Object.values(state.scenarios).map((s) => ({
              value: s.id,
              label: s.title,
              keywords: [s.author],
            }))}
          />
        </Field>
      </div>
      <Field label="遊んだ日時">
        <SittingsInput rows={sittings} onChange={setSittings} invalidIndex={error?.index} />
      </Field>
      <FieldError text={error?.text} />
    </Modal>
  );
}

/* ---------- 卓報告カード ---------- */
/**
 * 卓報告カード。画像はサーバーが描く（書体をそろえるため。src/app/api/report-card）。
 * 載せるのはネタバレにならないものだけ（src/lib/report-card.ts）。スマホでは画像ごと共有シートに渡せる
 */
export function ReportCardModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const { state } = useStore();
  const shareUrl = `${location.origin}/share/l/${log.slug}`;
  const [options, setOptions] = useState<ReportCardOptions>(() => {
    try {
      return parseReportOptions(localStorage.getItem(REPORT_OPTIONS_KEY));
    } catch {
      return REPORT_DEFAULTS;
    }
  });
  const choose = (key: keyof ReportCardOptions, on: boolean) => {
    const next = { ...options, [key]: on };
    setOptions(next);
    try {
      localStorage.setItem(REPORT_OPTIONS_KEY, JSON.stringify(next));
    } catch {
      // 覚えられなくても、この場の選択は効く
    }
  };
  const card = useMemo(() => reportCardFromSession(log, state, options), [log, state, options]);
  const choices = useMemo(() => reportCardChoices(log, state), [log, state]);
  const tweet = useMemo(
    () => ({ title: card.title, playerCount: card.players, shareUrl }),
    [card.title, card.players, shareUrl],
  );
  /* 描き終えた画像と、どの中身から描いたか。いまの中身と違えば描き直し中 */
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [done, setDone] = useState<{ card: ReportCard; error: string | null } | null>(null);
  const loading = done?.card !== card;
  const imageError = loading ? null : (done?.error ?? null);

  useEffect(() => {
    let cancelled = false;
    // 続けて切り替えたときは、最後の選択だけ描く
    const timer = setTimeout(() => {
      fetch("/api/report-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setImage((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { url, file: new File([blob], `takufu-report-${log.id}.png`, { type: "image/png" }) };
          });
          setDone({ card, error: null });
        })
        .catch(() => {
          if (!cancelled)
            setDone({ card, error: "画像を作れませんでした。時間をおいてもう一度お試しください。" });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [card, log.id]);
  // 閉じたら最後の画像を手放す
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    lastUrl.current = image?.url ?? null;
  }, [image]);
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const ready = image !== null && !loading;
  const canShareFile =
    ready && typeof navigator.canShare === "function" && navigator.canShare({ files: [image.file] });

  return (
    <Modal
      title="卓報告カード"
      onClose={onClose}
      foot={
        <>
          {canShareFile ? (
            <button
              className="btn"
              onClick={() =>
                void navigator
                  .share({ files: [image.file], text: reportTweetText(tweet), url: shareUrl })
                  .catch(() => {})
              }
            >
              画像を共有
            </button>
          ) : (
            <a
              className={cx("btn", !ready && "btn-disabled")}
              href={ready ? image.url : undefined}
              download={image?.file.name}
              aria-disabled={!ready}
            >
              画像を保存
            </a>
          )}
          <a className="btn btn-primary" href={xIntentUrl(tweet)} target="_blank" rel="noreferrer">
            <IconExternal width={14} height={14} /> Xで投稿
          </a>
        </>
      }
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-base-300 bg-base-200">
        {image && (
          <img
            src={image.url}
            alt="卓報告カード"
            className={cx("h-full w-full object-cover motion-fade", loading && "opacity-60")}
          />
        )}
        {loading && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="loading loading-spinner loading-sm" aria-label="画像を作っています" />
          </div>
        )}
      </div>
      {choices.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="カードに載せるもの">
          {choices.map((c) => (
            <Toggle
              key={c.key}
              label={c.label}
              showLabel
              on={options[c.key]}
              onChange={(v) => choose(c.key, v)}
            />
          ))}
        </div>
      )}
      <div className="mt-3">
        <CopyBox text={shareUrl} />
      </div>
      {imageError && (
        <div className="mt-3">
          <InlineNotice text={imageError} tone="error" />
        </div>
      )}
    </Modal>
  );
}

/* ---------- 共有モーダル(共有に関わる操作を1か所に集約) ---------- */
function ShareModal({
  log,
  onClose,
  onOpenReportCard,
}: {
  log: Log;
  onClose: () => void;
  onOpenReportCard: () => void;
}) {
  const { state, update } = useStore();
  const shareUrl = `${location.origin}/share/l/${log.slug}`;

  const isOwner = log.ownerId === state.me;

  function setScope(v: Scope) {
    if (!isOwner) return;
    update((s) => {
      s.logs[log.id].scope = v;
    });
  }

  function setSecretTabs(v: SecretTabsScope) {
    if (!isOwner) return;
    update((s) => {
      if (v === "shared") delete s.logs[log.id].secretTabs;
      else s.logs[log.id].secretTabs = v;
    });
  }
  const hasSecret = log.channels.some((c) => c.secret || c.msgs.some((m) => m.roll?.secret));

  return (
    <Modal title="共有" onClose={onClose}>
      <h3 className="text-sm font-bold">共有範囲</h3>
      <div className="mt-2">
        <ScopePicker ariaLabel="共有範囲" value={log.scope} onChange={setScope} />
      </div>
      {hasSecret && isOwner && (
        <>
          <h3 className="mt-6 text-sm font-bold">シークレットタブ・シークレットダイス</h3>
          <div className="mt-2 flex">
            <Seg<SecretTabsScope>
              ariaLabel="シークレットタブ・シークレットダイス"
              value={log.secretTabs ?? "shared"}
              onChange={setSecretTabs}
              options={[
                { v: "shared", label: "共有範囲の人にも見せる" },
                { v: "private", label: "自分だけ" },
              ]}
            />
          </div>
        </>
      )}

      <h3 className="mt-6 text-sm font-bold">共有リンク</h3>
      <div className="mt-2">
        <CopyBox text={shareUrl} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn btn-sm btn-quiet" href={`/share/l/${log.slug}`} target="_blank" rel="noreferrer">
          <IconExternal width={15} height={15} /> 共有ページを開く
        </a>
        <button className="btn btn-sm" onClick={onOpenReportCard}>
          <IconBrandX width={14} height={14} /> Xに投稿する
        </button>
      </div>
    </Modal>
  );
}
