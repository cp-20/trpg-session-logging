import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, EmptyState, PageHead, SysBadge, Tag } from "../components/ui";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { fmtDate, fmtDates, fmtDur, fmtDurShort, sessionPlayMinutes } from "../lib/time";
import type { Log } from "../types";
import { IconPlus } from "../components/icons";

/* ---------- セッション行（一覧共用） ---------- */
export function SessionRow({ log, href, showKp = true }: { log: Log; href: string; showKp?: boolean }) {
  const { state } = useStore();
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const tb = log.tableId ? state.tables[log.tableId] : null;
  const sys = SYSTEMS[log.systemId];
  const members = Object.keys(log.players);
  const playMin = sessionPlayMinutes(log);
  return (
    <a href={href} className="flex gap-3.5 items-start px-2 py-3 border-b border-base-300 last:border-0 hover:bg-base-200/40">
      <div className="flex-none w-11 text-center hidden sm:block">
        <div className="text-[15px] font-extrabold leading-tight">{+log.dates[0].split("-")[2]}</div>
        <div className="text-[10px] text-ink2">{+log.dates[0].split("-")[1]}月</div>
        {log.dates.length > 1 && <div className="text-[9.5px] text-primary font-bold mt-0.5">{log.dates.length}日</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <h3 className="text-[15px] leading-6 font-bold truncate">{log.title}</h3>
          {!log.hasLog && <Tag v="warn" className="!badge-xs">ログ未添付</Tag>}
        </div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs leading-5 text-base-content/70 mt-0.5">
          <SysBadge short={sys?.short ?? "汎"} color={sys?.color ?? "#6d7f8f"} size={16} />
          {sc && <span className="truncate max-w-40">{sc.title}</span>}
          {tb && <span className="truncate max-w-32">{tb.name}</span>}
          <span>{fmtDurShort(playMin)}</span>
          <span>{fmtDates(log.dates)}</span>
          <span className="sm:hidden">{log.scope === "public" ? "公開" : log.scope === "passed" ? "プレイした人" : "メンバー限定"} · KP: {state.users[log.ownerId].name}</span>
        </div>
        <div className="flex items-center gap-1 mt-1.5">
          <div className="flex -space-x-1.5">
            {members.slice(0, 6).map((u) => (
              <Avatar key={u} u={state.users[u]} />
            ))}
            {members.length > 6 && <span className="text-[10.5px] text-ink2 self-center ml-1.5">+{members.length - 6}</span>}
          </div>
          <span className="text-[10.5px] text-ink2 ml-1">
            {members.filter((u) => log.players[u].linked).length}/{members.length} リンク
          </span>
        </div>
      </div>
      <div className="flex-none text-right hidden sm:block">
        {log.scope === "public" ? (
          <span className="badge badge-sm badge-outline" style={{ color: "var(--success)", borderColor: "var(--success)" }}>公開</span>
        ) : log.scope === "passed" ? (
          <Tag v="accent">プレイした人</Tag>
        ) : (
          <span className="badge badge-sm badge-ghost">メンバー限定</span>
        )}
        {showKp && <div className="text-[10.5px] text-ink2 mt-1.5">KP: {state.users[log.ownerId].name}</div>}
      </div>
    </a>
  );
}

/* ---------- 一覧 ---------- */
export default function Sessions() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");
  const [scope, setScope] = useState("all");
  const [mineOnly, setMineOnly] = useState(true);

  const logs = useMemo(() => {
    let list = Object.values(state.logs);
    if (mineOnly) list = list.filter((l) => l.ownerId === state.me || l.players[state.me]);
    if (sys !== "all") list = list.filter((l) => l.systemId === sys);
    if (scope !== "all") list = list.filter((l) => l.scope === scope);
    if (q.trim()) list = list.filter((l) => l.title.includes(q.trim()));
    return list.sort((a, b) => b.t0 - a.t0);
  }, [state.logs, state.me, q, sys, scope, mineOnly]);

  const playTotal = logs.reduce((a, l) => a + sessionPlayMinutes(l), 0);
  const coPlayers = new Set<string>();
  logs.forEach((l) => Object.keys(l.players).forEach((u) => u !== state.me && coPlayers.add(u)));
  const isFirstUse = Object.keys(state.logs).length === 0;
  /* 記録の入口は /upload に一本化(ログあり/なしも同じ画面から始まる) */
  const goCreate = () => nav("/upload");

  return (
    <>
      <PageHead
        title="セッション"
        sub="自分が回した・参加した記録"
        actions={
          <button className="btn btn-primary btn-sm" onClick={goCreate}>
            <IconPlus width={15} height={15} /> セッションを記録
          </button>
        }
      />

      {/* 初回だけ案内を出す。データがあれば一覧が最優先 */}
      {isFirstUse && (
        <EmptyState
          kind="first"
          title="最初のセッションを記録しましょう"
          action={
            <button className="btn btn-primary btn-sm" onClick={goCreate}>
              <IconPlus width={14} height={14} /> セッションを記録
            </button>
          }
        >
          ログファイル（CCFOLIA書き出し等）があればその場で解析し、無ければ日付と参加者だけでも記録できます。
        </EmptyState>
      )}

      {/* 一覧 */}
      <div className="card bg-base-100 border border-base-300 px-2 py-1">
        <div className="flex flex-wrap items-center gap-2 px-1.5 py-2 border-b border-base-300">
          <input type="search" className="input input-bordered input-sm flex-1 min-w-36 bg-base-100" placeholder="タイトルで絞り込み…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select select-bordered select-sm bg-base-100" value={sys} onChange={(e) => setSys(e.target.value)}>
            <option value="all">全部のシステム</option>
            {SYSTEM_LIST.map((s) => (
              <option key={s.id} value={s.id}>{s.short} {s.name}</option>
            ))}
          </select>
          <select className="select select-bordered select-sm bg-base-100" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">共有範囲: 全部</option>
            <option value="members">メンバー限定</option>
            <option value="passed">プレイした人</option>
            <option value="public">公開</option>
          </select>
          <label className="flex items-center gap-1.5 text-[11.5px] text-base-content/70 cursor-pointer ml-auto">
            自分が参加したもの
            <input type="checkbox" className="toggle toggle-sm" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          </label>
        </div>
        {logs.length === 0 ? (
          <EmptyState
            kind={q || sys !== "all" || scope !== "all" ? "filtered" : "first"}
            title={q || sys !== "all" || scope !== "all" ? undefined : "まだセッションがありません"}
            action={
              q || sys !== "all" || scope !== "all" ? (
                <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setSys("all"); setScope("all"); }}>
                  絞り込みを解除
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={goCreate}>
                  <IconPlus width={14} height={14} /> セッションを記録
                </button>
              )
            }
          />
        ) : (
          logs.map((l) => <SessionRow key={l.id} log={l} href={`#/sessions/${l.id}`} />)
        )}
      </div>

      {/* 統計は一覧の後に、控えめな1行で */}
      {logs.length > 0 && (
        <p className="text-xs text-base-content/70 mt-3 px-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="tabular-nums">
            表示中 <b>{logs.length}</b>件 · 総プレイ <b>{fmtDur(playTotal)}</b> · 同卓 <b>{coPlayers.size}</b>人
          </span>
          <Link to="/tables" className="link link-hover text-primary">
            所属している卓 {Object.values(state.tables).filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me).length}件 →
          </Link>
        </p>
      )}
    </>
  );
}
