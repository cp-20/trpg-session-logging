import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParam } from "../lib/router";
import { useStore } from "../store";
import {
  CopyBox,
  DateList,
  EmptyState,
  Field,
  FieldError,
  InlineNotice,
  Menu,
  Modal,
  NotFound,
  PageHead,
  SCOPE_META,
  StatChange,
  SectionTitle,
  Seg,
  Select,
  SplitLayout,
  SysBadge,
  TimeRange,
  Toggle,
  cx,
} from "../components/ui";
import { Avatar, CharAvatar, SpeakerConfigGrid } from "../components/identity";
import { LogReaderBar, SessionTimeline, TimelineFilter, RecordingLinkContext } from "../components/timeline";
import { SessionMediaSection, recordingLinksAt } from "../components/media";
import { SYSTEMS } from "../data/systems";
import {
  buildSessionRange,
  fmtDates,
  fmtDur,
  jstTime,
  sessionClock,
  sessionPlayMinutes,
  uid,
} from "../lib/time";
import type { Character, Log, MsgKind, Scope } from "../types";
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
  IconPlus,
  IconSearch,
  IconShare,
  IconTrash,
  IconUnlink,
  IconUpload,
  IconUserPlus,
  IconUsersGroup,
  IconX,
} from "../components/icons";
import { buildReportCardSVG, svgDataUrl, downloadReportPNG, xIntentUrl } from "../external";
import {
  createSharedInvite,
  fetchSharedLog,
  revokeSharedMember,
  type SharedLogData,
} from "../lib/cloud-state";

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
  // 共有の状態と操作は見出しの「共有」ボタン（範囲つき）と共有モーダルにまとめる。横の欄に共有だけの区画を作らない
  const showOverviewAside = hasRolls;

  const openTimeline = () => {
    setTab("timeline");
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <PageHead
        back={{ to: "/sessions", label: "セッション" }}
        title={log.title}
        sub={
          <div className="space-y-1">
            <div className="meta text-ink">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <IconCalendarTime width={15} height={15} className="shrink-0 text-ink2" aria-hidden />
                {fmtDates(log.dates)}
                {log.dates.length > 1
                  ? `（${log.dates.length}日間）`
                  : ` ${jstTime(log.t0)}–${jstTime(log.t1)}`}
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
                  <IconUsersGroup width={14} height={14} className="shrink-0" aria-hidden />
                  {tb.name}
                </Link>
              )}
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
                <span className="font-medium opacity-80">· {SCOPE_META[log.scope].label}</span>
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
                  viewer={{ viewerId: state.me, isMember: isParticipant, hasPassed: isParticipant }}
                  onChange={(media) =>
                    update((s) => {
                      const target = s.logs[log.id];
                      if (target) target.media = media;
                    })
                  }
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
              <div className="max-w-4xl">{overviewMain}</div>
            );
          })()}
      </div>

      <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline" hidden={tab !== "timeline"}>
        {tab === "timeline" && (
          <div className="max-w-4xl">
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
                <>
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
                    <RecordingLinkContext.Provider
                      value={(ts) =>
                        recordingLinksAt(log, ts, {
                          viewerId: state.me,
                          isMember: isParticipant,
                          hasPassed: isParticipant,
                        })[0]?.href
                      }
                    >
                      <SessionTimeline log={log} state={state} mode="own" filter={filter} />
                    </RecordingLinkContext.Provider>
                  </div>
                  {log.importedFrom && (
                    <p className="mt-3 text-xs text-ink3">取り込んだファイル: {log.importedFrom}</p>
                  )}
                </>
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
            「{log.title}」のログ・参加者の紐付け・感想が消えます。元に戻せません。
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
        <Link to={`/users/${author.id}`} className="truncate text-sm font-bold hover:text-primary">
          {author.name}
        </Link>
        {authorId === log.ownerId && <span className="text-xs text-ink3">GM</span>}
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
  const [q, setQ] = useState("");
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

  const candidates = Object.values(state.users)
    .filter((u) => !ids.includes(u.id))
    .filter((u) => !q.trim() || u.name.includes(q.trim()));

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
  const sys = SYSTEMS[log.systemId];

  const deltaText = (delta: Record<string, { before: number; after: number }>) =>
    Object.entries(delta).map(([k, d]) => {
      const label = sys?.stats.find((x) => x.key === k)?.label ?? k.toUpperCase();
      return <StatChange key={k} label={label} before={d.before} after={d.after} />;
    });

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
                    <Link to={`/users/${kpUser.id}`} className="font-bold hover:text-primary">
                      {kpUser.name}
                    </Link>
                  )}
                  <span className="text-xs font-semibold text-primary">GM</span>
                  {kpLink?.hidden && <span className="text-xs text-ink3">共有ページでは非表示</span>}
                </div>
                {kpSessRec && (
                  <div className="meta mt-0.5 text-xs text-base-content">{deltaText(kpSessRec.delta)}</div>
                )}
              </div>
              {kpChar && (
                <Link
                  to={`/users/${kpUser.id}`}
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
                  <Select
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
                      { value: "", label: "キャラクターなし（GMのみ）" },
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
                      <Link to={`/users/${user.id}`} className="font-bold hover:text-primary">
                        {user.name}
                      </Link>
                    )}
                    {char?.archetype && <span className="truncate text-xs text-ink2">{char.archetype}</span>}
                    {!char && (
                      <span className="text-xs text-ink3">
                        {p.linked ? "キャラクター未設定" : "名前のみ（未リンク）"}
                      </span>
                    )}
                    {p.hidden && <span className="text-xs text-ink3">共有ページでは非表示</span>}
                  </div>
                  {sessRec && Object.keys(sessRec.delta).length > 0 && (
                    <div className="meta mt-0.5 text-xs text-base-content">{deltaText(sessRec.delta)}</div>
                  )}
                </div>
                {char && (
                  <Link
                    to={`/users/${user.id}`}
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
                      <Select
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
              {log.tableId &&
                state.tables[log.tableId]?.memberIds.some((member) => !ids.includes(member)) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-ink2">{state.tables[log.tableId].name}のメンバー</span>
                    {state.tables[log.tableId].memberIds
                      .filter((m) => !ids.includes(m) && state.users[m])
                      .map((m) => (
                        <button key={m} className="btn btn-sm" onClick={() => addParticipant(m)}>
                          <Avatar u={state.users[m]} size={18} />
                          {state.users[m].name}
                          <IconPlus width={14} height={14} className="opacity-60" />
                        </button>
                      ))}
                  </div>
                )}
              <div className="relative">
                <label className="input input-sm flex items-center gap-2">
                  <IconSearch width={15} height={15} className="shrink-0 opacity-50" aria-hidden />
                  <input
                    className="min-w-0 grow"
                    aria-label="参加者を検索"
                    placeholder="ユーザー名で検索"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                </label>
                {q && (
                  <div className="list mt-1 max-h-48 overflow-y-auto rounded-lg border border-base-300 bg-base-100">
                    {candidates.slice(0, 6).map((u) => (
                      <button
                        key={u.id}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-base-200/60"
                        onClick={() => {
                          addParticipant(u.id);
                          setQ("");
                        }}
                      >
                        <Avatar u={u} size={24} />
                        <span className="grow text-sm font-semibold">{u.name}</span>
                        <span className="text-xs text-ink2">追加</span>
                      </button>
                    ))}
                    {candidates.length === 0 && (
                      <div className="px-3 py-2 text-sm text-ink2">見つかりません</div>
                    )}
                  </div>
                )}
              </div>
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
                  {inviting ? "作成中…" : "招待リンクを作る"}
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
        count++;
        const sp = m.sp;
        nextBySp[sp] ??= { crit: 0, fumble: 0, fail: 0, ok: 0, spec: 0 };
        const r = m.roll.result;
        if (/クリティカル/.test(r)) nextBySp[sp].crit++;
        else if (/ファンブル/.test(r)) nextBySp[sp].fumble++;
        else if (/スペシャル/.test(r)) nextBySp[sp].spec++;
        else if (/失敗/.test(r)) nextBySp[sp].fail++;
        else if (/SAN/.test(r)) {
          /* SANは分布に含めない */
        } else nextBySp[sp].ok++;
        const key = /SAN/.test(r) ? "SANチェック" : r;
        nextDist[key] = (nextDist[key] ?? 0) + 1;
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
          <ul className="space-y-2">
            {Object.entries(dist)
              .sort((x, y) => y[1] - x[1])
              .map(([k, n]) => (
                <li key={k} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 truncate">{k}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
                    <span
                      className={cx(
                        "block h-full rounded-full",
                        /クリティカル|スペシャル/.test(k)
                          ? "bg-success"
                          : /ファンブル/.test(k)
                            ? "bg-error"
                            : "bg-base-content/35",
                      )}
                      style={{ width: `${(n / maxDist) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right tabular-nums text-ink2">{n}</span>
                </li>
              ))}
          </ul>
        </div>
        <div className="overflow-x-auto border-t border-base-300 px-4 py-4 sm:px-5">
          <h3 className="eyebrow mb-2">発言者ごと</h3>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="whitespace-nowrap text-xs text-ink2">
                <th className="py-1 pr-2 text-left font-medium">発言者</th>
                <th className="px-1.5 py-1 text-right font-medium">成功</th>
                <th className="px-1.5 py-1 text-right font-medium">失敗</th>
                <th className="px-1.5 py-1 text-right font-medium">クリティカル</th>
                <th className="py-1 pl-1.5 text-right font-medium">ファンブル</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(bySp).map(([sp, v]) => (
                <tr key={sp} className="border-t border-base-200">
                  <td className="max-w-24 truncate py-1.5 pr-2 font-semibold">{sp}</td>
                  <td className="px-1.5 py-1.5 text-right">{v.ok + v.spec}</td>
                  <td className="px-1.5 py-1.5 text-right text-ink2">{v.fail}</td>
                  <td
                    className={cx(
                      "px-1.5 py-1.5 text-right",
                      v.crit > 0 ? "font-bold text-success" : "text-ink3",
                    )}
                  >
                    {v.crit}
                  </td>
                  <td
                    className={cx(
                      "py-1.5 pl-1.5 text-right",
                      v.fumble > 0 ? "font-bold text-error" : "text-ink3",
                    )}
                  >
                    {v.fumble}
                  </td>
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
  const [title, setTitle] = useState(log.title);
  const [tableId, setTableId] = useState(log.tableId ?? "");
  const [scenarioId, setScenarioId] = useState(log.scenarioId ?? "");
  const [dates, setDates] = useState<string[]>([...log.dates]);
  const [startTime, setStartTime] = useState(sessionClock(log.t0, log.dates[0]));
  const [endTime, setEndTime] = useState(sessionClock(log.t1, log.dates[log.dates.length - 1]));
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)) || new Set(dates).size !== dates.length) {
      setError("実施日を重複しない日付で入力してください。");
      return;
    }
    const sortedDates = [...dates].sort();
    const range = buildSessionRange({ dates: sortedDates, startTime, endTime });
    if (!range.ok) {
      setError(range.error ?? "入力を確認してください");
      return;
    }
    const { t0, t1 } = range;
    update((s) => {
      const l = s.logs[log.id];
      l.title = title.trim() || l.title;
      l.tableId = tableId || undefined;
      l.scenarioId = scenarioId || undefined;
      if (scenarioId && s.scenarios[scenarioId]) l.systemId = s.scenarios[scenarioId].systemId;
      l.dates = sortedDates;
      l.t0 = t0;
      l.t1 = t1;
    });
    onClose();
  }

  return (
    <Modal
      title="セッション情報を編集"
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
      <Field label="タイトル">
        <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="卓">
          <Select
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
          <Select
            className="w-full"
            ariaLabel="シナリオ"
            value={scenarioId}
            onChange={setScenarioId}
            options={[
              { value: "", label: "選択しない" },
              ...Object.values(state.scenarios).map((s) => ({ value: s.id, label: s.title })),
            ]}
          />
        </Field>
      </div>
      <Field label="実施日">
        <DateList dates={dates} setDates={setDates} />
      </Field>
      <div className="mt-4">
        <span className="text-sm font-semibold text-base-content/90">時刻（初日の開始〜最終日の終了）</span>
        <div className="mt-1.5">
          <TimeRange start={startTime} end={endTime} setStart={setStartTime} setEnd={setEndTime} />
        </div>
      </div>
      <FieldError text={error} />
    </Modal>
  );
}

/* ---------- 卓報告カード ---------- */
export function ReportCardModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const { state } = useStore();
  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const shareUrl = `${location.origin}/share/l/${log.slug}`;
  const cardData = useMemo(
    () => ({
      scenarioTitle: sc?.title,
      scenarioEmoji: sc?.emoji,
      title: log.title,
      dateLabel: fmtDates(log.dates),
      systemName: SYSTEMS[log.systemId]?.name ?? "汎用・その他",
      playerCount: Object.keys(log.players).length,
      shareUrl,
    }),
    [sc?.title, sc?.emoji, log.title, log.dates, log.systemId, log.players, shareUrl],
  );
  const cardSvg = useMemo(() => buildReportCardSVG(cardData), [cardData]);

  return (
    <Modal
      title="卓報告カード"
      onClose={onClose}
      foot={
        <>
          <button
            className="btn"
            disabled={savingImage}
            onClick={async () => {
              setSavingImage(true);
              setImageError(null);
              try {
                await downloadReportPNG(cardSvg, `takufu-report-${log.id}.png`);
              } catch {
                setImageError("画像を保存できませんでした。もう一度お試しください。");
              } finally {
                setSavingImage(false);
              }
            }}
          >
            {savingImage ? "画像を作成中…" : "画像を保存"}
          </button>
          <button
            className={cx("btn w-40", copiedLink && "text-success")}
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/share/l/${log.slug}`).catch(() => {});
              setCopiedLink(true);
              window.setTimeout(() => setCopiedLink(false), 2000);
            }}
          >
            {copiedLink ? <IconCheck width={16} height={16} /> : <IconLink width={16} height={16} />}
            {copiedLink ? "コピーした" : "リンクをコピー"}
          </button>
          <a className="btn btn-primary" href={xIntentUrl(cardData)} target="_blank" rel="noreferrer">
            <IconExternal width={14} height={14} /> Xで投稿
          </a>
        </>
      }
    >
      <img
        src={svgDataUrl(cardSvg)}
        alt="卓報告カード"
        className="w-full rounded-xl border border-base-300"
      />
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
  const options: { v: Scope; label: string }[] = (["members", "passed", "public"] as const).map((v) => ({
    v,
    label: SCOPE_META[v].label,
  }));

  function setScope(v: Scope) {
    if (!isOwner) return;
    update((s) => {
      s.logs[log.id].scope = v;
    });
  }

  return (
    <Modal title="共有" onClose={onClose}>
      <h3 className="text-sm font-bold">読める人</h3>
      <div className="mt-2">
        <Seg ariaLabel="読める人" value={log.scope} options={options} onChange={setScope} />
      </div>
      <p className="mt-2 text-sm text-ink2">{SCOPE_META[log.scope].hint}</p>
      {log.channels.some((c) => c.secret) && (
        <p className="mt-1 text-sm text-ink2">シークレットタブも、読める人にはそのまま表示されます。</p>
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
