import { useEffect, useState, type ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import type { State } from "./types";
import { StoreProvider, emptyState } from "./store";
import { observeAuth, firebaseUserProfile, signOutAccount } from "./lib/auth";
import { loadCloudState } from "./lib/cloud-state";
import { parseSavedState } from "./lib/state-schema";
import { download, todayStr } from "./lib/time";

/** Real accounts and the local demonstration never share a storage key or seed data. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ user: FirebaseUser | null; state?: State; revision?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    let previouslySignedIn = false;
    const unsubscribe = observeAuth(async (user) => {
      const run = ++generation;
      setError(null);
      if (!user) {
        if (previouslySignedIn) {
          try {
            const raw = localStorage.getItem("takufu-state-v4");
            const demo = raw ? parseSavedState(raw) : null;
            if (demo) { demo.entered = false; localStorage.setItem("takufu-state-v4", JSON.stringify(demo)); }
          } catch { /* Keep existing records intact when browser storage is unavailable. */ }
        }
        previouslySignedIn = false;
        setRecovery(null);
        if (alive) setSession({ user: null });
        return;
      }
      previouslySignedIn = true;
      setSession(null);
      try {
        const cloud = await loadCloudState(user.uid);
        if (!alive || run !== generation) return;
        const restored = cloud ? parseSavedState(JSON.stringify(cloud.state)) : null;
        if (cloud && !restored) throw new Error("保存した記録を読み込めませんでした。元の記録は変更されていません。");
        const profile = firebaseUserProfile(user);
        let state = restored ?? emptyState(profile);
        const key = `takufu-cloud-${user.uid}`;
        try {
          const localRaw = localStorage.getItem(key);
          const cached = localRaw ? parseSavedState(localRaw) : null;
          const knownRevision = localStorage.getItem(`${key}-cloud-revision`);
          if (cached?.me === user.uid) {
            if ((knownRevision ?? null) === (cloud?.revision ?? null)) state = cached;
            else if (localStorage.getItem(`${key}-pending`) === "true" && localRaw) {
              localStorage.setItem(`${key}-backup-${Date.now()}`, localRaw);
              setRecovery(localRaw);
            }
          }
        } catch { /* Never let a browser cache failure prevent access to cloud records. */ }
        state.entered = true;
        state.users[user.uid] = { ...state.users[user.uid], ...profile };
        setSession({ user, state, revision: cloud?.revision });
      } catch (cause) {
        if (alive && run === generation) setError(cause instanceof Error ? cause.message : "記録を読み込めませんでした。");
      }
    }, () => { if (alive) setError("サインイン情報を確認できませんでした。"); });
    return () => { alive = false; ++generation; unsubscribe(); };
  }, []);
  if (error) return <main className="min-h-screen grid place-items-center p-6"><div className="max-w-md space-y-4" role="alert">
    <h1 className="text-xl font-bold">記録を開けませんでした</h1><p>{error}</p>
    <p className="text-sm text-base-content/70">通信状態を確認して、もう一度お試しください。</p>
    <div className="flex gap-2"><button className="btn btn-primary" onClick={() => location.reload()}>再読み込み</button><button className="btn btn-ghost" onClick={() => signOutAccount()}>サインアウト</button></div>
  </div></main>;
  if (!session) return <main className="min-h-screen grid place-items-center" role="status"><span className="loading loading-spinner loading-sm text-primary" aria-hidden="true" /><span className="sr-only">記録を読み込んでいます</span></main>;
  return <StoreProvider key={session.user?.uid ?? "demo"} initialState={session.state} authUser={session.user} cloudRevision={session.revision} storageKey={session.user ? `takufu-cloud-${session.user.uid}` : undefined}>
    {recovery && <div role="alert" className="flex flex-wrap items-center gap-3 p-4 bg-warning text-warning-content text-sm"><span className="grow">別の端末の更新を読み込みました。この端末の未同期の記録も残してあります。</span><button className="btn btn-sm" onClick={() => download(`takufu-recovery-${todayStr()}.json`, recovery)}>未同期の記録をダウンロード</button></div>}
    {children}
  </StoreProvider>;
}
