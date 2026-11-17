import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { Avatar, CharAvatar, Empty, Field, NotFound, PageHead, Tag } from "../components/ui";
import { SYSTEMS } from "../data/systems";
import { fmtDates } from "../lib/time";
import type { Msg } from "../types";
import { IconLink, IconUserPlus } from "../components/icons";
import { getSharedInvite, acceptSharedInvite, type SharedInvite } from "../lib/cloud-state";
import { authErrorMessage } from "../lib/auth";

/**
 * 招待リンク着地ページ。
 * PLがサインインして「発言者を引き受ける」or「発言者なしで参加」する。
 * 紐付けは任意(同意フォームなし)で、本人はあとから外せる。
 */
export default function ClaimInvite() {
  const { id } = useParams();
  const { state, authUser } = useStore();
  if (!authUser || state.logs[id ?? ""]) return <LocalClaimInvite />;
  return <RemoteClaimInvite token={id ?? ""} />;
}
function RemoteClaimInvite({ token }: { token: string }) {
  const { update, toast } = useStore();
  const nav = useNavigate();
  const [invite, setInvite] = useState<SharedInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSharedInvite(token).then((value) => { if (alive) setInvite(value); }).catch(() => { if (alive) setError("招待を読み込めませんでした。通信状態を確認して、もう一度お試しください。"); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);
  if (loading) return <p role="status">招待を確認しています…</p>;
  if (!invite) return <><PageHead title="招待を開けませんでした" /><p className="text-sm leading-7">{error || "招待の有効期限が切れているか、共有が終了しています。招待した方に確認してください。"}</p></>;
  return <>
    <PageHead title="この卓への参加" />
    <h2 className="text-xl font-bold mt-6">{invite.title}</h2>
    <p className="text-sm text-base-content/70 mt-2">{SYSTEMS[invite.systemId]?.name}{invite.scenarioTitle ? ` · ${invite.scenarioTitle}` : ""}</p>
    <button className="btn btn-primary mt-6" disabled={busy} onClick={async () => {
      setBusy(true); setError(null);
      try {
        const shared = await acceptSharedInvite(token);
        update((s) => {
          const me = s.users[s.me];
          Object.assign(s.users, shared.users); s.users[s.me] = me;
          s.logs[shared.log.id] = { ...shared.log, players: { ...shared.log.players, [s.me]: { linked: true, hidden: s.prefs.hideSelfOnShare, characterIds: [] } } };
          if (shared.scenario) s.scenarios[shared.scenario.id] = shared.scenario;
        });
        toast("この卓に参加しました。"); nav(`/sessions/${shared.log.id}`);
      } catch (cause) { setError(authErrorMessage(cause)); }
      finally { setBusy(false); }
    }}>{busy ? "参加しています…" : "この卓に参加する"}</button>
    {error && <p className="text-sm text-error mt-4" role="alert">{error}</p>}
  </>;
}
function LocalClaimInvite() {
  const { id } = useParams();
  const { state, update, toast } = useStore();
  const nav = useNavigate();
  const log = state.logs[id ?? ""];
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [charId, setCharId] = useState("");
  const [joined, setJoined] = useState(false);

  if (!log) return <NotFound what="招待ページ" />;
  const me = state.me;
  const already = log.players[me];
  const sys = SYSTEMS[log.systemId];
  const kp = state.users[log.ownerId];

  /* 発言者の一覧(PC/PL中心)と、すでに誰が引き受けているか */
  const speakers = useMemo(() => {
    const seen = new Map<string, { name: string; kind: Msg["kind"] }>();
    log.channels.forEach((c) =>
      c.msgs.forEach((m) => {
        if (seen.has(m.sp)) return;
        seen.set(m.sp, { name: m.sp, kind: m.kind });
      })
    );
    return [...seen.values()];
  }, [log.channels]);

  const claimedBy = useMemo(() => {
    const map = new Map<string, { userName: string; userId: string }>();
    Object.entries(log.players).forEach(([uid, p]) => {
      if (!p.linked) return;
      p.characterIds.forEach((cid) => {
        const c = state.characters[cid];
        if (c) map.set(c.name, { userName: state.users[uid].name, userId: uid });
      });
    });
    return map;
  }, [log.players, state.characters, state.users]);

  const myChars = Object.values(state.characters).filter((c) => c.ownerId === me && c.systemId === log.systemId);
  const unclaimed = speakers.filter((s) => !claimedBy.has(s.name) && (s.kind === "PC" || s.kind === "PL"));

  function join(withCharacter: string | null) {
    update((s) => {
      s.logs[log.id].players[me] = { linked: true, hidden: false, characterIds: withCharacter ? [withCharacter] : [] };
    });
    toast("この卓に参加しました。キャラクターはあとから付け替えられます。");
    setJoined(true);
  }

  return (
    <>
      <PageHead back={{ to: "/sessions", label: "セッション" }} title="この卓への参加" sub={`${kp.name}さんがあなたをこの卓に招待しました`} />

      <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
        <b className="text-[16px]">{log.title}</b>
        <div className="text-[12px] text-base-content/70 mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <span>{sys?.name}</span>
          <span>{fmtDates(log.dates)}</span>
          <span>KP: {kp.name}</span>
          <span>参加 {Object.keys(log.players).length}人</span>
        </div>
      </div>

      {joined ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty >
            この卓に参加しました。
            <div className="mt-3">
              <Link className="btn btn-primary btn-sm" to={`/sessions/${log.id}`}>セッションを開く</Link>
            </div>
          </Empty>
        </div>
      ) : already ? (
        <div className="card bg-base-100 border border-base-300">
          <Empty >
            すでにこの卓に参加しています。
            <div className="mt-3">
              <Link className="btn btn-primary btn-sm" to={`/sessions/${log.id}`}>セッションを開く</Link>
            </div>
          </Empty>
        </div>
      ) : (
        <>
          {/* 発言者の引き受け */}
          {log.hasLog && unclaimed.length > 0 && (
            <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
              <b className="text-[14px]">発言者を引き受ける</b>
              <p className="text-[11.5px] text-base-content/60 mt-1 mb-2 leading-5">
                自分の発言を選んで、所有するキャラクターを付けてください。この操作に同意書は不要で、あとから解除できます。
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {unclaimed.map((s) => (
                  <button
                    key={s.name}
                    className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl border text-left ${selectedSpeaker === s.name ? "border-primary bg-primary/5" : "border-base-300 hover:bg-base-200/50"}`}
                    onClick={() => setSelectedSpeaker(s.name)}
                  >
                    <span className="w-2 h-2 rounded-full flex-none" style={{ background: selectedSpeaker === s.name ? "var(--fallback-p,oklch(var(--p)/1))" : "var(--fallback-bc,oklch(var(--bc)/0.3))" }} />
                    <b className="text-[13px] grow">{s.name}</b>
                    <Tag v="gray" className="!badge-xs">{s.kind}</Tag>
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Field label="付けるキャラクター">
                  <select className="select select-bordered select-sm w-full bg-base-100" value={charId} onChange={(e) => setCharId(e.target.value)}>
                    <option value="">あとで選ぶ</option>
                    {myChars.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <button
                className="btn btn-primary btn-sm mt-3"
                disabled={!selectedSpeaker}
                onClick={() => {
                  void selectedSpeaker;
                  join(charId || null);
                }}
              >
                <IconLink width={14} height={14} /> この発言を引き受けて参加
              </button>
            </div>
          )}

          {log.hasLog && unclaimed.length === 0 && (
            <div className="card bg-base-100 border border-base-300 px-5 py-4 mb-4">
              <b className="text-[14px]">発言者</b>
              <p className="text-[11.5px] text-base-content/60 mt-1">このログの発言者はすべて他のメンバーが引き受けています。</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {speakers.map((s) => {
                  const claimed = claimedBy.get(s.name);
                  return (
                    <Tag key={s.name} v="gray" className="!badge-md">
                      {s.name}
                      {claimed && <span className="text-base-content/50">({claimed.userName})</span>}
                    </Tag>
                  );
                })}
              </div>
            </div>
          )}

          {/* 発言者なしで参加 */}
          <div className="card bg-base-100 border border-base-300 px-5 py-4">
            <b className="text-[14px]">発言者を指定せず参加</b>
            <p className="text-[11.5px] text-base-content/60 mt-1 mb-3 leading-5">
              参加者として登録されます。ログが添付されたあとに、自分の発言とキャラクターを付けられます。
            </p>
            {myChars.length > 0 && (
              <div className="mb-3">
                <Field label="キャラクター(任意)">
                  <select className="select select-bordered select-sm w-full bg-base-100" value={charId} onChange={(e) => setCharId(e.target.value)}>
                    <option value="">あとで選ぶ</option>
                    {myChars.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => join(charId || null)}>
              <IconUserPlus width={14} height={14} /> この卓に参加する
            </button>
          </div>
        </>
      )}
    </>
  );
}
