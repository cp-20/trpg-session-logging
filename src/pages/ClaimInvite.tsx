import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useStore } from "../store";
import { NotFound, PageHead, Select, SysBadge, cx } from "../components/ui";
import { Avatar, CharAvatar, characterAvatarSrc, userAvatarSrc } from "../components/identity";
import { SYSTEMS } from "../data/systems";
import { fmtDates } from "../lib/time";
import type { Msg } from "../types";
import { IconBooks, IconCheck, IconUserPlus } from "../components/icons";
import { getSharedInvite, acceptSharedInvite, type SharedInvite } from "../lib/cloud-state";
import { authErrorMessage } from "../lib/auth";

/**
 * 招待リンク着地ページ。
 * PLがサインインして「発言者を引き受ける」or「発言者なしで参加」する。
 * 紐付けは任意(同意フォームなし)で、本人はあとから外せる。
 */
export default function ClaimInvite() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const { state, authUser } = useStore();
  if (!authUser || state.logs[id ?? ""]) return <LocalClaimInvite />;
  return <RemoteClaimInvite token={id ?? ""} />;
}
/** 招待の見出し: 誰が、どのセッションに招待しているか */
function InviteHead({
  title,
  systemId,
  scenarioTitle,
  dates,
  inviter,
}: {
  title: string;
  systemId: string;
  scenarioTitle?: string;
  dates?: string[];
  inviter?: ReactNode;
}) {
  const sys = SYSTEMS[systemId];
  return (
    <div className="mb-6">
      <p className="eyebrow mb-2">セッションへの招待</p>
      <PageHead
        title={title}
        sub={
          <>
            {inviter && <p className="mb-1.5 text-base text-base-content">{inviter}</p>}
            <div className="meta">
              {sys && <SysBadge sys={sys} />}
              {dates && dates.length > 0 && <span>{fmtDates(dates)}</span>}
              {scenarioTitle && (
                <span className="inline-flex items-center gap-1">
                  <IconBooks width={14} height={14} aria-hidden />
                  {scenarioTitle}
                </span>
              )}
            </div>
          </>
        }
      />
    </div>
  );
}

const JOIN_LABEL = "このセッションに参加する";

function RemoteClaimInvite({ token }: { token: string }) {
  const { update } = useStore();
  const nav = useNavigate();
  const [invite, setInvite] = useState<SharedInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSharedInvite(token)
      .then((value) => {
        if (alive) setInvite(value);
      })
      .catch(() => {
        if (alive) setError("招待を読み込めませんでした。通信状態を確認して、もう一度お試しください。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) {
    return (
      <p role="status" className="flex items-center gap-2 py-16 justify-center text-sm text-ink2">
        <span className="loading loading-spinner loading-sm" aria-hidden />
        招待を確認しています…
      </p>
    );
  }
  if (!invite) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHead title="招待を開けませんでした" />
        <div className="surface p-5 sm:p-6">
          <p className="text-sm leading-7">
            {error || "招待の有効期限が切れているか、共有が終了しています。招待した人に確認してください。"}
          </p>
          <Link to="/sessions" className="btn mt-4">
            セッション一覧へ
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl">
      <InviteHead title={invite.title} systemId={invite.systemId} scenarioTitle={invite.scenarioTitle} />
      <section className="surface p-5 sm:p-6">
        <p className="text-sm leading-relaxed">
          参加すると、このセッションがあなたの記録に入り、ログを読めるようになります。参加はあとから外せます。
        </p>
        <button
          className="btn btn-primary mt-5 w-full sm:w-auto"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const shared = await acceptSharedInvite(token);
              update((s) => {
                const me = s.users[s.me];
                Object.assign(s.users, shared.users);
                s.users[s.me] = me;
                s.logs[shared.log.id] = {
                  ...shared.log,
                  players: {
                    ...shared.log.players,
                    [s.me]: { linked: true, hidden: s.prefs.hideSelfOnShare, characterIds: [] },
                  },
                };
                if (shared.scenario) s.scenarios[shared.scenario.id] = shared.scenario;
              });
              nav({ to: `/sessions/${shared.log.id}` as never });
            } catch (cause) {
              setError(authErrorMessage(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <span className="loading loading-spinner loading-xs" aria-hidden />
          ) : (
            <IconUserPlus width={18} height={18} aria-hidden />
          )}
          {busy ? "参加しています…" : JOIN_LABEL}
        </button>
        {error && (
          <p className="mt-3 text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function LocalClaimInvite() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const { state, update } = useStore();
  const log = state.logs[id ?? ""];
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [charId, setCharId] = useState("");
  const [joined, setJoined] = useState(false);

  /* 発言者の一覧(PC/PL中心)と、すでに誰が引き受けているか */
  const speakers = useMemo(() => {
    const seen = new Map<string, { name: string; kind: Msg["kind"] }>();
    log?.channels.forEach((c) =>
      c.msgs.forEach((m) => {
        if (seen.has(m.sp)) return;
        seen.set(m.sp, { name: m.sp, kind: m.kind });
      }),
    );
    return [...seen.values()];
  }, [log?.channels]);

  const claimedBy = useMemo(() => {
    const map = new Map<string, { userName: string; userId: string }>();
    Object.entries(log?.players ?? {}).forEach(([uid, p]) => {
      if (!p.linked) return;
      const user = state.users[uid];
      /* PL名そのままの発言者も、その人が引き受け済みとして扱う */
      if (user) map.set(user.name, { userName: user.name, userId: uid });
      p.characterIds.forEach((cid) => {
        const c = state.characters[cid];
        if (c) map.set(c.name, { userName: state.users[uid]?.name ?? "", userId: uid });
      });
    });
    return map;
  }, [log?.players, state.characters, state.users]);

  if (!log) return <NotFound what="招待ページ" />;
  const me = state.me;
  const already = log.players[me];
  const kp = state.users[log.ownerId];
  const scenario = log.scenarioId ? state.scenarios[log.scenarioId] : undefined;
  const others = Object.keys(log.players)
    .filter((u) => u !== log.ownerId)
    .map((u) => state.users[u])
    .filter(Boolean);

  const myChars = Object.values(state.characters).filter(
    (c) => c.ownerId === me && c.systemId === log.systemId,
  );
  const playerSpeakers = speakers.filter((s) => s.kind === "PC" || s.kind === "PL");
  const unclaimed = playerSpeakers.filter((s) => !claimedBy.has(s.name));

  function join(withCharacter: string | null) {
    update((s) => {
      const target = s.logs[log.id];
      target.players[me] = {
        linked: true,
        hidden: false,
        characterIds: withCharacter ? [withCharacter] : [],
      };
      /* 選んだ発言者のアイコンを本人（またはキャラクター）に合わせる */
      if (selectedSpeaker) {
        const ch = withCharacter ? s.characters[withCharacter] : undefined;
        const icon = ch ? characterAvatarSrc(ch) : s.users[me] ? userAvatarSrc(s.users[me]) : undefined;
        if (icon) target.speakerIcons = { ...target.speakerIcons, [selectedSpeaker]: icon };
      }
    });
    setJoined(true);
  }

  const head = (
    <InviteHead
      title={log.title}
      systemId={log.systemId}
      scenarioTitle={scenario?.title}
      dates={log.dates}
      inviter={
        kp && !joined && !already
          ? `${kp.name}さんが、あなたをこのセッションの参加者に招待しています。`
          : undefined
      }
    />
  );

  if (joined || already) {
    /* 参加後は「何が変わったか」を告げる代わりに、参加者の顔ぶれに自分が入った状態をそのまま見せる */
    const mine = log.players[me]?.characterIds[0];
    const myChar = mine ? state.characters[mine] : undefined;
    const meUser = state.users[me];
    return (
      <div className="mx-auto max-w-2xl">
        {head}
        <section className="surface" aria-label="参加者">
          <div className="list">
            {kp && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <Avatar u={kp} size={32} />
                <span className="min-w-0 flex-1 truncate font-bold">{kp.name}</span>
                <span className="text-sm text-ink2">進行</span>
              </div>
            )}
            {others
              .filter((u) => u!.id !== me)
              .map((u) => (
                <div key={u!.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar u={u!} size={32} />
                  <span className="min-w-0 flex-1 truncate">{u!.name}</span>
                </div>
              ))}
            {meUser && (
              <div className="flex items-center gap-3 bg-primary/5 px-5 py-3.5">
                {myChar ? <CharAvatar c={myChar} size={32} /> : <Avatar u={meUser} size={32} />}
                <span className="min-w-0 flex-1 truncate">
                  <b>{myChar ? myChar.name : meUser.name}</b>
                  {myChar && <span className="ml-2 text-sm text-ink2">{meUser.name}</span>}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-bold text-success">
                  <IconCheck width={16} height={16} aria-hidden />
                  参加中
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-base-300 px-5 py-4">
            <p className="min-w-0 flex-1 text-sm text-ink2">
              キャラクターはセッションの参加者欄で付け替えます。
            </p>
            <Link className="btn btn-primary" to={`/sessions/${log.id}` as never}>
              セッションを開く
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {head}

      <section className="surface p-5 sm:p-6">
        {(kp || others.length > 0) && (
          <div className="mb-5 flex items-center gap-3">
            <span className="flex shrink-0 -space-x-1.5" aria-hidden>
              {[kp, ...others]
                .filter(Boolean)
                .slice(0, 6)
                .map((u) => (
                  <span key={u!.id} className="rounded-full ring-2 ring-base-100">
                    <Avatar u={u!} size={28} />
                  </span>
                ))}
            </span>
            <p className="min-w-0 text-sm text-ink2">
              {kp && <>進行 {kp.name}</>}
              {others.length > 0 && (
                <>
                  {kp ? "　" : ""}参加 {others.map((u) => u!.name).join("、")}
                </>
              )}
            </p>
          </div>
        )}

        <div className="list">
          {log.hasLog && unclaimed.length > 0 && (
            <fieldset className="pb-5">
              <legend className="text-sm font-bold">ログの中のあなた</legend>
              <p className="mt-0.5 text-sm text-ink2">選んだ発言者に、あなたのアイコンが付きます（任意）。</p>
              <div
                role="radiogroup"
                aria-label="ログの中のあなた"
                className="mt-3 grid gap-1.5 sm:grid-cols-2"
              >
                {playerSpeakers.map((s) => {
                  const claimed = claimedBy.get(s.name);
                  const active = selectedSpeaker === s.name;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={Boolean(claimed)}
                      className={cx(
                        "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-55",
                        active ? "border-primary bg-primary/10" : "border-base-300 hover:bg-base-200",
                      )}
                      onClick={() => setSelectedSpeaker(active ? null : s.name)}
                    >
                      <span
                        className={cx(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          active ? "border-primary bg-primary" : "border-base-content/30",
                        )}
                        aria-hidden
                      >
                        {active && <span className="size-1.5 rounded-full bg-primary-content" />}
                      </span>
                      <b className="min-w-0 flex-1 truncate text-sm">{s.name}</b>
                      {claimed && <span className="shrink-0 text-xs text-ink2">{claimed.userName}</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {myChars.length > 0 && (
            <div className="py-5 first:pt-0">
              <p className="text-sm font-bold" id="invite-char">
                使ったキャラクター
              </p>
              <Select
                className="mt-2 w-full sm:max-w-sm"
                ariaLabel="使ったキャラクター"
                value={charId}
                onChange={setCharId}
                options={[
                  { value: "", label: "あとで選ぶ" },
                  ...myChars.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          )}

          <div className="flex flex-col gap-3 pt-5 first:pt-0 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-xs text-ink2">参加はあとから外せます。</p>
            <button className="btn btn-primary" onClick={() => join(charId || null)}>
              <IconUserPlus width={18} height={18} aria-hidden />
              {JOIN_LABEL}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
