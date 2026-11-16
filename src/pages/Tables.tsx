import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, Empty, Field, Modal, PageHead, Tag } from "../components/ui";
import { PlayerPicker } from "../components/pickers";
import { SYSTEMS, SYSTEM_LIST } from "../data/systems";
import { fmtDate, todayStr, uid } from "../lib/time";
import { IconPlus, IconUsersGroup } from "../components/icons";

export default function Tables() {
  const { state } = useStore();
  const nav = useNavigate();
  const [newTable, setNewTable] = useState(false);

  const tables = Object.values(state.tables)
    .filter((t) => t.memberIds.includes(state.me) || t.ownerId === state.me)
    .sort((a, b) => {
      const la = Object.values(state.logs).filter((l) => l.tableId === a.id).map((l) => l.t0).sort().at(-1) ?? 0;
      const lb = Object.values(state.logs).filter((l) => l.tableId === b.id).map((l) => l.t0).sort().at(-1) ?? 0;
      return lb - la;
    });

  return (
    <>
      <PageHead
        title="卓"
        sub="メンバーグループ。セッションをまとめ、あとから日程調整にも使えます"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setNewTable(true)}>
            <IconPlus width={15} height={15} /> 卓を作成
          </button>
        }
      />
      {tables.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty>参加している卓がありません。</Empty>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {tables.map((t) => {
            const sessions = Object.values(state.logs).filter((l) => l.tableId === t.id);
            const last = sessions.map((l) => l.t0).sort().at(-1);
            return (
              <div key={t.id} className="card bg-base-100 border border-base-300 px-4 py-3.5 cursor-pointer hover:border-primary/50" onClick={() => nav(`/tables/${t.id}`)}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-base-200 flex items-center justify-center text-base flex-none">
                    {SYSTEMS[t.systemId ?? ""]?.emoji ?? "🎲"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <b className="text-[15px] block truncate">{t.name}</b>
                    <span className="text-[11px] text-ink2">
                      {SYSTEMS[t.systemId ?? ""]?.short ?? "汎用"} · KP: {state.users[t.ownerId].name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <div className="flex -space-x-1.5">
                    {t.memberIds.slice(0, 6).map((m) => (
                      <Avatar key={m} u={state.users[m]} size={22} />
                    ))}
                  </div>
                  <span className="text-[11px] text-ink2">{t.memberIds.length}人</span>
                  <span className="text-[11px] text-ink2 ml-auto">
                    セッション {sessions.length}回{last ? ` · 最終 ${fmtDate(new Date((last + 9 * 3600) * 1000).toISOString().slice(0, 10))}` : ""}
                  </span>
                </div>
                {t.note && <p className="text-[11.5px] text-ink2 mt-2 truncate">{t.note}</p>}
              </div>
            );
          })}
        </div>
      )}
      {newTable && <NewTableModal onClose={() => setNewTable(false)} />}
    </>
  );
}

function NewTableModal({ onClose }: { onClose: () => void }) {
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [systemId, setSystemId] = useState("coc7");
  const [note, setNote] = useState("");
  const [members, setMembers] = useState<string[]>([]);

  function save() {
    if (!name.trim()) {
      toast("卓名を入力してください");
      return;
    }
    const id = "t_" + uid();
    update((s) => {
      s.tables[id] = {
        id,
        name: name.trim(),
        systemId,
        ownerId: s.me,
        memberIds: [s.me, ...members],
        note: note.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
    });
    toast(`卓「${name.trim()}」を作成しました`);
    onClose();
    nav(`/tables/${id}`);
  }

  return (
    <Modal
      title="新しい卓を作る"
      onClose={onClose}
      foot={
        <>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>作成する</button>
        </>
      }
    >
      <p className="text-[11.5px] text-ink2 mb-1 flex items-start gap-1.5">
        <IconUsersGroup width={14} height={14} className="mt-0.5 flex-none" />
        卓はメンバーのグループです。ここからセッションを立てると参加者が自動で入り、日程調整機能の土台にもなります。
      </p>
      <Field label="卓名"><input className="input input-bordered input-sm w-full bg-base-100" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 廃校部" /></Field>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="主なシステム">
          <select className="select select-bordered select-sm " value={systemId} onChange={(e) => setSystemId(e.target.value)}>
            {SYSTEM_LIST.map((s) => (
              <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="メモ（任意）"><input className="input input-bordered input-sm w-full bg-base-100" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: 隔週土曜・夜21時開始" /></Field>
      </div>
      <Field label={`メンバー（あなた${state.users[state.me].name} は自動で追加されます）`}>
        <PlayerPicker state={state} selected={members} onChange={setMembers} />
      </Field>
    </Modal>
  );
}
