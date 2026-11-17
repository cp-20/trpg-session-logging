import { useMemo, useState } from "react";
import type { State } from "../types";
import { Avatar, Tag } from "./ui";
import { IconUserPlus, IconSearch, IconX } from "./icons";

/**
 * 検索つきの参加者ピッカー。
 * 大量のユーザーから探す場面（セッション参加者・卓メンバーの追加）で使う。
 */
export function PlayerPicker({
  state,
  selected,
  onChange,
  quickIds,
  quickLabel = "よく一緒に遊ぶ人",
  exclude,
  placeholder = "ユーザー名で検索…",
}: {
  state: State;
  selected: string[];
  onChange: (ids: string[]) => void;
  /** 検索欄の上に「ここから探す」候補として出すユーザー（卓メンバーなど） */
  quickIds?: string[];
  quickLabel?: string;
  exclude?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const all = Object.values(state.users).filter((u) => !exclude?.includes(u.id) && !selected.includes(u.id));
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query ? all.filter((u) => u.name.toLowerCase().includes(query)) : [];
    return list.slice(0, 8);
  }, [q, all]);
  const quick = (quickIds ?? []).filter((id) => state.users[id] && !selected.includes(id) && !exclude?.includes(id));

  return (
    <div>
      {/* 検索欄 */}
      <label className="input input-bordered input-sm flex items-center gap-2 w-full bg-base-100">
        <IconSearch width={15} height={15} className="opacity-40" />
        <input aria-label="参加者を検索" className="grow min-w-0" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </label>

      {/* クイック候補 */}
      {quick.length > 0 && !q && (
        <div className="mt-2">
          <div className="text-[10.5px] font-bold text-ink2 mb-1">{quickLabel}</div>
          <div className="flex flex-wrap gap-1.5">
            {quick.map((id) => (
              <button key={id} className="btn btn-xs bg-base-200 border border-base-300 rounded-full gap-1.5 font-semibold" onClick={() => onChange([...selected, id])}>
                <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-extrabold text-white" style={{ background: state.users[id].color }}>
                  {state.users[id].name[0]}
                </span>
                {state.users[id].name}
                <IconUserPlus width={12} height={12} className="opacity-50" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 検索結果 */}
      {q && (
        <div className="mt-2 border border-base-300 rounded-xl bg-base-100 shadow-sm divide-y divide-base-200 max-h-56 overflow-y-auto">
          {results.length === 0 && <div className="px-3 py-2 text-[12px] text-ink2">見つかりません</div>}
          {results.map((u) => (
            <button
              key={u.id}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-base-200/60"
              onClick={() => {
                onChange([...selected, u.id]);
                setQ("");
              }}
            >
              <Avatar u={u} size={24} />
              <span className="text-[13px] font-semibold grow">{u.name}</span>
              <span className="text-[10.5px] text-ink2">追加</span>
            </button>
          ))}
        </div>
      )}

      {/* 選択済み */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.filter((id) => state.users[id]).map((id) => (
            <Tag key={id} v="gray" className="!badge-md">
              <Avatar u={state.users[id]} size={16} />
              {state.users[id].name}
              <button aria-label={`${state.users[id].name}を参加者から外す`} className="ml-0.5 opacity-70 hover:opacity-100" onClick={() => onChange(selected.filter((x) => x !== id))}>
                <IconX width={14} height={14} />
              </button>
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}
