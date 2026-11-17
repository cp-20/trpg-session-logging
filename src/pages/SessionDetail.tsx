import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, CopyBox, EmptyState, Field, Modal, NotFound, PageHead, SectionTitle, Seg, Tag, Toggle, cx } from "../components/ui";
import { SessionTimeline, TimelineFilter } from "../components/timeline";
import { SYSTEMS } from "../data/systems";
import { buildSessionRange, fmtDate, fmtDates, fmtDur, jstTime, sessionClock, sessionPlayMinutes, todayStr } from "../lib/time";
import type { Log, Scope } from "../types";
import {
  IconShare, IconPencil, IconTrash, IconUpload, IconWand, IconPlus, IconUserPlus, IconLink, IconUnlink, IconCalendarTime, IconFileText, IconExternal, IconX,
} from "../components/icons";
import { buildReportCardSVG, svgDataUrl, downloadReportPNG, xIntentUrl } from "../external";
import { createSharedInvite, fetchSharedLog, revokeSharedMember } from "../lib/cloud-state";

export default function SessionDetail() {
  const { id } = useParams();
  const { state, update, toast, authUser } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<"timeline" | "overview" | "stats">("overview");
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [reportCard, setReportCard] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>({ query: "", channel: "all" });
  useEffect(() => {
    const log = state.logs[id ?? ""];
    if (!authUser || !log) return;
    let alive = true;
    fetchSharedLog(log.slug).then((shared) => {
      if (!alive || !shared) return;
      const newcomers = Object.keys(shared.log.players).filter((uid) => !log.players[uid]);
      if (!newcomers.length) return;
      update((s) => {
        if (!s.logs[log.id]) return;
        for (const uid of newcomers) {
          if (!s.users[uid] && shared.users[uid]) s.users[uid] = shared.users[uid];
          s.logs[log.id].players[uid] ??= shared.log.players[uid];
        }
      });
    }).catch(() => { /* A new record may not have been published yet. */ });
    return () => { alive = false; };
  }, [id, authUser?.uid]);

  const log = state.logs[id ?? ""];
  if (!log) return <NotFound what="セッション" />;

  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const tb = log.tableId ? state.tables[log.tableId] : null;
  const sys = SYSTEMS[log.systemId];
  const isOwner = log.ownerId === state.me;
  const playMin = sessionPlayMinutes(log);

  return (
    <>
      <PageHead
        back={{ to: "/sessions", label: "セッション" }}
        title={<span className="inline-flex items-center gap-2.5 flex-wrap">{log.title}{log.endLabel && <span className="seal-outline !text-[11px]">{log.endLabel}</span>}</span>}
        sub={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {fmtDates(log.dates)}
              {log.dates.length > 1 ? `（${log.dates.length}日間・実プレイ合計 ${fmtDur(playMin)}）` : ` · ${jstTime(log.t0)}–${jstTime(log.t1)}（${fmtDur(playMin)}）`}
            </span>
            <span>{sys?.name}</span>
            {sc && <span><a href={`#/scenarios/${sc.id}`} className="link link-hover">{sc.title}</a></span>}
            {tb && <span><a href={`#/tables/${tb.id}`} className="link link-hover">{tb.name}</a></span>}
            {log.importedFrom && <span className="text-ink2">取込: {log.importedFrom}</span>}
          </span>
        }
        actions={
          <>
            {isOwner && (
              <button className="btn btn-outline btn-sm" onClick={() => setShareOpen(true)}>
                <IconShare width={15} height={15} /> 共有
              </button>
            )}
            {isOwner && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <IconPencil width={15} height={15} /> 編集
              </button>
            )}
            {!log.hasLog && isOwner && (
              <button className="btn btn-primary btn-sm" onClick={() => nav(`/upload?log=${log.id}`)}>
                <IconUpload width={15} height={15} /> ログを添付
              </button>
            )}
            {isOwner && (
              <div className="dropdown dropdown-end">
                <button tabIndex={0} className="btn btn-ghost btn-sm" aria-label="その他の操作">その他</button>
                <div tabIndex={0} className="dropdown-content z-50 card p-1 w-44">
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-[12.5px] text-error hover:bg-base-200 rounded" onClick={() => setConfirmDel(true)}>
                    <IconTrash width={14} height={14} /> 削除
                  </button>
                </div>
              </div>
            )}
          </>
        }
      />

      <div role="tablist" aria-label="セッション詳細のタブ" className="tabs mb-5">
        {([['overview', '概要'], ['timeline', 'タイムライン'], ['stats', '統計']] as const).map(([value, label]) => (
          <button key={value} role="tab" aria-selected={tab === value} aria-controls={`panel-${value}`} id={`tab-${value}`} className={cx("tab", tab === value && "tab-active")} onClick={() => setTab(value)}>
            {label}{value === 'timeline' && log.hasLog ? ` · ${log.channels.reduce((n, c) => n + c.msgs.length, 0)}` : ''}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
        {tab === "overview" && <>
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 pb-5 border-b border-base-300 text-sm">
            <div><dt className="text-xs text-base-content/70 mb-1">記録した人</dt><dd className="flex items-center gap-2"><Avatar u={state.users[log.ownerId]} size={24} /><a href={`#/users/${log.ownerId}`} className="link link-hover">{state.users[log.ownerId]?.name}</a></dd></div>
            <div><dt className="text-xs text-base-content/70 mb-1">ログの共有範囲</dt><dd>{log.scope === "public" ? "公開" : log.scope === "passed" ? "このシナリオをプレイした人" : "メンバー限定"}</dd></div>
            <div><dt className="text-xs text-base-content/70 mb-1">シナリオ</dt><dd>{sc ? <a href={`#/scenarios/${sc.id}`} className="link link-hover">{sc.title}</a> : "未設定"}</dd></div>
            <div><dt className="text-xs text-base-content/70 mb-1">ログ</dt><dd>{log.hasLog ? `${log.channels.reduce((n, c) => n + c.msgs.length, 0)}行を記録` : "未添付"}</dd></div>
          </dl>
          <SectionTitle>参加者 · {Object.keys(log.players).length}</SectionTitle>
          <MembersTab log={log} />
        </>}
      </div>

      <div role="tabpanel" id="panel-timeline" aria-labelledby="tab-timeline" hidden={tab !== "timeline"}>
        {tab === "timeline" && (log.hasLog ? <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input type="search" aria-label="ログを絞り込み" className="input input-bordered input-sm w-full sm:w-64 bg-base-100" placeholder="本文・発言者で絞り込み…" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
            <select className="select select-bordered select-sm bg-base-100 max-w-full" value={filter.channel} onChange={(e) => setFilter({ ...filter, channel: e.target.value })} aria-label="チャンネルで絞り込み">
              <option value="all">全部のチャンネル（時系列）</option>
              {log.channels.map((c) => <option key={c.id} value={c.id}>{c.name}{c.secret ? "（シークレット）" : ""}</option>)}
            </select>
          </div>
          <div className="card bg-base-100 border border-base-300 px-3 py-3"><SessionTimeline log={log} state={state} mode="own" filter={filter} /></div>
        </> : <div className="card bg-base-100 border border-base-300">
          <EmptyState kind="first" icon={<IconFileText width={24} height={24} />} title="ログはまだ添付されていません" action={isOwner ? <button className="btn btn-primary btn-sm" onClick={() => nav(`/upload?log=${log.id}`)}><IconUpload width={14} height={14} /> ログを添付</button> : undefined}>日時と参加者は記録されています。</EmptyState>
        </div>)}
      </div>

      <div role="tabpanel" id="panel-stats" aria-labelledby="tab-stats" hidden={tab !== "stats"}>
        {tab === "stats" && <StatsTab log={log} />}
      </div>

      {editing && <EditLogModal log={log} onClose={() => setEditing(false)} />}
      {confirmDel && (
        <Modal
          title="セッション記録を削除しますか？"
          onClose={() => setConfirmDel(false)}
          foot={
            <>
              <button className="btn" onClick={() => setConfirmDel(false)}>キャンセル</button>
              <button
                className="btn btn-error"
                onClick={() => {
                  update((s) => {
                    delete s.logs[log.id];
                  });
                  toast("セッションを削除しました");
                  nav("/sessions");
                }}
              >
                削除する
              </button>
            </>
          }
        >
          <p className="text-[12px] text-ink2">ログ本体・参加者のリンク・統計が消えます。</p>
        </Modal>
      )}
      {reportCard && <ReportCardModal log={log} onClose={() => setReportCard(false)} />}
      {shareOpen && <ShareModal log={log} onClose={() => setShareOpen(false)} onOpenReportCard={() => { setShareOpen(false); setReportCard(true); }} />}
    </>
  );
}

/* ---------- 参加者 ---------- */
function MembersTab({ log }: { log: Log }) {
  const { state, update, toast, authUser } = useStore();
  const [q, setQ] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const ids = Object.keys(log.players);
  const candidates = Object.values(state.users)
    .filter((u) => !ids.includes(u.id))
    .filter((u) => !q.trim() || u.name.includes(q.trim()));

  function addParticipant(uid2: string) {
    update((s) => {
      s.logs[log.id].players[uid2] = { linked: true, hidden: false, characterIds: [] };
    });
    toast(`${state.users[uid2].name}さんを参加者に追加しました`);
  }
  async function removeParticipant(uid2: string) {
    if (authUser) {
      try { await revokeSharedMember(log.slug, uid2); }
      catch { toast("参加者を外せませんでした。もう一度お試しください。"); return; }
    }
    update((s) => {
      delete s.logs[log.id].players[uid2];
    });
    toast(`${state.users[uid2].name}さんを参加者から外しました`);
  }

  const isKpView = log.ownerId === state.me;
  return (
    <div className="card bg-base-100 border border-base-300 px-4 py-3">
      {/* 追加（検索つき）— KPのみ */}
      {isKpView ? (
      <div className="mb-4">
        <div className="text-[11.5px] font-bold text-ink2 mb-1.5">参加者を追加</div>
        <input
          className="input input-bordered input-sm w-full bg-base-100"
          aria-label="参加者を検索" placeholder="ユーザー名で検索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {/* 卓メンバーのクイック候補 */}
        {log.tableId && state.tables[log.tableId]?.memberIds.some((member) => !ids.includes(member)) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="text-[10.5px] text-ink2 self-center">卓のメンバー:</span>
            {state.tables[log.tableId].memberIds
              .filter((m) => !ids.includes(m))
              .map((m) => (
                <button key={m} className="btn btn-xs bg-base-200 rounded-full gap-1.5" onClick={() => addParticipant(m)}>
                  <Avatar u={state.users[m]} size={14} />
                  {state.users[m].name}
                  <IconUserPlus width={11} height={11} className="opacity-50" />
                </button>
              ))}
          </div>
        )}
        {q && (
          <div className="mt-2 border border-base-300 rounded-xl divide-y divide-base-200 max-h-44 overflow-y-auto">
            {candidates.slice(0, 6).map((u) => (
              <button key={u.id} className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-base-200/50" onClick={() => { addParticipant(u.id); setQ(""); }}>
                <Avatar u={u} size={22} />
                <span className="text-[13px] font-semibold grow">{u.name}</span>
                <span className="text-[10.5px] text-ink2">追加</span>
              </button>
            ))}
            {candidates.length === 0 && <div className="px-3 py-2 text-[12px] text-ink2">見つかりません</div>}
          </div>
        )}
      </div>
      ) : (
        <p className="text-[11.5px] text-ink2 mb-2">
          参加者の追加・キャラクターの付け替えは、記録した人（{state.users[log.ownerId].name}さん）が管理します。
        </p>
      )}

      {/* 参加者リスト */}
      {ids.map((u) => {
        const p = log.players[u];
        const user = state.users[u];
        const isKp = u === log.ownerId;
        const sys = SYSTEMS[log.systemId];
        const myChars = Object.values(state.characters).filter((c) => c.ownerId === u && c.systemId === log.systemId);
        return (
          <div key={u} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-b border-base-300 last:border-0">
            <Avatar u={user} size={28} />
            <div className="w-28">
              <b className="text-[13px]">{user.name}</b>
              {isKp && <div className="text-[10px] text-ink2">記録した人</div>}
            </div>
            {p.linked ? (
              <select aria-label={`${user.name}のキャラクター`} disabled={!isKpView && u !== state.me} className="select select-bordered select-sm w-full sm:w-52 max-w-full bg-base-100"
                value={p.characterIds[0] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  update((s) => {
                    s.logs[log.id].players[u].characterIds = v ? [v] : [];
                  });
                  toast(v ? `${state.characters[v].name} をこの卓に付けました` : "キャラクターを外しました");
                }}
              >
                <option value="">キャラクター: 未設定</option>
                {myChars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}（{sys?.short}）</option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-ink2">未リンク（名前のみ表示されます）</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {(isKpView || u === state.me) && (
                <>
                <Toggle on={p.hidden} onChange={(v) => { update((s) => { s.logs[log.id].players[u].hidden = v; }); toast(v ? `${user.name}さんを共有ビューから外しました（KPには見えます）` : `${user.name}さんを再表示しました`); }} label="非表示" />
                {p.linked ? (
                  <button className="btn btn-ghost btn-xs text-error gap-1" onClick={() => { update((s) => { s.logs[log.id].players[u].linked = false; }); toast(`${user.name}さんのリンクを解除しました`); }}>
                    <IconUnlink width={13} height={13} /> 解除
                  </button>
                ) : (
                  <button className="btn btn-xs btn-primary gap-1" onClick={() => { update((s) => { s.logs[log.id].players[u].linked = true; }); toast(`${user.name}さんをリンクしました`); }}>
                    <IconLink width={13} height={13} /> リンク
                  </button>
                )}
                {isKpView && !isKp && (
                  <button className="btn btn-ghost btn-xs btn-circle" aria-label={`${user.name}を参加者から外す`} onClick={() => removeParticipant(u)}>
                    <IconX width={14} height={14} />
                  </button>
                )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {isKpView && <div className="flex flex-wrap items-center gap-2 bg-base-200/60 rounded-xl px-3 py-2.5 mt-3">
        <span className="text-[11.5px] text-ink2 grow">
          招待リンクを送ると、相手がこのセッションに参加できます。
        </span>
        <button className="btn btn-xs" disabled={inviting} onClick={async () => {
          setInviting(true); setInviteError(null);
          try {
            const token = authUser ? await createSharedInvite(log, state) : log.id;
            const url = `${location.origin}${location.pathname}#/invite/${token}`;
            setInviteUrl(url);
            if (!authUser) { await navigator.clipboard.writeText(url); toast("招待リンクをコピーしました"); }
          } catch { setInviteError("招待リンクを作成できませんでした。もう一度お試しください。"); }
          finally { setInviting(false); }
        }}>
          {inviting ? "作成中…" : authUser ? "招待リンクを作成" : "招待リンクをコピー"}
        </button>
      </div>}
      {inviteUrl && <div className="mt-3"><CopyBox text={inviteUrl} /></div>}
      {inviteError && <p className="text-xs text-error mt-2" role="alert">{inviteError}</p>}
    </div>
  );
}

/* ---------- 統計 ---------- */
function StatsTab({ log }: { log: Log }) {
  const rolls = log.channels.flatMap((c) => c.msgs.filter((m) => m.type === "roll" && m.roll).map((m) => m.roll!));
  const bySp: Record<string, { crit: number; fumble: number; fail: number; ok: number; spec: number }> = {};
  log.channels.forEach((c) =>
    c.msgs.forEach((m) => {
      if (m.type !== "roll" || !m.roll) return;
      const sp = m.sp;
      bySp[sp] ??= { crit: 0, fumble: 0, fail: 0, ok: 0, spec: 0 };
      const r = m.roll.result;
      if (/クリティカル/.test(r)) bySp[sp].crit++;
      else if (/ファンブル/.test(r)) bySp[sp].fumble++;
      else if (/スペシャル/.test(r)) bySp[sp].spec++;
      else if (/失敗/.test(r)) bySp[sp].fail++;
      else if (/SAN/.test(r)) { /* SANは分布に含めない */ }
      else bySp[sp].ok++;
    })
  );
  const dist: Record<string, number> = {};
  rolls.forEach((r) => {
    const key = /SAN/.test(r.result) ? "SANチェック" : r.result;
    dist[key] = (dist[key] ?? 0) + 1;
  });
  const maxDist = Math.max(1, ...Object.values(dist));
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card bg-base-100 border border-base-300 px-4 py-3">
          <SectionTitle>ロールの結果分布</SectionTitle>
          {Object.entries(dist).length === 0 && <p className="text-[12px] text-ink2">ロールがありません。</p>}
          {Object.entries(dist).map(([k, n]) => (
            <div key={k} className="flex items-center gap-2.5 mb-1.5">
              <span className="text-[11.5px] text-ink2 w-20">{k}</span>
              <div className="flex-1 h-2 rounded-full bg-base-300 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(n / maxDist) * 100}%`, background: /クリティカル|成功|スペシャル/.test(k) ? "var(--fallback-p,oklch(var(--p)/1))" : /SAN/.test(k) ? "var(--fallback-in,oklch(var(--in)/1))" : "var(--fallback-s,oklch(var(--s)/1))" }} />
              </div>
              <span className="text-[11px] text-ink2 w-6 text-right">{n}</span>
            </div>
          ))}
        </div>
        <div className="card bg-base-100 border border-base-300 px-4 py-3">
          <SectionTitle>発言者別</SectionTitle>
          {Object.entries(bySp).length === 0 && <p className="text-[12px] text-ink2">ロールがありません。</p>}
          {Object.entries(bySp).map(([sp, v]) => (
            <div key={sp} className="flex items-center gap-2 text-[12px] py-0.5">
              <b className="w-24 truncate">{sp}</b>
              <span className="text-ink2">成功 {v.ok + v.spec}</span>
              <span className="text-success">クリ {v.crit}</span>
              <span className="text-ink2">失敗 {v.fail}</span>
              <span className="text-error">ファンブル {v.fumble}</span>
            </div>
          ))}
        </div>
      </div>

    </>
  );
}

/* ---------- 編集 ---------- */
function EditLogModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const { state, update, toast } = useStore();
  const [title, setTitle] = useState(log.title);
  const [tableId, setTableId] = useState(log.tableId ?? "");
  const [scenarioId, setScenarioId] = useState(log.scenarioId ?? "");
  const [dates, setDates] = useState<string[]>([...log.dates]);
  const [startTime, setStartTime] = useState(sessionClock(log.t0, log.dates[0]));
  const [endTime, setEndTime] = useState(sessionClock(log.t1, log.dates[log.dates.length - 1]));
  const [endLabel, setEndLabel] = useState(log.endLabel ?? "");
  const [error, setError] = useState<string | null>(null);

  function addDate() {
    const last = dates.at(-1) ?? todayStr();
    const d = new Date(last + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    setDates([...dates, d.toISOString().slice(0, 10)]);
  }

  function save() {
    if (dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)) || new Set(dates).size !== dates.length) {
      setError("実施日を重複しない日付で入力してください。");
      return;
    }
    const sortedDates = [...dates].sort();
    const range = buildSessionRange({ dates: sortedDates, startTime, endTime });
    if (!range.ok) {
      setError(range.error ?? "入力を確認してください");
      return;
    }
    const { t0, t1 } = range;
    update((s) => {
      const l = s.logs[log.id];
      l.title = title.trim() || l.title;
      l.tableId = tableId || undefined;
      l.scenarioId = scenarioId || undefined;
      if (scenarioId && s.scenarios[scenarioId]) l.systemId = s.scenarios[scenarioId].systemId;
      l.dates = sortedDates;
      l.t0 = t0;
      l.t1 = t1;
      l.endLabel = endLabel.trim() || undefined;
    });
    toast("セッション情報を更新しました");
    onClose();
  }

  return (
    <Modal
      title="セッション情報を編集"
      onClose={onClose}
      wide
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }
    >
      <Field label="タイトル"><input className="input input-bordered input-sm w-full bg-base-100" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="卓">
          <select className="select select-bordered select-sm bg-base-100" value={tableId} onChange={(e) => setTableId(e.target.value)}>
            <option value="">— 選択しない —</option>
            {Object.values(state.tables).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="シナリオ">
          <select className="select select-bordered select-sm bg-base-100" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            <option value="">— 選択しない —</option>
            {Object.values(state.scenarios).map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="実施日（複数日にまたがる場合は日を追加）">
        <div className="space-y-2">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="date" aria-label={`実施日 ${i + 1}`} className="input input-bordered input-sm w-full bg-base-100" value={d} onChange={(e) => setDates(dates.map((date, index) => index === i ? e.target.value : date))} />
              {dates.length > 1 && (
                <button className="btn btn-ghost btn-sm btn-square" aria-label={`実施日 ${i + 1} を削除`} onClick={() => setDates(dates.filter((_, x) => x !== i))}><IconX width={16} height={16} /></button>
              )}
            </div>
          ))}
          <button className="btn btn-ghost btn-xs" onClick={addDate}><IconPlus width={12} height={12} /> 日を追加</button>
        </div>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <Field label="開始（初日の時刻）" hint="深夜は+24h表記OK（例: 27:30）">
          <input className="input input-bordered input-sm w-full bg-base-100" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="終了（最終日の時刻）">
          <input className="input input-bordered input-sm w-full bg-base-100" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </div>
      <Field label="ENDラベル"><input className="input input-bordered input-sm w-full bg-base-100" value={endLabel} onChange={(e) => setEndLabel(e.target.value)} placeholder="正常END「後夜祭」" /></Field>
      {error && <p role="alert" className="text-sm text-error mt-3">{error}</p>}
    </Modal>
  );
}

/* ---------- 卓報告カード ---------- */
export function ReportCardModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const { state, toast } = useStore();
  const [savingImage, setSavingImage] = useState(false);
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const chars = Object.entries(log.players).flatMap(([, p]) => p.characterIds.map((cid) => state.characters[cid])).filter(Boolean);
  const cardData = {
    scenarioTitle: sc?.title,
    scenarioEmoji: sc?.emoji,
    title: log.title,
    dateLabel: fmtDates(log.dates),
    systemName: SYSTEMS[log.systemId]?.name ?? "汎用",
    playerCount: Object.keys(log.players).length,
    endLabel: log.endLabel,
    shareUrl: `${location.origin}${location.pathname}#/share/l/${log.slug}`,
  };
  const cardSvg = buildReportCardSVG(cardData);

  return (
    <Modal
      title="卓報告カード（#卓報告）"
      onClose={onClose}
      foot={
        <>
          <button className="btn" disabled={savingImage} onClick={async () => { setSavingImage(true); try { await downloadReportPNG(cardSvg, `takufu-report-${log.id}.png`); } catch { toast("画像を保存できませんでした。もう一度お試しください。"); } finally { setSavingImage(false); } }}>{savingImage ? "画像を作成中…" : "画像を保存"}</button>
          <button className="btn" onClick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/share/l/${log.slug}`).catch(() => {}); }}>リンクをコピー</button>
          <a className="btn btn-primary" href={xIntentUrl(cardData)} target="_blank" rel="noreferrer">
            <IconExternal width={14} height={14} /> Xで投稿
          </a>
        </>
      }
    >
      <img src={svgDataUrl(cardSvg)} alt="卓報告カード" className="w-full rounded-2xl" />
      {chars.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center mt-3">
          {chars.map((c) => (
            <Tag key={c.id} v="gray">{c.name}</Tag>
          ))}
        </div>
      )}
      <p className="text-[11px] text-ink2 mt-3">
        保存した画像をXの投稿に添付できます。
      </p>
    </Modal>
  );
}

/* ---------- 共有モーダル(共有に関わる操作を1か所に集約) ---------- */
function ShareModal({ log, onClose, onOpenReportCard }: { log: Log; onClose: () => void; onOpenReportCard: () => void }) {
  const { state, update, toast } = useStore();
  const sc = log.scenarioId ? state.scenarios[log.scenarioId] : null;
  const shareUrl = `${location.origin}${location.pathname}#/share/l/${log.slug}`;

  const options: { v: Scope; label: string; disabled?: boolean; title?: string }[] = [
    { v: "members", label: "メンバー限定" },
    { v: "passed", label: "このシナリオをプレイした人", disabled: sc?.policy !== "public" },
    {
      v: "public",
      label: "公開",
      disabled: sc ? sc.policy !== "public" : true,
      title: sc && sc.policy !== "public" ? "作者のログルールが公開を許可していないため、公開にはできません" : undefined,
    },
  ];

  function setScope(v: Scope) {
    if (log.ownerId !== state.me || (v !== "members" && sc?.policy !== "public")) return;
    update((s) => {
      s.logs[log.id].scope = v;
    });
    toast(`共有範囲を「${{ members: "メンバー限定", passed: "このシナリオをプレイした人", public: "公開" }[v]}」に変更しました`);
  }

  return (
    <Modal title="共有" onClose={onClose}>
      <div className="flex items-center gap-2 mb-3">
        <b className="text-[12px] text-ink2">共有範囲</b>
        {log.scope === "public" ? <Tag v="ok">公開</Tag> : log.scope === "passed" ? <Tag v="accent">プレイした人</Tag> : <Tag v="gray">メンバー限定</Tag>}
      </div>
      <Seg value={log.scope} options={options} onChange={setScope} />
      <p className="text-[11.5px] text-base-content/70 mt-2 leading-5">
        {sc ? (sc.policy === "public" ? "このシナリオは公開ログを許可しています。" : "作者のログルールにより、公開にはできません。") : "シナリオ未設定のため、メンバー限定として扱います。"}
      </p>
      <div className="mt-3">
        <CopyBox text={shareUrl} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <a className="btn btn-sm" href={`#/share/l/${log.slug}`} target="_blank" rel="noreferrer">
          共有ページを確認
        </a>
        <button className="btn btn-ghost btn-sm" onClick={onOpenReportCard}>
          <IconShare width={14} height={14} /> 卓報告カード(X)
        </button>
      </div>
      <p className="text-[11px] text-ink2 mt-3 leading-5">
        シークレットタブ・シナリオ本文・非表示の参加者は、共有ページに表示しません。
      </p>
    </Modal>
  );
}
