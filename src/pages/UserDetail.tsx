import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, CharAvatar, Empty, NotFound, PageHead, SectionTitle, Tag } from "../components/ui";
import { ProviderIcon, PROVIDER_LABEL } from "../components/ui";
import { SessionRow } from "./Sessions";
import type { Provider } from "../types";

export default function UserDetail() {
  const { id } = useParams();
  const { state } = useStore();
  const user = state.users[id ?? ""];
  if (!user) return <NotFound what="ユーザー" />;
  const isMe = user.id === state.me;

  const chars = Object.values(state.characters).filter((c) => c.ownerId === user.id);
  const logs = Object.values(state.logs)
    .filter((l) => l.ownerId === user.id || l.players[user.id])
    .sort((a, b) => b.t0 - a.t0);
  const coPlay = logs.filter((l) => l.players[state.me] || l.ownerId === state.me).length;

  return (
    <>
      <PageHead
        back={{ to: "/sessions", label: "戻る" }}
        title={
          <span className="flex items-center gap-2.5">
            <Avatar u={user} size={34} />
            {user.name}
            {isMe && <Tag v="accent">あなた</Tag>}
          </span>
        }
        sub={user.bio ?? "TRPGプレイヤー"}
        actions={isMe ? <a className="btn btn-ghost btn-sm" href="#/settings">設定・連携</a> : undefined}
      />

      <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <div>
            <div className="text-[10.5px] font-extrabold text-ink2">セッション</div>
            <div className="text-3xl font-extrabold leading-tight">{logs.length}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-extrabold text-ink2">キャラクター</div>
            <div className="text-3xl font-extrabold leading-tight">{chars.length}</div>
          </div>
          {!isMe && (
            <div>
              <div className="text-[10.5px] font-extrabold text-ink2">{state.users[state.me].name}さんと同卓</div>
              <div className="text-3xl font-extrabold leading-tight">{coPlay}<span className="text-[12px] font-semibold text-ink2 ml-1">回</span></div>
            </div>
          )}
          <div className="grow min-w-56">
            <div className="text-[10.5px] font-extrabold text-ink2 mb-1">連携アカウント</div>
            <div className="flex flex-wrap gap-1.5">
              {user.accounts.filter((a) => a.status === "linked").map((a) => (
                <Tag key={a.provider} v="gray" className="!badge-md" title={a.verifiedAt ? `確認: ${a.verifiedAt}` : undefined}>
                  <ProviderIcon provider={a.provider as Provider} size={13} />
                  {PROVIDER_LABEL[a.provider as Provider]}
                </Tag>
              ))}
              {user.accounts.filter((a) => a.status === "linked").length === 0 && <span className="text-[11.5px] text-ink2">なし（名前のみ）</span>}
            </div>
          </div>
        </div>
      </div>

      <SectionTitle>キャラクター</SectionTitle>
      {chars.length === 0 ? (
        <div className="card bg-base-100 border border-base-300"><Empty >キャラクターがいません。</Empty></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {chars.map((c) => (
            <a key={c.id} href={`#/characters/${c.id}`} className="card bg-base-100 border border-base-300 px-4 py-3 flex items-center gap-3 hover:border-primary/50">
              <CharAvatar c={c} size={38} />
              <span className="grow min-w-0">
                <b className="text-[13.5px] block truncate">{c.name}</b>
                <span className="text-[11px] text-ink2 block truncate">{c.archetype}</span>
              </span>
              <span className="text-[11px] text-ink2">{c.sessions.length}卓</span>
            </a>
          ))}
        </div>
      )}

      <SectionTitle>関わったセッション</SectionTitle>
      <div className="card bg-base-100 border border-base-300 px-2 py-1">
        {logs.length === 0 ? (
          <Empty >まだありません。</Empty>
        ) : (
          logs.map((l) => <SessionRow key={l.id} log={l} href={`#/sessions/${l.id}`} showKp={false} />)
        )}
      </div>
    </>
  );
}
