import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, Empty, Field, Modal, NotFound, PageHead, SectionTitle, Tag } from "../components/ui";
import { PlayerPicker } from "../components/pickers";
import { SessionRow } from "./Sessions";
import { SYSTEMS } from "../data/systems";
import { IconPlus, IconPencil, IconUpload, IconFileText } from "../components/icons";

export default function TableDetail() {
  const { id } = useParams();
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  
  const [q, setQ] = useState("");

  const table = state.tables[id ?? ""];
  if (!table) return <NotFound what="卓" />;
  const sys = SYSTEMS[table.systemId ?? ""];
  const isOwner = table.ownerId === state.me;

  const sessions = useMemo(
    () => Object.values(state.logs).filter((l) => l.tableId === table.id).sort((a, b) => b.t0 - a.t0),
    [state.logs, table.id]
  );
  const shown = sessions.filter((l) => !q.trim() || l.title.includes(q.trim()));

  function addMember(uid2: string) {
    update((s) => {
      s.tables[table.id].memberIds.push(uid2);
    });
    toast(`${state.users[uid2].name}さんをメンバーに追加しました`);
  }
  function removeMember(uid2: string) {
    update((s) => {
      s.tables[table.id].memberIds = s.tables[table.id].memberIds.filter((m) => m !== uid2);
      toast(`${state.users[uid2].name}さんをメンバーから外しました`);
    });
  }

  return (
    <>
      <PageHead
        back={{ to: "/tables", label: "卓" }}
        title={
          <span className="flex items-center gap-2">
            <span>{sys?.short ?? "卓"}</span>
            {table.name}
          </span>
        }
        sub={`${sys?.name ?? "汎用/その他"} · KP: ${state.users[table.ownerId].name} · メンバー ${table.memberIds.length}人`}
        actions={
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <IconPencil width={15} height={15} /> 編集
            </button>
            <button className="btn btn-sm" onClick={() => nav(`/upload?table=${table.id}`)}>
              <IconUpload width={15} height={15} /> ログをアップロード
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => nav(`/upload?table=${table.id}`)}>
              <IconPlus width={15} height={15} /> セッションを記録
            </button>
          </>
        }
      />

      {table.note && <p className="text-[12.5px] text-ink2 mb-3 px-1">{table.note}</p>}

      <SectionTitle
        right={
          <input type="search" className="input input-bordered input-xs w-40 bg-base-100" placeholder="この卓で絞り込み…" value={q} onChange={(e) => setQ(e.target.value)} />
        }
      >
        この卓のセッション · {sessions.length}
      </SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-2 py-1">
        {shown.length === 0 ? (
          <Empty >
            まだセッションがありません。
            <div className="flex justify-center gap-2 mt-3">
              <button className="btn btn-primary btn-sm" onClick={() => nav(`/upload?table=${table.id}`)}><IconUpload width={14} height={14} /> セッションを記録</button>
            </div>
          </Empty>
        ) : (
          shown.map((l) => <SessionRow key={l.id} log={l} href={`#/sessions/${l.id}`} />)
        )}
      </div>

      <SectionTitle right={<span className="text-[11px] text-ink2">メンバーは検索で追加できます</span>}>メンバー · {table.memberIds.length}</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-4 py-3">
        {table.memberIds.map((m) => (
          <div key={m} className="flex items-center gap-3 py-2 border-b border-base-200 last:border-0">
            <Avatar u={state.users[m]} size={28} />
            <b className="text-[13px]">{state.users[m].name}</b>
            {m === table.ownerId && <Tag v="accent" className="!badge-xs">KP</Tag>}
            <span className="ml-auto text-[11px] text-ink2">
              {Object.values(state.logs).filter((l) => l.tableId === table.id && l.players[m]).length}回参加
            </span>
            {isOwner && m !== table.ownerId && (
              <button className="btn btn-ghost btn-xs btn-circle" title="メンバーから外す" onClick={() => removeMember(m)}>✕</button>
            )}
          </div>
        ))}
        {isOwner && (
          <div className="mt-3 max-w-md">
            <PlayerPicker
              state={state}
              selected={[]}
              onChange={(ids) => ids.forEach(addMember)}
              exclude={table.memberIds}
              placeholder="メンバーを検索して追加…"
              quickLabel="候補（他の卓で一緒の人が多め）"
              quickIds={suggestMembers(state, table.id)}
            />
          </div>
        )}
      </div>


      {editing && <EditTableModal table={table} onClose={() => setEditing(false)} />}
    </>
  );
}

/** 他の卓での同僚からメンバー候補を出す（簡易レコメンド） */
function suggestMembers(state: ReturnType<typeof useStore>["state"], excludeTableId: string) {
  const mine = state.tables[excludeTableId]?.memberIds ?? [];
  const counts: Record<string, number> = {};
  Object.values(state.tables)
    .filter((t) => t.id !== excludeTableId)
    .forEach((t) => {
      const overlap = t.memberIds.filter((m) => mine.includes(m)).length;
      if (overlap > 0) {
        t.memberIds.filter((m) => !mine.includes(m)).forEach((m) => (counts[m] = (counts[m] ?? 0) + overlap));
      }
    });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id]) => id);
}

function EditTableModal({ table, onClose }: { table: ReturnType<typeof useStore>["state"]["tables"][string]; onClose: () => void }) {
  const { state, update, toast } = useStore();
  const [name, setName] = useState(table.name);
  const [note, setNote] = useState(table.note ?? "");
  const [systemId, setSystemId] = useState(table.systemId ?? "coc7");

  function save() {
    update((s) => {
      const t = s.tables[table.id];
      t.name = name.trim() || t.name;
      t.note = note.trim() || undefined;
      t.systemId = systemId;
    });
    toast("卓を更新しました");
    onClose();
  }

  return (
    <Modal
      title="卓を編集"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </>
      }
    >
      <Field label="卓名"><input className="input input-bordered input-sm w-full bg-base-100" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="主なシステム">
          <select className="select select-bordered select-sm " value={systemId} onChange={(e) => setSystemId(e.target.value)}>
            {Object.values(SYSTEMS).map((s) => (
              <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="メモ"><input className="input input-bordered input-sm w-full bg-base-100" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <p className="text-[11px] text-ink2 mt-2">卓のメンバーは、後から変わってもセッションの参加者記録には影響しません（各セッションにユーザーが紐づきます）。</p>
    </Modal>
  );
}
