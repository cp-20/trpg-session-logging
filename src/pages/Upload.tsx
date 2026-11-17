import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../store";
import { CopyBox, Empty, Field, NotFound, PageHead, Tag, cx } from "../components/ui";
import { PlayerPicker } from "../components/pickers";
import { SessionTimeline, TimelineFilter } from "../components/timeline";
import { SAMPLE_LOG } from "../data/seed";
import { SYSTEMS, SYSTEM_LIST, POLICY_LABEL } from "../data/systems";
import { buildSessionRange, deriveSessionFromMessages, fmtDate, fmtDur, sessionPlayMinutes, todayStr } from "../lib/time";
import { inferSystem } from "../lib/system-guess";
import { parseCcfoliaLog, parseCcfoliaLogZip, type ParsedLog } from "../lib/ccfolia-parser";
import { commitLogImport, type CommitLogResult } from "../api/commands";
import type { Channel, Log, MsgKind, Policy } from "../types";
import { IconUpload, IconWand, IconCheck, IconShieldLock, IconSparkles, IconFileText, IconUsersGroup, IconPlus, IconX, IconBooks } from "../components/icons";

/* Step3 を終えた時点の確定前の内容。ログあり/なしの両方を同じ形で運ぶ */
interface Draft {
  fileName: string | null;
  channels: Channel[];
  kinds: Record<string, MsgKind>;
  meta: { title: string; systemId: string };
  guess: { id: string; reason: string } | null;
  tableId: string;
  scenarioId: string;
  newScenario: { title: string; author: string; policy: Policy } | null;
  players: { userId: string; characterIds: string[] }[];
  derived: { dates: string[]; t0: number; t1: number } | null;
  /* ログなしパスのときのみ入る */
  manual: { dates: string[]; start: string; end: string } | null;
}

export default function Upload() {
  const { state, update, toast } = useStore();
  const [sp] = useSearchParams();
  const attachId = sp.get("log");
  const presetTable = sp.get("table") ?? "";
  const presetScenario = sp.get("scenario") ?? "";
  const attachLog = attachId ? state.logs[attachId] : null;

  /* 手順: 1 入力(ログ or 手入力) → 2 分類の確認(ログありのみ) → 3 参加者 → 4 完了 */
  const [step, setStep] = useState(1);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [result, setResult] = useState<CommitLogResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = manual ? 3 : 4;
  const stepIndex = manual && step > 1 ? step - 1 : step;

  async function handleCommit() {
    if (!draft || committing) return;
    if (!draft.meta.title.trim()) {
      setError("セッションのタイトルを入力してください。");
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      let schedule = null;
      if (draft.manual) {
        const range = buildSessionRange({ dates: draft.manual.dates, startTime: draft.manual.start, endTime: draft.manual.end });
        if (!range.ok) {
          setError(range.error ?? "日時を確認してください");
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
          tableId: draft.tableId,
          scenarioId: draft.scenarioId,
          newScenario: draft.newScenario,
          players: draft.players,
          schedule,
        },
        state,
        update
      );
      if (!r.ok) {
        setError(r.reason ?? "記録できませんでした。入力内容を確認して、もう一度お試しください。");
        return; // Step3 に留まり、入力は保持される
      }
      setResult(r);
      setStep(4);
      toast(draft.manual ? "セッションを記録しました" : attachId ? "ログを添付しました" : "ログをアップロードしました");
    } catch {
      setError("記録できませんでした。入力内容は保持されています。もう一度お試しください。");
    } finally {
      setCommitting(false);
    }
  }

  if (attachId && !attachLog) return <NotFound what="添付先のセッション" />;

  return (
    <>
      <PageHead
        back={{ to: attachLog ? `/sessions/${attachLog.id}` : presetTable ? `/tables/${presetTable}` : "/sessions", label: attachLog ? attachLog.title : presetTable ? state.tables[presetTable]?.name ?? "卓" : "セッション" }}
        title={attachLog ? `「${attachLog.title}」にログを添付` : "セッションを記録"}
        sub={attachLog ? "ログから日時とシステムを読み取り、記録済みのセッションに追加します。" : "ココフォリアのログから取り込むか、日時と参加者を入力して記録します。"}
      />
      <Steps step={stepIndex} total={totalSteps} manual={manual} />
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
            setStep(manual || d.manual ? 3 : 2);
          }}
          toast={toast}
        />
      )}
      {step === 2 && draft && <Step2 draft={draft} setDraft={setDraft} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {step === 3 && draft && <Step3 draft={draft} setDraft={setDraft} attachId={attachId} committing={committing} manual={manual} onCommit={handleCommit} onBack={() => { setError(null); setStep(manual ? 1 : 2); }} />}
      {error && <p role="alert" className="text-sm text-error mt-3">{error}</p>}
      {step === 4 && <Step4 result={result} attachId={attachId} manual={manual} />}
    </>
  );
}

function Steps({ step, total, manual }: { step: number; total: number; manual: boolean }) {
  const labels = manual ? ["日時を入力", "シナリオと参加者", "完了"] : ["ログを選ぶ", "ログを確認", "シナリオと参加者", "完了"];
  return (
    <ol aria-label="記録の手順" className="grid gap-2 mb-6 text-xs" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
      {labels.map((label, i) => (
        <li key={label} aria-current={step === i + 1 ? "step" : undefined} className={cx("border-t-2 pt-2 leading-5", step > i ? "border-primary text-primary font-semibold" : "border-base-300 text-base-content/60")}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function buildDraft(opts: {
  fileName: string | null;
  channels: Channel[];
  attachLog: Log | null;
  presetTable: string;
  presetScenario: string;
  manual: Draft["manual"];
}): Draft {
  const { fileName, channels, attachLog, presetTable, presetScenario, manual } = opts;
  const kinds: Record<string, MsgKind> = {};
  channels.forEach((c) => c.msgs.forEach((m) => (kinds[m.sp] = m.kind)));
  const guess = channels.length ? inferSystem(channels) : null;
  const systemId = attachLog?.systemId ?? guess?.id ?? "general";
  return {
    fileName,
    channels,
    kinds,
    meta: { title: attachLog?.title ?? "", systemId },
    guess,
    tableId: attachLog?.tableId ?? presetTable,
    scenarioId: attachLog?.scenarioId ?? presetScenario,
    newScenario: null,
    players: Object.keys(attachLog?.players ?? {}).length
      ? Object.entries(attachLog!.players).map(([userId, p]) => ({ userId, characterIds: p.characterIds }))
      : [],
    derived: deriveSessionFromMessages(channels),
    manual,
  };
}

/* ================= ステップ1: ログをドロップ / 手入力 ================= */
function Step1({
  presetTable,
  presetScenario,
  attachLog,
  draft,
  manual,
  setManual,
  onDone,
  toast,
}: {
  presetTable: string;
  presetScenario: string;
  attachLog: Log | null;
  draft: Draft | null;
  manual: boolean;
  setManual: (v: boolean) => void;
  onDone: (d: Draft) => void;
  toast: (m: string) => void;
}) {
  const [running, setRunning] = useState(false);
  const [parsed, setParsed] = useState<ParsedLog | null>(() => draft?.channels.length ? { channels: draft.channels, kinds: draft.kinds, messageCount: draft.channels.reduce((n, c) => n + c.msgs.length, 0) } : null);
  const [fileInfo, setFileInfo] = useState<string | null>(draft?.fileName ?? null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | File[] | null) {
    const f = files?.[0] ?? (Array.isArray(files) ? files[0] : null);
    if (!f) return;
    setRunning(true);
    setError(null);
    setParsed(null);
    setFileInfo(null);
    try {
      let p: ParsedLog | null = null;
      if (/\.(zip)$/i.test(f.name) || f.type === "application/zip") {
        p = await parseCcfoliaLogZip(f);
      } else {
        p = parseCcfoliaLog(await f.text());
      }
      if (!p || p.messageCount === 0) {
        setError("読み取れる発言が見つかりませんでした。ココフォリアから書き出した JSON・HTML・ZIP ファイルを選んでください。");
        return;
      }
      setParsed(p);
      setFileInfo(f.name);
    } catch {
      setError("ファイルを読み取れませんでした。ココフォリアからログを書き出し直して、もう一度お試しください。");
    } finally {
      setRunning(false);
    }
  }

  function finishSample() {
    const channels = JSON.parse(JSON.stringify(SAMPLE_LOG)) as Channel[];
    setParsed(null);
    setFileInfo(null);
    onDone(buildDraft({ fileName: null, channels, attachLog, presetTable, presetScenario, manual: null }));
  }

  /* ---- 手入力(ログなし)パス ---- */
  return manual && !attachLog ? (
    <ManualForm
      presetTable={presetTable}
      presetScenario={presetScenario}
      initial={draft?.manual ? draft : null}
      onBack={() => setManual(false)}
      onNext={(d) => onDone(d)}
    />
  ) : (
    <>
      <div className="card bg-base-100 border border-base-300 px-5 py-5">
        <div
          className={cx("drop", running && "pointer-events-none opacity-70")}
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("hot");
          }}
          onDragLeave={(e) => e.currentTarget.classList.remove("hot")}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("hot");
            onFiles(e.dataTransfer.files);
          }}
        >
          <IconFileText width={30} height={30} className="mx-auto opacity-50" />
          <b className="block mt-1">ここにログをドロップ</b>
          <p className="text-[11.5px] text-ink2 my-2 leading-5">
            CCFOLIAのログ出力（{"{room}_log.json"}・HTML・zip）に対応。
            <br />
            出力できるのはルームマスターです。
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <input type="file" aria-label="ログファイルを選ぶ" accept=".json,.html,.htm,.txt,.zip" className="file-input file-input-bordered file-input-primary file-input-sm w-full max-w-xs" disabled={running} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <button className="btn btn-sm" disabled={running} onClick={finishSample}>
              サンプルログで試す
            </button>
          </div>
          {running && (
            <>
              <div role="status" className="mt-3 flex justify-center items-center gap-2 text-sm"><span className="loading loading-spinner loading-sm" />読み込み中…</div>
            </>
          )}
        </div>

        {parsed && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Tag v="ok"><IconCheck width={12} height={12} /> 読み取り完了</Tag>
              <span className="text-[12px] text-ink2">{fileInfo}</span>
            </div>
            {(() => {
              const msgs = parsed.channels.reduce((a, c) => a + c.msgs.length, 0);
              const speakers = [...new Set(parsed.channels.flatMap((c) => c.msgs.map((m) => m.sp)))];
              const derived = deriveSessionFromMessages(parsed.channels);
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    <div className="card bg-base-200/60 px-3 py-2"><div className="text-xl font-extrabold">{msgs}</div><div className="text-[10.5px] text-ink2">発言</div></div>
                    <div className="card bg-base-200/60 px-3 py-2"><div className="text-xl font-extrabold">{parsed.channels.length}</div><div className="text-[10.5px] text-ink2">タブ</div></div>
                    <div className="card bg-base-200/60 px-3 py-2"><div className="text-xl font-extrabold">{parsed.channels.flatMap((c) => c.msgs).filter((m) => m.roll).length}</div><div className="text-[10.5px] text-ink2">ロール</div></div>
                    <div className="card bg-base-200/60 px-3 py-2"><div className="text-xl font-extrabold text-error">{parsed.channels.filter((c) => c.secret).reduce((a, c) => a + c.msgs.length, 0)}</div><div className="text-[10.5px] text-ink2">シークレット</div></div>
                  </div>
                  <div className="mt-3 text-[12px] text-base-content/70 leading-6">
                    <div><b className="text-[11px] text-ink2 mr-1.5">タブ</b>{parsed.channels.map((c) => c.name).join(" / ")}</div>
                    <div><b className="text-[11px] text-ink2 mr-1.5">発言者</b>{speakers.slice(0, 6).join("・")}{speakers.length > 6 ? ` ほか${speakers.length - 6}人` : ""}</div>
                    {derived && <div><b className="text-[11px] text-ink2 mr-1.5">日時</b>{derived.dates.map(fmtDate).join("・")} · {fmtDur(sessionPlayMinutes({ hasLog: true, channels: parsed.channels, t0: derived.t0, t1: derived.t1 }))}</div>}
                  </div>
                </>
              );
            })()}
            <div className="flex justify-end mt-4">
              <button
                className="btn btn-primary"
                onClick={() => onDone(draft?.channels === parsed.channels ? draft : buildDraft({ fileName: fileInfo, channels: parsed.channels, attachLog, presetTable, presetScenario, manual: null }))}
              >
                分類の確認へ進む
              </button>
            </div>
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-error mt-3">{error}</p>}
      {!attachLog && <div className="mt-5 pt-5 border-t border-base-300 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-sm">ログなしで記録</h2><p className="text-xs text-base-content/70 mt-1">ログはあとから追加できます。</p></div><button className="btn btn-outline btn-sm" onClick={() => setManual(true)}>日時と参加者を直接入力する</button></div>}
      {attachLog && <p className="text-[11px] text-ink2 mt-2">添付先「{attachLog.title}」の情報が更新されます。</p>}
    </>
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
  const { state, toast } = useStore();
  const [title, setTitle] = useState(initial?.meta.title ?? "");
  const [dates, setDates] = useState<string[]>(initial?.manual?.dates ?? [todayStr()]);
  const [start, setStart] = useState(initial?.manual?.start ?? "21:00");
  const [end, setEnd] = useState(initial?.manual?.end ?? "25:00");
  const [tableId, setTableId] = useState(initial?.tableId ?? presetTable);
  const [error, setError] = useState<string | null>(null);
  const myTables = Object.values(state.tables).filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me);
  const table = tableId ? state.tables[tableId] : null;

  function addDate() {
    const last = dates.at(-1) || todayStr();
    const base = new Date(last + "T00:00:00Z");
    base.setUTCDate(base.getUTCDate() + 1);
    setDates([...dates, base.toISOString().slice(0, 10)]);
  }

  function next() {
    if (!title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }
    if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)) || new Set(dates).size !== dates.length) {
      setError("実施日を重複しない日付で入力してください。");
      return;
    }
    const sortedDates = [...dates].sort();
    const range = buildSessionRange({ dates: sortedDates, startTime: start, endTime: end });
    if (!range.ok) {
      setError(range.error ?? "時刻を確認してください");
      return;
    }
    const members = (table?.memberIds.filter((m) => m !== state.me)) ?? [];
    onNext({
      ...(initial ?? buildDraft({ fileName: null, channels: [], attachLog: null, presetTable, presetScenario, manual: null })),
      meta: { title: title.trim(), systemId: table?.systemId ?? initial?.meta.systemId ?? "general" },
      tableId,
      players: initial?.tableId === tableId ? initial.players : members.map((m) => ({ userId: m, characterIds: [] })),
      manual: { dates: sortedDates, start, end },
    });
  }

  return (
    <div className="card bg-base-100 border border-base-300 px-5 py-5">
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="タイトル">
          <input className="input input-bordered input-sm w-full bg-base-100" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 廃校の十三時間目 — 後夜祭" autoFocus />
        </Field>
        <Field label="卓（参加者を自動で入れます）">
          <select className="select select-bordered select-sm bg-base-100" value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">— 選択しない —</option>
            {myTables.map((t) => (
              <option key={t.id} value={t.id}>{t.name}（{t.memberIds.length}人）</option>
            ))}
          </select>
        </Field>
        <div className="mt-2.5">
          <div className="text-xs font-semibold mb-1">実施日</div>
          <div className="space-y-2">
            {dates.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="date" aria-label={`実施日 ${i + 1}`} className="input input-bordered input-sm w-full bg-base-100" value={d} onChange={(e) => setDates(dates.map((date, index) => index === i ? e.target.value : date))} />
                {dates.length > 1 && (
                  <button className="btn btn-ghost btn-sm btn-square" onClick={() => setDates(dates.filter((_, x) => x !== i))} aria-label={`実施日 ${i + 1} を削除`}><IconX width={16} height={16} /></button>
                )}
              </div>
            ))}
            <button className="btn btn-ghost btn-xs" onClick={addDate}><IconPlus width={12} height={12} /> 日を追加</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="開始（JST）" hint="翌朝にまたがる場合は +24h で入力（例: 27:30）">
            <input className="input input-bordered input-sm w-full bg-base-100" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="終了（JST）">
            <input className="input input-bordered input-sm w-full bg-base-100" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-error mt-3">{error}</p>}
      {table && table.memberIds.length > 1 && (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-base-content/70">
          <IconUsersGroup width={15} height={15} />
          参加者: {table.memberIds.filter((m) => m !== state.me).map((m) => state.users[m].name).join("・")}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onBack}>ログから作成に戻す</button>
        <button className="btn btn-primary" onClick={next}>シナリオと参加者へ進む</button>
      </div>
    </div>
  );
}

/* ================= ステップ2: 分類の確認(ログありのみ) ================= */
function Step2({ draft, setDraft, onNext, onBack }: { draft: Draft; setDraft: (d: Draft) => void; onNext: () => void; onBack: () => void }) {
  const previewLog = useMemo(() => ({ channels: draft.channels } as unknown as Log), [draft]);
  const previewFilter: TimelineFilter = { query: "", channel: "all" };

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3">
        {/* 日時の自動算出 */}
        <div className="card bg-base-100 border border-base-300 px-4 py-4">
          <b className="text-[14px]">日時</b>
          {draft.derived ? (
            <div className="flex flex-wrap items-center gap-2 bg-success/10 border border-success/30 rounded-xl px-3 py-2 mt-2 text-[12.5px]">
              <IconWand width={14} height={14} className="text-success flex-none" />
              <span>{draft.derived.dates.map(fmtDate).join("・")} · {fmtDur(sessionPlayMinutes({ hasLog: true, channels: draft.channels, t0: draft.derived.t0, t1: draft.derived.t1 }))}</span>
            </div>
          ) : (
            <div className="text-[12px] text-ink2 mt-1">日時を読み取れませんでした。記録後に編集できます。</div>
          )}
        </div>
        {/* システムの推定 */}
        <div className="card bg-base-100 border border-base-300 px-4 py-4">
          <b className="text-[14px]">システム</b>
          {draft.guess ? (
            <div className="flex flex-wrap items-center gap-2 bg-primary/10 border border-primary/30 rounded-xl px-3 py-2 mt-2 text-[12.5px]">
              <IconSparkles width={14} height={14} className="text-primary flex-none" />
              <b>{SYSTEMS[draft.guess.id]?.name}</b>
              <span className="text-[10.5px] text-ink2 w-full">{draft.guess.reason}</span>
            </div>
          ) : (
            <div className="text-[12px] text-ink2 mt-1">ロール形式から推定できませんでした。次のステップで選択できます。</div>
          )}
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300 px-4 py-4 mt-3">
        <b className="text-[14px]">検出されたタブ</b>
        <p className="text-[11.5px] text-ink2 mt-0.5 mb-2 flex items-center gap-1.5">
          <IconShieldLock width={13} height={13} className="text-error" />
          共有するログには、シークレットタブとシナリオ本文を含めません。
        </p>
        {draft.channels.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-b border-base-200 last:border-0">
            <b className="text-[13px] min-w-20 break-words">{c.name}</b>
            {c.secret && <Tag v="danger" className="!badge-xs">シークレット · 共有から除外</Tag>}
            <span className="text-[11px] text-ink2">
              {c.msgs.length}行 · ロール {c.msgs.filter((m) => m.type === "roll").length}件
            </span>
          </div>
        ))}
      </div>

      <div className="card bg-base-100 border border-base-300 px-4 py-4 mt-3">
        <b className="text-[14px]">発言者のラベル</b>
        <div className="grid sm:grid-cols-2 gap-x-6">
          {Object.entries(draft.kinds).map(([sp, kind]) => (
            <div key={sp} className="flex items-center gap-3 py-1.5 border-b border-base-200 last:border-0">
              <b className="text-[13px] w-28 truncate">{sp}</b>
              <select aria-label={`${sp}の役割`} className="select select-bordered select-xs w-24 bg-base-100"
                value={kind}
                onChange={(e) => setDraft({ ...draft, kinds: { ...draft.kinds, [sp]: e.target.value as MsgKind } })}
              >
                {["PC", "NPC", "KP", "PL", "GM", "SYSTEM"].map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300 px-3 py-3 mt-3 max-h-80 overflow-y-auto">
        <SessionTimeline log={previewLog} state={{ users: {}, characters: {} } as never} mode="own" filter={previewFilter} />
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onBack}>戻る</button>
        <button className="btn btn-primary" onClick={onNext}>シナリオと参加者へ進む</button>
      </div>
    </>
  );
}

/* ================= ステップ3: シナリオと参加者(共通) ================= */
function Step3({
  draft,
  setDraft,
  attachId,
  committing,
  manual,
  onCommit,
  onBack,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  attachId: string | null;
  committing: boolean;
  manual: boolean;
  onCommit: () => void;
  onBack: () => void;
}) {
  const { state, toast } = useStore();
  const [scq, setScq] = useState("");
  const [showNew, setShowNew] = useState(Boolean(draft.newScenario));
  const scenario = state.scenarios[draft.scenarioId];
  const effectiveScenario = scenario?.id;

  const scResults = useMemo(
    () => Object.values(state.scenarios).filter((s) => !scq.trim() || (s.title + s.author).toLowerCase().includes(scq.trim().toLowerCase())).slice(0, 5),
    [state.scenarios, scq]
  );

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
    setDraft({ ...draft, scenarioId: id, newScenario: null, meta: { ...draft.meta, systemId: sc.systemId, title: draft.meta.title || sc.title }, guess: null });
  }

  return (
    <>
      <div className="card bg-base-100 border border-base-300 px-4 py-4">
        <b className="text-[14px]">シナリオを選ぶ</b>
        {effectiveScenario && !showNew && (
          <div className="flex items-center gap-2 mt-2">
            <span className="font-semibold text-sm">{scenario?.title}</span>
            <button className="btn btn-ghost btn-xs" onClick={() => setDraft({ ...draft, scenarioId: "" })}>取り消す</button>
          </div>
        )}
        {!effectiveScenario && !showNew && (
          <>
            <input aria-label="シナリオを検索" className="input input-bordered input-sm w-full bg-base-100 mt-2" placeholder="タイトル・作者で検索…" value={scq} onChange={(e) => setScq(e.target.value)} />
            <div className="mt-2 divide-y divide-base-200">
              {scResults.map((s) => (
                <button key={s.id} className="flex items-center gap-3 w-full py-2 text-left hover:bg-base-200/50 rounded-lg px-1" onClick={() => pickScenario(s.id)}>
                  <IconBooks width={20} height={20} className="text-base-content/60 flex-none" />
                  <span className="grow min-w-0">
                    <b className="text-[13.5px] block truncate">{s.title}</b>
                    <span className="text-[11px] text-ink2">{s.author} · {SYSTEMS[s.systemId]?.short}</span>
                  </span>
                  <Tag v={s.policy === "public" ? "ok" : s.policy === "members" ? "warn" : "gray"}>{POLICY_LABEL[s.policy]}</Tag>
                </button>
              ))}
            </div>
            {scResults.length === 0 && <p className="text-xs text-base-content/70 mt-2">一致するシナリオがありません。</p>}
            <button className="btn btn-ghost btn-sm text-primary mt-2" onClick={() => setShowNew(true)}>シナリオを新しく登録</button>
          </>
        )}
        {showNew && (
          <div className="mt-2">
            <Field label="シナリオタイトル">
              <input className="input input-bordered input-sm w-full bg-base-100" value={draft.newScenario?.title ?? ""} onChange={(e) => setDraft({ ...draft, newScenario: { ...(draft.newScenario ?? { author: "", policy: "unknown" as Policy }), title: e.target.value } })} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-x-4">
              <Field label="作者/サークル">
                <input className="input input-bordered input-sm w-full bg-base-100" value={draft.newScenario?.author ?? ""} onChange={(e) => setDraft({ ...draft, newScenario: { ...(draft.newScenario ?? { title: "", policy: "unknown" as Policy }), author: e.target.value } })} />
              </Field>
              <Field label="ログポリシー">
                <select className="select select-bordered select-sm bg-base-100" value={draft.newScenario?.policy ?? "unknown"} onChange={(e) => setDraft({ ...draft, newScenario: { ...(draft.newScenario ?? { title: "", author: "" }), policy: e.target.value as Policy } })}>
                  <option value="unknown">未確認（メンバー限定として扱う）</option>
                  <option value="members">メンバー限定</option>
                  <option value="public">公開ログ可</option>
                </select>
              </Field>
            </div>
            <button className="btn btn-ghost btn-xs mt-1" onClick={() => { setShowNew(false); setDraft({ ...draft, newScenario: null }); }}>既存から選ぶ</button>
          </div>
        )}
      </div>

      <div className="card bg-base-100 border border-base-300 px-4 py-4 mt-3">
        <b className="text-[14px]">卓（メンバーを自動で入れます）</b>
        <select aria-label="卓を選ぶ" className="select select-bordered select-sm bg-base-100 w-full mt-2" value={draft.tableId} onChange={(e) => selectTable(e.target.value)}>
          <option value="">— 卓を選ばずに進む —</option>
          {Object.values(state.tables).filter((t) => t.ownerId === state.me || t.memberIds.includes(state.me)).map((t) => (
            <option key={t.id} value={t.id}>{SYSTEMS[t.systemId ?? ""]?.short ?? "汎"} {t.name}（{t.memberIds.length}人）</option>
          ))}
        </select>
      </div>

      <div className="card bg-base-100 border border-base-300 px-4 py-4 mt-3">
        <b className="text-[14px]">参加者</b>
        <p className="text-[11.5px] text-ink2 mt-0.5 mb-2">
          参加者とキャラクターは、記録したあとでも追加できます。
        </p>
        <PlayerPicker
          state={state}
          exclude={[state.me]}
          selected={draft.players.map((p) => p.userId)}
          onChange={(ids) => setDraft({ ...draft, players: ids.map((id) => draft.players.find((p) => p.userId === id) ?? { userId: id, characterIds: [] }) })}
          placeholder="ユーザー名で検索して追加…"
        />
        <div className="mt-2">
          {draft.players.map((p) => {
            const u = state.users[p.userId];
            if (!u) return null;
            const chars = Object.values(state.characters).filter((c) => c.ownerId === p.userId && c.systemId === draft.meta.systemId);
            return (
              <div key={p.userId} className="flex flex-wrap items-center gap-2.5 py-2 border-b border-base-200 last:border-0">
                <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold text-white flex-none" style={{ background: u.color }}>{u.name[0]}</span>
                <b className="text-[13px] w-20">{u.name}</b>
                <select aria-label={`${u.name}のキャラクター`} className="select select-bordered select-sm bg-base-100 max-w-full grow" value={p.characterIds[0] ?? ""} onChange={(e) => setChar(p.userId, e.target.value)}>
                  <option value="">キャラクター: なし（あとで）</option>
                  {chars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            );
          })}
          {draft.players.length === 0 && <p className="text-xs text-base-content/70 py-1">あなたの記録として保存します。</p>}
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300 px-4 py-4 mt-3">
        <b className="text-[14px]">タイトルとシステム</b>
        <div className="grid sm:grid-cols-2 gap-x-4 mt-1">
          <Field label="タイトル">
            <input className="input input-bordered input-sm w-full bg-base-100" value={draft.meta.title} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, title: e.target.value } })} placeholder="例: 廃校の十三時間目 — 後夜祭" />
          </Field>
          <Field
            label="システム"
            hint={draft.guess && draft.meta.systemId === draft.guess.id ? undefined : "シナリオを選ぶと、シナリオのシステムに合わせます"}
          >
            <div className="flex items-center gap-2">
              <select aria-label="システム" className="select select-bordered select-sm bg-base-100 w-full min-w-0" value={draft.meta.systemId} onChange={(e) => setDraft({ ...draft, meta: { ...draft.meta, systemId: e.target.value }, guess: null })}>
                {SYSTEM_LIST.map((s) => (
                  <option key={s.id} value={s.id}>{s.short} {s.name}</option>
                ))}
              </select>
              {draft.guess && draft.meta.systemId === draft.guess.id && (
                <Tag v="accent" title={draft.guess.reason} className="!badge-md flex-none">
                  <IconSparkles width={11} height={11} /> ログから推定
                </Tag>
              )}
            </div>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onBack}>戻る</button>
        <button className={cx("btn btn-primary", committing && "btn-disabled loading")} disabled={committing} onClick={onCommit}>
          {committing ? "記録中…" : manual ? "記録する" : attachId ? "添付する" : "アップロードする"}
        </button>
      </div>
      {attachId && <p className="text-[11px] text-ink2 mt-1">添付先のセッション「{state.logs[attachId].title}」の情報が更新されます。</p>}
    </>
  );
}

/* ================= ステップ4: 完了 ================= */
function Step4({ result, attachId, manual }: { result: CommitLogResult | null; attachId: string | null; manual: boolean }) {
  const { state } = useStore();
  const nav = useNavigate();
  const lid = result?.id ?? "";
  const target = attachId ? state.logs[attachId] : null;

  if (!result) return <Empty>結果を読み込み中…</Empty>;

  return (
    <div className="card bg-base-100 border border-base-300 text-center px-6 py-10">
      <h2 className="text-lg font-extrabold mt-2">{manual ? "セッションを記録しました" : "ログをアップロードしました"}</h2>
      <p className="text-[12px] text-ink2 mt-1">
        メンバー限定で記録しました。共有範囲はセッションの「共有」から変更できます。
      </p>
      <div className="max-w-md mx-auto mt-4">
        <CopyBox text={`${location.origin}${location.pathname}#/share/l/${result.slug}`} />
      </div>
      <div className="flex justify-center gap-2 flex-wrap mt-4">
        <button className="btn btn-primary" onClick={() => nav(`/sessions/${lid}`)}>セッションを開く</button>
        <button className="btn" onClick={() => nav("/sessions")}>セッション一覧へ</button>
      </div>
      {target && <p className="text-[11.5px] text-ink2 mt-3">「{target.title}」のログとして添付されました。</p>}
    </div>
  );
}
