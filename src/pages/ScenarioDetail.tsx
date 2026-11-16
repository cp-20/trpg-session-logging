import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { Empty, Field, Modal, NotFound, PageHead, SectionTitle, Tag } from "../components/ui";
import { SYSTEMS, POLICY_HINT, POLICY_LABEL } from "../data/systems";
import { buildSessionRange, fmtDate, fmtDur, sessionPlayMinutes, todayStr, uid } from "../lib/time";
import { evaluateShareGate } from "../lib/share-gate";
import { IconUpload, IconPlus, IconPencil, IconSend, IconExternal } from "../components/icons";

export default function ScenarioDetail() {
  const { id } = useParams();
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [newSession, setNewSession] = useState(false);
  const [editRequest, setEditRequest] = useState(false);
  const [editing, setEditing] = useState(false);

  const sc = state.scenarios[id ?? ""];
  if (!sc) return <NotFound what="シナリオ" />;
  const sys = SYSTEMS[sc.systemId];
  const allLogs = Object.values(state.logs).filter((l) => l.scenarioId === sc.id).sort((a, b) => a.t0 - b.t0);
  const visibleLogs = allLogs.filter((l) => evaluateShareGate(l, state.me).visible);
  const hiddenCount = allLogs.length - visibleLogs.length;
  const runs = visibleLogs.length + (sc.extraRuns ?? 0);
  const visible = visibleLogs;
  const visibleUsers = new Set<string>();
  visibleLogs.forEach((l) => Object.entries(l.players).forEach(([u, p]) => p.linked && !p.hidden && visibleUsers.add(u)));
  const medDur = visibleLogs.length ? [...visibleLogs].sort((a, b) => sessionPlayMinutes(a) - sessionPlayMinutes(b))[Math.floor(visibleLogs.length / 2)] : null;
  const isAuthor = sc.claimedBy === state.me;
  const pendingRequests = state.editRequests.filter((r) => r.scenarioId === sc.id && r.status === "pending");

  return (
    <>
      <PageHead
        back={{ to: "/scenarios", label: "シナリオ" }}
        title={sc.title}
        sub={
          <>
            {sc.author} · {sys?.emoji} {sys?.name}
            {sc.sourceUrl && (
              <>
                {" · "}
                <a href={sc.sourceUrl} target="_blank" rel="noreferrer" className="link link-hover inline-flex items-center gap-0.5">
                  出典ページ <IconExternal width={11} height={11} />
                </a>
              </>
            )}
            <span className="text-ink2"> · {sc.addedBy === "user" ? "ユーザー登録" : "カタログ取込"}</span>
          </>
        }
        actions={
          <>
            {isAuthor ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <IconPencil width={15} height={15} /> 編集（作者）
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => setEditRequest(true)}>
                <IconSend width={15} height={15} /> 編集を申請{pendingRequests.length > 0 && <span className="badge badge-warning badge-xs">{pendingRequests.length}</span>}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => nav(`/upload?scenario=${sc.id}`)}>
              <IconUpload width={15} height={15} /> ログをアップロード
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setNewSession(true)}>
              <IconPlus width={15} height={15} /> このシナリオでセッションを記録
            </button>
          </>
        }
      />

      {/* 概要カード */}
      <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <div>
            <div className="text-[10.5px] font-extrabold text-ink2">記録されたセッション(見える範囲)</div>
            <div className="text-3xl font-extrabold leading-tight">{runs}<span className="text-[12px] font-semibold text-ink2 ml-1">回</span></div>
          </div>
          <div>
            <div className="text-[10.5px] font-extrabold text-ink2">共有されたセッションのプレイヤー</div>
            <div className="text-3xl font-extrabold leading-tight">{visibleUsers.size}<span className="text-[12px] font-semibold text-ink2 ml-1">人</span></div>
          </div>
          <div>
            <div className="text-[10.5px] font-extrabold text-ink2">プレイ時間の中央値</div>
            <div className="text-3xl font-extrabold leading-tight">{medDur ? fmtDur(sessionPlayMinutes(medDur)) : "—"}</div>
          </div>
          <div className="min-w-64 grow">
            <Tag v={sc.policy === "public" ? "ok" : sc.policy === "members" ? "warn" : "gray"}>ログポリシー: {POLICY_LABEL[sc.policy]}</Tag>
            <p className="text-[11.5px] text-ink2 mt-1.5 leading-5">{POLICY_HINT[sc.policy]}</p>
            {sc.claimedBy ? (
              isAuthor ? <Tag v="ok" className="mt-1.5">あなたが所有権を申請済み</Tag> : <Tag v="accent" className="mt-1.5">作者が所有権を申請済み</Tag>
            ) : (
              <button className="btn btn-ghost btn-xs mt-1 px-0" onClick={() => toast("（モック）頒布元アカウント（BOOTH/TALTO）を連携すると申請できます。設定・連携からどうぞ。")}>
                所有権を申請（作者の方）
              </button>
            )}
          </div>
        </div>
        {sc.description && <p className="text-[13px] text-base-content/75 mt-3">{sc.description}</p>}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {sc.tags.map((t) => (
            <Tag key={t} v="gray">{t}</Tag>
          ))}
        </div>
      </div>

      {/* 見えるラン */}
      <SectionTitle right={<span className="text-[11px] text-ink2">共有範囲で見えるセッションだけを表示します</span>}>ラン一覧</SectionTitle>
      {allLogs.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty icon="🗺️">
            このシナリオのセッションはまだありません。
            <div className="flex justify-center gap-2 mt-3">
              <button className="btn btn-primary btn-sm" onClick={() => setNewSession(true)}>卓を登録する</button>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="card bg-base-100 border border-base-300 px-2 py-1">
          {visible.length === 0 ? (
            <p className="text-[12px] text-ink2 px-3 py-4">
              あなたに見えるランはまだありません。メンバー限定のランは、そのシナリオをプレイした人にだけ見えます。
            </p>
          ) : (
            visible.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-2 py-2.5 border-b border-base-300 last:border-0 cursor-pointer hover:bg-base-200/40 rounded-lg" onClick={() => nav(`/sessions/${l.id}`)}>
                <div className="flex-none w-12 text-center">
                  <div className="text-[13px] font-extrabold">{l.dates[0].slice(5).replace("-", "/")}</div>
                  <div className="text-[9.5px] text-ink2">{fmtDate(l.dates[0]).match(/\((.)\)/)?.[1]}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <b className="text-[13.5px] block truncate">{l.title}</b>
                  <span className="text-[11px] text-ink2">
                    {fmtDur(sessionPlayMinutes(l))} · 発言 {l.channels.reduce((a, c) => a + c.msgs.length, 0)}件 · KP: {state.users[l.ownerId].name}
                  </span>
                </div>
                {l.endLabel && <Tag v="gray">{l.endLabel}</Tag>}
                <Tag v={l.scope === "public" ? "ok" : "accent"}>{l.scope === "public" ? "公開" : "プレイした人"}</Tag>
              </div>
            ))
          )}
        </div>
      )}
      {allLogs.some((l) => l.scope === "members") && (
        <p className="text-[11px] text-ink2 mt-2">
          このほかに非公開のセッションが {hiddenCount} 件あります（件数のみ表示。作者のポリシーが許す場合に限ります）。
        </p>
      )}

      {pendingRequests.length > 0 && isAuthor && (
        <div className="alert alert-warning text-[12px] mt-4">
          <span>
            編集の申請が {pendingRequests.length} 件あります（{pendingRequests.map((r) => state.users[r.uid]?.name ?? "ユーザー").join("・")} さん）。
            承認するとメタデータの変更を任せられます（モックでは承認ボタンのみ）。
          </span>
          <button className="btn btn-xs" onClick={() => { update((s) => { s.editRequests.forEach((r) => { if (r.scenarioId === sc.id) r.status = "accepted"; }); }); toast("申請を承認しました"); }}>
            承認
          </button>
        </div>
      )}

      {newSession && <NewSessionModal sc={sc} onClose={() => setNewSession(false)} />}
      {editing && <EditScenarioModal sc={sc} onClose={() => setEditing(false)} />}
      {editRequest && <EditRequestModal sc={sc} onClose={() => setEditRequest(false)} />}
    </>
  );
}

function NewSessionModal({ sc, onClose }: { sc: ReturnType<typeof useStore>["state"]["scenarios"][string]; onClose: () => void }) {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const myTables = Object.values(state.tables).filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me);
  const [title, setTitle] = useState(`${sc.title} — `);
  const [tableId, setTableId] = useState(myTables[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("21:00");
  const [end, setEnd] = useState("25:00");

  function save() {
    const id = "s_" + uid();
    const range = buildSessionRange({ dates: [date], startTime: start, endTime: end });
    if (!range.ok) {
      toast(range.error ?? "入力を確認してください");
      return;
    }
    const { t0, t1 } = range;
    update((s) => {
      const members = tableId ? s.tables[tableId].memberIds : [];
      s.logs[id] = {
        id,
        title: title.trim() || sc.title,
        tableId: tableId || undefined,
        scenarioId: sc.id,
        systemId: sc.systemId,
        ownerId: s.me,
        scope: "members",
        hasLog: false,
        channels: [],
        players: {
          [s.me]: { linked: true, hidden: false, characterIds: [] },
          ...Object.fromEntries(members.filter((m) => m !== s.me).map((m) => [m, { linked: true, hidden: false, characterIds: [] }])),
        },
        createdAt: new Date().toISOString(),
        dates: [date],
        t0,
        t1,
        slug: uid("s") + uid(""),
      };
    });
    toast("卓を登録しました。メンバーを集めて、ログはあとから添付できます。");
    onClose();
    nav(`/sessions/${id}`);
  }

  return (
    <Modal
      title="このシナリオで卓を登録"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>登録する</button>
        </>
      }
    >
      <p className="text-[11.5px] text-ink2 mb-1">ログなしのセッション記録として登録します。日程・参加者・キャラクターはあとから編集できます。</p>
      <Field label="タイトル"><input className="input input-bordered input-sm w-full bg-base-100" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="卓">
        <select className="select select-bordered select-sm " value={tableId} onChange={(e) => setTableId(e.target.value)}>
          <option value="">— 選択しない —</option>
          {Object.values(state.tables).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </Field>
      <div className="grid sm:grid-cols-3 gap-x-4">
        <Field label="日付"><input type="date" className="input input-bordered input-sm w-full bg-base-100" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="開始"><input className="input input-bordered input-sm w-full bg-base-100" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="終了" hint="翌朝は+24h（例: 27:30）"><input className="input input-bordered input-sm w-full bg-base-100" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <p className="text-[11px] text-ink2 mt-2">共有範囲の既定はメンバー限定です。{POLICY_HINT[sc.policy]}</p>
    </Modal>
  );
}

function EditScenarioModal({ sc, onClose }: { sc: ReturnType<typeof useStore>["state"]["scenarios"][string]; onClose: () => void }) {
  const { update, toast } = useStore();
  const [title, setTitle] = useState(sc.title);
  const [author, setAuthor] = useState(sc.author);
  const [policy, setPolicy] = useState(sc.policy);
  const [tags, setTags] = useState(sc.tags.join(", "));
  const [description, setDescription] = useState(sc.description ?? "");

  function save() {
    update((s) => {
      const x = s.scenarios[sc.id];
      x.title = title.trim() || x.title;
      x.author = author.trim() || x.author;
      x.policy = policy;
      x.tags = tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean);
      x.description = description.trim() || undefined;
    });
    toast("シナリオを更新しました");
    onClose();
  }

  return (
    <Modal
      title="シナリオを編集（作者）"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }
    >
      <Field label="タイトル"><input className="input input-bordered input-sm w-full bg-base-100" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="作者 / サークル"><input className="input input-bordered input-sm w-full bg-base-100" value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
        <Field label="ログポリシー" hint={POLICY_HINT[policy]}>
          <select className="select select-bordered select-sm " value={policy} onChange={(e) => setPolicy(e.target.value as typeof policy)}>
            <option value="unknown">未確認</option>
            <option value="members">メンバー限定</option>
            <option value="public">公開ログ可</option>
          </select>
        </Field>
      </div>
      <Field label="タグ（カンマ区切り）"><input className="input input-bordered input-sm w-full bg-base-100" value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
      <Field label="ひとこと紹介"><textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
    </Modal>
  );
}

function EditRequestModal({ sc, onClose }: { sc: ReturnType<typeof useStore>["state"]["scenarios"][string]; onClose: () => void }) {
  const { state, update, toast } = useStore();
  const [note, setNote] = useState("");
  const pending = state.editRequests.some((r) => r.scenarioId === sc.id && r.uid === state.me && r.status === "pending");

  function send() {
    if (pending) {
      toast("すでに申請中です");
      onClose();
      return;
    }
    update((s) => {
      s.editRequests.push({ id: "er_" + uid(), scenarioId: sc.id, uid: s.me, at: new Date().toISOString(), note: note.trim() || undefined, status: "pending" });
    });
    toast("編集の申請を送りました。作者の承認後に反映されます（モック）。");
    onClose();
  }

  return (
    <Modal
      title="シナリオ情報の編集を申請"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className={pending ? "btn btn-disabled" : "btn btn-primary"} onClick={send}>{pending ? "申請中" : "申請を送る"}</button>
        </>
      }
    >
      <p className="text-[11.5px] text-ink2 mb-2 leading-5">
        カタログの行は<b>作者が管理</b>します。作者でない場合は、修正内容を添えて申請を送ってください（誤字・タイトル・ポリシー等）。追加は自由にできますが、編集はこのフローになります。
      </p>
      <Field label="修正したい内容">
        <textarea className="textarea textarea-bordered w-full bg-base-100 text-[13px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 作者名の表記を『しおかぜ堂』に修正したい" />
      </Field>
      {pending && <p className="text-[11.5px] text-warning mt-1">このシナリオにはすでにあなたの申請があります。</p>}
    </Modal>
  );
}
