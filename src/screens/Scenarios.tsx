import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "../lib/router";
import { Controller, useForm } from "react-hook-form";
import type { Control } from "react-hook-form";
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
  Modal,
  NotFound,
  PageHead,
  SCOPE_META,
  SectionTitle,
  Seg,
  Select,
  SysBadge,
  cx,
} from "../components/ui";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { evaluateShareGate } from "../lib/share-gate";
import { fmtDur, sessionPlayMinutes, uid } from "../lib/time";
import { useStore } from "../store";
import type { Policy, Scenario } from "../types";
import { SessionRow } from "./Sessions";

type ScenarioVisibility = "public" | "passed" | "members";

/** シナリオの公開範囲は「このシナリオで記録したセッションの共有範囲の初期値」として働く */
const SCENARIO_VISIBILITY_OPTIONS: readonly { value: ScenarioVisibility; label: string; hint: string }[] = (
  ["public", "passed", "members"] as const
).map((v) => ({ value: v, label: SCOPE_META[v].label, hint: SCOPE_META[v].hint }));

const VISIBILITY_FIELD_HINT = "このシナリオでセッションを記録するときの共有範囲の初期値です。";

function normalizeScenarioVisibility(policy: Policy | string | undefined): ScenarioVisibility {
  if (policy === "public" || policy === "passed" || policy === "members") return policy;
  return "passed";
}

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

export default function Scenarios() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");
  const [played, setPlayed] = useState<PlayedFilter>("all");

  const rows = useMemo(() => {
    const viewer = state.entered ? state.me : null;
    return Object.values(state.scenarios).map((s) => {
      const logs = Object.values(state.logs).filter((l) => l.scenarioId === s.id);
      const visible = logs.filter((l) => evaluateShareGate(l, viewer).visible);
      const mine = logs.filter((l) => l.ownerId === state.me || Boolean(l.players[state.me]));
      const last = visible.reduce((m, l) => Math.max(m, l.t0), 0);
      return { s, mine, last };
    });
  }, [state.scenarios, state.logs, state.entered, state.me]);

  const usedSystems = useMemo(() => new Set(rows.map((r) => r.s.systemId)), [rows]);

  const list = useMemo(() => {
    let items = rows;
    if (sys !== "all") items = items.filter((r) => r.s.systemId === sys);
    if (played === "played") items = items.filter((r) => r.mine.length > 0);
    if (played === "unplayed") items = items.filter((r) => r.mine.length === 0);
    if (q.trim()) {
      const query = q.trim().toLowerCase();
      items = items.filter((r) => (r.s.title + r.s.author + r.s.tags.join()).toLowerCase().includes(query));
    }
    return [...items].sort((a, b) => b.last - a.last || a.s.title.localeCompare(b.s.title, "ja"));
  }, [rows, q, sys, played]);

  const filtered = q.trim() !== "" || sys !== "all" || played !== "all";

  return (
    <>
      <PageHead
        title="シナリオ"
        actions={
          <button className="btn btn-primary" onClick={() => nav({ to: "/scenarios/new" })}>
            <IconPlus width={16} height={16} /> シナリオを追加
          </button>
        }
      />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="input flex flex-1 items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-2">
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
              className="min-w-0 flex-1 sm:w-56 sm:flex-none"
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
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setQ("");
                    setSys("all");
                    setPlayed("all");
                  }}
                >
                  絞り込みを解除
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => nav({ to: "/scenarios/new" })}>
                  <IconPlus width={16} height={16} /> シナリオを追加
                </button>
              )
            }
          />
        </div>
      ) : (
        <div className="surface list">
          {list.map(({ s, mine }) => {
            const sysDef = SYSTEMS[s.systemId];
            return (
              <Link
                key={s.id}
                to={`/scenarios/${s.id}`}
                className="row-interactive flex items-center gap-4 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold leading-snug">{s.title}</h3>
                  <div className="meta mt-0.5 text-xs sm:text-sm">
                    <SysBadge sys={sysDef} />
                    <span className="truncate">{s.author}</span>
                  </div>
                </div>
                {mine.length > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium sm:text-sm">
                    <IconCheck width={14} height={14} className="text-success" aria-hidden /> 通過済み
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ScenarioDetail() {
  const { id } = useParams<{ id?: string }>();
  const { state, update, authUser } = useStore();
  const nav = useNavigate();
  const [editRequest, setEditRequest] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showSpoilers, setShowSpoilers] = useState(false);

  const sc = state.scenarios[id ?? ""];
  if (!sc) return <NotFound what="シナリオ" />;
  const sys = SYSTEMS[sc.systemId];
  const visibility = normalizeScenarioVisibility(sc.policy);
  const allLogs = Object.values(state.logs)
    .filter((l) => l.scenarioId === sc.id)
    .sort((a, b) => b.t0 - a.t0);
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
  const record = () => nav({ to: `/upload?scenario=${sc.id}` });

  return (
    <>
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
              <span className="inline-flex items-center gap-1 font-semibold text-success">
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
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-box border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
          <span className="grow">
            {pendingRequests.map((r) => state.users[r.uid]?.name ?? "ユーザー").join("・")}
            さんから情報の修正依頼が {pendingRequests.length} 件届いています。
          </span>
          <button
            className="btn btn-sm"
            onClick={() => {
              update((s) => {
                s.editRequests.forEach((r) => {
                  if (r.scenarioId === sc.id) r.status = "accepted";
                });
              });
            }}
          >
            確認済みにする
          </button>
        </div>
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
        sub={canEdit ? `共有範囲の初期値: ${SCOPE_META[visibility].label}` : undefined}
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
        <div className="surface list">
          {visibleLogs.map((l) => (
            <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} context="scenario" />
          ))}
        </div>
      )}

      {editing && <EditScenarioModal sc={sc} onClose={() => setEditing(false)} />}
      {editRequest && <EditRequestModal sc={sc} onClose={() => setEditRequest(false)} />}
    </>
  );
}

interface EditScenarioFormValues {
  title: string;
  author: string;
  policy: ScenarioVisibility;
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
    control,
    watch,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EditScenarioFormValues>({
    mode: "onChange",
    defaultValues: {
      title: sc.title,
      author: sc.author,
      policy: normalizeScenarioVisibility(sc.policy),
      tags: sc.tags.join(", "),
      description: sc.description ?? "",
    },
  });

  const policy = watch("policy");

  function onSubmit(values: EditScenarioFormValues) {
    update((s) => {
      const x = s.scenarios[sc.id]!;
      x.title = values.title.trim();
      x.author = values.author.trim() || x.author;
      x.policy = values.policy as Policy;
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
        <PolicyField control={control} policy={policy} />
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
  const pending = state.editRequests.some(
    (r) => r.scenarioId === sc.id && r.uid === state.me && r.status === "pending",
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EditRequestFormValues>({
    mode: "onChange",
    defaultValues: { note: "" },
  });

  function onSubmit(values: EditRequestFormValues) {
    if (pending) return;
    update((s) => {
      s.editRequests.push({
        id: `er_${uid()}`,
        scenarioId: sc.id,
        uid: s.me,
        at: new Date().toISOString(),
        note: values.note.trim() || undefined,
        status: "pending",
      });
    });
    onClose();
  }

  return (
    <Modal
      title="シナリオ情報の修正を依頼"
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !isValid}
            onClick={handleSubmit(onSubmit)}
          >
            {pending ? "依頼済み" : "依頼を送る"}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Field label="修正したい内容" noMargin>
          <textarea
            className={cx("textarea textarea-bordered w-full text-sm", errors.note && "textarea-error")}
            rows={3}
            aria-invalid={errors.note ? "true" : undefined}
            placeholder="例: 作者名の表記を『しおかぜ堂』に修正したい"
            {...register("note", {
              validate: (v) => v.trim().length > 0 || "修正したい内容を入力してください",
            })}
          />
        </Field>
        {errors.note?.message && (
          <p role="alert" className="text-xs text-error mt-1.5">
            {errors.note.message}
          </p>
        )}
        {pending && (
          <p className="text-xs text-warning mt-2">このシナリオにはすでにあなたの依頼があります。</p>
        )}
      </form>
    </Modal>
  );
}

/** 共有範囲の初期値を選ぶ欄（追加・編集で共通） */
function PolicyField({ control, policy }: { control: Control<any>; policy: ScenarioVisibility }) {
  return (
    <div className="mt-4">
      <span className="block text-sm font-semibold">共有範囲の初期値</span>
      <div className="mt-1.5">
        <Controller
          name="policy"
          control={control}
          render={({ field }) => (
            <Seg<ScenarioVisibility>
              ariaLabel="共有範囲の初期値"
              value={field.value}
              onChange={field.onChange}
              options={SCENARIO_VISIBILITY_OPTIONS.map((o) => ({ v: o.value, label: o.label }))}
            />
          )}
        />
      </div>
      <p className="mt-1.5 text-xs leading-5 text-ink2">
        {SCENARIO_VISIBILITY_OPTIONS.find((o) => o.value === policy)?.hint}。{VISIBILITY_FIELD_HINT}
      </p>
    </div>
  );
}

const BG = ["#efe6d8", "#e8dfd5", "#ede4d7", "#f0e1dc", "#f0e6d2", "#e7eadc", "#e6e2da"];

interface ScenarioNewFormValues {
  title: string;
  author: string;
  systemId: string;
  policy: ScenarioVisibility;
  sourceUrl: string;
  tags: string;
  description: string;
}

export function ScenarioNew() {
  const { update } = useStore();
  const nav = useNavigate();
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ScenarioNewFormValues>({
    mode: "onChange",
    defaultValues: {
      title: "",
      author: "",
      systemId: "coc7",
      policy: "passed",
      sourceUrl: "",
      tags: "",
      description: "",
    },
  });

  const policy = watch("policy");

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
        policy: values.policy as Policy,
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
      };
    });
    nav({ to: `/scenarios/${id}` });
  }

  return (
    <div className="max-w-2xl">
      <PageHead back={{ to: "/scenarios", label: "シナリオ" }} title="シナリオを追加" />
      <form className="surface px-5 py-5 sm:px-6" onSubmit={handleSubmit(onSubmit)}>
        <Field label="タイトル" noMargin>
          <input
            className={cx("input input-bordered w-full", errors.title && "input-error")}
            aria-invalid={errors.title ? "true" : undefined}
            placeholder="例: 廃校の十三時間目"
            autoFocus
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
        <Field label="配布ページのURL（任意）" hint="BOOTH・TALTO などのページ">
          <input
            type="url"
            inputMode="url"
            className="input input-bordered w-full"
            placeholder="https://booth.pm/ja/items/…"
            {...register("sourceUrl")}
          />
        </Field>
        <PolicyField control={control} policy={policy} />
        <details className="group mt-5 border-t border-base-300 pt-4">
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
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => nav({ to: "/scenarios" })}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={!isValid}>
            追加する
          </button>
        </div>
      </form>
    </div>
  );
}
