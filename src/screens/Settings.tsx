import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, replaceUrlInPlace, useNavigate, useParams } from "../lib/router";
import { IconChevronRight, IconLock, IconPencil, IconSearch, IconSettings } from "../components/icons";
import {
  EmptyState,
  Field,
  FieldError,
  LoadMore,
  Modal,
  NotFound,
  PageHead,
  SectionTitle,
  Seg,
  SettingRow,
  Toggle,
  cx,
  useVisibleCount,
} from "../components/ui";
import { Avatar, CharacterCard, ImageUploadField, ProviderIcon } from "../components/identity";
import { findUserByRef, userHref } from "../lib/people";
import { authErrorMessage, linkXAccount, signOutAccount, unlinkXAccount } from "../lib/auth";
import { LEGAL_LINKS } from "../lib/rights";
import { GoogleBusySettings } from "../components/google-busy";
import { features } from "../lib/features";
import { DiscordAccountRow } from "../components/discord";
import { sessionStart } from "../lib/time";
import { resetData, useStore } from "../store";

import { SessionRow } from "./Sessions";
import { applyTheme, currentThemeMode, type ThemeMode } from "../lib/theme";

export { applyTheme, currentThemeMode, resolveTheme, type ThemeMode } from "../lib/theme";
export { ThemeSync } from "../components/ThemeSync";

export default function Settings() {
  const { state, update, authUser, cloudStatus, enterDemo, refreshProfile, retrySave, saveError } =
    useStore();
  const nav = useNavigate();
  const me = state.users[state.me]!;
  const [mode, setMode] = useState<ThemeMode>(currentThemeMode);
  const [demoPicker, setDemoPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 成功は画面の変化（連携状態・読み込んだ記録）で伝わるので、エラーだけを出す

  const x = me.accounts.find((account) => account.provider === "x" && account.status === "linked");
  const google = me.accounts.find((account) => account.provider === "google");

  async function connectX(remove = false) {
    setBusy(true);
    setError(null);
    try {
      await (remove ? unlinkXAccount() : linkXAccount());
      refreshProfile();
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      if (authUser) await signOutAccount();
      else
        update((s) => {
          s.entered = false;
        });
      nav({ to: "/" });
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const syncText = authUser
    ? cloudStatus === "saved"
      ? "記録はアカウントに保存され、どの端末からでも見られます。"
      : cloudStatus === "saving"
        ? "記録を保存しています…"
        : "まだ保存できていない記録があります。"
    : "お試し中の記録は、このブラウザだけに保存されます。";

  return (
    <div>
      <PageHead title="設定" />

      <SectionTitle>アカウント</SectionTitle>
      <div className="surface list">
        <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
          <Avatar u={me} size={48} />
          <div className="min-w-0 grow">
            <b className="block truncate">{me.name}</b>
            <p className="truncate text-sm text-ink2">
              {authUser ? me.email || google?.displayName : "サンプルデータでお試し中"}
            </p>
          </div>
          <Link className="btn btn-sm" to={userHref(me)}>
            プロフィール
          </Link>
        </div>
        {!authUser && (
          <SettingRow title="表示する利用者" desc="サンプルの別の利用者になって、見え方を確かめられます。">
            <button className="btn btn-sm" onClick={() => setDemoPicker(true)}>
              サンプルの利用者を切り替える
            </button>
          </SettingRow>
        )}
        <SettingRow
          icon={<ProviderIcon provider="google" size={28} />}
          title="Google"
          desc={
            authUser
              ? google?.status === "linked"
                ? google.email || me.email || google.displayName || "連携済み"
                : "連携していません"
              : "サンプルでは未連携"
          }
        >
          {authUser && (
            <span className="text-sm text-ink2">{google?.status === "linked" ? "連携中" : "未連携"}</span>
          )}
        </SettingRow>
        <DiscordAccountRow />
        <SettingRow
          icon={<ProviderIcon provider="x" size={28} />}
          title="X"
          desc={authUser ? x?.displayName || (x ? me.name : "連携していません") : "サンプルでは未連携"}
        >
          {authUser && (
            <button className="btn btn-sm" disabled={busy} onClick={() => connectX(Boolean(x))}>
              {busy ? "連携中…" : x ? "連携を解除" : "連携する"}
            </button>
          )}
        </SettingRow>
        <SettingRow title={authUser ? "ログアウト" : "お試しを終える"}>
          <button className="btn btn-sm" disabled={busy} onClick={signOut}>
            {authUser ? "ログアウト" : "最初の画面へ"}
          </button>
        </SettingRow>
      </div>
      {error && (
        <p className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <SectionTitle>表示</SectionTitle>
      <div className="surface list">
        <SettingRow title="外観">
          <Seg<ThemeMode>
            ariaLabel="外観"
            value={mode}
            onChange={(value) => {
              setMode(value);
              applyTheme(value);
            }}
            options={[
              { v: "light", label: "ライト" },
              { v: "system", label: "端末に合わせる" },
              { v: "dark", label: "ダーク" },
            ]}
          />
        </SettingRow>
      </div>

      <SectionTitle>プライバシー</SectionTitle>
      <div className="surface list">
        <SettingRow
          title="プロフィールを公開"
          desc="オフにすると、ほかの人からプロフィール・キャラクター・参加セッションが見えなくなります。"
        >
          <Toggle
            label="プロフィールを公開"
            on={me.profilePublic !== false}
            onChange={(value) =>
              update((s) => {
                s.users[s.me]!.profilePublic = value;
              })
            }
          />
        </SettingRow>
        <SettingRow title="共有ページで名前を隠す">
          <Toggle
            label="共有ページで名前を隠す"
            on={state.prefs.hideSelfOnShare}
            onChange={(value) =>
              update((s) => {
                s.prefs.hideSelfOnShare = value;
                Object.values(s.logs).forEach((log) => {
                  if (log.players[s.me]) log.players[s.me]!.hidden = value;
                });
              })
            }
          />
        </SettingRow>
      </div>

      {features.googleCalendar && <GoogleCalendarSection />}

      <SectionTitle sub={syncText}>データ</SectionTitle>
      {/* 操作が無いとき（ログイン中で保存できている）は、空の面を出さず保存の状態だけを見せる */}
      {(!authUser || saveError) && (
        <div className="surface list">
          {authUser && saveError && (
            <SettingRow title="保存できていない記録" desc={saveError}>
              <button className="btn btn-sm" onClick={retrySave}>
                もう一度保存
              </button>
            </SettingRow>
          )}
          {!authUser && (
            <SettingRow title="サンプルを初期状態に戻す" desc="このブラウザで加えた変更をすべて消します。">
              <button className="btn btn-sm btn-danger" onClick={() => setConfirmReset(true)}>
                初期状態に戻す
              </button>
            </SettingRow>
          )}
        </div>
      )}

      <SectionTitle>このサービスについて</SectionTitle>
      <nav aria-label="このサービスについて" className="surface list">
        {LEGAL_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="row-interactive flex items-center justify-between gap-3 px-4 py-3.5 text-sm font-bold sm:px-5"
          >
            {l.label}
            <IconChevronRight width={16} height={16} className="text-ink2" aria-hidden />
          </Link>
        ))}
      </nav>

      {demoPicker && (
        <Modal title="表示する利用者" onClose={() => setDemoPicker(false)}>
          <div className="space-y-1">
            {["u_mikan", "u_sora", "u_kai", "u_hina", "u_rin"]
              .filter((id) => state.users[id])
              .map((id) => (
                <button
                  key={id}
                  className={cx(
                    "w-full flex items-center gap-3.5 p-3 text-left rounded-lg transition-colors hover:bg-base-200",
                    id === state.me && "bg-primary/10",
                  )}
                  onClick={() => {
                    enterDemo(id);
                    setDemoPicker(false);
                  }}
                >
                  <Avatar u={state.users[id]!} size={36} />
                  <span className="font-semibold text-sm grow">{state.users[id]!.name}</span>
                  {id === state.me && <span className="text-xs text-primary">表示中</span>}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {confirmReset && (
        <Modal
          title="サンプルを初期状態に戻しますか？"
          onClose={() => setConfirmReset(false)}
          foot={
            <>
              <button className="btn btn-quiet" onClick={() => setConfirmReset(false)}>
                キャンセル
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  resetData();
                  location.reload();
                }}
              >
                初期状態に戻す
              </button>
            </>
          }
        >
          <p className="text-sm leading-7">
            このブラウザで加えた変更が消えます。必要な記録は、先にダウンロードしてください。
          </p>
        </Modal>
      )}
    </div>
  );
}

/** 区画の余白はここで持つ（SectionTitle は先頭の子だと上の余白が消える） */
function GoogleCalendarSection() {
  return (
    <section id="google-calendar" aria-labelledby="settings-google-calendar" className="mt-10">
      <SectionTitle>
        <span id="settings-google-calendar">カレンダー</span>
      </SectionTitle>
      <GoogleBusySettings />
    </section>
  );
}

/* ================= ユーザー詳細ページ ================= */
const USER_CHAR_PAGE = 6;
const USER_CHAR_STEP = 12;
const USER_LOG_PAGE = 10;
const USER_LOG_STEP = 20;

export function UserDetail() {
  const { id } = useParams<{ id?: string }>();
  const { state } = useStore();
  /*
   * 別の人のページへ移ったら、編集中の内容・検索・表示件数をすべて最初に戻す。
   * 区別は URL の文字ではなく人で行う: 古い uid の URL は開いた直後に ID の URL へ置き換わる（同じ人）ので、
   * URL で区別すると、その間に開いた編集が消えていた
   */
  const person = findUserByRef(state, id ?? "")?.id ?? id ?? "";
  return <UserDetailView key={person} id={id} />;
}

function UserDetailView({ id }: { id: string | undefined }) {
  const { state, update } = useStore();
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [imageDraft, setImageDraft] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [charQ, setCharQ] = useState("");
  const deferredCharQ = useDeferredValue(charQ);
  const [charCount, setCharCount] = useVisibleCount(USER_CHAR_PAGE, [deferredCharQ]);
  const [logCount, setLogCount] = useState(USER_LOG_PAGE);

  // URL はユーザー ID（/users/<handle>）。古い uid の URL は ID の URL に置き換える
  const user = findUserByRef(state, id ?? "");
  const canonical = user ? userHref(user) : null;
  useEffect(() => {
    // 同じ人の URL なので、画面を作り直さずにアドレス欄だけを置き換える
    if (canonical && id && canonical !== `/users/${id}`) replaceUrlInPlace(canonical);
  }, [canonical, id]);
  const chars = useMemo(
    () => (user ? Object.values(state.characters).filter((c) => c.ownerId === user.id) : []),
    [user, state.characters],
  );
  const filteredChars = useMemo(() => {
    const q = deferredCharQ.trim().toLowerCase();
    if (!q) return chars;
    return chars.filter((c) => (c.name + c.archetype + c.tags.join()).toLowerCase().includes(q));
  }, [chars, deferredCharQ]);
  const logs = useMemo(
    () =>
      user
        ? Object.values(state.logs)
            .filter((l) => l.ownerId === user.id || l.players[user.id])
            .sort((a, b) => sessionStart(b) - sessionStart(a))
        : [],
    [user, state.logs],
  );
  const isMe = user?.id === state.me;
  const together = useMemo(
    () => (isMe || !user ? [] : logs.filter((l) => l.players[state.me] || l.ownerId === state.me)),
    [isMe, user, logs, state.me],
  );
  const shownLogs = isMe ? logs : together.length > 0 ? together : logs;

  if (!user) return <NotFound what="ユーザー" />;

  if (!isMe && user.profilePublic === false) {
    return (
      <div>
        <PageHead lead={<Avatar u={user} size={64} />} title={user.name} />
        <div className="surface">
          <EmptyState kind="permission" title="プロフィールは非公開です" />
        </div>
      </div>
    );
  }

  const shownChars = filteredChars.slice(0, charCount);
  const visibleLogs = shownLogs.slice(0, logCount);

  return (
    <div>
      <PageHead
        lead={<Avatar u={user} size={64} />}
        title={user.name}
        sub={
          <>
            {user.handle && <p className="text-ink2">@{user.handle}</p>}
            {user.bio && (
              <p data-user-content className="text-base-content">
                {user.bio}
              </p>
            )}
            {isMe && user.profilePublic === false && (
              <p className="mt-1 inline-flex items-center gap-1">
                <IconLock width={14} height={14} aria-hidden /> プロフィールは非公開です
              </p>
            )}
          </>
        }
        actions={
          isMe ? (
            <>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setNameDraft(user.name);
                  setBioDraft(user.bio ?? "");
                  setImageDraft(user.image ?? "");
                  setProfileError(null);
                  setEditingProfile(true);
                }}
              >
                <IconPencil width={16} height={16} /> プロフィールを編集
              </button>
              <Link className="btn" to="/settings">
                <IconSettings width={16} height={16} /> 設定
              </Link>
            </>
          ) : undefined
        }
      />

      {isMe && editingProfile && (
        <Modal
          title="プロフィールを編集"
          onClose={() => setEditingProfile(false)}
          foot={
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setEditingProfile(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const trimmedName = nameDraft.trim();
                  if (!trimmedName) {
                    setProfileError("表示名を入力してください");
                    return;
                  }
                  update((s) => {
                    const target = s.users[s.me]!;
                    target.name = trimmedName;
                    target.bio = bioDraft.trim() || undefined;
                    target.image = imageDraft || undefined;
                  });
                  setEditingProfile(false);
                }}
              >
                保存
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <ImageUploadField
              value={imageDraft}
              onChange={setImageDraft}
              label="アイコン"
              render={(src) => <Avatar u={{ ...user, image: src || undefined }} size={56} />}
            />

            <Field label="表示名" noMargin>
              <input
                id="user-name-input"
                className={cx("input w-full", profileError && "input-error")}
                aria-invalid={profileError ? "true" : undefined}
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value);
                  if (profileError) setProfileError(null);
                }}
              />
              <FieldError text={profileError} />
            </Field>

            <Field label="自己紹介" noMargin>
              <textarea
                id="user-bio-input"
                className="textarea w-full text-sm leading-relaxed"
                rows={3}
                placeholder="好きなシステムや遊ぶ時間帯など"
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
      )}

      <SectionTitle
        right={
          chars.length > USER_CHAR_PAGE ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="input input-sm flex w-44 items-center gap-1.5">
                <IconSearch width={14} height={14} className="shrink-0 opacity-50" aria-hidden />
                <input
                  type="search"
                  className="min-w-0 grow"
                  placeholder="キャラを検索"
                  aria-label="キャラクターを検索"
                  value={charQ}
                  onChange={(e) => setCharQ(e.target.value)}
                />
              </label>
              {isMe && (
                <Link className="btn btn-quiet btn-sm" to="/characters">
                  すべて見る
                </Link>
              )}
            </div>
          ) : undefined
        }
      >
        キャラクター
      </SectionTitle>
      {chars.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind="first"
            title={isMe ? "キャラクターはまだいません" : "公開しているキャラクターはいません"}
            action={
              isMe ? (
                <Link className="btn" to="/characters">
                  キャラクターを取り込む
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : filteredChars.length === 0 ? (
        <div className="surface">
          <EmptyState
            kind="filtered"
            action={
              <button type="button" className="btn btn-sm" onClick={() => setCharQ("")}>
                検索を解除
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shownChars.map((c) => (
              <CharacterCard key={c.id} c={c} />
            ))}
          </div>
          <LoadMore
            shown={shownChars.length}
            total={filteredChars.length}
            step={USER_CHAR_STEP}
            onMore={() => setCharCount((n) => n + USER_CHAR_STEP)}
          />
        </>
      )}

      <SectionTitle
        right={
          isMe && shownLogs.length > USER_LOG_PAGE ? (
            <Link className="btn btn-quiet btn-sm" to="/sessions">
              すべて見る
            </Link>
          ) : undefined
        }
      >
        {isMe ? "参加したセッション" : together.length > 0 ? "一緒に遊んだセッション" : "参加したセッション"}
      </SectionTitle>
      {shownLogs.length === 0 ? (
        <div className="surface">
          <EmptyState kind="first" title="セッションはまだありません" />
        </div>
      ) : (
        <>
          <div className="surface list">
            {visibleLogs.map((l) => (
              <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} showKp={false} />
            ))}
          </div>
          <LoadMore
            shown={visibleLogs.length}
            total={shownLogs.length}
            step={USER_LOG_STEP}
            onMore={() => setLogCount((n) => n + USER_LOG_STEP)}
          />
        </>
      )}
    </div>
  );
}
