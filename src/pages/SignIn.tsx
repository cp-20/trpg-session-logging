import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { LogoMark, ProviderIcon } from "../components/ui";
import { signInWithGoogle, authErrorMessage } from "../lib/auth";
import { isFirebaseConfigured } from "../lib/firebase";

export default function SignIn() {
  const { enterDemo } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <main className="min-h-screen flex items-center justify-center p-6">
    <div className="w-full max-w-md">
      <div className="flex items-center gap-3 text-primary"><LogoMark size={36} /><span className="text-2xl font-bold tracking-tight">卓譜</span></div>
      <h1 className="text-3xl sm:text-4xl font-bold leading-snug mt-10">遊んだ時間を、<br />つながる記録に。</h1>
      <p className="text-base-content/70 text-sm leading-7 mt-4">セッションの思い出とログを残し、<br className="hidden sm:block" />仲間やキャラクターとつなげましょう。</p>
      <div className="mt-9 border-t border-base-300 pt-7">
        <button className="btn w-full bg-base-100 border-base-300 font-semibold gap-3" disabled={busy || !isFirebaseConfigured} onClick={async () => {
          setBusy(true); setError(null);
          try { await signInWithGoogle(); } catch (cause) { setError(authErrorMessage(cause)); }
          finally { setBusy(false); }
        }}>
          {busy ? <span className="loading loading-spinner loading-xs" aria-hidden="true" /> : <ProviderIcon provider="google" size={24} />}
          {busy ? "サインイン中…" : "Google でサインイン"}
        </button>
        {error && <p className="text-sm text-error mt-3 leading-6" role="alert">{error}</p>}
        {!isFirebaseConfigured && <p className="text-sm text-base-content/70 mt-3">サインインは準備中です。サンプルで卓譜をお試しください。</p>}
        <button className="btn btn-ghost w-full mt-3 text-base-content/70 text-xs" disabled={busy} onClick={() => { enterDemo(); nav("/sessions"); }}>サンプルデータをそのまま見る（デモ）</button>
      </div>
    </div>
  </main>;
}
