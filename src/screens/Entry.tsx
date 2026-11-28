/**
 * 記録（ストア）を読む入口: 招待の受け取り（/invite/[id]・卓は /join/[token]）・ログイン（/signin）・
 * はじめの設定（/welcome）・サンプルの開始（/demo）。
 * LP・規約などの公開ページ（Landing.tsx）は Firebase と記録を読み込まないので、ログインの処理はこちらに置く。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParam } from "../lib/router";
import { useStore } from "../store";
import {
  Combobox,
  CompletionModal,
  LogoMark,
  NotFound,
  PageHead,
  SysBadge,
  TableMark,
  cx,
  PageLoading,
} from "../components/ui";
import {
  Avatar,
  CharAvatar,
  characterAvatarSrc,
  ImageUploadField,
  resolveSpeakerAvatarSrc,
  UserName,
  userAvatarSrc,
} from "../components/identity";
import { alternateHandle, HANDLE_MAX, handleProblem, normalizeHandle, suggestHandle } from "../lib/handle";
import { applyJoinedTable, findLocalInvite, handleTakenLocally, type TableInviteView } from "../lib/people";
/** ユーザー ID・卓の招待の照会は Firestore を使うので、要るときに読む（ログイン画面の JS に Firestore を載せない） */
const cloudPeople = () => import("../lib/cloud-people");
import { SYSTEMS } from "../data/systems";
import { roleLabel } from "../lib/roles";
import { fmtDates, sessionDays } from "../lib/time";
import type { Msg } from "../types";
import { IconBooks, IconCheck, IconUserPlus } from "../components/icons";
import type { SharedInvite } from "../lib/cloud-state";
import { mergeAcceptedShare } from "../lib/accept-share";
import { authErrorMessage, signInWithGoogle } from "../lib/auth";
import { isFirebaseConfigured } from "../lib/firebase";
import { destinationLabel, safeNextPath } from "../lib/next-path";
import { GoogleSignInButton } from "../components/identity";
import { PublicFrame } from "./Landing";
import { sessionTitle } from "../lib/session-scenario";

/**
 * 招待リンク着地ページ。
 * PLがログインして「発言者を引き受ける」or「発言者なしで参加」する。
 * 紐付けは任意(同意フォームなし)で、本人はあとから外せる。
 */
export default function ClaimInvite() {
  const { id } = useParams<{ id?: string }>();
  const { state, authUser } = useStore();
  if (!authUser || state.logs[id ?? ""]) return <LocalClaimInvite />;
  return <RemoteClaimInvite token={id ?? ""} />;
}
/** 招待の見出し: 誰が、どのセッションに招待しているか */
function InviteHead({
  title,
  systemId,
  dates,
  inviter,
}: {
  title: string;
  systemId: string;
  dates?: string[];
  inviter?: ReactNode;
}) {
  const sys = SYSTEMS[systemId];
  return (
    <PageHead
      eyebrow="セッションへの招待"
      title={title}
      sub={
        <>
          {inviter && <p className="mb-1.5 text-base text-base-content">{inviter}</p>}
          <div className="meta">
            {sys && <SysBadge sys={sys} />}
            {dates && dates.length > 0 && <span>{fmtDates(dates)}</span>}
          </div>
        </>
      }
    />
  );
}

const JOIN_LABEL = "このセッションに参加する";

function RemoteClaimInvite({ token }: { token: string }) {
  const { state, update } = useStore();
  const nav = useNavigate();
  const [invite, setInvite] = useState<SharedInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    // Firestore の SDK は、招待を開いたときに読む（ログイン画面など、この画面の他の部分の JS に載せない）
    import("../lib/cloud-state")
      .then(({ getSharedInvite }) => getSharedInvite(token))
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
      <div>
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
    <div>
      <InviteHead title={invite.title} systemId={invite.systemId} />
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
              const { acceptSharedInvite } = await import("../lib/cloud-state");
              const { share, slug, ownerId } = await acceptSharedInvite(token, state.users[state.me]);
              // 自分の記録や、知っている人・シナリオは上書きしない。入れられなければ何も変えずに知らせる
              mergeAcceptedShare(structuredClone(state), share, { slug, ownerId });
              update((s) => mergeAcceptedShare(s, share, { slug, ownerId }));
              nav({ to: `/sessions/${share.log.id}` });
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
  const { id } = useParams<{ id?: string }>();
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
      title={sessionTitle(log, state.scenarios)}
      systemId={log.systemId}
      dates={sessionDays(log)}
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
      <div>
        {head}
        <section className="surface" aria-label="参加者">
          <div className="list">
            {kp && (
              <div className="flex items-center gap-3 px-5 py-3.5">
                <Avatar u={kp} size={32} />
                <span className="min-w-0 flex-1 truncate font-bold">{kp.name}</span>
                <span className="text-sm text-ink2">{roleLabel(log.systemId, "GM")}</span>
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
            <Link className="btn btn-primary" to={`/sessions/${log.id}`}>
              セッションを開く
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
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
              {kp && <>GM {kp.name}</>}
              {others.length > 0 && (
                <>
                  {kp ? "　" : ""}PL {others.map((u) => u!.name).join("、")}
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
                  const avatarSrc = resolveSpeakerAvatarSrc(s.name, s.kind, log.speakerIcons, state);
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
                      <img
                        src={avatarSrc}
                        alt=""
                        width={28}
                        height={28}
                        className="size-7 shrink-0 rounded-full border border-base-300 bg-base-200 object-cover"
                      />
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
              <Combobox
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

/** 体験版の見本（約 480KB）を先に読んでおく。読み終えたものは import() が使い回す */
const preloadDemo = () => void import("../data/seed").catch(() => {});

/* ================= サンプルの開始（/demo） =================
 * LP は記録を読まずに描画するので、サンプルを始める操作はこの画面（記録を読む側）で行う。
 */
export function DemoStart() {
  const { state, enterDemo } = useStore();
  const nav = useNavigate();
  useEffect(() => {
    // 見本は始めるときに読む（非同期）。入り終えてからホームへ（先に移ると、入る前の画面としてログインへ送られる）
    if (!state.entered) enterDemo();
    else nav({ to: "/home", replace: true });
  }, [state.entered, enterDemo, nav]);
  return (
    <main>
      <PageLoading full label="サンプルを準備しています" />
    </main>
  );
}

/* ================= ログイン（/signin） ================= */
export function SignIn() {
  const { state, enterDemo } = useStore();
  const nav = useNavigate();
  const next = safeNextPath(useSearchParam("next"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // もう使い始めている（ログイン済み・サンプル中）なら、ログインの画面を挟まず行き先へ送る
  useEffect(() => {
    if (state.entered) nav({ to: next, replace: true });
  }, [state.entered, next, nav]);
  return (
    <PublicFrame width="max-w-md" hideLogin>
      <section aria-labelledby="signin-title">
        <h1 id="signin-title" className="text-2xl font-bold">
          卓譜にログイン
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink2">
          記録はアカウントに保存され、どの端末からでも開けます。
        </p>
        {state.entered ? (
          <Link to={next} className="btn btn-primary mt-6">
            ホームを開く
          </Link>
        ) : (
          <div className="mt-6">
            <GoogleSignInButton
              busy={busy}
              disabled={!isFirebaseConfigured}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await signInWithGoogle();
                  nav({ to: next, replace: true });
                } catch (cause) {
                  setError(authErrorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            />
            {error && (
              <p className="mt-3 text-sm leading-6 text-error" role="alert">
                {error}
              </p>
            )}
            {!isFirebaseConfigured && (
              <p className="mt-3 text-sm text-ink2">ログインは準備中です。サンプルデータでお試しください。</p>
            )}
            <p className="mt-4 text-xs leading-relaxed text-ink2">
              ログインすると
              <Link to="/terms" className="underline underline-offset-2 hover:text-base-content">
                利用規約
              </Link>
              と
              <Link to="/privacy" className="underline underline-offset-2 hover:text-base-content">
                プライバシーポリシー
              </Link>
              に同意したことになります。
            </p>
            <div className="mt-8 border-t border-base-300 pt-6">
              <h2 className="text-sm font-bold">アカウントを作らずに試す</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink2">
                サンプルの卓とキャラクターが入った状態で開きます。変更はこのブラウザにだけ保存されます。
              </p>
              <button
                type="button"
                className="btn mt-3"
                // 見本は押されそうになったら読み始める（押してからの待ちを縮める）
                onPointerEnter={preloadDemo}
                onFocus={preloadDemo}
                onClick={() => void enterDemo().then(() => nav({ to: next, replace: true }))}
              >
                サンプルデータをそのまま見る
              </button>
            </div>
          </div>
        )}
      </section>
    </PublicFrame>
  );
}

/* ================= はじめの設定（/welcome） =================
 * 初めてログインした人に、ID・表示名・アイコンを 1 つずつ決めてもらう（P15）。
 * ID だけは飛ばせない（プロフィールの URL とアイコンの種で、あとから変えられないため）。表示名とアイコンは飛ばすと今の値のまま。
 * 取り込み（ログ・キャラシ）は、終わりの画面から既存の画面へ案内する
 */
type WelcomeStep = "id" | "name" | "icon";
const WELCOME_STEPS: readonly { key: WelcomeStep; label: string }[] = [
  { key: "id", label: "ユーザー ID" },
  { key: "name", label: "表示名" },
  { key: "icon", label: "アイコン" },
];

function WelcomeFrame({ step, children }: { step: WelcomeStep; children: ReactNode }) {
  const index = WELCOME_STEPS.findIndex((s) => s.key === step);
  return (
    <div className="flex min-h-dvh flex-col bg-base-200">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <span className="flex items-center gap-2 text-primary">
            <LogoMark size={22} />
            <span className="font-bold tracking-tight text-base-content">卓譜</span>
          </span>
          <ol className="ml-auto flex items-center gap-1.5" aria-label="はじめの設定">
            {WELCOME_STEPS.map((s, i) => (
              <li
                key={s.key}
                aria-current={i === index ? "step" : undefined}
                className={cx(
                  "h-1.5 w-6 rounded-full transition-colors",
                  i <= index ? "bg-primary" : "bg-base-300",
                )}
              >
                <span className="sr-only">
                  {s.label}
                  {i < index ? "（済）" : ""}
                </span>
              </li>
            ))}
          </ol>
          <span className="text-sm tabular-nums text-ink2" aria-hidden>
            {index + 1} / {WELCOME_STEPS.length}
          </span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-xl grow px-4 pb-16 pt-10 sm:px-6">
        <div key={step} className="motion-enter">
          {children}
        </div>
      </main>
    </div>
  );
}

/** 一歩ぶんの面: 見出し・中身・下の操作（戻る / スキップ / 次へ） */
function WelcomeCard({
  title,
  lead,
  children,
  onBack,
  onSkip,
  primary,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  primary: ReactNode;
}) {
  return (
    <section className="surface" aria-labelledby="welcome-title">
      <div className="px-5 pt-6 sm:px-7 sm:pt-7">
        <h1 id="welcome-title" className="text-xl font-bold">
          {title}
        </h1>
        {lead && <p className="mt-1.5 text-sm text-ink2">{lead}</p>}
        <div className="mt-6">{children}</div>
      </div>
      <div className="mt-7 flex items-center gap-2 border-t border-base-300 px-5 py-4 sm:px-7">
        {onBack && (
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            戻る
          </button>
        )}
        <span className="grow" />
        {onSkip && (
          <button type="button" className="btn btn-quiet" onClick={onSkip}>
            スキップ
          </button>
        )}
        {primary}
      </div>
    </section>
  );
}

type HandleStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "error"; text: string };

function useHandleStatus(
  handle: string,
  uid: string,
  remote: boolean,
  takenLocally: (h: string) => boolean,
): HandleStatus {
  const problem = handle ? handleProblem(handle) : null;
  const local: HandleStatus | null = !handle
    ? { kind: "idle" }
    : problem
      ? { kind: "error", text: problem }
      : takenLocally(handle)
        ? { kind: "error", text: HANDLE_TAKEN }
        : null;
  const needsRemote = remote && !local;
  const [checked, setChecked] = useState<{ handle: string; status: HandleStatus } | null>(null);
  useEffect(() => {
    if (!needsRemote) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      cloudPeople()
        .then((p) => p.fetchHandleOwner(handle))
        .then((owner) => {
          if (alive)
            setChecked({
              handle,
              status: owner && owner !== uid ? { kind: "error", text: HANDLE_TAKEN } : { kind: "ok" },
            });
        })
        .catch(() => {
          if (alive)
            setChecked({
              handle,
              status: { kind: "error", text: "確かめられませんでした。通信状態を確認してください" },
            });
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [needsRemote, handle, uid]);
  if (local) return local;
  if (!remote) return { kind: "ok" };
  return checked?.handle === handle ? checked.status : { kind: "checking" };
}

const HANDLE_TAKEN = "この ID はほかの人が使っています";

export function Welcome() {
  const { state, update, authUser } = useStore();
  const nav = useNavigate();
  const rawNext = useSearchParam("next");
  const next = safeNextPath(rawNext?.startsWith("/welcome") ? null : rawNext);
  const me = state.users[state.me];
  const [step, setStep] = useState<WelcomeStep>(me?.handle ? "name" : "id");
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!state.entered) nav({ to: "/signin", search: { next: "/welcome" }, replace: true });
  }, [state.entered, nav]);

  // 別の端末で ID を決めていて、記録の保存がまだ追いついていないとき
  const uid = authUser?.uid;
  const hasHandle = Boolean(me?.handle);
  useEffect(() => {
    if (!uid || hasHandle) return;
    let alive = true;
    cloudPeople()
      .then((p) => p.fetchOwnHandle(uid))
      .then((handle) => {
        if (!alive || !handle) return;
        update((s) => {
          s.users[s.me]!.handle = handle;
        });
        setStep("name");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid, hasHandle, update]);

  if (!state.entered || !me) return null;

  const finish = () => {
    update((s) => {
      s.prefs.onboardingDone = true;
    });
    setFinished(true);
  };

  // 完了の印はアニメーションする枠（transform）の外に置く。中に置くと fixed が枠に閉じ込められる
  return (
    <>
      <WelcomeFrame step={step}>
        {step === "id" && <WelcomeHandle onDone={() => setStep("name")} />}
        {step === "name" && (
          <WelcomeName onBack={me.handle ? undefined : () => setStep("id")} onDone={() => setStep("icon")} />
        )}
        {step === "icon" && <WelcomeIcon onBack={() => setStep("name")} onDone={finish} />}
      </WelcomeFrame>
      {finished && (
        <CompletionModal
          title="卓譜の準備ができました"
          stamp={
            <span className="motion-reveal">
              <Avatar u={state.users[state.me]!} size={72} />
            </span>
          }
          primary={{ label: destinationLabel(next), to: next }}
          secondary={[
            { label: "セッションのログを取り込む", to: "/upload" },
            { label: "キャラシを取り込む", to: "/characters" },
          ]}
          onClose={() => nav({ to: next, replace: true })}
        >
          <p>
            <b className="text-base-content">{state.users[state.me]!.name}</b>
            <span className="ml-1.5">@{state.users[state.me]!.handle}</span>
          </p>
          <p className="mt-2">記録とプロフィールは、一緒に遊んだ人に見えます。</p>
        </CompletionModal>
      )}
    </>
  );
}

function WelcomeHandle({ onDone }: { onDone: () => void }) {
  const { state, update, authUser } = useStore();
  const me = state.users[state.me]!;
  const remote = Boolean(authUser);
  const suggested = useMemo(
    () => suggestHandle({ email: me.email ?? authUser?.email ?? undefined, name: me.name, uid: me.id }),
    [me.email, me.name, me.id, authUser?.email],
  );
  const takenLocally = useMemo(() => (h: string) => handleTakenLocally(state, h), [state]);
  // はじめの候補が使われていたら、末尾に数字を足した候補に替える（入力し始めたら触らない）
  const [draft, setDraft] = useState(() => {
    for (let i = 0; i <= 3; i++) {
      const candidate = i === 0 ? suggested : alternateHandle(suggested, i);
      if (!takenLocally(candidate)) return candidate;
    }
    return suggested;
  });
  const touched = useRef(false);
  const uid = authUser?.uid;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void (async () => {
      for (let i = 0; i <= 3; i++) {
        const candidate = i === 0 ? suggested : alternateHandle(suggested, i);
        const owner = await cloudPeople()
          .then((p) => p.fetchHandleOwner(candidate))
          .catch(() => uid);
        if (!alive) return;
        if (!owner || owner === uid) {
          if (!touched.current) setDraft(candidate);
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
    // 開いたときに一度だけ候補を決める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, suggested]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = normalizeHandle(draft);
  const status = useHandleStatus(handle, me.id, remote, takenLocally);

  async function submit() {
    if (status.kind !== "ok" || busy) return;
    setBusy(true);
    setError(null);
    try {
      let fixed = handle;
      if (authUser) {
        const res = await cloudPeople().then((p) => p.claimHandle(authUser.uid, handle));
        if (!res.ok && res.reason === "taken") {
          setError(HANDLE_TAKEN);
          return;
        }
        fixed = res.handle ?? handle;
      }
      update((s) => {
        s.users[s.me]!.handle = fixed;
      });
      onDone();
    } catch {
      setError("ID を保存できませんでした。通信状態を確認して、もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? (status.kind === "error" ? status.text : null);
  return (
    <WelcomeCard
      title="ユーザー ID を決めましょう"
      lead="プロフィールの URL になり、あとから変えられません。"
      primary={
        <button
          type="button"
          className="btn btn-primary"
          disabled={status.kind !== "ok" || busy}
          onClick={submit}
        >
          {busy && <span className="loading loading-spinner loading-xs" aria-hidden />}
          この ID にする
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="welcome-handle" className="sr-only">
            ユーザー ID
          </label>
          <div className={cx("input flex w-full items-center gap-1", message && "input-error")}>
            <span className="text-ink2" aria-hidden>
              @
            </span>
            <input
              id="welcome-handle"
              className="min-w-0 grow"
              value={draft}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={HANDLE_MAX + 1}
              aria-invalid={message ? "true" : undefined}
              aria-describedby="welcome-handle-status"
              onChange={(e) => {
                touched.current = true;
                setError(null);
                setDraft(e.target.value);
              }}
            />
          </div>
          <p
            id="welcome-handle-status"
            role="status"
            className={cx("mt-1.5 min-h-5 text-sm", message ? "text-error" : "text-ink2")}
          >
            {message ??
              (status.kind === "checking"
                ? "確かめています…"
                : status.kind === "ok"
                  ? `/users/${handle}`
                  : "半角の英小文字・数字・_ で 3〜20 文字")}
          </p>
        </div>
      </form>
    </WelcomeCard>
  );
}

function WelcomeName({ onBack, onDone }: { onBack?: () => void; onDone: () => void }) {
  const { state, update } = useStore();
  const me = state.users[state.me]!;
  const [name, setName] = useState(me.name);
  const trimmed = name.trim();
  const save = () => {
    if (!trimmed) return;
    update((s) => {
      s.users[s.me]!.name = trimmed.slice(0, 50);
    });
    onDone();
  };
  return (
    <WelcomeCard
      title="表示名を決めましょう"
      lead="一緒に遊ぶ人に見える名前で、いつでも変えられます。"
      onBack={onBack}
      onSkip={onDone}
      primary={
        <button type="button" className="btn btn-primary" disabled={!trimmed} onClick={save}>
          次へ
        </button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label htmlFor="welcome-name" className="sr-only">
          表示名
        </label>
        <input
          id="welcome-name"
          className={cx("input w-full", !trimmed && "input-error")}
          value={name}
          maxLength={50}
          autoComplete="nickname"
          aria-invalid={!trimmed ? "true" : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="mt-1.5 min-h-5 text-sm text-ink2">
          <span className="font-semibold text-base-content">{trimmed || "（未入力）"}</span>
          <span className="ml-1.5">@{me.handle}</span>
        </p>
      </form>
    </WelcomeCard>
  );
}

function WelcomeIcon({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { state, update, authUser } = useStore();
  const me = state.users[state.me]!;
  const google = authUser?.photoURL ?? undefined;
  // はじめは生成した画像。Google の画像は選んだときだけ使う
  const [image, setImage] = useState(me.image && me.image !== google ? me.image : "");
  const save = (value: string) => {
    update((s) => {
      s.users[s.me]!.image = value;
    });
    onDone();
  };
  return (
    <WelcomeCard
      title="アイコンを選びましょう"
      onBack={onBack}
      onSkip={() => save("")}
      primary={
        <button type="button" className="btn btn-primary" onClick={() => save(image)}>
          はじめる
        </button>
      }
    >
      <ImageUploadField
        value={image}
        onChange={setImage}
        label="アイコン"
        render={(src) => <Avatar u={{ ...me, image: src || undefined }} size={56} />}
        choices={google ? [{ value: google, label: "Google" }] : []}
      />
    </WelcomeCard>
  );
}

/* ================= 卓の招待（/join/[token]） =================
 * 招待リンクを開いた人に、卓の名前と顔ぶれを見せて「参加する」だけを置く（P14）
 */
interface JoinView {
  tableId: string;
  tableName: string;
  image?: string;
  ownerId: string;
  members: { uid: string; name: string; handle?: string; color: string; image?: string }[];
  remote?: TableInviteView;
}

export function JoinTable() {
  const { token = "" } = useParams<{ token?: string }>();
  const { state, update, authUser } = useStore();
  const nav = useNavigate();
  const local = findLocalInvite(state, token);
  const [remote, setRemote] = useState<TableInviteView | null>(null);
  const [loading, setLoading] = useState(!local && Boolean(authUser));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (local || !authUser) return;
    let alive = true;
    cloudPeople()
      .then((p) => p.fetchTableInvite(token))
      .then((v) => alive && setRemote(v))
      .catch(() => alive && setError("招待を読み込めませんでした。通信状態を確認してください。"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [local, authUser, token]);

  const view: JoinView | null = local
    ? {
        tableId: local.id,
        tableName: local.name,
        image: local.image,
        ownerId: local.ownerId,
        members: local.memberIds
          .map((id) => state.users[id])
          .filter((u): u is NonNullable<typeof u> => Boolean(u))
          .map((u) => ({ uid: u.id, name: u.name, handle: u.handle, color: u.color, image: u.image })),
      }
    : remote
      ? { ...remote, remote }
      : null;

  if (loading) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-ink2">
        <span className="loading loading-spinner loading-sm" aria-hidden />
        招待を確認しています…
      </p>
    );
  }
  if (!view) {
    return (
      <div>
        <PageHead title="招待を開けませんでした" />
        <div className="surface p-5 sm:p-6">
          <p className="text-sm">{error ?? "期限が切れたか、無効になった招待です。"}</p>
          <Link to="/tables" className="btn mt-4">
            卓の一覧へ
          </Link>
        </div>
      </div>
    );
  }

  const joined = state.tables[view.tableId]?.memberIds.includes(state.me) ?? false;
  const owner = view.members.find((m) => m.uid === view.ownerId);

  async function join() {
    if (!view) return;
    setBusy(true);
    setError(null);
    try {
      if (view.remote) {
        await cloudPeople().then((p) => p.joinTableInvite(token, state.users[state.me]!));
        update((s) => {
          applyJoinedTable(s, view.remote!);
        });
      } else {
        update((s) => {
          const t = s.tables[view.tableId]!;
          if (!t.memberIds.includes(s.me)) t.memberIds.push(s.me);
        });
      }
      nav({ to: `/tables/${view.tableId}` });
    } catch {
      setError("参加できませんでした。招待した人に、新しいリンクを頼んでください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead
        eyebrow="卓への招待"
        lead={<TableMark table={{ id: view.tableId, image: view.image }} size={56} />}
        title={view.tableName}
        sub={owner ? `${owner.name}さんが、あなたをこの卓に招待しています。` : undefined}
      />
      <section className="surface" aria-label="メンバー">
        <ul className="list">
          {view.members.map((m) => (
            <li key={m.uid} className="flex items-center gap-3 px-5 py-3">
              <Avatar
                u={{
                  id: m.uid,
                  name: m.name,
                  handle: m.handle || undefined,
                  color: m.color,
                  image: m.image || undefined,
                  accounts: [],
                }}
                size={32}
              />
              <UserName
                u={{ id: m.uid, name: m.name, handle: m.handle || undefined, color: m.color, accounts: [] }}
                className="flex-1 truncate"
              />
              {m.uid === view.ownerId && <span className="text-sm text-ink2">作成者</span>}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t border-base-300 px-5 py-4 sm:flex-row sm:items-center">
          {error ? (
            <p className="min-w-0 flex-1 text-sm text-error" role="alert">
              {error}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {joined ? (
            <Link className="btn btn-primary" to={`/tables/${view.tableId}`}>
              <IconCheck width={18} height={18} aria-hidden />
              参加中・卓を開く
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={join}>
              {busy ? (
                <span className="loading loading-spinner loading-xs" aria-hidden />
              ) : (
                <IconUserPlus width={18} height={18} aria-hidden />
              )}
              この卓に参加する
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
