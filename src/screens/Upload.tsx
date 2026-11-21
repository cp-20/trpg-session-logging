import { useMemo, useState } from "react";
import { useNavigate, useSearchString } from "../lib/router";
import { useStore } from "../store";
import {
  CopyBox,
  DateList,
  Empty,
  Field,
  FieldError,
  FormRow,
  InlineNotice,
  Modal,
  NotFound,
  PageHead,
  PanelHead,
  SCOPE_META,
  ScopeLabel,
  Seg,
  Select,
  type SelectOption,
  SplitLayout,
  SysBadge,
  TimeRange,
  cx,
} from "../components/ui";
import {
  Avatar,
  PlayerPicker,
  PRESET_NPC_ICONS,
  characterAvatarSrc,
  readAvatarImageFile,
  resolveSpeakerAvatarSrc,
  userAvatarSrc,
} from "../components/identity";
import { SessionTimeline, TimelineFilter } from "../components/timeline";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { buildSessionRange, fmtDates, fmtDur, sessionClock, sessionPlayMinutes, todayStr } from "../lib/time";
import { importLogFromFile, importLogFromText } from "../lib/importers";
import { parsePlayHistory, type PlayHistoryRow } from "../lib/history-import";
import { commitLogImport, commitPlayHistoryImport, type CommitLogResult } from "../api/commands";
import {
  buildDraft as buildDraftWith,
  remapChannelTimestamps,
  type Draft,
  type SpeakerLink,
} from "../lib/speaker-match";
import type { Channel, Log, MsgKind, Policy, Scope, State } from "../types";
import {
  IconBooks,
  IconBrandX,
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconFileText,
  IconPlus,
  IconSearch,
  IconUpload,
  IconX,
} from "../components/icons";
import { ReportCardModal } from "./SessionDetail";

/** 発言者の顔アイコンは、紐付いたキャラクター・ユーザーの画像を使う */
const buildDraft = (opts: Omit<Parameters<typeof buildDraftWith>[0], "avatars">) =>
  buildDraftWith({ ...opts, avatars: { character: characterAvatarSrc, user: userAvatarSrc } });

/** 発言者の役割。GM 役はシステムを問わず「GM」に統一する */
const ROLE_OPTIONS: readonly SelectOption<MsgKind>[] = [
  { value: "GM", label: "GM" },
  { value: "PC", label: "PC" },
  { value: "PL", label: "PL" },
  { value: "NPC", label: "NPC" },
  { value: "SYSTEM", label: "システム" },
];
const roleOptionsFor = (kind: MsgKind): readonly SelectOption<MsgKind>[] =>
  kind === "KP"
    ? ROLE_OPTIONS.map((o) => (o.value === "GM" ? { value: "KP" as MsgKind, label: "GM" } : o))
    : ROLE_OPTIONS;

type FlowError = { field: "title" | "general"; text: string } | null;

export default function Upload() {
  const { state, update } = useStore();
  const searchStr = useSearchString();
  const sp = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const attachId = sp.get("log");
  const presetTable = sp.get("table") ?? "";
  const presetScenario = sp.get("scenario") ?? "";
  const attachLog = attachId ? state.logs[attachId] : null;

  /* 手順: 1 入力(ログ or 日時入力) / 2 内容と参加者の確認 / 3 完了 */
  const [step, setStep] = useState(1);
  const [manual, setManual] = useState(() => sp.get("manual") === "1" && !attachId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<CommitLogResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<FlowError>(null);

  async function handleCommit() {
    if (!draft || committing) return;
    if (!draft.meta.title.trim()) {
      setError({ field: "title", text: "タイトルを入力してください。" });
      document.getElementById("upload-title")?.focus();
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      let schedule: { dates: string[]; t0: number; t1: number } | null = null;
      if (draft.manual) {
        const range = buildSessionRange({
          dates: draft.manual.dates,
          startTime: draft.manual.start,
          endTime: draft.manual.end,
        });
        if (!range.ok) {
          setError({ field: "general", text: range.error ?? "日時を確認してください" });
          return;
        }
        schedule = { dates: draft.manual.dates, t0: range.t0, t1: range.t1 };
      }
      const r = await commitLogImport(
        {
          fileName: draft.fileName,
          attachId,
          meta: draft.meta,
          channels: draft.channels,
          kinds: draft.kinds,
          speakerIcons: draft.speakerIcons,
          scope: draft.scope,
          tableId: draft.tableId,
          scenarioId: draft.scenarioId,
          newScenario: draft.newScenario,
          players: draft.players,
          schedule,
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
      setStep(3);
      window.scrollTo({ top: 0 });
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
    ? { to: `/sessions/${attachLog.id}`, label: attachLog.title }
    : presetTable
      ? { to: `/tables/${presetTable}`, label: state.tables[presetTable]?.name ?? "卓" }
      : { to: "/sessions", label: "セッション" };

  const wideStudio = step === 2 && Boolean(draft && !manual && draft.channels.length > 0);

  return (
    <div className={cx(!wideStudio && "mx-auto max-w-3xl")}>
      <PageHead
        back={step === 3 ? undefined : backTo}
        title={attachLog ? "ログを添付" : "セッションを記録"}
        sub={attachLog ? <>「{attachLog.title}」にログを追加し、日時と発言者を読み取ります。</> : undefined}
      />
      {step < 3 && <Steps step={step} manual={manual} attach={Boolean(attachLog)} />}
      {step === 1 && (
        <Step1
          presetTable={presetTable}
          presetScenario={presetScenario}
          attachLog={attachLog}
          draft={draft}
          manual={manual}
          setManual={setManual}
          onDone={(d) => {
            setDraft(d);
            setError(null);
            setStep(2);
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      {step === 2 && draft && (
        <Step2Review
          draft={draft}
          setDraft={(d) => {
            setDraft(d);
            if (error?.field === "title" && d.meta.title.trim()) setError(null);
          }}
          attachId={attachId}
          committing={committing}
          manual={manual}
          error={error}
          onCommit={handleCommit}
          onBack={() => {
            setError(null);
            setStep(1);
          }}
        />
      )}
      {step === 3 && (
        <Step3Done
          result={result}
          attachId={attachId}
          scope={draft?.scope ?? "members"}
          onRestart={() => {
            setDraft(null);
            setResult(null);
            setManual(false);
            setError(null);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}

/** 手順表示: 番号と現在の段だけを示す小さな表示 */
function Steps({ step, manual, attach }: { step: number; manual: boolean; attach: boolean }) {
  const labels = [manual ? "日時を入力" : "ログを選ぶ", "内容の確認", attach ? "添付" : "記録"];
  return (
    <ol aria-label="記録の手順" className="mb-5 flex items-center gap-2 text-sm">
      {labels.map((label, i) => {
        const n = i + 1;
        const current = step === n;
        const done = step > n;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="flex items-center gap-2">
            <span
              className={cx(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                done && "bg-primary text-primary-content",
                current && "bg-primary/15 text-primary ring-1 ring-primary/40",
                !done && !current && "bg-base-300/70 text-ink2",
              )}
            >
              {done ? <IconCheck width={14} height={14} aria-hidden /> : n}
            </span>
            <span className={cx(current ? "font-bold" : "hidden text-ink2 sm:inline")}>{label}</span>
            {i < labels.length - 1 && <span className="h-px w-5 bg-base-300 sm:w-8" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/* ================= ステップ1: ログを選ぶ / 日時入力 ================= */
function Step1({
  presetTable,
  presetScenario,
  attachLog,
  draft,
  manual,
  setManual,
  onDone,
}: {
  presetTable: string;
  presetScenario: string;
  attachLog: Log | null;
  draft: Draft | null;
  manual: boolean;
  setManual: (v: boolean) => void;
  onDone: (d: Draft) => void;
}) {
  const { state } = useStore();
  const [running, setRunning] = useState(false);
  const [hot, setHot] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function proceedWith(channels: Channel[], fileName: string | null) {
    onDone(
      buildDraft({
        fileName,
        channels,
        attachLog,
        presetTable,
        presetScenario,
        manual: null,
        state,
      }),
    );
  }

  async function onFiles(files: FileList | File[] | null) {
    const f = files?.[0] ?? (Array.isArray(files) ? files[0] : null);
    if (!f) return;
    setRunning(true);
    setError(null);
    try {
      const res = await importLogFromFile(f);
      if (!res || res.log.messageCount === 0) {
        setError(
          "読み取れる発言が見つかりませんでした。CCFOLIA（JSON・HTML・ZIP）、Udonarium（chat.xml・ZIP）、Discord（JSON・テキスト）、どどんとふ・テキストログを選んでください。",
        );
        return;
      }
      proceedWith(res.log.channels, f.name);
    } catch {
      setError("ファイルを読み取れませんでした。対応形式を確認して、もう一度お試しください。");
    } finally {
      setRunning(false);
    }
  }

  function handlePasteImport() {
    setError(null);
    const res = importLogFromText(pasteText);
    if (!res || res.log.messageCount === 0) {
      setError(
        "読み取れる発言が見つかりませんでした。CCFOLIA（JSON・HTML）、Discord（JSON・テキスト）、Udonarium（chat.xml）、またはテキストログを貼り付けてください。",
      );
      return;
    }
    setPasteOpen(false);
    proceedWith(res.log.channels, res.sourceLabel);
  }

  async function finishSample() {
    setRunning(true);
    try {
      const { SAMPLE_LOG } = await import("../data/seed");
      const channels = JSON.parse(JSON.stringify(SAMPLE_LOG)) as Channel[];
      proceedWith(channels, null);
    } finally {
      setRunning(false);
    }
  }

  /* ---- 手入力(ログなし)パス ---- */
  if (manual && !attachLog) {
    return (
      <ManualForm
        presetTable={presetTable}
        presetScenario={presetScenario}
        initial={draft?.manual ? draft : null}
        onBack={() => setManual(false)}
        onNext={(d) => onDone(d)}
      />
    );
  }

  return (
    <>
      <section className="surface p-4 sm:p-6" aria-label="ログを選ぶ">
        <div
          className={cx("drop py-12", hot && "hot", running && "pointer-events-none opacity-70")}
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
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink2">
            CCFOLIA（JSON・HTML・ZIP）、Discord（JSON・テキスト）、Udonarium（chat.xml・ZIP）、どどんとふ、テキストログに対応しています。
          </p>
          <label className={cx("btn btn-primary mt-5 cursor-pointer", running && "btn-disabled")}>
            <IconFileText width={18} height={18} aria-hidden />
            ファイルを選ぶ
            <input
              type="file"
              aria-label="ログファイルを選ぶ"
              accept=".json,.html,.htm,.txt,.xml,.zip"
              className="sr-only"
              disabled={running}
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {running && (
            <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm text-ink2">
              <span className="loading loading-spinner loading-sm" aria-hidden />
              読み込み中…
            </p>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            aria-expanded={pasteOpen}
            disabled={running}
            onClick={() => setPasteOpen((v) => !v)}
          >
            テキストを貼り付ける
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={running} onClick={finishSample}>
            サンプルログで試す
          </button>
        </div>

        {pasteOpen && (
          <div className="mt-4 border-t border-base-300 pt-4">
            <textarea
              className="textarea textarea-bordered w-full font-mono text-sm"
              rows={6}
              aria-label="ログテキストを貼り付け"
              placeholder={
                "[メイン] 探索者: セリフ\n21:05 探索者: セリフ\n2026/11/08 21:06 [情報] GM: 資料を公開"
              }
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink2">
              CCFOLIA の JSON・HTML、Udonarium の chat.xml、または上の例のような行形式のテキスト
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setPasteOpen(false);
                  setPasteText("");
                }}
              >
                閉じる
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!pasteText.trim()}
                onClick={handlePasteImport}
              >
                テキストを読み込む
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </p>
        )}
      </section>

      {!attachLog && (
        <>
          <section className="mt-4 flex flex-col gap-3 rounded-box border border-dashed border-base-300 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">ログがないセッション</h2>
              <p className="mt-0.5 text-sm text-ink2">日時と参加者だけで記録し、ログはあとから添付します。</p>
            </div>
            <button type="button" className="btn shrink-0" onClick={() => setManual(true)}>
              <IconCalendar width={16} height={16} aria-hidden />
              ログなしで記録する
            </button>
          </section>
          <section className="mt-3 flex flex-col gap-3 rounded-box border border-dashed border-base-300 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">通過履歴をまとめて取り込む</h2>
              <p className="mt-0.5 text-sm text-ink2">
                スプレッドシートやメモの表（CSV・TSV・Markdown表）から過去の通過記録を一括登録します。
              </p>
            </div>
            <button type="button" className="btn shrink-0" onClick={() => setHistoryOpen(true)}>
              <IconBooks width={16} height={16} aria-hidden />
              通過履歴を取り込む
            </button>
          </section>
          {historyOpen && <BulkHistoryModal onClose={() => setHistoryOpen(false)} />}
        </>
      )}
    </>
  );
}

/* ---------- 一括通過履歴取り込みモーダル ---------- */
function BulkHistoryModal({ onClose }: { onClose: () => void }) {
  const { state, update } = useStore();
  const nav = useNavigate();
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<(PlayHistoryRow & { selected: boolean })[] | null>(null);
  const [scope, setScope] = useState<Scope>("members");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleParse(text: string) {
    setError(null);
    const parsed = parsePlayHistory(text);
    if (!parsed || parsed.rows.length === 0) {
      setError(
        "読み取れる表データが見つかりませんでした。「日付」「シナリオ（またはタイトル）」の列を含む CSV・TSV・Markdown表を指定してください。",
      );
      return;
    }
    setRows(parsed.rows.map((r) => ({ ...r, selected: true })));
  }

  async function handleCommit() {
    if (!rows || busy) return;
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) {
      setError("取り込む行を 1 件以上選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await commitPlayHistoryImport(selected, state, update, { scope });
      if (!res.ok) {
        setError("履歴を取り込めませんでした。入力内容を確認してください。");
        return;
      }
      onClose();
      nav({ to: "/sessions" });
    } catch {
      setError("履歴を取り込めませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = rows ? rows.filter((r) => r.selected).length : 0;

  return (
    <Modal
      title="通過履歴をまとめて取り込む"
      wide
      onClose={onClose}
      foot={
        rows ? (
          <>
            <button
              type="button"
              className="btn btn-quiet"
              disabled={busy}
              onClick={() => {
                setRows(null);
                setError(null);
              }}
            >
              戻る
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || selectedCount === 0}
              onClick={handleCommit}
            >
              {selectedCount}件を取り込む
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" onClick={onClose}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!raw.trim()}
              onClick={() => handleParse(raw)}
            >
              内容を確認
            </button>
          </>
        )
      }
    >
      {!rows ? (
        <div className="space-y-4">
          <label className="btn btn-sm cursor-pointer">
            <IconUpload width={16} height={16} aria-hidden />
            CSV / TSV / Markdown ファイルを選ぶ
            <input
              type="file"
              accept=".csv,.tsv,.md,.txt,.json"
              aria-label="通過履歴ファイルを選ぶ"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const text =
                  typeof file.text === "function" ? await file.text() : await new Response(file).text();
                setRaw(text);
                handleParse(text);
              }}
            />
          </label>
          <Field
            label="表データ（CSV / タブ区切り / Markdown 表）"
            hint="先頭行に「日付」「シナリオ」「システム」「キャラ」「メモ」などの見出しを入れてください"
            noMargin
          >
            <textarea
              className="textarea textarea-bordered w-full font-mono text-sm"
              rows={7}
              placeholder={
                "日付,シナリオ,システム,キャラ,メモ\n2026-10-12,沼男は誰だ？,クトゥルフ神話TRPG 7版,遠沢澄花,生還"
              }
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setError(null);
              }}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink2">{rows.length}件の通過記録を読み取りました。</p>
            <Seg<Scope>
              size="sm"
              ariaLabel="共有範囲"
              value={scope}
              onChange={setScope}
              options={[
                { v: "members", label: SCOPE_META.members.label },
                { v: "passed", label: SCOPE_META.passed.label },
                { v: "public", label: SCOPE_META.public.label },
              ]}
            />
          </div>
          <ul className="divide-y divide-base-300 rounded-box border border-base-300">
            {rows.map((r, i) => (
              <li key={`${r.date}-${r.title}-${i}`} className="flex items-start gap-3 px-3.5 py-2.5 text-sm">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm mt-0.5"
                  aria-label={`${r.title}を取り込む`}
                  checked={r.selected}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev
                        ? prev.map((x, idx) => (idx === i ? { ...x, selected: e.target.checked } : x))
                        : null,
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{r.title}</b>
                  <span className="meta text-xs">
                    <span className="tabular-nums">{r.date}</span>
                    <SysBadge sys={SYSTEMS[r.systemId]} />
                    {r.characterNames.length > 0 && <span>PC: {r.characterNames.join("・")}</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {busy && <InlineNotice tone="pending" text="取り込み中…" />}
        </div>
      )}
      <FieldError text={error} />
    </Modal>
  );
}

/* ---------- ログなし: 手入力フォーム ---------- */
function ManualForm({
  presetTable,
  presetScenario,
  initial,
  onBack,
  onNext,
}: {
  presetTable: string;
  presetScenario: string;
  initial: Draft | null;
  onBack: () => void;
  onNext: (d: Draft) => void;
}) {
  const { state } = useStore();
  const [title, setTitle] = useState(initial?.meta.title ?? "");
  const [dates, setDates] = useState<string[]>(initial?.manual?.dates ?? [todayStr()]);
  const [start, setStart] = useState(initial?.manual?.start ?? "21:00");
  const [end, setEnd] = useState(initial?.manual?.end ?? "25:00");
  const [tableId, setTableId] = useState(initial?.tableId ?? presetTable);
  const [error, setError] = useState<{ field: "title" | "dates" | "time"; text: string } | null>(null);
  const myTables = Object.values(state.tables).filter(
    (t) => t.memberIds.includes(state.me) || t.ownerId === state.me,
  );
  const table = tableId ? state.tables[tableId] : null;

  function next() {
    if (!title.trim()) {
      setError({ field: "title", text: "タイトルを入力してください。" });
      return;
    }
    if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)) || new Set(dates).size !== dates.length) {
      setError({ field: "dates", text: "実施日を重複しない日付で入力してください。" });
      return;
    }
    const sortedDates = [...dates].sort();
    const range = buildSessionRange({ dates: sortedDates, startTime: start, endTime: end });
    if (!range.ok) {
      setError({ field: "time", text: range.error ?? "時刻を確認してください" });
      return;
    }
    setError(null);
    const members = table?.memberIds.filter((m) => m !== state.me) ?? [];
    onNext({
      ...(initial ??
        buildDraft({
          fileName: null,
          channels: [],
          attachLog: null,
          presetTable,
          presetScenario,
          manual: null,
          state,
        })),
      meta: { title: title.trim(), systemId: table?.systemId ?? initial?.meta.systemId ?? "general" },
      tableId,
      players:
        initial?.tableId === tableId
          ? initial.players
          : members.map((m) => ({ userId: m, characterIds: [] })),
      manual: { dates: sortedDates, start, end },
    });
  }

  const others = table?.memberIds
    .filter((m) => m !== state.me)
    .map((m) => state.users[m])
    .filter(Boolean);

  return (
    <section className="surface p-5 sm:p-6" aria-label="日時を入力">
      <PanelHead title="いつ、誰と遊んだか" sub="ログが見つかったら、あとでこのセッションに添付します。" />
      <div className="list">
        <FormRow label="タイトル">
          <input
            id="manual-title"
            aria-label="タイトル"
            className="input input-bordered w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 廃校の十三時間目（2陣）"
            autoFocus
          />
          <FieldError text={error?.field === "title" ? error.text : null} />
        </FormRow>
        <FormRow label="実施日">
          <DateList dates={dates} setDates={setDates} />
          <FieldError text={error?.field === "dates" ? error.text : null} />
        </FormRow>
        <FormRow label="時間">
          <TimeRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <FieldError text={error?.field === "time" ? error.text : null} />
        </FormRow>
        <FormRow label="卓">
          <Select
            className="w-full sm:max-w-sm"
            ariaLabel="卓（参加者を自動で入れます）"
            value={tableId}
            onChange={setTableId}
            options={[
              { value: "", label: "選ばない" },
              ...myTables.map((t) => ({ value: t.id, label: `${t.name}（${t.memberIds.length}人）` })),
            ]}
          />
          <p className="mt-1.5 text-xs text-ink2">
            {others && others.length > 0
              ? `参加者に ${others.map((u) => u!.name).join("、")} を入れます。`
              : "選ぶと卓のメンバーを参加者に入れます。"}
          </p>
        </FormRow>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-2 border-t border-base-300 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn btn-quiet" onClick={onBack}>
          <IconChevronLeft width={16} height={16} aria-hidden />
          ログから記録する
        </button>
        <button type="button" className="btn btn-primary" onClick={next}>
          内容と参加者の確認へ進む
        </button>
      </div>
    </section>
  );
}

/* ---------- 発言者ごとの役割・紐付け・アイコン ---------- */
function UploadSpeakerConfigGrid({
  speakers,
  speakerIcons,
  speakerLinks,
  state,
  onRoleChange,
  onIconChange,
  onLinkChange,
}: {
  speakers: { sp: string; kind: MsgKind }[];
  speakerIcons: Record<string, string>;
  speakerLinks: Record<string, SpeakerLink>;
  state: Pick<State, "characters" | "users">;
  onRoleChange: (sp: string, kind: MsgKind) => void;
  onIconChange: (sp: string, iconSrc: string) => void;
  onLinkChange: (sp: string, linkValue: string) => void;
}) {
  const charList = useMemo(() => Object.values(state.characters), [state.characters]);
  const userList = useMemo(() => Object.values(state.users), [state.users]);

  const pcLinkOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "結び付けない" },
      ...charList.map((c) => {
        const owner = state.users[c.ownerId];
        return {
          value: `char:${c.id}`,
          label: owner ? `${c.name}（${owner.name}）` : c.name,
        };
      }),
      ...userList.map((u) => ({ value: `user:${u.id}`, label: `PL ${u.name}` })),
    ],
    [charList, userList, state.users],
  );

  const plLinkOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "結び付けない" },
      ...userList.map((u) => ({ value: `user:${u.id}`, label: `PL ${u.name}` })),
    ],
    [userList],
  );

  const pcIconOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "自動（結び付け先に合わせる）" },
      ...charList.map((c) => ({ value: characterAvatarSrc(c), label: c.name })),
      ...userList.map((u) => ({ value: userAvatarSrc(u), label: `PL ${u.name}` })),
    ],
    [charList, userList],
  );

  const kpIconOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "既定のGMアイコン" },
      ...userList.map((u) => ({ value: userAvatarSrc(u), label: u.name })),
    ],
    [userList],
  );

  const npcIconOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "既定のNPCアイコン" },
      ...PRESET_NPC_ICONS.map((p) => ({ value: p.src, label: p.label })),
    ],
    [],
  );

  const systemIconOptions = useMemo<SelectOption<string>[]>(
    () => [{ value: "", label: "既定のシステムアイコン" }],
    [],
  );

  return (
    <ul className="list">
      {speakers.map(({ sp, kind }) => {
        const currentExplicit = speakerIcons[sp] ?? "";
        const previewSrc = resolveSpeakerAvatarSrc(sp, kind, speakerIcons, state);
        const link = speakerLinks[sp];
        const linkValue = link?.characterId
          ? `char:${link.characterId}`
          : link?.userId
            ? `user:${link.userId}`
            : "";

        const isPlayerSide = kind === "PC" || kind === "PL";
        const isHost = kind === "KP" || kind === "GM";
        const isNpc = kind === "NPC";

        const baseIcons = isPlayerSide
          ? pcIconOptions
          : isHost
            ? kpIconOptions
            : isNpc
              ? npcIconOptions
              : systemIconOptions;

        const hasKnown = baseIcons.some((o) => o.value === currentExplicit);
        const iconOptions =
          currentExplicit && !hasKnown
            ? [...baseIcons, { value: currentExplicit, label: "アップロードした画像" }]
            : baseIcons;

        /* 2 つ目の操作は役割ごとに 1 つだけ: PC/PL は「誰の発言か」（アイコンも連動）、GM と NPC はアイコン */
        const second = isPlayerSide ? (
          <Select
            size="sm"
            ariaLabel={`${sp}は誰の発言か`}
            className="w-full"
            value={kind === "PL" && linkValue.startsWith("char:") ? "" : linkValue}
            onChange={(v) => onLinkChange(sp, v)}
            options={kind === "PL" ? plLinkOptions : pcLinkOptions}
          />
        ) : kind === "SYSTEM" ? null : (
          <Select
            size="sm"
            ariaLabel={`${sp}のアイコン`}
            className="w-full"
            value={currentExplicit}
            onChange={(v) => onIconChange(sp, v)}
            options={iconOptions}
          />
        );

        return (
          <li
            key={sp}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[auto_1fr_6.5rem_15rem]"
          >
            <label className="relative shrink-0 cursor-pointer rounded-full" aria-label={`${sp}の画像を選ぶ`}>
              <img
                src={previewSrc}
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
                    if (dataUrl) onIconChange(sp, dataUrl);
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
              onChange={(v) => onRoleChange(sp, v)}
              options={roleOptionsFor(kind)}
            />
            {second && <div className="col-span-3 pl-12 sm:col-span-1 sm:pl-0">{second}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* ================= ステップ2: 内容と参加者の確認 ================= */
function Step2Review({
  draft,
  setDraft,
  attachId,
  committing,
  manual,
  error,
  onCommit,
  onBack,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  attachId: string | null;
  committing: boolean;
  manual: boolean;
  error: FlowError;
  onCommit: () => void;
  onBack: () => void;
}) {
  const { state } = useStore();
  const [scq, setScq] = useState("");
  const [showNew, setShowNew] = useState(Boolean(draft.newScenario));
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [editDates, setEditDates] = useState<string[]>([]);
  const [editStart, setEditStart] = useState("21:00");
  const [editEnd, setEditEnd] = useState("24:00");
  const [editError, setEditError] = useState<string | null>(null);

  const scenario = state.scenarios[draft.scenarioId];
  const hasSelectedSystem = Boolean(draft.meta.systemId && draft.meta.systemId !== "general");

  /* ログ本文やファイル名にタイトルが出てくるシナリオを先頭に出す（候補の手がかり） */
  const logText = useMemo(
    () =>
      [draft.fileName ?? "", ...draft.channels.flatMap((c) => c.msgs.slice(0, 200).map((m) => m.text ?? ""))]
        .join("\n")
        .toLowerCase(),
    [draft.fileName, draft.channels],
  );
  const scResults = useMemo(() => {
    const q = scq.trim().toLowerCase();
    const rank = (sc: { title: string; systemId: string }) =>
      (logText.includes(sc.title.toLowerCase()) ? 0 : 2) +
      (hasSelectedSystem && sc.systemId !== draft.meta.systemId ? 1 : 0);
    return Object.values(state.scenarios)
      .filter((sc) => !q || (sc.title + sc.author).toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, q ? 6 : 3);
  }, [state.scenarios, scq, hasSelectedSystem, draft.meta.systemId, logText]);

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
  const msgCount = draft.channels.reduce((n, c) => n + c.msgs.length, 0);

  const currentDates = draft.manual?.dates ?? draft.derived?.dates ?? null;
  const clock = useMemo(() => {
    if (draft.manual) return `${draft.manual.start}〜${draft.manual.end}`;
    if (draft.derived) {
      const ds = draft.derived.dates;
      return `${sessionClock(draft.derived.t0, ds[0]!)}〜${sessionClock(draft.derived.t1, ds[ds.length - 1]!)}`;
    }
    return "";
  }, [draft.manual, draft.derived]);
  const playMinutes = useMemo(() => {
    if (draft.manual) {
      const range = buildSessionRange({
        dates: draft.manual.dates,
        startTime: draft.manual.start,
        endTime: draft.manual.end,
      });
      return range.ok ? sessionPlayMinutes({ hasLog: false, channels: [], t0: range.t0, t1: range.t1 }) : 0;
    }
    if (draft.derived) {
      return sessionPlayMinutes({
        hasLog: true,
        channels: draft.channels,
        t0: draft.derived.t0,
        t1: draft.derived.t1,
      });
    }
    return 0;
  }, [draft.manual, draft.derived, draft.channels]);

  function toggleScheduleEditor() {
    if (editingSchedule) {
      setEditingSchedule(false);
      setEditError(null);
      return;
    }
    if (draft.manual) {
      setEditDates([...draft.manual.dates]);
      setEditStart(draft.manual.start);
      setEditEnd(draft.manual.end);
    } else if (draft.derived) {
      const ds = draft.derived.dates;
      setEditDates([...ds]);
      setEditStart(sessionClock(draft.derived.t0, ds[0]!));
      setEditEnd(sessionClock(draft.derived.t1, ds[ds.length - 1]!));
    } else {
      setEditDates([todayStr()]);
      setEditStart("21:00");
      setEditEnd("24:00");
    }
    setEditError(null);
    setEditingSchedule(true);
  }

  function applySchedule() {
    const hasInvalidDate = editDates.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
    if (hasInvalidDate || new Set(editDates).size !== editDates.length) {
      setEditError("実施日を重複しない日付で入力してください。");
      return;
    }
    const sortedDates = [...editDates].sort();
    const range = buildSessionRange({ dates: sortedDates, startTime: editStart, endTime: editEnd });
    if (!range.ok) {
      setEditError(range.error ?? "時刻を確認してください");
      return;
    }
    setEditError(null);
    if (draft.manual) {
      setDraft({ ...draft, manual: { dates: sortedDates, start: editStart, end: editEnd } });
    } else {
      const remapped = remapChannelTimestamps(draft.channels, sortedDates, range.t0, range.t1);
      setDraft({
        ...draft,
        channels: remapped,
        derived: { dates: sortedDates, t0: range.t0, t1: range.t1 },
      });
    }
    setEditingSchedule(false);
  }

  function selectTable(id: string) {
    const members = id ? state.tables[id].memberIds.filter((m) => m !== state.me) : [];
    setDraft({
      ...draft,
      tableId: id,
      players: members.map((m) => {
        const existing = draft.players.find((p) => p.userId === m);
        return existing ?? { userId: m, characterIds: [] };
      }),
    });
  }

  function setChar(userId: string, cid: string) {
    setDraft({
      ...draft,
      players: draft.players.map((p) => (p.userId === userId ? { ...p, characterIds: cid ? [cid] : [] } : p)),
    });
  }

  function pickScenario(id: string) {
    const sc = state.scenarios[id];
    const defaultScope: Scope =
      sc.policy === "public" ? "public" : (sc.policy as string) === "passed" ? "passed" : "members";
    setDraft({
      ...draft,
      scenarioId: id,
      newScenario: null,
      meta: { ...draft.meta, systemId: sc.systemId, title: draft.meta.title || sc.title },
      scope: defaultScope,
      guess: null,
    });
  }

  function handleSpeakerLinkChange(sp: string, value: string) {
    const nextLinks = { ...draft.speakerLinks };
    const nextIcons = { ...draft.speakerIcons };
    let nextPlayers = [...draft.players];

    if (!value) {
      delete nextLinks[sp];
      setDraft({ ...draft, speakerLinks: nextLinks, speakerIcons: nextIcons, players: nextPlayers });
      return;
    }

    if (value.startsWith("char:")) {
      const cid = value.slice(5);
      const ch = state.characters[cid];
      if (!ch) return;
      nextLinks[sp] = { userId: ch.ownerId, characterId: ch.id };
      nextIcons[sp] = characterAvatarSrc(ch);
      if (ch.ownerId !== state.me) {
        const idx = nextPlayers.findIndex((p) => p.userId === ch.ownerId);
        if (idx >= 0) {
          const existing = nextPlayers[idx]!;
          if (!existing.characterIds.includes(ch.id)) {
            nextPlayers[idx] = { ...existing, characterIds: [ch.id, ...existing.characterIds] };
          }
        } else {
          nextPlayers = [...nextPlayers, { userId: ch.ownerId, characterIds: [ch.id] }];
        }
      }
      setDraft({ ...draft, speakerLinks: nextLinks, speakerIcons: nextIcons, players: nextPlayers });
      return;
    }

    if (value.startsWith("user:")) {
      const uid = value.slice(5);
      const u = state.users[uid];
      if (!u) return;
      nextLinks[sp] = { userId: u.id };
      nextIcons[sp] = userAvatarSrc(u);
      if (u.id !== state.me && !nextPlayers.some((p) => p.userId === u.id)) {
        nextPlayers = [...nextPlayers, { userId: u.id, characterIds: [] }];
      }
      setDraft({ ...draft, speakerLinks: nextLinks, speakerIcons: nextIcons, players: nextPlayers });
    }
  }

  const backLabel = manual ? "日時入力に戻る" : "ログ選択に戻る";
  const myTables = Object.values(state.tables).filter(
    (t) => t.ownerId === state.me || t.memberIds.includes(state.me),
  );
  const scopeMeta = SCOPE_META[draft.scope];
  const hasLog = draft.channels.length > 0;
  const rollsCount = useMemo(
    () => draft.channels.reduce((n, c) => n + c.msgs.filter((m) => m.roll).length, 0),
    [draft.channels],
  );
  const secretChannels = useMemo(() => draft.channels.filter((c) => c.secret), [draft.channels]);

  const basicInfoSection = (
    <section className="surface p-5 sm:p-6" aria-labelledby="sum-head">
      <h2 id="sum-head" className="mb-4 text-base font-bold">
        基本情報
      </h2>
      <div className="list">
        <FormRow label="タイトル">
          <input
            id="upload-title"
            aria-label="タイトル"
            aria-invalid={error?.field === "title" || undefined}
            className={cx("input input-bordered w-full", error?.field === "title" && "input-error")}
            value={draft.meta.title}
            onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, title: e.target.value } })}
            placeholder={scenario ? scenario.title : "例: 廃校の十三時間目（2陣）"}
          />
          <FieldError text={error?.field === "title" ? error.text : null} />
        </FormRow>

        <FormRow label="日時">
          <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold">
              {currentDates ? fmtDates(currentDates) : "未入力"}
              {clock && <span className="ml-2 font-normal tabular-nums">{clock}</span>}
            </span>
            {playMinutes > 0 && <span className="text-sm text-ink2 tabular-nums">{fmtDur(playMinutes)}</span>}
            <button
              type="button"
              aria-expanded={editingSchedule}
              className="btn btn-quiet btn-sm ml-auto"
              onClick={toggleScheduleEditor}
            >
              {editingSchedule ? "閉じる" : "変更"}
            </button>
          </div>
          {editingSchedule && (
            <div className="mt-3 space-y-4 rounded-lg bg-base-200/60 p-4">
              <DateList dates={editDates} setDates={setEditDates} size="sm" />
              <TimeRange start={editStart} end={editEnd} setStart={setEditStart} setEnd={setEditEnd} />
              {editError && (
                <p role="alert" className="text-sm text-error">
                  {editError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => {
                    setEditingSchedule(false);
                    setEditError(null);
                  }}
                >
                  キャンセル
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={applySchedule}>
                  日時を反映
                </button>
              </div>
            </div>
          )}
        </FormRow>

        <FormRow label="システム">
          <Select
            ariaLabel="システム"
            className="w-full sm:max-w-sm"
            value={draft.meta.systemId}
            onChange={(v) => setDraft({ ...draft, meta: { ...draft.meta, systemId: v }, guess: null })}
            options={SYSTEM_LIST.map((s) => ({ value: s.id, label: s.name }))}
          />
        </FormRow>

        <FormRow label="シナリオ">
          {scenario && !showNew ? (
            <div className="flex min-h-10 items-center gap-3">
              <IconBooks width={18} height={18} className="shrink-0 text-ink2" aria-hidden />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-sm">{scenario.title}</b>
                <span className="text-xs text-ink2">{scenario.author}</span>
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => setDraft({ ...draft, scenarioId: "" })}
              >
                選び直す
              </button>
            </div>
          ) : showNew ? (
            <div className="space-y-2">
              <input
                aria-label="シナリオタイトル"
                placeholder="シナリオタイトル"
                className="input input-bordered w-full"
                value={draft.newScenario?.title ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    newScenario: {
                      ...(draft.newScenario ?? { author: "", policy: "public" as Policy }),
                      title: e.target.value,
                      policy: "public",
                    },
                  })
                }
              />
              <input
                aria-label="作者・サークル"
                placeholder="作者・サークル"
                className="input input-bordered w-full"
                value={draft.newScenario?.author ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    newScenario: {
                      ...(draft.newScenario ?? { title: "", policy: "public" as Policy }),
                      author: e.target.value,
                      policy: "public",
                    },
                  })
                }
              />
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  setShowNew(false);
                  setDraft({ ...draft, newScenario: null });
                }}
              >
                登録済みから選ぶ
              </button>
            </div>
          ) : (
            <div>
              <label className="input input-bordered flex items-center gap-2">
                <IconSearch width={16} height={16} className="shrink-0 opacity-50" aria-hidden />
                <input
                  type="search"
                  aria-label="シナリオを検索"
                  className="min-w-0 grow"
                  placeholder="タイトル・作者で検索"
                  value={scq}
                  onChange={(e) => setScq(e.target.value)}
                />
              </label>
              <ul className="mt-1.5">
                {scResults.map((s) => {
                  const showSystem = !hasSelectedSystem || s.systemId !== draft.meta.systemId;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-base-200"
                        onClick={() => pickScenario(s.id)}
                      >
                        <span className="min-w-0 flex-1">
                          <b className="block truncate text-sm">{s.title}</b>
                          <span className="block truncate text-xs text-ink2">
                            {s.author}
                            {showSystem ? `　${SYSTEMS[s.systemId]?.name ?? "汎用・その他"}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-primary">選ぶ</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {scResults.length === 0 && (
                <p className="px-2 py-2 text-sm text-ink2">一致するシナリオがありません。</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2 px-2">
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowNew(true)}>
                  <IconPlus width={14} height={14} aria-hidden /> 新しく登録
                </button>
                <span className="text-xs text-ink2">選ばなくても記録します</span>
              </div>
            </div>
          )}
        </FormRow>

        <FormRow label="卓">
          <Select
            ariaLabel="卓を選ぶ"
            className="w-full sm:max-w-sm"
            value={draft.tableId}
            onChange={selectTable}
            options={[
              { value: "", label: "選ばない" },
              ...myTables.map((t) => ({ value: t.id, label: `${t.name}（${t.memberIds.length}人）` })),
            ]}
          />
          <p className="mt-1.5 text-xs text-ink2">選ぶと卓のメンバーを参加者に入れます。</p>
        </FormRow>
      </div>
    </section>
  );

  const castSection = (
    <section className="surface p-5 sm:p-6" aria-labelledby="players-head">
      <div className="mb-4">
        <h2 id="players-head" className="text-base font-bold">
          {speakers.length > 0 ? "参加者と発言者" : "参加者"}
        </h2>
        <p className="mt-0.5 text-sm text-ink2">
          {speakers.length > 0
            ? "ログの発言者と参加メンバーの対応です。キャラクターはあとから付けても構いません。"
            : "キャラクターはあとから付けても構いません。"}
        </p>
      </div>

      {speakers.length > 0 && (
        <div className="mb-5 border-b border-base-300 pb-5">
          <h3 className="eyebrow mb-3">ログの発言者</h3>
          <UploadSpeakerConfigGrid
            speakers={speakers}
            speakerIcons={draft.speakerIcons}
            speakerLinks={draft.speakerLinks}
            state={state}
            onRoleChange={(sp, kind) => setDraft({ ...draft, kinds: { ...draft.kinds, [sp]: kind } })}
            onIconChange={(sp, src) => {
              const nextIcons = { ...draft.speakerIcons };
              if (src) nextIcons[sp] = src;
              else delete nextIcons[sp];
              setDraft({ ...draft, speakerIcons: nextIcons });
            }}
            onLinkChange={handleSpeakerLinkChange}
          />
        </div>
      )}

      <div>
        {speakers.length > 0 && <h3 className="eyebrow mb-3">参加メンバー</h3>}
        <PlayerPicker
          state={state}
          exclude={[state.me, ...draft.players.map((p) => p.userId)]}
          selected={[]}
          onChange={(ids) =>
            setDraft({
              ...draft,
              players: [...draft.players, ...ids.map((id) => ({ userId: id, characterIds: [] }))],
            })
          }
          placeholder="ユーザー名で検索して追加…"
        />
        {draft.players.length > 0 ? (
          <ul className="list mt-3">
            {draft.players.map((p) => {
              const u = state.users[p.userId];
              if (!u) return null;
              const chars = Object.values(state.characters).filter(
                (c) => c.ownerId === p.userId && (!hasSelectedSystem || c.systemId === draft.meta.systemId),
              );
              return (
                <li
                  key={p.userId}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 py-2.5 sm:grid-cols-[auto_1fr_14rem_auto]"
                >
                  <Avatar u={u} size={32} />
                  <b className="min-w-0 truncate text-sm">{u.name}</b>
                  <div className="col-span-3 row-start-2 pl-11 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:pl-0">
                    <Select
                      size="sm"
                      ariaLabel={`${u.name}のキャラクター`}
                      className="w-full"
                      value={p.characterIds[0] ?? ""}
                      onChange={(v) => setChar(p.userId, v)}
                      options={[
                        { value: "", label: "キャラクターなし" },
                        ...chars.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn col-start-3 row-start-1 sm:col-start-4"
                    aria-label={`${u.name}を参加者から外す`}
                    onClick={() =>
                      setDraft({ ...draft, players: draft.players.filter((x) => x.userId !== p.userId) })
                    }
                  >
                    <IconX width={16} height={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink2">ほかの参加者を入れない場合は、あなただけの記録になります。</p>
        )}
      </div>
    </section>
  );

  const scopeSection = (
    <section className="surface p-5 sm:p-6" aria-labelledby="scope-head">
      <h2 id="scope-head" className="mb-3 text-base font-bold">
        共有範囲
      </h2>
      <Seg<Scope>
        ariaLabel="共有範囲"
        value={draft.scope}
        onChange={(scope) => setDraft({ ...draft, scope })}
        options={(["members", "passed", "public"] as const).map((v) => {
          const M = SCOPE_META[v];
          return {
            v,
            label: (
              <>
                <M.Icon width={15} height={15} aria-hidden />
                {M.label}
              </>
            ),
          };
        })}
      />
      <p className="mt-2 text-sm text-ink2">
        {scopeMeta.hint}。記録したあともセッションの「共有」から変えられます。
      </p>
    </section>
  );

  const actionErrors = (
    <>
      {error?.field === "general" && (
        <p role="alert" className="mb-2 text-sm text-error">
          {error.text}
        </p>
      )}
      {error?.field === "title" && (
        <p className="mb-2 text-sm text-error lg:hidden">タイトルを入力してください。</p>
      )}
    </>
  );

  if (hasLog) {
    return (
      <div className="space-y-6">
        <div className="surface flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <IconCheck width={18} height={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <p className="text-sm font-bold" role="status">
                読み取り完了
              </p>
              {draft.fileName && <span className="truncate text-xs text-ink2">{draft.fileName}</span>}
            </div>
            <div className="meta mt-0.5 text-xs tabular-nums">
              {currentDates && (
                <span>
                  {fmtDates(currentDates)}
                  {playMinutes > 0 && `（${fmtDur(playMinutes)}）`}
                </span>
              )}
              <span>
                発言 {msgCount}件（ダイス {rollsCount}件）
              </span>
              <span>
                タブ {draft.channels.length}つ
                {secretChannels.length > 0 && `・シークレット ${secretChannels.length}タブも記録`}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-quiet btn-sm shrink-0" onClick={onBack}>
            別のログにする
          </button>
        </div>

        <SplitLayout
          asideWidth="lg"
          stickyAside
          main={
            <div className="space-y-6">
              {basicInfoSection}
              {castSection}
              {scopeSection}
            </div>
          }
          aside={
            <div className="space-y-4">
              <section className="surface overflow-hidden" aria-labelledby="preview-head">
                <div className="flex items-baseline gap-2 border-b border-base-300 px-5 py-3.5">
                  <h2 id="preview-head" className="text-base font-bold">
                    ログの表示
                  </h2>
                  <span className="text-sm text-ink2 tabular-nums">{msgCount}件</span>
                </div>
                <div className="max-h-[26rem] overflow-y-auto px-2 py-2 sm:px-3">
                  <SessionTimeline log={previewLog} state={state} mode="own" filter={previewFilter} />
                </div>
              </section>

              <div className="hidden lg:block">
                {error?.field === "general" && (
                  <p role="alert" className="mb-2 text-sm text-error">
                    {error.text}
                  </p>
                )}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button type="button" className="btn btn-quiet" onClick={onBack}>
                    <IconChevronLeft width={16} height={16} aria-hidden />
                    {backLabel}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary min-w-36"
                    disabled={committing}
                    onClick={onCommit}
                  >
                    {committing && <span className="loading loading-spinner loading-xs" aria-hidden />}
                    {committing ? "記録中…" : attachId ? "添付する" : "記録する"}
                  </button>
                </div>
              </div>
            </div>
          }
        />

        <div
          className="sticky z-20 -mx-4 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:hidden"
          style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
        >
          {actionErrors}
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn btn-quiet" onClick={onBack}>
              <IconChevronLeft width={16} height={16} aria-hidden />
              {backLabel}
            </button>
            <button
              type="button"
              className="btn btn-primary min-w-32"
              disabled={committing}
              onClick={onCommit}
            >
              {committing && <span className="loading loading-spinner loading-xs" aria-hidden />}
              {committing ? "記録中…" : attachId ? "添付する" : "記録する"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {basicInfoSection}
      {castSection}
      {scopeSection}

      {/* 操作バー: モバイルでは下部タブの上に固定 */}
      <div
        className="sticky z-20 -mx-4 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-2 lg:backdrop-blur-none"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      >
        {actionErrors}
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            <IconChevronLeft width={16} height={16} aria-hidden />
            {backLabel}
          </button>
          <button type="button" className="btn btn-primary min-w-32" disabled={committing} onClick={onCommit}>
            {committing && <span className="loading loading-spinner loading-xs" aria-hidden />}
            {committing ? "記録中…" : attachId ? "添付する" : "記録する"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= ステップ3: 完了 ================= */
function Step3Done({
  result,
  attachId,
  scope,
  onRestart,
}: {
  result: CommitLogResult | null;
  attachId: string | null;
  scope: Scope;
  onRestart: () => void;
}) {
  const { state } = useStore();
  const nav = useNavigate();
  const [reportCard, setReportCard] = useState(false);
  if (!result) return <Empty>結果を読み込み中…</Empty>;
  const log = state.logs[result.id];
  const sys = log ? SYSTEMS[log.systemId] : undefined;
  const others = log ? Object.keys(log.players).filter((u) => u !== state.me).length : 0;

  return (
    <section className="surface p-5 sm:p-8">
      <div className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <IconCheck width={22} height={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">
            {attachId ? "ログを添付しました" : "セッションを記録しました"}
          </h2>
          {log && (
            <>
              <p className="mt-1 truncate font-semibold">{log.title}</p>
              <div className="meta mt-1">
                <span>{fmtDates(log.dates)}</span>
                {sys && <SysBadge sys={sys} />}
                {others > 0 && <span>参加者 {others}人</span>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 border-t border-base-300 pt-5">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-sm font-bold">共有リンク</h3>
          <ScopeLabel scope={scope} className="text-sm text-ink2" />
        </div>
        <CopyBox text={`${location.origin}/share/l/${result.slug}`} />
        <p className="mt-2 text-xs text-ink2">
          {SCOPE_META[scope].hint}。参加者の招待はセッションの「参加者」から行います。
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => nav({ to: `/sessions/${result.id}` })}
        >
          セッションを開く
        </button>
        {log && (
          <button type="button" className="btn" onClick={() => setReportCard(true)}>
            <IconBrandX width={15} height={15} /> Xで卓報告
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onRestart}>
          続けて記録する
        </button>
      </div>

      {reportCard && log && <ReportCardModal log={log} onClose={() => setReportCard(false)} />}
    </section>
  );
}
