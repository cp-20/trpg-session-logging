import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "../lib/router";
import { IconBooks, IconExternal, IconLock, IconTrendingUp } from "../components/icons";
import { LogReaderBar, RecordingLinkContext, SessionTimeline, TimelineFilter } from "../components/timeline";
import { EmptyState, LegalLinks, LogoMark, StatBar, StatChange, SysBadge, cx } from "../components/ui";
import { Avatar, CharAvatar } from "../components/identity";
import { SessionMediaSection, recordingLinksAt } from "../components/media";
import { SYSTEMS } from "../data/systems";
import { carriedDeltas, carriedValues } from "../lib/character-growth";
import { SheetView } from "../components/sheet";
import { SYSTEM_RIGHTS } from "../lib/rights";
import { roleLabel } from "../lib/roles";
import { authErrorMessage, signInWithGoogle } from "../lib/auth";
import {
  confirmPlayedLog,
  fetchSharedCharacter,
  fetchSharedLog,
  getSharedLogAccess,
  type SharedCharacterData,
  type SharedLogData,
} from "../lib/cloud-state";
import { isFirebaseConfigured } from "../lib/firebase";
import { evaluateShareGate, visibleShareMembers } from "../lib/share-gate";
import { fmtDate, fmtDur, fmtSessionWhen, sessionPlayMinutes } from "../lib/time";
import { useStore } from "../store";
import type { Character, Log, State } from "../types";

/* ---------- 共有ページの外枠（ログインなしでも読める静かな読書面） ---------- */
function ShareFrame({
  children,
  action,
  narrow,
  systemIds,
}: {
  children: ReactNode;
  action?: ReactNode;
  narrow?: boolean;
  /** 本文で扱うシステム。二次創作物である旨をフッターに出す */
  systemIds?: string[];
}) {
  const width = narrow ? "max-w-2xl" : "max-w-4xl";
  return (
    <div className="min-h-screen bg-base-200">
      <header className="border-b border-base-300 bg-base-100">
        <div className={cx("mx-auto flex h-14 items-center gap-3 px-4 sm:px-6", width)}>
          <Link to={"/sessions"} className="flex items-center gap-2" aria-label="卓譜">
            <LogoMark size={22} className="text-primary" />
            <span className="font-bold tracking-tight">卓譜</span>
          </Link>
          {action && <div className="ml-auto">{action}</div>}
        </div>
      </header>
      <main className={cx("mx-auto px-4 pb-20 pt-8 sm:px-6", width)}>{children}</main>
      <footer className={cx("mx-auto px-4 pb-12 sm:px-6", width)}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-base-300 pt-6 text-xs text-ink2">
          {systemIds && systemIds.some((id) => SYSTEM_RIGHTS[id]) && (
            <span className="basis-full">
              {systemIds
                .map((id) => SYSTEMS[id]?.name)
                .filter(Boolean)
                .join("・")}{" "}
              の二次創作物を含みます。
            </span>
          )}
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

export default function ShareLog() {
  const { slug } = useParams<{ slug?: string; id?: string }>();
  const { state, authUser } = useStore();
  const log = Object.values(state.logs).find((l) => l.slug === slug || l.id === slug);
  if (log && (!authUser || log.ownerId === authUser.uid)) return <ShareLogView state={state} log={log} />;
  return <RemoteShare slug={slug ?? ""} />;
}

function RemoteShare({ slug }: { slug: string }) {
  const { state, authUser } = useStore();
  const [shared, setShared] = useState<SharedLogData | null>(null);
  const [scope, setScope] = useState<"members" | "passed" | "public" | null>(null);
  const canFetch = isFirebaseConfigured && Boolean(slug);
  const [status, setStatus] = useState<"loading" | "missing" | "gate" | "ready" | "error">(
    canFetch ? "loading" : "missing",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  /* 読み込み直す条件が変わったら、描画中に読み込み中へ戻す（Effect で戻すと古い結果が一瞬映る） */
  const fetchKey = JSON.stringify([slug, authUser?.uid ?? null, retry]);
  const [statusKey, setStatusKey] = useState(fetchKey);
  if (statusKey !== fetchKey) {
    setStatusKey(fetchKey);
    setStatus(canFetch ? "loading" : "missing");
  }

  useEffect(() => {
    let alive = true;
    if (!isFirebaseConfigured || !slug) return;
    (async () => {
      try {
        const access = await getSharedLogAccess(slug);
        if (!alive) return;
        if (!access) {
          setStatus("missing");
          return;
        }
        setScope(access.scope);
        try {
          const data = await fetchSharedLog(slug);
          if (alive) {
            setShared(data);
            setStatus(data ? "ready" : "missing");
          }
        } catch (cause) {
          if (!alive) return;
          if ((cause as { code?: string }).code === "permission-denied") setStatus("gate");
          else throw cause;
        }
      } catch {
        if (alive) {
          setError("共有ページを読み込めませんでした。通信状態を確認してください。");
          setStatus("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug, authUser?.uid, retry]);

  if (status === "loading")
    return (
      <ShareFrame>
        <p className="flex items-center gap-2 text-sm text-ink2" role="status">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          共有ページを読み込んでいます…
        </p>
      </ShareFrame>
    );
  if (status === "missing")
    return (
      <ShareFrame>
        <div className="surface">
          <EmptyState kind="permission" title="共有ページが見つかりません">
            リンクが間違っているか、記録が削除された可能性があります。
          </EmptyState>
        </div>
      </ShareFrame>
    );
  if (status === "ready" && shared) {
    const view: State = {
      ...state,
      users: { ...state.users, ...shared.users },
      characters: {},
      logs: { [shared.log.id]: shared.log },
      scenarios: shared.scenario ? { [shared.scenario.id]: shared.scenario } : {},
    };
    return <ShareLogView state={view} log={shared.log} serverAuthorized />;
  }
  return (
    <ShareFrame>
      <div className="surface">
        <EmptyState
          kind="permission"
          icon={<IconLock width={28} height={28} />}
          title={scope === "passed" ? "プレイした人に共有された記録です" : "メンバー限定の記録です"}
          action={
            status === "error" ? (
              <button className="btn" onClick={() => setRetry((n) => n + 1)}>
                もう一度読み込む
              </button>
            ) : !authUser ? (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await signInWithGoogle();
                  } catch (cause) {
                    setError(authErrorMessage(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Google でログイン
              </button>
            ) : (
              scope === "passed" && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
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
                </button>
              )
            )
          }
        >
          <p>
            {status === "error"
              ? error
              : !authUser
                ? "Google でログインすると、読めるかどうかを確認します。"
                : scope === "passed"
                  ? "このシナリオをプレイ済みなら、記録を開けます。"
                  : "参加者として登録されたアカウントでログインしてください。"}
          </p>
          {error && status !== "error" && (
            <p role="alert" className="mt-3 text-error">
              {error}
            </p>
          )}
        </EmptyState>
      </div>
    </ShareFrame>
  );
}

function ShareLogView({
  state,
  log,
  serverAuthorized = false,
}: {
  state: State;
  log: Log;
  serverAuthorized?: boolean;
}) {
  const [asPassed, setAsPassed] = useState(false);
  const [showSpoilerImpressions, setShowSpoilerImpressions] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>({ query: "", channel: "all" });

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const sys = SYSTEMS[log.systemId];
  const viewerId = state.entered ? state.me : null;

  const gateResult = evaluateShareGate(log, viewerId, { asPassed });
  const gate = serverAuthorized || gateResult.visible ? null : gateResult.reason;
  const visibleMembers = visibleShareMembers(log, { hideSelfOnShare: state.prefs.hideSelfOnShare, viewerId });
  const mediaViewer = {
    viewerId,
    isMember: Boolean(viewerId && (viewerId === log.ownerId || log.players[viewerId])),
    hasPassed: asPassed || Boolean(serverAuthorized),
  };
  const channels = log.channels;
  const kpUser = state.users[log.ownerId];
  const kpLink = log.players[log.ownerId];
  const kpChar =
    kpLink?.linked && !kpLink.hidden ? state.characters[kpLink.characterIds[0] ?? ""] : undefined;
  const castMembers = visibleMembers.filter((u) => u !== log.ownerId);

  const playMin = sessionPlayMinutes(log);
  const spoilerCount = (log.impressions ?? []).filter((imp) => imp.spoiler).length;
  const shownImpressions = (log.impressions ?? []).filter((imp) => !imp.spoiler || showSpoilerImpressions);

  const castCard = (key: string, face: ReactNode, name: string, sub?: string, role?: string) => (
    <li key={key} className="flex min-w-0 items-center gap-2.5">
      {face}
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold">
          {name}
          {role && <span className="ml-1.5 text-xs font-semibold text-primary">{role}</span>}
        </span>
        {sub && <span className="block truncate text-xs text-ink2">{sub}</span>}
      </span>
    </li>
  );

  return (
    <ShareFrame systemIds={[log.systemId]}>
      <header>
        <div className="meta">
          <SysBadge sys={sys} />
        </div>
        <h1
          data-user-content
          className="mt-2 text-2xl font-bold leading-snug tracking-tight sm:text-[1.75rem]"
        >
          {log.title}
        </h1>
        <div className="meta mt-2 text-ink">
          <span className="tabular-nums">{fmtSessionWhen(log)}</span>
          {playMin > 0 && <span className="tabular-nums text-ink2">{fmtDur(playMin)}</span>}
          {sc && <ScenarioRef sc={sc} entered={state.entered && !serverAuthorized} />}
        </div>

        <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-base-300 pt-5 sm:grid-cols-2">
          {kpUser &&
            castCard(
              "kp",
              kpChar ? <CharAvatar c={kpChar} size={36} /> : <Avatar u={kpUser} size={36} />,
              kpChar?.name ?? kpUser.name,
              kpChar ? kpUser.name : undefined,
              roleLabel(log.systemId, "GM"),
            )}
          {castMembers.map((u) => {
            const user = state.users[u];
            if (!user) return null;
            const charId = log.players[u]?.characterIds[0];
            const char = charId ? state.characters[charId] : undefined;
            return char
              ? castCard(u, <CharAvatar c={char} size={36} />, char.name, user.name)
              : castCard(u, <Avatar u={user} size={36} />, user.name);
          })}
        </ul>
      </header>

      <div className="mt-8">
        {gate ? (
          <div className="surface">
            <EmptyState
              kind="permission"
              icon={<IconLock width={28} height={28} />}
              action={
                log.scope === "passed" && !serverAuthorized ? (
                  <button type="button" className="btn btn-primary" onClick={() => setAsPassed(true)}>
                    このシナリオをプレイした（記録を開く）
                  </button>
                ) : undefined
              }
            >
              <p>{gate}</p>
            </EmptyState>
          </div>
        ) : (
          <>
            {(log.impressions?.length ?? 0) > 0 && (
              <section aria-label="感想" className="mb-8">
                <div className="mb-3 flex items-end justify-between gap-2">
                  <h2 className="text-base font-bold sm:text-lg">感想</h2>
                  {spoilerCount > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() => setShowSpoilerImpressions((v) => !v)}
                    >
                      {showSpoilerImpressions
                        ? "ネタバレを隠す"
                        : `ネタバレを含む感想も表示（${spoilerCount}件）`}
                    </button>
                  )}
                </div>
                {shownImpressions.length > 0 ? (
                  <div className="surface list">
                    {shownImpressions.map((imp) => {
                      const hideAuthor = state.prefs.hideSelfOnShare && imp.userId === viewerId;
                      const author = hideAuthor ? undefined : state.users[imp.userId];
                      return (
                        <div key={imp.id} className="flex gap-3 px-4 py-4 sm:px-5">
                          {author ? (
                            <Avatar u={author} size={32} />
                          ) : (
                            <span className="size-8 shrink-0 rounded-full bg-base-200" aria-hidden />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold">{author?.name ?? "参加者"}</div>
                            <p data-user-content className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                              {imp.text}
                            </p>
                            {imp.spoiler && <p className="mt-1 text-xs text-ink3">ネタバレを含む感想</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-ink2">感想はすべてネタバレを含みます。</p>
                )}
              </section>
            )}

            <SessionMediaSection
              className="mb-8"
              log={log}
              state={state}
              editable={false}
              viewer={mediaViewer}
            />

            <section aria-label="ログ">
              <LogReaderBar
                log={log}
                state={state}
                filter={filter}
                onChange={setFilter}
                stickyClassName="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6"
              />
              {channels.length === 0 ? (
                <div className="surface">
                  <EmptyState kind="permission" title="表示できるログがありません" />
                </div>
              ) : (
                <div className="surface px-1 py-2 sm:px-3 sm:py-3">
                  <RecordingLinkContext.Provider
                    value={(ts) => recordingLinksAt(log, ts, mediaViewer)[0]?.href}
                  >
                    <SessionTimeline log={log} state={state} mode="share" filter={filter} />
                  </RecordingLinkContext.Provider>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ShareFrame>
  );
}

/* ================= キャラクター共有カルテ ================= */
export function ShareChar() {
  const { id } = useParams<{ slug?: string; id?: string }>();
  const { state } = useStore();
  const c = state.characters[id ?? ""];
  if (c) return <ShareCharView state={state} c={c} />;
  return <RemoteCharacter id={id ?? ""} />;
}

function RemoteCharacter({ id }: { id: string }) {
  const { state } = useStore();
  const [data, setData] = useState<SharedCharacterData | null>(null);
  const canFetch = isFirebaseConfigured && Boolean(id);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">(
    canFetch ? "loading" : "missing",
  );
  const [retry, setRetry] = useState(0);
  /* 読み込み直す条件が変わったら、描画中に読み込み中へ戻す */
  const fetchKey = JSON.stringify([id, retry]);
  const [statusKey, setStatusKey] = useState(fetchKey);
  if (statusKey !== fetchKey) {
    setStatusKey(fetchKey);
    setStatus(canFetch ? "loading" : "missing");
  }
  useEffect(() => {
    let alive = true;
    if (!isFirebaseConfigured || !id) return;
    fetchSharedCharacter(id)
      .then((shared) => {
        if (alive) {
          setData(shared);
          setStatus(shared ? "ready" : "missing");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [id, retry]);

  if (status === "loading")
    return (
      <ShareFrame narrow>
        <p className="flex items-center gap-2 text-sm text-ink2" role="status">
          <span className="loading loading-spinner loading-sm" aria-hidden />
          カルテを読み込んでいます…
        </p>
      </ShareFrame>
    );
  if (status === "error") {
    return (
      <ShareFrame narrow>
        <div className="surface">
          <EmptyState
            kind="permission"
            title={<span role="alert">カルテを読み込めませんでした</span>}
            action={
              <button className="btn" onClick={() => setRetry((n) => n + 1)}>
                もう一度読み込む
              </button>
            }
          >
            通信状態を確認してください。
          </EmptyState>
        </div>
      </ShareFrame>
    );
  }
  if (!data)
    return (
      <ShareFrame narrow>
        <div className="surface">
          <EmptyState kind="permission" title="カルテが見つかりません">
            リンクが間違っているか、共有が止められた可能性があります。
          </EmptyState>
        </div>
      </ShareFrame>
    );
  const view = { ...state, users: { ...state.users, [data.owner.id]: data.owner } };
  return <ShareCharView state={view} c={data.character} publicLogs={data.publicLogs} remote />;
}

function ShareCharView({
  state,
  c,
  publicLogs,
  remote = false,
}: {
  state: State;
  c: Character;
  publicLogs?: Record<string, string>;
  remote?: boolean;
}) {
  const sys = SYSTEMS[c.systemId];
  const owner = state.users[c.ownerId];
  const isOwner = !remote && state.entered && c.ownerId === state.me;
  const share = c.share;

  if ((!share.enabled || share.scope === "private") && !isOwner) {
    return (
      <ShareFrame narrow>
        <div className="surface">
          <EmptyState
            kind="permission"
            icon={<IconLock width={28} height={28} />}
            title="このカルテは非公開です"
          >
            持ち主が共有を有効にすると、このリンクで読めるようになります。
          </EmptyState>
        </div>
      </ShareFrame>
    );
  }

  // 時系列は新しいものを上に（現在値の計算は古い順で行う）
  const sessionsAsc = [...c.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const sessions = [...sessionsAsc].reverse();
  const growth = [...c.growth].sort((a, b) => b.date.localeCompare(a.date));
  /* 卓をまたいで続く値（SAN など）だけを出す（P3） */
  const carried = carriedValues(c);

  return (
    <ShareFrame narrow systemIds={[c.systemId]}>
      {isOwner && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm">
          <span className="font-semibold">共有ページのプレビュー</span>
          {!share.enabled && (
            <span className="text-warning">共有は止まっています。ほかの人には見えません。</span>
          )}
        </div>
      )}

      <header className="flex items-center gap-4 sm:gap-5">
        <CharAvatar c={c} size={80} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-[1.75rem]">{c.name}</h1>
          <div className="meta mt-1">
            {c.archetype && <span>{c.archetype}</span>}
            <SysBadge sys={sys} />
            {owner && <span>PL {owner.name}</span>}
          </div>
        </div>
      </header>

      {share.includeProfile && (c.bio || c.tags.length > 0) && (
        <div className="mt-5">
          {c.bio && (
            <p data-user-content className="whitespace-pre-wrap text-sm leading-relaxed sm:text-base">
              {c.bio}
            </p>
          )}
          {c.tags.length > 0 && (
            <p data-user-content className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink2">
              {c.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
        </div>
      )}

      {share.includeStats && carried.length > 0 && (
        <dl className="surface mt-6 grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {carried.map((st) => (
            <StatBar key={st.key} label={st.label} value={st.value} max={st.max} />
          ))}
        </dl>
      )}
      {share.includeStats && c.sheet && (
        <div className="mt-6">
          <SheetView sheet={c.sheet} systemId={c.systemId} />
        </div>
      )}

      {share.includeSessions && sessions.length > 0 && (
        <section className="mt-8" aria-label="セッション履歴">
          <h2 className="mb-3 text-base font-bold sm:text-lg">セッション履歴</h2>
          <ol className="surface tl">
            {sessions.map((s) => {
              const slugOrNull = s.logId
                ? publicLogs?.[s.logId] ||
                  (!remote && state.logs[s.logId]?.scope === "public" ? state.logs[s.logId]?.slug : undefined)
                : undefined;
              return (
                <li key={s.logId} className="tlitem">
                  <div className="tlrow">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <b data-user-content className="text-sm sm:text-base">
                        {s.title}
                      </b>
                      <span className="text-xs tabular-nums text-ink2">{fmtDate(s.date)}</span>
                    </div>
                    {carriedDeltas(c.systemId, s.delta).length > 0 && (
                      <div className="meta mt-1 text-xs text-base-content">
                        {carriedDeltas(c.systemId, s.delta).map((d) => (
                          <StatChange key={d.key} label={d.label} before={d.before} after={d.after} />
                        ))}
                      </div>
                    )}
                    {slugOrNull && (
                      <Link
                        className="mt-1.5 inline-block text-sm font-semibold text-primary hover:underline"
                        to={`/share/l/${slugOrNull}`}
                      >
                        公開ログを読む
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {share.includeGrowth && growth.length > 0 && (
        <section className="mt-8" aria-label={`${sys?.growthLabel ?? "成長"}の履歴`}>
          <h2 className="mb-3 text-base font-bold sm:text-lg">{sys?.growthLabel ?? "成長"}の履歴</h2>
          <ul className="surface list">
            {growth.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-3 text-sm sm:px-5"
              >
                <IconTrendingUp width={16} height={16} className="flex-none text-success" aria-hidden />
                <b>{g.skill}</b>
                <span className="tabular-nums text-ink2">
                  {g.from} → <b className="text-success">{g.to}</b>
                </span>
                <span className="ml-auto text-xs tabular-nums text-ink2">{fmtDate(g.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ShareFrame>
  );
}

/** 共有ページのシナリオ表示。卓譜の利用者には卓譜内のページへ、それ以外の読者には配布ページへつなぐ */
function ScenarioRef({
  sc,
  entered,
}: {
  sc: { id: string; title: string; sourceUrl?: string };
  entered: boolean;
}) {
  const inner = (
    <>
      <IconBooks width={14} height={14} className="shrink-0" aria-hidden />
      {sc.title}
    </>
  );
  const cls = "inline-flex items-center gap-1 text-ink2 transition-colors hover:text-primary";
  if (entered) {
    return (
      <Link to={`/scenarios/${sc.id}`} className={cls}>
        {inner}
      </Link>
    );
  }
  if (sc.sourceUrl) {
    return (
      <a href={sc.sourceUrl} target="_blank" rel="noreferrer" className={cls}>
        {inner}
        <IconExternal width={13} height={13} className="shrink-0 opacity-60" aria-hidden />
      </a>
    );
  }
  return <span className="inline-flex items-center gap-1 text-ink2">{inner}</span>;
}
