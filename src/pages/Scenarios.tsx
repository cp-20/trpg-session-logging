import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { EmptyState, PageHead, SysBadge, Tag } from "../components/ui";
import { SYSTEMS, SYSTEM_LIST, POLICY_LABEL } from "../data/systems";
import { IconPlus } from "../components/icons";

export default function Scenarios() {
  const { state } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sys, setSys] = useState("all");

  const list = useMemo(() => {
    let list = Object.values(state.scenarios);
    if (sys !== "all") list = list.filter((s) => s.systemId === sys);
    if (q.trim()) list = list.filter((s) => (s.title + s.author + s.tags.join()).includes(q.trim()));
    return list;
  }, [state.scenarios, q, sys]);

  return (
    <>
      <PageHead
        title="シナリオ"
        sub="メタデータのみを保存します。シナリオ本文や有料ファイルは保存しません"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => nav("/scenarios/new")}>
            <IconPlus width={15} height={15} /> シナリオを追加
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input type="search" className="input input-bordered input-sm w-56 bg-base-100" placeholder="タイトル・作者・タグで検索…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select select-bordered select-sm " value={sys} onChange={(e) => setSys(e.target.value)}>
          <option value="all">全部のシステム</option>
          {SYSTEM_LIST.map((s) => (
            <option key={s.id} value={s.id}>{s.emoji} {s.short}</option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <EmptyState
            kind={q.trim() || sys !== "all" ? "filtered" : "first"}
            title={q.trim() || sys !== "all" ? undefined : "シナリオがまだありません"}
            action={
              q.trim() || sys !== "all" ? (
                <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setSys("all"); }}>
                  絞り込みを解除
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => nav("/scenarios/new")}>
                  <IconPlus width={14} height={14} /> シナリオを追加
                </button>
              )
            }
          >
            {q.trim() || sys !== "all" ? "検索条件を変えるか、絞り込みを解除してください。" : "BOOTH / TALTO のURLからの追加にも対応しています。"}
          </EmptyState>
        </div>
      ) : (
        <div className="card bg-base-100 border border-base-300 divide-y divide-base-300">
          {list.map((s) => {
            const runs = Object.values(state.logs).filter((l) => l.scenarioId === s.id).length + (s.extraRuns ?? 0);
            return (
              <a key={s.id} href={`#/scenarios/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-base-200/40">
                <SysBadge short={SYSTEMS[s.systemId]?.short ?? "汎"} color={SYSTEMS[s.systemId]?.color ?? "#6d7f8f"} size={36} />
                <div className="flex-1 min-w-0">
                  <b className="text-[14px] leading-5 block truncate">{s.title}</b>
                  <div className="text-[11px] text-ink2 truncate">{s.author} · {SYSTEMS[s.systemId]?.short}</div>
                </div>
                <Tag v="gray" className="!badge-sm flex-none">記録 {runs}回</Tag>
                <Tag v={s.policy === "public" ? "ok" : "gray"} className="!badge-sm flex-none">{POLICY_LABEL[s.policy]}</Tag>
                {s.claimedBy === state.me && <Tag v="accent" className="!badge-sm flex-none">所有</Tag>}
              </a>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-ink2 mt-3">
        ※ 「N回プレイ済み」は、この卓での記録とカタログ上の既知ラン数の合計です。メンバー限定のランは名前なしで件数にのみ含まれます。
      </p>
    </>
  );
}
