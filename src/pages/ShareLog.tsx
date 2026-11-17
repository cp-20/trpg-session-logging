import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, Empty, NotFound, Tag } from "../components/ui";
import { SessionTimeline, TimelineFilter } from "../components/timeline";
import { evaluateShareGate, visibleShareMembers } from "../lib/share-gate";
import { SYSTEMS } from "../data/systems";
import { fmtDates, fmtDur, jstTime, sessionPlayMinutes } from "../lib/time";
import type { Log, State } from "../types";
import { fetchSharedLog, getSharedLogAccess, confirmPlayedLog, type SharedLogData } from "../lib/cloud-state";
import { isFirebaseConfigured } from "../lib/firebase";
import { signInWithGoogle, authErrorMessage } from "../lib/auth";

export default function ShareLog() {
  const { slug } = useParams();
  const { state, authUser } = useStore();
  const log = Object.values(state.logs).find((l) => l.slug === slug || l.id === slug);
  if (log && (!authUser || log.ownerId === authUser.uid)) return <ShareLogView state={state} log={log} />;
  return <RemoteShare slug={slug ?? ""} />;
}

function RemoteShare({ slug }: { slug: string }) {
  const { state, authUser } = useStore();
  const [shared, setShared] = useState<SharedLogData | null>(null);
  const [scope, setScope] = useState<"members" | "passed" | "public" | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "gate" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    if (!isFirebaseConfigured || !slug) { setStatus("missing"); return; }
    (async () => {
      try {
        const access = await getSharedLogAccess(slug);
        if (!alive) return;
        if (!access) { setStatus("missing"); return; }
        setScope(access.scope);
        try {
          const data = await fetchSharedLog(slug);
          if (alive) { setShared(data); setStatus(data ? "ready" : "missing"); }
        } catch (cause) {
          if (!alive) return;
          if ((cause as { code?: string }).code === "permission-denied") setStatus("gate");
          else throw cause;
        }
      } catch { if (alive) { setError("共有ページを読み込めませんでした。通信状態を確認してください。"); setStatus("error"); } }
    })();
    return () => { alive = false; };
  }, [slug, authUser?.uid, retry]);
  if (status === "loading") return <div className="max-w-xl mx-auto p-8" role="status">共有ページを読み込んでいます…</div>;
  if (status === "missing") return <NotFound what="共有ページ" />;
  if (status === "ready" && shared) {
    const view: State = { ...state, users: { ...state.users, ...shared.users }, characters: {}, logs: { [shared.log.id]: shared.log }, scenarios: shared.scenario ? { [shared.scenario.id]: shared.scenario } : {} };
    return <ShareLogView state={view} log={shared.log} serverAuthorized />;
  }
  return <main className="max-w-xl mx-auto px-5 py-12">
    <a href="#/sessions" className="text-primary text-sm font-bold">卓譜</a>
    <h1 className="text-2xl font-bold mt-8">{scope === "passed" ? "プレイした方へ共有された記録です" : "メンバー限定の記録です"}</h1>
    <p className="text-sm text-base-content/70 leading-7 mt-3">{status === "error" ? error : !authUser ? "Googleでサインインして、記録を開いてください。" : scope === "passed" ? "このシナリオをプレイ済みであれば、記録を開けます。" : "参加者として登録されたアカウントでサインインしてください。"}</p>
    {status === "error" ? <button className="btn btn-sm mt-5" onClick={() => setRetry((n) => n + 1)}>もう一度読み込む</button> : !authUser ? <button className="btn btn-primary mt-5" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await signInWithGoogle(); } catch (cause) { setError(authErrorMessage(cause)); } finally { setBusy(false); } }}>Google でサインイン</button> : scope === "passed" && <button className="btn btn-primary mt-5" disabled={busy} onClick={async () => {
      setBusy(true); setError(null);
      try { await confirmPlayedLog(slug); setRetry((n) => n + 1); } catch { setError("記録を開けませんでした。もう一度お試しください。"); } finally { setBusy(false); }
    }}>{busy ? "確認中…" : "プレイ済みのため、記録を開く"}</button>}
    {error && status !== "error" && <p role="alert" className="text-sm text-error mt-4">{error}</p>}
  </main>;
}

function ShareLogView({ state, log, serverAuthorized = false }: { state: State; log: Log; serverAuthorized?: boolean }) {
  const [asPassed, setAsPassed] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>({ query: "", channel: "all" });

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const sys = SYSTEMS[log.systemId];
  const me = state.me;
  const viewerId = state.entered ? state.me : null;

  const gateResult = evaluateShareGate(log, viewerId, { asPassed });
  const gate = serverAuthorized || gateResult.visible ? null : gateResult.reason;

  const visibleMembers = visibleShareMembers(log, { hideSelfOnShare: state.prefs.hideSelfOnShare, viewerId });

  const channels = log.channels.filter((c) => !c.secret);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-16">
      <div className="bg-base-100 border border-base-300 rounded-xl px-4 py-2.5 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11.5px] text-ink2">共有ビュー</span>
        {log.scope === "passed" && !serverAuthorized && (
          <label className="flex items-center gap-1.5 text-[11px] text-ink2 cursor-pointer">
            このシナリオをプレイした（自己申告）
            <input type="checkbox" className="toggle toggle-sm" checked={asPassed} onChange={(e) => setAsPassed(e.target.checked)} />
          </label>
        )}
        <span className="ml-auto">
          {log.scope === "public" ? <Tag v="ok">公開</Tag> : log.scope === "passed" ? <Tag v="accent">プレイした人</Tag> : <Tag v="gray">メンバー限定</Tag>}
        </span>
      </div>

      {/* ヘッダーカード */}
      <div className="card bg-base-100 border border-base-300 px-6 py-6 text-center mb-4">
        <div className="text-[11px] tracking-[0.14em] text-ink2">{sys?.name}</div>
        <h1 className="text-2xl font-extrabold mt-1.5">{log.title}</h1>
        <p className="text-[12px] text-ink2 mt-1.5">
          {fmtDates(log.dates)}{log.dates.length > 1 ? `（${log.dates.length}日間・実プレイ合計 ${fmtDur(sessionPlayMinutes(log))}）` : ` · ${jstTime(log.t0)}–${jstTime(log.t1)}（${fmtDur(sessionPlayMinutes(log))}）`} · KP: {state.users[log.ownerId]?.name ?? "プレイヤー"}
        </p>
        {sc && <p className="text-[12px] text-ink2">シナリオ: {sc.title}</p>}
        {log.endLabel && <div className="mt-2.5"><Tag v="gray">{log.endLabel}</Tag></div>}
        <div className="flex justify-center -space-x-1.5 mt-3">
          {visibleMembers.map((u) => (
            <span key={u} className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold text-white border-2 border-base-100" style={{ background: state.users[u]?.color }} title={state.users[u]?.name}>
              {state.users[u]?.name[0]}
            </span>
          ))}
        </div>
        {log.scope !== "public" && (
          <p className="text-[10.5px] text-ink2 mt-1.5">{visibleMembers.length}人のメンバーでプレイ</p>
        )}
      </div>

      {gate ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty>{gate}</Empty>
        </div>
      ) : (
        <div className="card bg-base-100 border border-base-300 px-4 py-4">
          {/* 絞り込み */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input type="search" className="input input-bordered input-sm w-44 bg-base-100" placeholder="絞り込み…" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
            <select className="select select-bordered select-sm " value={filter.channel} onChange={(e) => setFilter({ ...filter, channel: e.target.value })}>
              <option value="all">全部のチャンネル（時系列）</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        <SessionTimeline log={log} state={state} mode="share" filter={filter} />
          {channels.length === 0 && <Empty>表示できるログがありません。</Empty>}
        </div>
      )}

      <div className="text-center text-[11px] text-ink2 mt-5 border-t border-base-300 pt-4">
        このログは 卓譜 で管理されています · <a href={`#/sessions/${log.id}`} className="link">卓譜で開く</a>
      </div>
    </div>
  );
}
