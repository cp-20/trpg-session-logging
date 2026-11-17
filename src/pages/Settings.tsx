import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore, resetData } from "../store";
import { Avatar, Modal, PageHead, ProviderIcon, SectionTitle, Toggle } from "../components/ui";
import { download, todayStr } from "../lib/time";
import { authErrorMessage, linkXAccount, unlinkXAccount, signOutAccount } from "../lib/auth";
import { parseSavedState } from "../lib/state-schema";

type ThemeMode = "dark" | "system" | "light";
export function currentThemeMode(): ThemeMode {
  try { const mode = localStorage.getItem("takufu-theme"); return mode === "dark" || mode === "light" ? mode : "system"; } catch { return "system"; }
}
export function resolveTheme(mode: ThemeMode): string {
  return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "takufuDark" : "takufu";
}
export function applyTheme(mode: ThemeMode): void {
  try { localStorage.setItem("takufu-theme", mode); } catch { /* Appearance still works without browser storage. */ }
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
  window.dispatchEvent(new Event("takufu-theme-change"));
}
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => document.documentElement.setAttribute("data-theme", resolveTheme(currentThemeMode()));
    update(); media.addEventListener("change", update); window.addEventListener("storage", update); window.addEventListener("takufu-theme-change", update);
    return () => { media.removeEventListener("change", update); window.removeEventListener("storage", update); window.removeEventListener("takufu-theme-change", update); };
  }, []);
  return null;
}

export default function Settings() {
  const { state, update, toast, authUser, cloudStatus, enterDemo, exportData, refreshProfile, retrySave, saveError } = useStore();
  const nav = useNavigate();
  const me = state.users[state.me];
  const [mode, setMode] = useState<ThemeMode>(currentThemeMode);
  const [demoPicker, setDemoPicker] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const x = me.accounts.find((account) => account.provider === "x" && account.status === "linked");
  const google = me.accounts.find((account) => account.provider === "google");

  async function connectX(remove = false) {
    setBusy(true); setError(null);
    try { await (remove ? unlinkXAccount() : linkXAccount()); refreshProfile(); toast(remove ? "Xの連携を解除しました" : "Xを連携しました"); }
    catch (cause) { setError(authErrorMessage(cause)); }
    finally { setBusy(false); }
  }
  return <>
    <PageHead title="設定・連携" actions={<button className="btn btn-ghost btn-sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { if (authUser) await signOutAccount(); else update((s) => { s.entered = false; }); nav("/"); }
      catch (cause) { setError(authErrorMessage(cause)); }
      finally { setBusy(false); }
    }}>サインアウト</button>} />
    <div className="flex items-center gap-3 py-2">
      <Avatar u={me} size={48} /><div className="grow min-w-0"><b className="block text-base">{me.name}</b><p className="text-sm text-base-content/70 truncate">{me.bio}</p></div>
      <Link className="btn btn-ghost btn-sm" to={`/users/${state.me}`}>マイページ</Link>
    </div>
    {!authUser && <div className="flex flex-wrap items-center gap-3 py-4 border-b border-base-300"><p className="text-sm text-base-content/70 grow">サンプルデータでお試し中です。</p><button className="btn btn-sm" onClick={() => setDemoPicker(true)}>デモ利用者を切替</button></div>}

    <SectionTitle>サインイン</SectionTitle>
    <div className="flex items-center gap-3 py-4 border-y border-base-300">
      <ProviderIcon provider="google" size={28} /><span className="font-semibold text-sm">Google</span>
      <span className="ml-auto min-w-0 text-sm break-all text-right">{authUser ? me.email || google?.displayName : "サンプルアカウント"}</span>
    </div>

    <SectionTitle>ソーシャル連携</SectionTitle>
    <div className="divide-y divide-base-300 border-y border-base-300">
      <div className="flex items-center gap-3 py-4"><ProviderIcon provider="x" size={28} /><b className="text-sm">X</b>
        <span className="grow text-sm text-base-content/70">{authUser ? x?.displayName || (x ? me.name : "未連携") : "サンプル"}</span>
        {authUser && <button className={`btn btn-sm ${x ? "btn-ghost" : "btn-outline"}`} disabled={busy} onClick={() => connectX(Boolean(x))}>{busy ? "接続中…" : x ? "連携を解除" : "Xを連携"}</button>}
      </div>
      <div className="flex items-center gap-3 py-4"><ProviderIcon provider="discord" size={28} /><b className="text-sm">Discord</b><span className="ml-auto text-sm text-base-content/60">準備中</span></div>
    </div>
    {error && <p className="text-sm text-error mt-3" role="alert">{error}</p>}

    <SectionTitle>作者アカウント</SectionTitle>
    <div className="divide-y divide-base-300 border-y border-base-300">
      {(["booth", "talto"] as const).map((provider) => <div key={provider} className="flex items-center gap-3 py-4"><ProviderIcon provider={provider} size={28} /><b className="text-sm">{provider === "booth" ? "BOOTH" : "TALTO"}</b><span className="ml-auto text-sm text-base-content/60">準備中</span></div>)}
    </div>

    <SectionTitle>表示</SectionTitle>
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-y border-base-300">
      <span className="text-sm font-semibold">外観</span>
      <div className="join" role="radiogroup" aria-label="外観">
        {([["light", "ライト"], ["system", "システムに従う"], ["dark", "ダーク"]] as [ThemeMode, string][]).map(([value, label]) => <input key={value} type="radio" name="theme-mode" aria-label={label} value={value} className="join-item btn btn-sm px-3" checked={mode === value} onChange={() => { setMode(value); applyTheme(value); }} />)}
      </div>
    </div>

    <SectionTitle>プライバシー</SectionTitle>
    <div className="flex items-center gap-4 py-4 border-y border-base-300">
      <div className="grow"><b className="text-sm block">共有ページに名前を表示しない</b><p className="text-xs text-base-content/70 leading-6 mt-1">参加したセッションの共有ページから、あなたの名前を隠します。</p></div>
      <Toggle label="名前を非表示" on={state.prefs.hideSelfOnShare} onChange={(value) => { update((s) => { s.prefs.hideSelfOnShare = value; Object.values(s.logs).forEach((log) => { if (log.players[s.me]) log.players[s.me].hidden = value; }); }); toast(value ? "共有ページで名前を非表示にしました" : "共有ページに名前を表示します"); }} />
    </div>

    <SectionTitle>記録の保存</SectionTitle>
    <div className="py-4 border-y border-base-300">
      <p className="text-sm text-base-content/70 mb-4">{authUser ? cloudStatus === "saved" ? "記録は保存されています。" : cloudStatus === "saving" ? "記録を保存しています…" : "記録を同期できていません。" : "お試し中の記録は、このブラウザに保存されます。"}</p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => { download(`takufu-data-${todayStr()}.json`, exportData()); toast("記録をダウンロードしました"); }}>記録をダウンロード</button>
        <label className="btn btn-sm">記録を読み込む<input type="file" accept=".json,application/json" className="sr-only" onChange={async (event) => {
          const file = event.currentTarget.files?.[0]; if (!file) return;
          try {
            const imported = parseSavedState(await file.text());
            if (!imported) { toast("卓譜の記録として読み込めませんでした。ファイルを確認してください。"); return; }
            if (authUser && imported.me !== authUser.uid) { toast("このアカウントの記録を選んでください。"); return; }
            update((s) => { Object.assign(s, imported); s.entered = true; }); toast("記録を読み込みました");
          } catch { toast("ファイルを読み込めませんでした。もう一度お試しください。"); }
          event.target.value = "";
        }} /></label>
        {authUser && saveError && <button className="btn btn-sm btn-primary" onClick={retrySave}>もう一度保存</button>}
        {!authUser && <button className="btn btn-ghost btn-sm text-error" onClick={() => setConfirmReset(true)}>サンプルを初期状態に戻す</button>}
      </div>
    </div>
    {demoPicker && <Modal title="デモ利用者を切替" onClose={() => setDemoPicker(false)}>{["u_mikan", "u_sora", "u_kai", "u_hina", "u_rin"].filter((id) => state.users[id]).map((id) => <button key={id} className="w-full flex items-center gap-3 p-3 hover:bg-base-200 text-left rounded-lg" onClick={() => { enterDemo(id); setDemoPicker(false); }}><Avatar u={state.users[id]} size={32} /><span>{state.users[id].name}</span></button>)}</Modal>}
    {confirmReset && <Modal title="サンプルを初期状態に戻しますか？" onClose={() => setConfirmReset(false)} foot={<><button className="btn" onClick={() => setConfirmReset(false)}>キャンセル</button><button className="btn btn-error" onClick={() => { resetData(); location.reload(); }}>初期状態に戻す</button></>}><p className="text-sm leading-7">このブラウザで加えた変更が消えます。必要な記録は、先にダウンロードしてください。</p></Modal>}
  </>;
}
