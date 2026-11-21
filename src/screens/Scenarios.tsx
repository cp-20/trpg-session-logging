import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParam } from "../lib/router";
import { Controller, useForm } from "react-hook-form";
import {
  IconCheck,
  IconExternal,
  IconEyeOff,
  IconPencil,
  IconPlus,
  IconSearch,
  IconSend,
} from "../components/icons";
import {
  EmptyState,
  Field,
  LoadMore,
  Modal,
  NotFound,
  PageHead,
  SectionTitle,
  Seg,
  Select,
  SysBadge,
  cx,
  useVisibleCount,
} from "../components/ui";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { evaluateShareGate } from "../lib/share-gate";
import { fmtDur, sessionPlayMinutes, uid } from "../lib/time";
import { useStore } from "../store";
import type { ExternalSyncConfig, ExternalSyncProvider, Scenario, ScenarioEditChanges } from "../types";
import type { ImportedScenario } from "../lib/external-sync";
import { SessionRow } from "./Sessions";

/** 配布ページの URL から配布元を判定する */
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

type PlayedFilter = "all" | "played" | "unplayed";

function scenarioAddHref(query: string): string {
  const q = query.trim();
  if (!q) return "/scenarios/new";
  return /^https?:\/\//i.test(q)
    ? `/scenarios/new?url=${encodeURIComponent(q)}`
    : `/scenarios/new?title=${encodeURIComponent(q)}`;
}

const SCENARIO_PAGE_SIZE = 30;

export default function Scenarios() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [sys, setSys] = useState("all");
  const [played, setPlayed] = useState<PlayedFilter>("all");
  const [visibleCount, setVisibleCount] = useVisibleCount(SCENARIO_PAGE_SIZE, [deferredQ, sys, played]);

  const rows = useMemo(() => {
    const viewer = state.entered ? state.me : null;
    const bySc = new Map<string, { last: number; played: boolean }>();
    for (const l of Object.values(state.logs)) {
      if (!l.scenarioId) continue;
      const cur = bySc.get(l.scenarioId) ?? { last: 0, played: false };
      if (evaluateShareGate(l, viewer).visible && l.t0 > cur.last) cur.last = l.t0;
      if (l.ownerId === state.me || Boolean(l.players[state.me])) cur.played = true;
      bySc.set(l.scenarioId, cur);
    }
    return Object.values(state.scenarios).map((s) => {
      const info = bySc.get(s.id);
      return { s, hasPlayed: info?.played ?? false, last: info?.last ?? 0 };
    });
  }, [state.scenarios, state.logs, state.entered, state.me]);

  const usedSystems = useMemo(() => new Set(rows.map((r) => r.s.systemId)), [rows]);

  const list = useMemo(() => {
    let items = rows;
    if (sys !== "all") items = items.filter((r) => r.s.systemId === sys);
    if (played === "played") items = items.filter((r) => r.hasPlayed);
    if (played === "unplayed") items = items.filter((r) => !r.hasPlayed);
    const query = deferredQ.trim().toLowerCase();
    if (query) {
      items = items.filter((r) => (r.s.title + r.s.author + r.s.tags.join()).toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => b.last - a.last || a.s.title.localeCompare(b.s.title, "ja"));
  }, [rows, deferredQ, sys, played]);

  const shownList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount]);
  const filtered = q.trim() !== "" || sys !== "all" || played !== "all";
  /** 検索して見つからなかったときの追加先。URL を貼ったならそのまま読み込み、言葉ならタイトルに入れる */
  const addHref = scenarioAddHref(q);

  return (
    <div className="max-w-4xl">
      <PageHead title="シナリオ" />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="input flex min-w-0 flex-1 items-center gap-2 sm:min-w-64">
          <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
          <input
            type="search"
            className="min-w-0 grow"
            placeholder="タイトル・作者・キーワードで検索"
            aria-label="シナリオを検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Seg<PlayedFilter>
            ariaLabel="通過状況で絞り込み"
            value={played}
            onChange={setPlayed}
            options={[
              { v: "all", label: "すべて" },
              { v: "played", label: "通過済み" },
              { v: "unplayed", label: "未通過" },
            ]}
          />
          {usedSystems.size > 1 && (
            <Select
              ariaLabel="システムで絞り込み"
              value={sys}
              onChange={setSys}
              className="min-w-40 flex-1 sm:w-56 sm:flex-none"
              options={[
                { value: "all", label: "すべてのシステム" },
                ...SYSTEM_LIST.filter((x) => usedSystems.has(x.id)).map((x) => ({
                  value: x.id,
                  label: x.name,
                })),
              ]}
            />
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind={filtered ? "filtered" : "first"}
            title={filtered ? undefined : "シナリオがまだありません"}
            action={
              filtered ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {q.trim() && (
                    <button className="btn btn-primary btn-sm" onClick={() => nav({ to: addHref })}>
                      <IconPlus width={15} height={15} /> シナリオを追加
                    </button>
                  )}
                  <button
                    className="btn btn-quiet btn-sm"
                    onClick={() => {
                      setQ("");
                      setSys("all");
                      setPlayed("all");
                    }}
                  >
                    絞り込みを解除
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={() => nav({ to: "/scenarios/new" })}>
                  <IconPlus width={16} height={16} /> シナリオを追加
                </button>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="surface list">
            {shownList.map(({ s, hasPlayed }) => {
              const sysDef = SYSTEMS[s.systemId];
              return (
                <Link
                  key={s.id}
                  to={`/scenarios/${s.id}`}
                  className="group row-interactive flex items-center gap-4 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold leading-snug transition-colors group-hover:text-primary">
                      {s.title}
                    </h3>
                    <div className="meta mt-0.5 text-xs sm:text-sm">
                      <SysBadge sys={sysDef} />
                      <span className="truncate">{s.author}</span>
                    </div>
                  </div>
                  {hasPlayed && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink2">
                      <IconCheck width={14} height={14} aria-hidden /> 通過済み
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          <LoadMore
            shown={shownList.length}
            total={list.length}
            step={SCENARIO_PAGE_SIZE}
            onMore={() => setVisibleCount((n) => n + SCENARIO_PAGE_SIZE)}
          />
          {q.trim() && (
            <p className="mt-4 flex flex-wrap items-center gap-x-2 text-sm text-ink2">
              探しているシナリオがないときは
              <Link to={addHref} className="btn btn-quiet btn-sm">
                <IconPlus width={15} height={15} /> シナリオを追加
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

const SCENARIO_LOG_PAGE_SIZE = 15;
const SCENARIO_LOG_STEP = 20;

function formatScenarioDiffs(sc: Scenario, changes?: ScenarioEditChanges) {
  if (!changes) return [];
  const rows: { label: string; before: string; after: string }[] = [];
  if (changes.title !== undefined && changes.title !== sc.title) {
    rows.push({ label: "タイトル", before: sc.title, after: changes.title });
  }
  if (changes.author !== undefined && changes.author !== sc.author) {
    rows.push({ label: "作者・サークル", before: sc.author, after: changes.author });
  }
  if (changes.systemId !== undefined && changes.systemId !== sc.systemId) {
    rows.push({
      label: "システム",
      before: SYSTEMS[sc.systemId]?.name ?? sc.systemId,
      after: SYSTEMS[changes.systemId]?.name ?? changes.systemId,
    });
  }
  if (changes.sourceUrl !== undefined && changes.sourceUrl !== (sc.sourceUrl ?? "")) {
    rows.push({
      label: "配布URL",
      before: sc.sourceUrl || "未設定",
      after: changes.sourceUrl || "未設定",
    });
  }
  if (changes.tags !== undefined && changes.tags.join(", ") !== sc.tags.join(", ")) {
    rows.push({
      label: "キーワード",
      before: sc.tags.join(", ") || "なし",
      after: changes.tags.join(", ") || "なし",
    });
  }
  if (changes.description !== undefined && changes.description !== (sc.description ?? "")) {
    rows.push({
      label: "概要",
      before: sc.description || "なし",
      after: changes.description || "なし",
    });
  }
  return rows;
}

export function ScenarioDetail() {
  const { id } = useParams<{ id?: string }>();
  const { state, update, authUser } = useStore();
  const nav = useNavigate();
  const [editRequest, setEditRequest] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [visibleLogCount, setVisibleLogCount] = useVisibleCount(SCENARIO_LOG_PAGE_SIZE, [id]);

  const sc = state.scenarios[id ?? ""];
  const allLogs = useMemo(
    () =>
      sc
        ? Object.values(state.logs)
            .filter((l) => l.scenarioId === sc.id)
            .sort((a, b) => b.t0 - a.t0)
        : [],
    [sc, state.logs],
  );
  const visibleLogs = useMemo(
    () => allLogs.filter((l) => evaluateShareGate(l, state.me).visible),
    [allLogs, state.me],
  );
  const medDur = useMemo(() => {
    const durations = visibleLogs
      .map(sessionPlayMinutes)
      .filter((m) => m > 0)
      .sort((a, b) => a - b);
    return durations.length ? durations[Math.floor(durations.length / 2)] : null;
  }, [visibleLogs]);

  if (!sc) return <NotFound what="シナリオ" />;
  const sys = SYSTEMS[sc.systemId];
  const hasParticipated = allLogs.some((l) => l.ownerId === state.me || Boolean(l.players[state.me]));
  const isAuthor = sc.claimedBy === state.me;
  const canEdit = isAuthor || sc.addedByUid === state.me;
  const needsSpoilerGuard = !canEdit && !hasParticipated && allLogs.length > 0;
  const pendingRequests = state.editRequests.filter((r) => r.scenarioId === sc.id && r.status === "pending");
  const shownLogs = visibleLogs.slice(0, visibleLogCount);
  const record = () => nav({ to: `/upload?scenario=${sc.id}` });

  return (
    <div className="max-w-4xl">
      <PageHead
        back={{ to: "/scenarios", label: "シナリオ" }}
        title={sc.title}
        sub={
          <div className="meta">
            <SysBadge sys={sys} />
            <span>{sc.author}</span>
            {sc.sourceUrl && (
              <a
                href={sc.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {sourceLabel(sc)} <IconExternal width={14} height={14} aria-hidden />
              </a>
            )}
            {medDur != null && <span>プレイ時間 約{fmtDur(medDur)}</span>}
            {hasParticipated && (
              <span className="inline-flex items-center gap-1 font-medium text-ink2">
                <IconCheck width={14} height={14} aria-hidden /> 通過済み
              </span>
            )}
          </div>
        }
        actions={
          <>
            {canEdit ? (
              <button className="btn" onClick={() => setEditing(true)}>
                <IconPencil width={16} height={16} /> 編集
              </button>
            ) : !authUser ? (
              <button className="btn" onClick={() => setEditRequest(true)}>
                <IconSend width={16} height={16} /> 編集を申請
              </button>
            ) : null}
            <button className="btn btn-primary" onClick={record}>
              <IconPlus width={16} height={16} /> このシナリオで記録
            </button>
          </>
        }
      />

      {pendingRequests.length > 0 && isAuthor && (
        <section
          aria-label="届いている修正提案"
          className="mb-6 space-y-3 rounded-box border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <p className="font-semibold">修正の提案が {pendingRequests.length} 件届いています</p>
          <ul className="space-y-3">
            {pendingRequests.map((req) => {
              const requester = state.users[req.uid]?.name ?? "ユーザー";
              const diffs = formatScenarioDiffs(sc, req.changes);
              return (
                <li key={req.id} className="rounded-lg border border-base-300 bg-base-100 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="grow">{requester} さんの提案</b>
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() => {
                        update((s) => {
                          const target = s.editRequests.find((r) => r.id === req.id);
                          if (target) target.status = "rejected";
                        });
                      }}
                    >
                      却下
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        update((s) => {
                          const targetSc = s.scenarios[sc.id];
                          const ch = req.changes;
                          if (targetSc && ch) {
                            if (ch.title !== undefined) targetSc.title = ch.title;
                            if (ch.author !== undefined) targetSc.author = ch.author || targetSc.author;
                            if (ch.systemId !== undefined) {
                              targetSc.systemId = ch.systemId;
                              targetSc.emoji = SYSTEMS[ch.systemId]?.short ?? targetSc.emoji;
                            }
                            if (ch.sourceUrl !== undefined) {
                              targetSc.sourceUrl = ch.sourceUrl || undefined;
                              targetSc.source = sourceFromUrl(ch.sourceUrl);
                            }
                            if (ch.tags !== undefined) targetSc.tags = ch.tags;
                            if (ch.description !== undefined) {
                              targetSc.description = ch.description || undefined;
                            }
                          }
                          const targetReq = s.editRequests.find((r) => r.id === req.id);
                          if (targetReq) targetReq.status = "accepted";
                        });
                      }}
                    >
                      {diffs.length > 0 ? "提案を反映" : "確認済みにする"}
                    </button>
                  </div>
                  {diffs.length > 0 && (
                    <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-xs sm:text-sm">
                      {diffs.map((d) => (
                        <div key={d.label} className="contents">
                          <dt className="text-ink2">{d.label}</dt>
                          <dd className="min-w-0 break-words">
                            <span className="text-ink3 line-through">{d.before}</span>
                            <span className="mx-1.5 text-ink3">→</span>
                            <span className="font-semibold">{d.after}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {req.note && (
                    <p data-user-content className="text-xs leading-relaxed text-ink2 sm:text-sm">
                      {req.note}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(sc.description || sc.tags.length > 0) && (
        <div className="mb-6 max-w-3xl">
          {sc.description && (
            <p data-user-content className="whitespace-pre-wrap text-sm leading-relaxed sm:text-base">
              {sc.description}
            </p>
          )}
          {sc.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink2">
              {sc.tags.map((t) => (
                <span key={t}>#{t}</span>
              ))}
            </p>
          )}
        </div>
      )}

      <SectionTitle
        right={
          needsSpoilerGuard && showSpoilers ? (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setShowSpoilers(false)}>
              <IconEyeOff width={14} height={14} /> 隠す
            </button>
          ) : undefined
        }
      >
        このシナリオのセッション
      </SectionTitle>
      {allLogs.length === 0 ? (
        <div className="surface">
          <EmptyState kind="first" title="このシナリオの記録はまだありません" />
        </div>
      ) : needsSpoilerGuard && !showSpoilers ? (
        <div className="surface">
          <EmptyState
            icon={<IconEyeOff width={28} height={28} />}
            title="ネタバレに配慮して隠しています"
            action={
              <button type="button" className="btn btn-sm" onClick={() => setShowSpoilers(true)}>
                セッションを表示
              </button>
            }
          >
            まだ遊んでいないシナリオです。セッションのタイトルや参加者を見ても大丈夫なら表示してください。
          </EmptyState>
        </div>
      ) : visibleLogs.length === 0 ? (
        <div className="surface">
          <EmptyState kind="permission" title="あなたが見られるセッションはありません" />
        </div>
      ) : (
        <>
          <div className="surface list">
            {shownLogs.map((l) => (
              <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} context="scenario" />
            ))}
          </div>
          <LoadMore
            shown={shownLogs.length}
            total={visibleLogs.length}
            step={SCENARIO_LOG_STEP}
            onMore={() => setVisibleLogCount((n) => n + SCENARIO_LOG_STEP)}
          />
        </>
      )}

      {editing && <EditScenarioModal sc={sc} onClose={() => setEditing(false)} />}
      {editRequest && <EditRequestModal sc={sc} onClose={() => setEditRequest(false)} />}
    </div>
  );
}

interface EditScenarioFormValues {
  title: string;
  author: string;
  tags: string;
  description: string;
}

function EditScenarioModal({
  sc,
  onClose,
}: {
  sc: ReturnType<typeof useStore>["state"]["scenarios"][string];
  onClose: () => void;
}) {
  const { update } = useStore();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EditScenarioFormValues>({
    mode: "onChange",
    defaultValues: {
      title: sc.title,
      author: sc.author,
      tags: sc.tags.join(", "),
      description: sc.description ?? "",
    },
  });

  function onSubmit(values: EditScenarioFormValues) {
    update((s) => {
      const x = s.scenarios[sc.id]!;
      x.title = values.title.trim();
      x.author = values.author.trim() || x.author;
      x.tags = values.tags
        .split(/[,、]/)
        .map((t) => t.trim())
        .filter(Boolean);
      x.description = values.description.trim() || undefined;
    });
    onClose();
  }

  return (
    <Modal
      title="シナリオを編集"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isValid}
            onClick={handleSubmit(onSubmit)}
          >
            保存
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Field label="タイトル" noMargin>
          <input
            className={cx("input input-bordered w-full", errors.title && "input-error")}
            aria-invalid={errors.title ? "true" : undefined}
            {...register("title", {
              validate: (v) => v.trim().length > 0 || "タイトルを入力してください",
            })}
          />
        </Field>
        {errors.title?.message && (
          <p role="alert" className="text-xs text-error mt-1.5">
            {errors.title.message}
          </p>
        )}
        <Field label="作者・サークル">
          <input className="input input-bordered w-full" {...register("author")} />
        </Field>
        <Field label="キーワード" hint="読点かカンマで区切る">
          <input className="input input-bordered w-full" {...register("tags")} />
        </Field>
        <Field label="概要">
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={3}
            {...register("description")}
          />
        </Field>
      </form>
    </Modal>
  );
}

interface EditRequestFormValues {
  title: string;
  author: string;
  systemId: string;
  sourceUrl: string;
  tags: string;
  description: string;
  note: string;
}

function EditRequestModal({
  sc,
  onClose,
}: {
  sc: ReturnType<typeof useStore>["state"]["scenarios"][string];
  onClose: () => void;
}) {
  const { state, update } = useStore();
  const [formError, setFormError] = useState<string | null>(null);
  const pending = state.editRequests.some(
    (r) => r.scenarioId === sc.id && r.uid === state.me && r.status === "pending",
  );
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EditRequestFormValues>({
    mode: "onChange",
    defaultValues: {
      title: sc.title,
      author: sc.author,
      systemId: sc.systemId,
      sourceUrl: sc.sourceUrl ?? "",
      tags: sc.tags.join(", "),
      description: sc.description ?? "",
      note: "",
    },
  });

  function onSubmit(values: EditRequestFormValues) {
    if (pending) return;
    const changes: ScenarioEditChanges = {};
    const nextTitle = values.title.trim();
    const nextAuthor = values.author.trim();
    const nextUrl = values.sourceUrl.trim();
    const nextTags = values.tags
      .split(/[,、]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const nextDesc = values.description.trim();
    const nextNote = values.note.trim();

    if (nextTitle && nextTitle !== sc.title) changes.title = nextTitle;
    if (nextAuthor && nextAuthor !== sc.author) changes.author = nextAuthor;
    if (values.systemId !== sc.systemId) changes.systemId = values.systemId;
    if (nextUrl !== (sc.sourceUrl ?? "")) changes.sourceUrl = nextUrl;
    if (nextTags.join(", ") !== sc.tags.join(", ")) changes.tags = nextTags;
    if (nextDesc !== (sc.description ?? "")) changes.description = nextDesc;

    if (Object.keys(changes).length === 0 && !nextNote) {
      setFormError("変更箇所または補足メモを入力してください");
      return;
    }
    setFormError(null);
    update((s) => {
      s.editRequests.push({
        id: `er_${uid()}`,
        scenarioId: sc.id,
        uid: s.me,
        at: new Date().toISOString(),
        changes: Object.keys(changes).length > 0 ? changes : undefined,
        note: nextNote || undefined,
        status: "pending",
      });
    });
    onClose();
  }

  return (
    <Modal
      title="シナリオ情報の修正を提案"
      wide
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || Boolean(errors.title)}
            onClick={handleSubmit(onSubmit)}
          >
            {pending ? "送信済み" : "提案を送る"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Field label="タイトル" noMargin>
          <input
            className={cx("input input-bordered w-full", errors.title && "input-error")}
            aria-invalid={errors.title ? "true" : undefined}
            {...register("title", {
              validate: (v) => v.trim().length > 0 || "タイトルを入力してください",
            })}
          />
        </Field>
        {errors.title?.message && (
          <p role="alert" className="text-xs text-error mt-1.5">
            {errors.title.message}
          </p>
        )}
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="システム">
            <Controller
              name="systemId"
              control={control}
              render={({ field }) => (
                <Select
                  ariaLabel="システム"
                  value={field.value}
                  options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={field.onChange}
                  className="w-full"
                />
              )}
            />
          </Field>
          <Field label="作者・サークル">
            <input className="input input-bordered w-full" {...register("author")} />
          </Field>
        </div>
        <Field label="配布ページのURL（任意）">
          <input
            type="url"
            inputMode="url"
            className="input input-bordered w-full"
            {...register("sourceUrl")}
          />
        </Field>
        <Field label="キーワード" hint="読点かカンマで区切る">
          <input className="input input-bordered w-full" {...register("tags")} />
        </Field>
        <Field label="概要">
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={3}
            {...register("description")}
          />
        </Field>
        <Field label="変更の理由・補足（任意）">
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={2}
            placeholder="例: 表記ゆれの修正、配布先リンクの更新"
            {...register("note")}
          />
        </Field>
        {formError && (
          <p role="alert" className="text-xs text-error mt-2">
            {formError}
          </p>
        )}
        {pending && (
          <p className="text-xs text-warning mt-2">このシナリオにはすでにあなたの提案があります。</p>
        )}
      </form>
    </Modal>
  );
}

const BG = ["#efe6d8", "#e8dfd5", "#ede4d7", "#f0e1dc", "#f0e6d2", "#e7eadc", "#e6e2da"];

interface ScenarioNewFormValues {
  title: string;
  author: string;
  systemId: string;
  sourceUrl: string;
  tags: string;
  description: string;
}

export function ScenarioNew() {
  const { update } = useStore();
  const nav = useNavigate();
  const urlParam = useSearchParam("url");
  const titleParam = useSearchParam("title");
  /** URL からの読み込みが主。手で入れる欄は、読み込めたときか「手で入力する」を押したときだけ出す */
  const [formOpen, setFormOpen] = useState(Boolean(titleParam));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState<ExternalSyncConfig | null>(null);
  const {
    register,
    control,
    getValues,
    setValue,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ScenarioNewFormValues>({
    mode: "onChange",
    defaultValues: {
      title: titleParam ?? "",
      author: "",
      systemId: "coc7",
      sourceUrl: urlParam ?? "",
      tags: "",
      description: "",
    },
  });

  async function importFromScenarioUrl() {
    const rawUrl = getValues("sourceUrl").trim();
    if (!rawUrl || urlBusy) return;
    setUrlBusy(true);
    setUrlError(null);
    try {
      const res = await fetch("/api/import/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: rawUrl }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        kind?: string;
        provider?: ExternalSyncProvider;
        url?: string;
        contentHash?: string;
        fetchedAt?: string;
        scenario?: ImportedScenario;
        error?: string;
      };
      if (!res.ok || !data.ok || data.kind !== "scenario" || !data.scenario || !data.provider) {
        setUrlError(data.error ?? "シナリオページの情報を読み取れませんでした。");
        return;
      }
      const sc = data.scenario;
      setValue("title", sc.title, { shouldValidate: true, shouldDirty: true });
      if (sc.author) setValue("author", sc.author, { shouldDirty: true });
      if (sc.systemId && SYSTEMS[sc.systemId]) {
        setValue("systemId", sc.systemId, { shouldDirty: true });
      }
      if (sc.sourceUrl) setValue("sourceUrl", sc.sourceUrl, { shouldDirty: true });
      if (sc.tags.length > 0) setValue("tags", sc.tags.join(", "), { shouldDirty: true });
      if (sc.description) setValue("description", sc.description, { shouldDirty: true });
      if (sc.tags.length > 0 || sc.description) setDetailsOpen(true);
      setFormOpen(true);
      setPendingSync({
        provider: data.provider,
        url: data.url ?? rawUrl,
        lastSyncedAt: data.fetchedAt ?? new Date().toISOString(),
        lastStatus: "ok",
        contentHash: data.contentHash,
        autoSync: false,
      });
    } catch {
      setUrlError("配布ページの情報を読み込めませんでした。URL をお確かめください。");
    } finally {
      setUrlBusy(false);
    }
  }

  // 一覧の検索に URL を貼って見つからなかったときは、そのまま読み込む
  const autoImported = useRef(false);
  useEffect(() => {
    if (!urlParam || autoImported.current) return;
    autoImported.current = true;
    void importFromScenarioUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam]);

  function onSubmit(values: ScenarioNewFormValues) {
    const id = `sc_${uid()}`;
    update((s) => {
      s.scenarios[id] = {
        id,
        title: values.title.trim(),
        author: values.author.trim() || "作者未設定",
        systemId: values.systemId,
        source: sourceFromUrl(values.sourceUrl),
        sourceUrl: values.sourceUrl.trim() || undefined,
        policy: "public",
        emoji: SYSTEMS[values.systemId]?.short ?? "汎用",
        bg: BG[Object.keys(s.scenarios).length % BG.length]!,
        tags: values.tags
          .split(/[,、]/)
          .map((t) => t.trim())
          .filter(Boolean),
        description: values.description.trim() || undefined,
        claimedBy: null,
        addedBy: "user",
        addedByUid: s.me,
        ...(pendingSync && values.sourceUrl.trim() ? { externalSync: pendingSync } : {}),
      };
    });
    nav({ to: `/scenarios/${id}` });
  }

  return (
    <div className="max-w-4xl">
      <PageHead back={{ to: "/scenarios", label: "シナリオ" }} title="シナリオを追加" />
      <form className="surface px-5 py-5 sm:px-6" onSubmit={handleSubmit(onSubmit)}>
        <Field
          label="配布ページのURL"
          hint="BOOTH・TALTO の商品ページから、タイトル・作者・システム・概要を読み込みます"
          noMargin
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="url"
              inputMode="url"
              className="input input-bordered w-full"
              placeholder="https://booth.pm/ja/items/…"
              autoFocus={!formOpen}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void importFromScenarioUrl();
                }
              }}
              {...register("sourceUrl")}
            />
            <button
              type="button"
              className={cx("btn shrink-0", !formOpen && "btn-primary")}
              disabled={urlBusy}
              onClick={() => void importFromScenarioUrl()}
            >
              {urlBusy ? "読み込み中…" : "URLから読み込む"}
            </button>
          </div>
        </Field>
        {urlError && (
          <p role="alert" className="mt-1.5 text-xs text-error">
            {urlError}
          </p>
        )}
        {!formOpen && (
          <div className="mt-5 flex flex-wrap items-center gap-x-2 border-t border-base-300 pt-4 text-sm text-ink2">
            配布ページがないシナリオは
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setFormOpen(true)}>
              手で入力する
            </button>
          </div>
        )}
        {formOpen && (
          <div className="mt-5 border-t border-base-300 pt-4">
            <Field label="タイトル" noMargin>
              <input
                className={cx("input input-bordered w-full", errors.title && "input-error")}
                aria-invalid={errors.title ? "true" : undefined}
                placeholder="例: 廃校の十三時間目"
                autoFocus={Boolean(titleParam) || undefined}
                {...register("title", {
                  validate: (v) => v.trim().length > 0 || "タイトルを入力してください",
                })}
              />
            </Field>
            {errors.title?.message && (
              <p role="alert" className="text-xs text-error mt-1.5">
                {errors.title.message}
              </p>
            )}
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="システム">
                <Controller
                  name="systemId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      ariaLabel="システム"
                      value={field.value}
                      options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
                      onChange={field.onChange}
                      className="w-full"
                    />
                  )}
                />
              </Field>
              <Field label="作者・サークル">
                <input
                  className="input input-bordered w-full"
                  placeholder="例: しおかぜ堂"
                  {...register("author")}
                />
              </Field>
            </div>
            <details
              open={detailsOpen}
              onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
              className="group mt-5 border-t border-base-300 pt-4"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-ink2 hover:text-base-content">
                <span className="group-open:hidden">＋ 概要とキーワードを追加</span>
                <span className="hidden group-open:inline">概要とキーワード</span>
              </summary>
              <Field label="概要" hint="ネタバレにならない範囲で">
                <textarea
                  className="textarea textarea-bordered w-full text-sm"
                  rows={3}
                  {...register("description")}
                />
              </Field>
              <Field label="キーワード" hint="読点かカンマで区切る">
                <input
                  className="input input-bordered w-full"
                  placeholder="例: 学校, クローズド"
                  {...register("tags")}
                />
              </Field>
            </details>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => nav({ to: "/scenarios" })}>
            キャンセル
          </button>
          {formOpen && (
            <button type="submit" className="btn btn-primary" disabled={!isValid}>
              追加する
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
