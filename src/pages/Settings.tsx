import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { IconDownload, IconLock, IconSettings, IconUpload } from "../components/icons";
import {
  EmptyState,
  Modal,
  NotFound,
  PageHead,
  SectionTitle,
  Seg,
  SettingRow,
  Toggle,
  cx,
} from "../components/ui";
import { Avatar, ProviderIcon } from "../components/identity";
import { authErrorMessage, linkXAccount, signOutAccount, unlinkXAccount } from "../lib/auth";
import { parseSavedState } from "../lib/state-schema";
import { download, todayStr } from "../lib/time";
import { resetData, useStore } from "../store";
import { CharacterCard } from "./Characters";
import { SessionRow } from "./Sessions";

type ThemeMode = "dark" | "system" | "light";
export function currentThemeMode(): ThemeMode {
  try {
    const mode = localStorage.getItem("takufu-theme");
    return mode === "dark" || mode === "light" ? mode : "system";
  } catch {
    return "system";
  }
}
export function resolveTheme(mode: ThemeMode): string {
  return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
    ? "takufuDark"
    : "takufu";
}
export function applyTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem("takufu-theme", mode);
  } catch {
    /* Appearance still works without browser storage. */
  }
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
  window.dispatchEvent(new Event("takufu-theme-change"));
}
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.setAttribute("data-theme", resolveTheme(currentThemeMode()));
    update();
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    window.addEventListener("takufu-theme-change", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
      window.removeEventListener("takufu-theme-change", update);
    };
  }, []);
  return null;
}

export default function Settings() {
  const {
    state,
    update,
    authUser,
    cloudStatus,
    enterDemo,
    exportData,
    importData,
    refreshProfile,
    retrySave,
    saveError,
  } = useStore();
  const nav = useNavigate();
  const me = state.users[state.me]!;
  const [mode, setMode] = useState<ThemeMode>(currentThemeMode);
  const [demoPicker, setDemoPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 成功は画面の変化（連携状態・読み込んだ記録）で伝わるので、エラーだけを出す
  const [backupError, setBackupError] = useState<string | null>(null);

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
      nav({ to: "/" as never });
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
    <div className="max-w-3xl">
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
          <Link className="btn btn-sm" to={`/users/${state.me}` as never}>
            マイページ
          </Link>
        </div>
        {!authUser && (
          <SettingRow title="表示する利用者" desc="サンプルの別の利用者になって、見え方を確かめられます。">
            <button className="btn btn-sm" onClick={() => setDemoPicker(true)}>
              デモ利用者を切替
            </button>
          </SettingRow>
        )}
        <SettingRow
          icon={<ProviderIcon provider="x" size={28} />}
          title="X"
          desc={
            authUser ? x?.displayName || (x ? me.name : "連携していません") : "サンプルでは連携できません"
          }
        >
          {authUser && (
            <button className="btn btn-sm" disabled={busy} onClick={() => connectX(Boolean(x))}>
              {busy ? "接続中…" : x ? "連携を解除" : "連携する"}
            </button>
          )}
        </SettingRow>
        <SettingRow title={authUser ? "サインアウト" : "お試しを終える"}>
          <button className="btn btn-sm" disabled={busy} onClick={signOut}>
            {authUser ? "サインアウト" : "最初の画面へ"}
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
        <SettingRow title="外観" desc="「端末に合わせる」は OS のライト・ダーク設定に従います。">
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
        <SettingRow
          title="共有ページで名前を隠す"
          desc="参加したセッションの共有ページに、あなたの名前を出しません。"
        >
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

      <SectionTitle sub={syncText}>データ</SectionTitle>
      <div className="surface list">
        <SettingRow
          title="バックアップ"
          desc="すべての記録を1つのファイルに保存したり、保存したファイルから戻したりします。"
        >
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-sm"
              onClick={() => {
                download(`takufu-data-${todayStr()}.json`, exportData());
              }}
            >
              <IconDownload width={16} height={16} /> 書き出す
            </button>
            <label className="btn btn-sm">
              <IconUpload width={16} height={16} /> 読み込む
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label="記録を読み込む"
                onChange={async (event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  if (!file) return;
                  setBackupError(null);
                  try {
                    const imported = parseSavedState(await file.text());
                    if (!imported) {
                      setBackupError("卓譜の記録として読み込めませんでした。ファイルを確認してください。");
                      return;
                    }
                    if (authUser && imported.me !== authUser.uid) {
                      setBackupError("このアカウントの記録を選んでください。");
                      return;
                    }
                    importData(imported);
                  } catch {
                    setBackupError("ファイルを読み込めませんでした。もう一度お試しください。");
                  } finally {
                    input.value = "";
                  }
                }}
              />
            </label>
          </div>
        </SettingRow>
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
      {backupError && (
        <p role="alert" className="mt-2 text-sm text-error">
          {backupError}
        </p>
      )}

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

/* ================= ユーザー詳細ページ ================= */
export function UserDetail() {
  const { id } = useParams({ strict: false }) as { id?: string };
  const { state } = useStore();
  const user = state.users[id ?? ""];
  if (!user) return <NotFound what="ユーザー" />;
  const isMe = user.id === state.me;

  if (!isMe && user.profilePublic === false) {
    return (
      <>
        <PageHead lead={<Avatar u={user} size={64} />} title={user.name} />
        <div className="surface">
          <EmptyState kind="permission" title="プロフィールは非公開です" />
        </div>
      </>
    );
  }

  const chars = Object.values(state.characters).filter((c) => c.ownerId === user.id);
  const logs = Object.values(state.logs)
    .filter((l) => l.ownerId === user.id || l.players[user.id])
    .sort((a, b) => b.t0 - a.t0);
  const together = isMe ? [] : logs.filter((l) => l.players[state.me] || l.ownerId === state.me);
  const shownLogs = isMe ? logs : together.length > 0 ? together : logs;

  return (
    <>
      <PageHead
        lead={<Avatar u={user} size={64} />}
        title={user.name}
        sub={
          <>
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
            <Link className="btn" to="/settings">
              <IconSettings width={16} height={16} /> 設定
            </Link>
          ) : undefined
        }
      />

      <SectionTitle>キャラクター</SectionTitle>
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
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chars.map((c) => (
            <CharacterCard key={c.id} c={c} />
          ))}
        </div>
      )}

      <SectionTitle>
        {isMe ? "参加したセッション" : together.length > 0 ? "一緒に遊んだセッション" : "参加したセッション"}
      </SectionTitle>
      {shownLogs.length === 0 ? (
        <div className="surface">
          <EmptyState kind="first" title="セッションはまだありません" />
        </div>
      ) : (
        <div className="surface list">
          {shownLogs.map((l) => (
            <SessionRow key={l.id} log={l} href={`/sessions/${l.id}`} showKp={false} />
          ))}
        </div>
      )}
    </>
  );
}
