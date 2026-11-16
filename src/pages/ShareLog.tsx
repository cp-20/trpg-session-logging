import { useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { Empty, NotFound, Tag } from "../components/ui";
import { SessionTimeline, TimelineFilter } from "../components/timeline";
import { evaluateShareGate, visibleShareMembers } from "../lib/share-gate";
import { SYSTEMS } from "../data/systems";
import { fmtDates, fmtDur, jstTime, sessionPlayMinutes } from "../lib/time";

export default function ShareLog() {
  const { slug } = useParams();
  const { state } = useStore();
  const [asPassed, setAsPassed] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>({ query: "", channel: "all" });

  const log = Object.values(state.logs).find((l) => l.slug === slug);
  if (!log) return <NotFound what="共有ページ" />;
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const sys = SYSTEMS[log.systemId];
  const me = state.me;
  const viewerId = state.entered ? state.me : null;

  const gateResult = evaluateShareGate(log, viewerId, { asPassed });
  const gate = gateResult.visible ? null : gateResult.reason;

  const visibleMembers = visibleShareMembers(log, { hideSelfOnShare: state.prefs.hideSelfOnShare, viewerId });

  const channels = log.channels.filter((c) => !c.secret);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-16">
      <div className="bg-base-100 border border-base-300 rounded-xl px-4 py-2.5 mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11.5px] text-ink2">🔍 共有ビューのプレビュー</span>
        {log.scope === "passed" && (
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
        <div className="text-[11px] tracking-[0.14em] text-ink2">{sys?.emoji} {sys?.name}</div>
        <h1 className="text-2xl font-extrabold mt-1.5">{log.title}</h1>
        <p className="text-[12px] text-ink2 mt-1.5">
          {fmtDates(log.dates)}{log.dates.length > 1 ? `（${log.dates.length}日間・実プレイ合計 ${fmtDur(sessionPlayMinutes(log))}）` : ` · ${jstTime(log.t0)}–${jstTime(log.t1)}（${fmtDur(sessionPlayMinutes(log))}）`} · KP: {state.users[log.ownerId].name}
        </p>
        {sc && <p className="text-[12px] text-ink2">シナリオ: {sc.emoji} {sc.title}</p>}
        {log.endLabel && <div className="mt-2.5"><Tag v="gray">{log.endLabel}</Tag></div>}
        <div className="flex justify-center -space-x-1.5 mt-3">
          {visibleMembers.map((u) => (
            <span key={u} className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold text-white border-2 border-base-100" style={{ background: state.users[u]?.color }} title={state.users[u]?.name}>
              {state.users[u]?.name[0]}
            </span>
          ))}
        </div>
        {log.scope !== "public" && (
          <p className="text-[10.5px] text-ink2 mt-1.5">{visibleMembers.length}人のメンバーでプレイ（非表示・未リンクの人は除外しています）</p>
        )}
      </div>

      {gate ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty icon="🔒">{gate}</Empty>
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
          {channels.length === 0 && <Empty icon="📄">表示できるログがありません。</Empty>}
        </div>
      )}

      <div className="text-center text-[11px] text-ink2 mt-5 border-t border-base-300 pt-4">
        このログは 卓譜 で管理されています · <a href={`#/sessions/${log.id}`} className="link">卓譜で開く（デモ）</a>
      </div>
    </div>
  );
}
