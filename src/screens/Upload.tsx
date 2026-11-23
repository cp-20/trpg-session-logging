import { useMemo, useState } from "react";
import { useNavigate, useSearchString } from "../lib/router";
import { useStore } from "../store";
import {
  Combobox,
  type ComboboxOption,
  CompletionModal,
  FieldError,
  FormRow,
  NotFound,
  PageHead,
  ScopeLabel,
  ScopePicker,
  ScoreInscription,
  Select,
  SittingsInput,
  SplitLayout,
  SysBadge,
  cx,
  Seg,
} from "../components/ui";
import {
  Avatar,
  AvatarStack,
  PlayerPicker,
  characterAvatarSrc,
  readAvatarImageFile,
  resolveSpeakerAvatarSrc,
  userAvatarSrc,
} from "../components/identity";
import { SessionTimeline, type TimelineFilter } from "../components/timeline";
import { SYSTEMS } from "../data/systems";
import {
  directoryToScenario,
  scenarioToDirectory,
  withoutKnown,
  type DirectoryScenario,
} from "../lib/scenario-directory";
import { useScenarioSearch } from "../lib/use-scenario-directory";
import { sessionTitle } from "../lib/session-scenario";
import { scoreMarks } from "../lib/score-marks";
import { roleLabel, speakerRoleOptions } from "../lib/roles";
import { recentSystemIds, systemOptions } from "../lib/system-options";
import { fmtSessionWhen, todayStr } from "../lib/time";
import {
  deriveSittings,
  nextSittingFields,
  sittingToFields,
  sittingsFromFields,
  type SittingFields,
} from "../lib/sittings";
import {
  LOG_FILE_ACCEPT,
  SUPPORTED_LOG_FORMATS_LABEL,
  UNSUPPORTED_LOG_MESSAGE,
  importLogFromFile,
} from "../lib/importers";
import { mergeLogParts } from "../lib/log-merge";
import { commitLogImport, type CommitLogResult } from "../api/commands";
import { useTableDiscord } from "../components/discord";
import { discordClient } from "../lib/discord/client";
import { buildDraft as buildDraftWith, carryDraftEdits, type Draft } from "../lib/speaker-match";
import type { Channel, Character, Log, MsgKind, SelfRole, State, User } from "../types";
import {
  IconBrandX,
  IconDiscord,
  IconCalendar,
  IconFileText,
  IconLink,
  IconPlus,
  IconUpload,
  IconX,
} from "../components/icons";
import { ReportCardModal } from "./SessionDetail";

/** 発言者の顔アイコンは、紐付いたキャラクター・ユーザーの画像を使う */
const buildDraft = (opts: Omit<Parameters<typeof buildDraftWith>[0], "avatars">) =>
  buildDraftWith({ ...opts, avatars: { character: characterAvatarSrc, user: userAvatarSrc } });

/** 読み込んだログ 1 ファイル分。複数あれば 1 つのセッションにまとめる */
type LogFilePart = { fileName: string; channels: Channel[] };

type FlowError = { field: "scenario" | "sittings" | "general"; text: string; index?: number } | null;

const rowsFor = (d: Draft): SittingFields[] =>
  d.sittings.length > 0 ? d.sittings.map(sittingToFields) : [nextSittingFields([], todayStr())];

export default function Upload() {
  const { state, update } = useStore();
  const nav = useNavigate();
  const searchStr = useSearchString();
  const sp = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const attachId = sp.get("log");
  const presetTable = sp.get("table") ?? "";
  const presetScenario = sp.get("scenario") ?? "";
  const attachLog = attachId ? state.logs[attachId] : null;

  const freshDraft = (parts: LogFilePart[]) =>
    buildDraft({
      fileNames: parts.map((p) => p.fileName),
      channels: parts.length > 0 ? mergeLogParts(parts) : [],
      attachLog,
      presetTable,
      presetScenario,
      state,
    });

  const [parts, setParts] = useState<LogFilePart[]>([]);
  const [draft, setDraftState] = useState<Draft | null>(() =>
    sp.get("manual") === "1" && !attachId ? freshDraft([]) : null,
  );
  /** 遊んだ日時の入力欄。ログの発言時刻から導いた値を入れておき、そのまま直せる */
  const [sittingRows, setSittingRows] = useState<SittingFields[]>(() => (draft ? rowsFor(draft) : []));
  const [result, setResult] = useState<CommitLogResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<FlowError>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  function setDraft(d: Draft) {
    setDraftState(d);
    if (error?.field === "scenario" && (d.scenarioId || d.newScenario?.title.trim())) setError(null);
  }

  function applyParts(next: LogFilePart[]) {
    const fresh = freshDraft(next);
    const d = draft ? carryDraftEdits(draft, fresh) : fresh;
    setParts(next);
    setDraftState(d);
    setSittingRows(rowsFor(d));
    setError(null);
  }

  async function addFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setLoading(true);
    setLoadError(null);
    const read: LogFilePart[] = [];
    const failed: string[] = [];
    for (const f of list) {
      try {
        const res = await importLogFromFile(f);
        if (res && res.log.messageCount > 0) read.push({ fileName: f.name, channels: res.log.channels });
        else failed.push(f.name);
      } catch {
        failed.push(f.name);
      }
    }
    setLoading(false);
    if (failed.length > 0) setLoadError(`「${failed.join("」「")}」を${UNSUPPORTED_LOG_MESSAGE}`);
    if (read.length > 0) applyParts([...parts, ...read]);
  }

  async function loadSample() {
    setLoading(true);
    try {
      const { SAMPLE_LOG } = await import("../data/seed");
      applyParts([
        { fileName: "サンプルログ", channels: JSON.parse(JSON.stringify(SAMPLE_LOG)) as Channel[] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function startManual() {
    const d = freshDraft([]);
    setParts([]);
    setDraftState(d);
    setSittingRows(rowsFor(d));
    setLoadError(null);
  }

  function repick() {
    setParts([]);
    setDraftState(null);
    setError(null);
    setLoadError(null);
  }

  async function handleCommit() {
    if (!draft || committing) return;
    // セッションはシナリオの題名で呼ぶので、シナリオは必ず要る
    if (!state.scenarios[draft.scenarioId] && !draft.newScenario?.title.trim()) {
      setError({ field: "scenario", text: "遊んだシナリオを選ぶか、名前を打って追加してください。" });
      document.getElementById("upload-scenario")?.focus();
      return;
    }
    const parsed = sittingsFromFields(sittingRows);
    if (!parsed.ok) {
      setError({ field: "sittings", text: parsed.error, index: parsed.index });
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      const r = await commitLogImport(
        {
          fileName: draft.fileNames.length > 0 ? draft.fileNames.join("、") : null,
          attachId,
          meta: draft.meta,
          channels: draft.channels,
          kinds: draft.kinds,
          speakerIcons: draft.speakerIcons,
          scope: draft.scope,
          tableId: draft.tableId,
          scenarioId: draft.scenarioId,
          newScenario: draft.newScenario,
          // 記録する本人は、遊んでいないと外したときだけ参加者に入れない
          players: [
            ...(draft.self.played
              ? [{ userId: state.me, characterIds: draft.self.characterIds, role: draft.self.role }]
              : []),
            ...draft.players.filter((p) => p.userId !== state.me),
          ],
          sittings: parsed.sittings,
        },
        state,
        update,
      );
      if (!r.ok) {
        setError({
          field: "general",
          text: r.reason ?? "記録できませんでした。入力内容を確認して、もう一度お試しください。",
        });
        return;
      }
      setResult(r);
    } catch {
      setError({
        field: "general",
        text: "記録できませんでした。入力内容は保持されています。もう一度お試しください。",
      });
    } finally {
      setCommitting(false);
    }
  }

  if (attachId && !attachLog) return <NotFound what="添付先のセッション" />;

  const backTo = attachLog
    ? { to: `/sessions/${attachLog.id}`, label: sessionTitle(attachLog, state.scenarios) }
    : presetTable
      ? { to: `/tables/${presetTable}`, label: state.tables[presetTable]?.name ?? "卓" }
      : { to: "/sessions", label: "セッション" };

  return (
    <div>
      <PageHead
        back={backTo}
        title={attachLog ? "ログを添付" : "セッションを記録"}
        sub={attachLog ? <>「{sessionTitle(attachLog, state.scenarios)}」にログを添付します。</> : undefined}
      />
      <div key={draft ? "review" : "pick"} className="motion-enter">
        {!draft ? (
          <PickLog
            attach={Boolean(attachLog)}
            loading={loading}
            error={loadError}
            onFiles={addFiles}
            onSample={loadSample}
            onManual={startManual}
          />
        ) : (
          <Review
            draft={draft}
            setDraft={setDraft}
            parts={parts}
            sittingRows={sittingRows}
            setSittingRows={(rows) => {
              setSittingRows(rows);
              if (error?.field === "sittings") setError(null);
            }}
            loading={loading}
            loadError={loadError}
            onAddFiles={addFiles}
            onRemovePart={(i) => applyParts(parts.filter((_, idx) => idx !== i))}
            onRepick={repick}
            attach={Boolean(attachLog)}
            committing={committing}
            error={error}
            onCommit={handleCommit}
          />
        )}
      </div>
      {result && (
        <RecordedModal
          result={result}
          attach={Boolean(attachLog)}
          onClose={() => nav({ to: `/sessions/${result.id}` })}
        />
      )}
    </div>
  );
}

/* ================= ログを選ぶ ================= */
function PickLog({
  attach,
  loading,
  error,
  onFiles,
  onSample,
  onManual,
}: {
  attach: boolean;
  loading: boolean;
  error: string | null;
  onFiles: (files: FileList | null) => void;
  onSample: () => void;
  onManual: () => void;
}) {
  const [hot, setHot] = useState(false);
  return (
    <section className="surface p-4 sm:p-6" aria-label="ログを選ぶ">
      <div
        className={cx("drop py-12", hot && "hot", loading && "pointer-events-none opacity-70")}
        onDragOver={(e) => {
          e.preventDefault();
          setHot(true);
        }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => {
          e.preventDefault();
          setHot(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconUpload width={24} height={24} aria-hidden />
        </span>
        <p className="mt-4 text-base font-bold">ログファイルをここにドロップ</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink2">{SUPPORTED_LOG_FORMATS_LABEL}</p>
        <label className={cx("btn btn-primary mt-5 cursor-pointer", loading && "btn-disabled")}>
          <IconFileText width={18} height={18} aria-hidden />
          ファイルを選ぶ
          <input
            type="file"
            multiple
            aria-label="ログファイルを選ぶ"
            accept={LOG_FILE_ACCEPT}
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {loading && (
          <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm text-ink2">
            <span className="loading loading-spinner loading-sm" aria-hidden />
            読み込み中…
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-4">
        <button type="button" className="btn btn-quiet btn-sm" disabled={loading} onClick={onSample}>
          サンプルログで試す
        </button>
        {!attach && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onManual}>
            <IconCalendar width={16} height={16} aria-hidden />
            ログなしで記録する
          </button>
        )}
      </div>
    </section>
  );
}

/** ログを足す（複数選べる）ファイル選択。見た目は低い段のボタン */
function AddLogButton({
  label,
  loading,
  onFiles,
}: {
  label: string;
  loading: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label className={cx("btn btn-quiet btn-sm cursor-pointer", loading && "btn-disabled")}>
      {loading ? (
        <span className="loading loading-spinner loading-xs" aria-hidden />
      ) : (
        <IconPlus width={16} height={16} aria-hidden />
      )}
      {label}
      <input
        type="file"
        multiple
        aria-label={label}
        accept={LOG_FILE_ACCEPT}
        className="sr-only"
        disabled={loading}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/* ================= 内容を確かめて記録する ================= */
function Review({
  draft,
  setDraft,
  parts,
  sittingRows,
  setSittingRows,
  loading,
  loadError,
  onAddFiles,
  onRemovePart,
  onRepick,
  attach,
  committing,
  error,
  onCommit,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  parts: LogFilePart[];
  sittingRows: SittingFields[];
  setSittingRows: (rows: SittingFields[]) => void;
  loading: boolean;
  loadError: string | null;
  onAddFiles: (files: FileList | null) => void;
  onRemovePart: (index: number) => void;
  onRepick: () => void;
  attach: boolean;
  committing: boolean;
  error: FlowError;
  onCommit: () => void;
}) {
  const { state } = useStore();
  const hasLog = draft.channels.length > 0;
  const recentSystems = useMemo(() => recentSystemIds(Object.values(state.logs)), [state.logs]);
  const scenario = state.scenarios[draft.scenarioId];

  const speakers = useMemo(
    () => Object.entries(draft.kinds).map(([sp, kind]) => ({ sp, kind })),
    [draft.kinds],
  );
  const previewLog = useMemo(
    () =>
      ({
        channels: draft.channels.map((c) => ({
          ...c,
          msgs: c.msgs.map((m) => ({ ...m, kind: draft.kinds[m.sp] ?? m.kind })),
        })),
        speakerIcons: draft.speakerIcons,
      }) as unknown as Log,
    [draft.channels, draft.kinds, draft.speakerIcons],
  );
  const previewFilter: TimelineFilter = { query: "", channel: "all" };

  const sourceSection = (
    <section className="surface px-4 py-3.5 sm:px-5" aria-labelledby="src-head">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="src-head" className="text-base font-bold">
          ログ
        </h2>
        {!hasLog && <span className="text-sm text-ink2">なし</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <AddLogButton label={hasLog ? "ログを足す" : "ログを添付"} loading={loading} onFiles={onAddFiles} />
          {hasLog && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onRepick}>
              選び直す
            </button>
          )}
        </div>
      </div>
      {parts.length > 0 && (
        <ul className="list mt-2">
          {parts.map((p, i) => {
            const when = deriveSittings(p.channels);
            return (
              <li key={`${p.fileName}-${i}`} className="motion-insert flex items-center gap-3 py-2">
                <IconFileText width={18} height={18} className="shrink-0 text-ink2" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.fileName}</span>
                  <span className="block text-xs tabular-nums text-ink2">
                    {when.length > 0 ? fmtSessionWhen({ sittings: when }) : "発言の時刻なし"}
                  </span>
                </span>
                {parts.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${p.fileName}を外す`}
                    onClick={() => onRemovePart(i)}
                  >
                    <IconX width={16} height={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {loadError && (
        <p role="alert" className="mt-2 text-sm text-error">
          {loadError}
        </p>
      )}
    </section>
  );

  const basicSection = (
    <section className="surface p-5 sm:p-6" aria-labelledby="sum-head">
      <h2 id="sum-head" className="mb-4 text-base font-bold">
        基本情報
      </h2>
      <div className="list">
        <FormRow label="シナリオ">
          <ScenarioField draft={draft} setDraft={setDraft} invalid={error?.field === "scenario"} />
          <FieldError text={error?.field === "scenario" ? error.text : null} />
        </FormRow>
        <FormRow label="遊んだ日時">
          <SittingsInput
            rows={sittingRows}
            onChange={setSittingRows}
            invalidIndex={error?.field === "sittings" ? error.index : null}
          />
          <FieldError text={error?.field === "sittings" ? error.text : null} />
        </FormRow>
        <FormRow label="システム">
          <Combobox
            ariaLabel="システム"
            className="w-full sm:max-w-sm"
            value={draft.meta.systemId}
            onChange={(v) => setDraft({ ...draft, meta: { ...draft.meta, systemId: v }, guess: null })}
            options={systemOptions()}
            pinned={recentSystems}
            placeholder="システムを探す"
          />
        </FormRow>
      </div>
    </section>
  );

  const actionButton = (
    <button type="button" className="btn btn-primary w-full" disabled={committing} onClick={onCommit}>
      {committing && <span className="loading loading-spinner loading-xs" aria-hidden />}
      {committing ? "記録中…" : attach ? "添付する" : "記録する"}
    </button>
  );
  const actionError = error?.field === "general" && (
    <p role="alert" className="mb-2 text-sm text-error">
      {error.text}
    </p>
  );

  const mainSections = (
    <div className="space-y-6">
      {sourceSection}
      {basicSection}
      <ParticipantsSection draft={draft} setDraft={setDraft} />
      {hasLog && <SpeakersSection draft={draft} setDraft={setDraft} speakers={speakers} />}
      <section className="surface p-5 sm:p-6" aria-labelledby="scope-head">
        <h2 id="scope-head" className="mb-3 text-base font-bold">
          共有範囲
        </h2>
        <ScopePicker value={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} />
      </section>
    </div>
  );

  /* 決定は流れの終わりに 1 つだけ（P10）。モバイルは下部タブの上に固定する */
  const mobileBar = (
    <div
      className={cx(
        "sticky z-20 -mx-4 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8",
        hasLog
          ? "lg:hidden"
          : "lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none",
      )}
      style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
    >
      {actionError}
      <div className={cx(!hasLog && "lg:ml-auto lg:max-w-60")}>{actionButton}</div>
    </div>
  );

  if (!hasLog) {
    return (
      <div className="space-y-6">
        {mainSections}
        {mobileBar}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SplitLayout
        asideWidth="lg"
        stickyAside
        main={mainSections}
        aside={
          <div className="space-y-4">
            <section className="surface overflow-hidden" aria-labelledby="preview-head">
              <h2 id="preview-head" className="border-b border-base-300 px-5 py-3.5 text-base font-bold">
                ログの表示
              </h2>
              <div className="max-h-[26rem] overflow-y-auto px-2 py-2 sm:px-3">
                <SessionTimeline log={previewLog} state={state} mode="own" filter={previewFilter} />
              </div>
            </section>
            <div className="hidden lg:block">
              {actionError}
              {actionButton}
            </div>
          </div>
        }
      />
      {mobileBar}
    </div>
  );
}

/* ---------- シナリオ ---------- */
function ScenarioField({
  draft,
  setDraft,
  invalid,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  invalid?: boolean;
}) {
  const { state, update } = useStore();
  const systemId = draft.meta.systemId;
  const hasSystem = Boolean(systemId && systemId !== "general");
  const systemName = SYSTEMS[systemId]?.name;
  /* 共有シナリオ一覧はサーバーで探す。打った言葉で問い合わせ、このシステムのものを先に */
  const [typed, setTyped] = useState("");
  const remote = useScenarioSearch({
    q: typed,
    // 打つ前はこのシステムのよく遊ばれているもの、打ったらどのシステムからも（このシステムのものを先に）
    systemId: hasSystem && !typed.trim() ? systemId : undefined,
    prefer: hasSystem ? [systemId] : [],
    pageSize: 20,
  });

  /* 候補の並び: 手元の写し（遊んだもの・足したもの）と共有シナリオ一覧の結果を合わせ、このシステムのものを先に。検索はタイトル・作者・システム名 */
  const options = useMemo<ComboboxOption[]>(() => {
    const local = Object.values(state.scenarios).map(scenarioToDirectory);
    // 手元の写しと同じ作品（同じ ID、同じ TALTO の作品）は重ねて出さない
    const all = [...local, ...withoutKnown(local, remote.items)];
    const toOption = (group?: string) => (sc: DirectoryScenario) => ({
      value: sc.id,
      label: sc.title,
      hint: sc.author,
      keywords: [sc.author, sc.systemLabel ?? SYSTEMS[sc.systemId]?.name ?? "", ...sc.tags],
      group,
    });
    if (!hasSystem) return all.map(toOption());
    return [
      ...all.filter((sc) => sc.systemId === systemId).map(toOption(systemName)),
      ...all.filter((sc) => sc.systemId !== systemId).map(toOption("ほかのシステム")),
    ];
  }, [state.scenarios, remote.items, hasSystem, systemId, systemName]);

  /* 入力前に出す候補: ログ本文・ファイル名に題名が出てくるもの、自分が遊んだもの（新しい順） */
  const pinned = useMemo(() => {
    const text = [
      ...draft.fileNames,
      ...draft.channels.flatMap((c) => c.msgs.slice(0, 300).map((m) => m.text ?? "")),
    ]
      .join("\n")
      .toLowerCase();
    const inLog = text
      ? Object.values(state.scenarios)
          .filter((sc) => sc.title.length >= 2 && text.includes(sc.title.toLowerCase()))
          .map((sc) => sc.id)
      : [];
    const played = Object.values(state.logs)
      .filter((l) => l.scenarioId && (l.ownerId === state.me || state.me in l.players))
      .sort((a, b) => (b.sittings[0]?.start ?? 0) - (a.sittings[0]?.start ?? 0))
      .map((l) => l.scenarioId!)
      .filter((id) => !hasSystem || state.scenarios[id]?.systemId === systemId);
    return [...new Set([...inLog, ...played])].filter((id) => state.scenarios[id]).slice(0, 6);
  }, [draft.fileNames, draft.channels, state.scenarios, state.logs, state.me, hasSystem, systemId]);

  function pick(id: string) {
    // 共有シナリオ一覧から選んだら、記録に結ぶので手元に写しを置く
    const fromDirectory = state.scenarios[id] ? undefined : remote.items.find((d) => d.id === id);
    const sc = state.scenarios[id] ?? (fromDirectory && directoryToScenario(fromDirectory, SYSTEMS));
    if (fromDirectory && sc) update((s) => void (s.scenarios[id] ??= sc));
    if (!sc) return;
    setDraft({
      ...draft,
      scenarioId: id,
      newScenario: null,
      meta: { ...draft.meta, systemId: sc.systemId },
      guess: null,
    });
  }

  if (draft.newScenario) {
    const set = (patch: Partial<NonNullable<Draft["newScenario"]>>) =>
      setDraft({
        ...draft,
        newScenario: {
          ...(draft.newScenario ?? { title: "", author: "" }),
          ...patch,
        },
      });
    return (
      <div className="space-y-2">
        <input
          id="upload-scenario"
          aria-label="シナリオのタイトル"
          aria-invalid={invalid || undefined}
          placeholder="シナリオのタイトル"
          className={cx("input input-bordered w-full", invalid && "input-error")}
          value={draft.newScenario.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <input
          aria-label="作者・サークル"
          placeholder="作者・サークル"
          className="input input-bordered w-full"
          value={draft.newScenario.author}
          onChange={(e) => set({ author: e.target.value })}
        />
        {/* 自作のシナリオや事前相談のように、ほかの人が遊ばないものは自分だけにする（P14: 安全側を既定に） */}
        <Seg<"private" | "public">
          ariaLabel="このシナリオを選べる人"
          size="sm"
          value={draft.newScenario.private === false ? "public" : "private"}
          onChange={(v) => set({ private: v === "private" })}
          options={[
            { v: "private", label: "自分だけ" },
            { v: "public", label: "ほかの人も選べる" },
          ]}
        />
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => setDraft({ ...draft, newScenario: null })}
        >
          登録済みから選ぶ
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Combobox
        id="upload-scenario"
        invalid={invalid}
        ariaLabel="シナリオ"
        className="min-w-0 flex-1"
        value={draft.scenarioId}
        onChange={pick}
        options={options}
        pinned={pinned}
        pinnedLabel="候補"
        allLabel={hasSystem ? systemName : "すべて"}
        placeholder="タイトル・作者で探す"
        emptyText="見つかりません。名前を打って追加できます"
        // 共有シナリオ一覧の答えが届くまでは「追加」を出さない（共有シナリオ一覧にある作品を二重に足させない）
        onCreate={
          remote.loading
            ? undefined
            : (text) =>
                setDraft({
                  ...draft,
                  scenarioId: "",
                  newScenario: { title: text, author: "", private: true },
                })
        }
        onQueryChange={setTyped}
      />
    </div>
  );
}

/* ---------- 卓と参加者 ---------- */
function charsOf(state: Pick<State, "characters">, userId: string, systemId: string): Character[] {
  const own = Object.values(state.characters).filter((c) => c.ownerId === userId);
  return [...own.filter((c) => c.systemId === systemId), ...own.filter((c) => c.systemId !== systemId)];
}

/**
 * 記録する本人の行。記録するのは遊んだ人なので外せない行として先頭に置き、役割（GM / PL。システムの言葉で）と
 * キャラクターを選ぶ。人の代わりに記録するときだけ「遊んでいない」で外す（P1）
 */
function SelfRow({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const { state } = useStore();
  const me = state.users[state.me];
  if (!me) return null;
  const { self } = draft;
  const systemId = draft.meta.systemId;
  const chars = charsOf(state, state.me, systemId);
  const set = (patch: Partial<Draft["self"]>) => setDraft({ ...draft, self: { ...self, ...patch } });
  if (!self.played) {
    return (
      <li className="flex items-center gap-3 py-2">
        <Avatar u={me} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink2">{me.name}（遊んでいない）</span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ played: true })}>
          遊んだ
        </button>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2 py-2 sm:grid-cols-[auto_auto_1fr_14rem]">
      <button
        type="button"
        className="icon-btn -ml-1.5"
        aria-label="遊んでいない（人の代わりに記録する）"
        onClick={() => set({ played: false })}
      >
        <IconX width={16} height={16} />
      </button>
      <Avatar u={me} size={28} />
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold">{me.name}</span>
        <Select<SelfRole>
          size="sm"
          ariaLabel="あなたの役割"
          className="w-[5.5rem] shrink-0"
          value={self.role}
          onChange={(role) => set({ role, characterIds: role === "GM" ? [] : self.characterIds })}
          options={[
            { value: "PL", label: roleLabel(systemId, "PL") },
            { value: "GM", label: roleLabel(systemId, "GM") },
          ]}
        />
      </span>
      {self.role === "PL" && (
        <div className="col-span-3 pl-[4.25rem] sm:col-span-1 sm:pl-0">
          <Combobox
            size="sm"
            ariaLabel="あなたのキャラクター"
            className="w-full"
            value={self.characterIds[0] ?? ""}
            onChange={(v) => set({ characterIds: v ? [v] : [] })}
            placeholder="キャラクター"
            options={[
              { value: "", label: "キャラクターなし" },
              ...chars.map((c) => ({ value: c.id, label: c.name, hint: SYSTEMS[c.systemId]?.short })),
            ]}
          />
        </div>
      )}
    </li>
  );
}

function ParticipantsSection({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const { state } = useStore();
  const myTables = Object.values(state.tables).filter(
    (t) => t.ownerId === state.me || t.memberIds.includes(state.me),
  );
  const table = draft.tableId ? state.tables[draft.tableId] : undefined;
  const memberIds = (table?.memberIds ?? []).filter((id) => id !== state.me && state.users[id]);
  const joined = new Set(draft.players.map((p) => p.userId));
  const extraIds = draft.players
    .map((p) => p.userId)
    .filter((id) => !memberIds.includes(id) && state.users[id]);
  const allJoined = memberIds.length > 0 && memberIds.every((id) => joined.has(id));

  function selectTable(id: string) {
    const t = id ? state.tables[id] : undefined;
    const members = (t?.memberIds ?? []).filter((m) => m !== state.me);
    // ログの発言者から分かった人（キャラクターから持ち主が分かる）がいれば、その人たちを参加者のまま残す
    const known = draft.players.filter(
      (p) =>
        p.characterIds.length > 0 || Object.values(draft.speakerLinks).some((l) => l.userId === p.userId),
    );
    const players =
      known.length > 0
        ? known
        : members.map((m) => draft.players.find((p) => p.userId === m) ?? { userId: m, characterIds: [] });
    setDraft({ ...draft, tableId: id, players });
  }

  function toggle(userId: string, on: boolean) {
    setDraft({
      ...draft,
      players: on
        ? [...draft.players, { userId, characterIds: [] }]
        : draft.players.filter((p) => p.userId !== userId),
    });
  }

  function setAll(on: boolean) {
    const rest = draft.players.filter((p) => !memberIds.includes(p.userId));
    const members = on
      ? memberIds.map((id) => draft.players.find((p) => p.userId === id) ?? { userId: id, characterIds: [] })
      : [];
    setDraft({ ...draft, players: [...members, ...rest] });
  }

  function setChar(userId: string, cid: string) {
    setDraft({
      ...draft,
      players: draft.players.map((p) => (p.userId === userId ? { ...p, characterIds: cid ? [cid] : [] } : p)),
    });
  }

  const row = (userId: string, removable: boolean) => {
    const u = state.users[userId]!;
    const p = draft.players.find((x) => x.userId === userId);
    const chars = charsOf(state, userId, draft.meta.systemId);
    return (
      <li
        key={userId}
        className="grid grid-cols-[auto_auto_1fr] items-center gap-x-3 gap-y-2 py-2 sm:grid-cols-[auto_auto_1fr_14rem]"
      >
        {removable ? (
          <button
            type="button"
            className="icon-btn -ml-1.5"
            aria-label={`${u.name}を参加者から外す`}
            onClick={() => toggle(userId, false)}
          >
            <IconX width={16} height={16} />
          </button>
        ) : (
          <input
            type="checkbox"
            className="checkbox checkbox-primary checkbox-sm"
            aria-label={`${u.name}が参加`}
            checked={Boolean(p)}
            onChange={(e) => toggle(userId, e.target.checked)}
          />
        )}
        <Avatar u={u} size={28} />
        <span className={cx("min-w-0 truncate text-sm font-semibold", !p && "text-ink2")}>{u.name}</span>
        {p && (
          <div className="col-span-3 pl-[4.25rem] sm:col-span-1 sm:pl-0">
            <Combobox
              size="sm"
              ariaLabel={`${u.name}のキャラクター`}
              className="w-full"
              value={p.characterIds[0] ?? ""}
              onChange={(v) => setChar(userId, v)}
              placeholder="キャラクター"
              options={[
                { value: "", label: "キャラクターなし" },
                ...chars.map((c) => ({ value: c.id, label: c.name, hint: SYSTEMS[c.systemId]?.short })),
              ]}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="players-head">
      <h2 id="players-head" className="mb-4 text-base font-bold">
        卓と参加者
      </h2>
      <div className="list">
        <FormRow label="卓">
          <Combobox
            ariaLabel="卓"
            className="w-full sm:max-w-sm"
            value={draft.tableId}
            onChange={selectTable}
            options={[
              { value: "", label: "選ばない" },
              ...myTables.map((t) => ({ value: t.id, label: t.name, hint: `${t.memberIds.length}人` })),
            ]}
          />
        </FormRow>
        <FormRow label="参加者">
          {table && memberIds.length > 0 && (
            <div className="flex min-h-9 items-center justify-between gap-2">
              <span className="text-sm text-ink2">{table.name}のメンバー</span>
              {memberIds.length > 1 && (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setAll(!allJoined)}>
                  {allJoined ? "全員を外す" : "全員が参加"}
                </button>
              )}
            </div>
          )}
          <ul className="list" aria-label="参加者">
            <SelfRow draft={draft} setDraft={setDraft} />
            {memberIds.map((id) => row(id, false))}
            {extraIds.map((id) => row(id, true))}
          </ul>
          <div className="mt-3">
            <PlayerPicker
              state={state}
              selected={[]}
              exclude={[state.me, ...memberIds, ...draft.players.map((p) => p.userId)]}
              quickLabel={table ? "ほかの卓のメンバー" : "自分の卓のメンバー"}
              onChange={(ids) =>
                setDraft({
                  ...draft,
                  players: [...draft.players, ...ids.map((id) => ({ userId: id, characterIds: [] }))],
                })
              }
            />
          </div>
        </FormRow>
      </div>
    </section>
  );
}

/* ---------- ログの発言者 ---------- */
function SpeakersSection({
  draft,
  setDraft,
  speakers,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  speakers: { sp: string; kind: MsgKind }[];
}) {
  const { state } = useStore();
  const systemId = draft.meta.systemId;
  const participantIds = useMemo(
    () => new Set([state.me, ...draft.players.map((p) => p.userId)]),
    [state.me, draft.players],
  );

  /* キャラクターの候補: 参加者のキャラクターを先に。持ち主の名前を添えて、だれのキャラか分かるようにする */
  const charOptions = useMemo<ComboboxOption[]>(() => {
    const all = Object.values(state.characters);
    const toOption = (group: string) => (c: Character) => ({
      value: `char:${c.id}`,
      label: c.name,
      hint: state.users[c.ownerId]?.name,
      keywords: [state.users[c.ownerId]?.name ?? ""],
      group,
    });
    const inSession = all.filter((c) => participantIds.has(c.ownerId));
    const rest = all.filter((c) => !participantIds.has(c.ownerId));
    return [
      { value: "", label: "なし" },
      ...inSession
        .sort((a, b) => Number(b.systemId === systemId) - Number(a.systemId === systemId))
        .map(toOption("参加者のキャラクター")),
      ...rest.map(toOption("ほかのキャラクター")),
    ];
  }, [state.characters, state.users, participantIds, systemId]);

  const userOptions = useMemo<ComboboxOption[]>(() => {
    const all = Object.values(state.users);
    const toOption = (group: string) => (u: User) => ({ value: `user:${u.id}`, label: u.name, group });
    return [
      { value: "", label: "なし" },
      ...all.filter((u) => participantIds.has(u.id)).map(toOption("参加者")),
      ...all.filter((u) => !participantIds.has(u.id)).map(toOption("ほかの人")),
    ];
  }, [state.users, participantIds]);

  function link(sp: string, value: string) {
    const speakerLinks = { ...draft.speakerLinks };
    const speakerIcons = { ...draft.speakerIcons };
    let players = [...draft.players];
    let self = draft.self;
    const addPlayer = (userId: string, characterId?: string) => {
      if (userId === state.me) {
        // 本人のキャラの発言なら PL、本人が GM の発言者なら GM
        const gm = !characterId && (draft.kinds[sp] === "GM" || draft.kinds[sp] === "KP");
        self = {
          played: true,
          role: characterId ? "PL" : gm ? "GM" : self.role,
          characterIds:
            characterId && !self.characterIds.includes(characterId)
              ? [characterId, ...self.characterIds]
              : self.characterIds,
        };
        return;
      }
      const idx = players.findIndex((p) => p.userId === userId);
      if (idx < 0) players = [...players, { userId, characterIds: characterId ? [characterId] : [] }];
      else if (characterId && !players[idx]!.characterIds.includes(characterId))
        players[idx] = { ...players[idx]!, characterIds: [characterId, ...players[idx]!.characterIds] };
    };
    if (!value) {
      delete speakerLinks[sp];
    } else if (value.startsWith("char:")) {
      const ch = state.characters[value.slice(5)];
      if (!ch) return;
      // キャラクターが決まれば持ち主も決まる（その人を参加者に入れる）
      speakerLinks[sp] = { userId: ch.ownerId, characterId: ch.id };
      speakerIcons[sp] = characterAvatarSrc(ch);
      addPlayer(ch.ownerId, ch.id);
    } else if (value.startsWith("user:")) {
      const u = state.users[value.slice(5)];
      if (!u) return;
      speakerLinks[sp] = { userId: u.id };
      speakerIcons[sp] = userAvatarSrc(u);
      addPlayer(u.id);
    }
    setDraft({ ...draft, speakerLinks, speakerIcons, players, self });
  }

  return (
    <section className="surface p-5 sm:p-6" aria-labelledby="speakers-head">
      <h2 id="speakers-head" className="mb-3 text-base font-bold">
        ログの発言者
      </h2>
      <div
        className="hidden grid-cols-[2.25rem_1fr_6.5rem_15rem] gap-x-3 border-b border-base-300 pb-2 text-xs font-medium text-ink2 sm:grid"
        aria-hidden
      >
        <span />
        <span>発言者</span>
        <span>役割</span>
        <span>だれの発言か</span>
      </div>
      <ul className="list">
        {speakers.map(({ sp, kind }) => {
          const l = draft.speakerLinks[sp];
          const value = l?.characterId ? `char:${l.characterId}` : l?.userId ? `user:${l.userId}` : "";
          const isPc = kind === "PC";
          const isPerson = kind === "PL" || kind === "GM" || kind === "KP";
          const second = isPc ? (
            <Combobox
              size="sm"
              ariaLabel={`${sp}のキャラクター`}
              className="w-full"
              value={value.startsWith("char:") ? value : ""}
              onChange={(v) => link(sp, v)}
              options={charOptions}
              placeholder="キャラクターを選ぶ"
            />
          ) : isPerson ? (
            <Combobox
              size="sm"
              ariaLabel={`${sp}はだれか`}
              className="w-full"
              value={value.startsWith("user:") ? value : ""}
              onChange={(v) => link(sp, v)}
              options={userOptions}
              placeholder="だれか選ぶ"
            />
          ) : null;
          return (
            <li
              key={sp}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[2.25rem_1fr_6.5rem_15rem]"
            >
              <label className="relative shrink-0 cursor-pointer rounded-full">
                <img
                  src={resolveSpeakerAvatarSrc(sp, kind, draft.speakerIcons, state)}
                  alt=""
                  width={36}
                  height={36}
                  referrerPolicy="no-referrer"
                  className="size-9 rounded-full bg-base-200 object-cover ring-1 ring-base-300"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-base-100 text-ink2 ring-1 ring-base-300">
                  <IconUpload width={10} height={10} aria-hidden />
                </span>
                <input
                  type="file"
                  accept="image/*"
                  aria-label={`${sp}のアイコン画像を選ぶ`}
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const dataUrl = await readAvatarImageFile(file);
                      if (dataUrl)
                        setDraft({ ...draft, speakerIcons: { ...draft.speakerIcons, [sp]: dataUrl } });
                    } catch {
                      /* 読めない画像は無視する */
                    }
                  }}
                />
              </label>
              <b className="min-w-0 truncate text-sm">{sp}</b>
              <Select
                size="sm"
                ariaLabel={`${sp}の役割`}
                className="w-[6.5rem]"
                value={kind}
                onChange={(v) => setDraft({ ...draft, kinds: { ...draft.kinds, [sp]: v } })}
                options={speakerRoleOptions(systemId, kind)}
              />
              {second && <div className="col-span-3 pl-12 sm:col-span-1 sm:pl-0">{second}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ================= 記録した ================= */
function RecordedModal({
  result,
  attach,
  onClose,
}: {
  result: CommitLogResult;
  attach: boolean;
  onClose: () => void;
}) {
  const { state } = useStore();
  const [copied, setCopied] = useState(false);
  const [reportCard, setReportCard] = useState(false);
  const log = state.logs[result.id];
  // 卓が Discord とつながっていれば、そのチャンネルへの投稿を選べる（自動では投稿しない。共有は本人が決める）
  const discord = useTableDiscord(log?.tableId);
  const [posted, setPosted] = useState<"idle" | "posting" | "posted">("idle");
  const [postError, setPostError] = useState<string | null>(null);
  if (!log) return null;
  const sys = SYSTEMS[log.systemId];
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : undefined;
  const people = Object.entries(log.players)
    .filter(([id]) => state.users[id])
    .map(([id, p]) => {
      const ch = p.characterIds[0] ? state.characters[p.characterIds[0]] : undefined;
      return ch ? { kind: "char" as const, char: ch } : { kind: "user" as const, user: state.users[id]! };
    });
  const names = Object.keys(log.players)
    .map((id) => state.users[id]?.name)
    .filter(Boolean);
  const url = `${location.origin}/share/l/${result.slug}`;

  return (
    <>
      <CompletionModal
        title={attach ? "ログを添付しました" : "セッションを記録しました"}
        stamp={<ScoreInscription marks={scoreMarks(log.channels)} />}
        onClose={onClose}
        primary={{ label: "セッションを開く", to: `/sessions/${log.id}` }}
        secondary={[
          {
            label: copied ? "コピーしました" : "共有リンクをコピー",
            icon: <IconLink width={16} height={16} aria-hidden />,
            onClick: () => {
              navigator.clipboard?.writeText(url).catch(() => {});
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            },
          },
          {
            label: "卓報告カード",
            icon: <IconBrandX width={15} height={15} aria-hidden />,
            onClick: () => setReportCard(true),
          },
          ...(discord
            ? [
                {
                  label:
                    posted === "posted"
                      ? "投稿しました"
                      : posted === "posting"
                        ? "投稿しています…"
                        : "Discord に投稿",
                  icon: <IconDiscord width={16} height={16} aria-hidden />,
                  onClick: () => {
                    if (posted !== "idle") return;
                    setPosted("posting");
                    setPostError(null);
                    void discordClient.postSession(result.slug, log?.tableId).then((r) => {
                      setPosted(r.ok ? "posted" : "idle");
                      if (!r.ok) setPostError(r.error);
                    });
                  },
                },
              ]
            : []),
        ]}
      >
        {/* 何を・いつ・だれと。1 行ずつ、大事な順に */}
        <p className="text-base font-bold text-base-content">{sessionTitle(log, state.scenarios)}</p>
        {sys && (
          <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <SysBadge sys={sys} />
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span className="tabular-nums">{fmtSessionWhen(log)}</span>
          <ScopeLabel scope={log.scope} />
        </p>
        {people.length > 0 && (
          <p className="mt-3 flex items-center justify-center gap-2">
            <AvatarStack people={people} size={24} />
            <span className="min-w-0 truncate">{names.join("・")}</span>
          </p>
        )}
        {postError && (
          <p className="mt-3 text-error" role="alert">
            {postError}
          </p>
        )}
      </CompletionModal>
      {reportCard && <ReportCardModal log={log} onClose={() => setReportCard(false)} />}
    </>
  );
}
