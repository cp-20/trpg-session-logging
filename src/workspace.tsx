import { useEffect, useState, type ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import type { State } from "./types";
import { StoreProvider, emptyState, type RestoreIssue } from "./store";
import { observeAuth, firebaseUserProfile, signOutAccount } from "./lib/auth";
import { idbGet, idbSet, LOCAL_STORAGE_MAX_CHARS } from "./lib/local-db";
import { parseSavedState, validateSavedState } from "./lib/state-schema";
import { download, todayStr } from "./lib/time";
import { userFacingError } from "./lib/user-error";
import { hasDemoData, stripDemoData } from "./lib/demo-cleanup";

async function readLocalSnapshot(storageKey: string): Promise<{
  state: State | null;
  raw: string | null;
  corrupt: boolean;
}> {
  try {
    const useIdb = localStorage.getItem(`${storageKey}-idb`) === "1";
    const localRaw = localStorage.getItem(storageKey);
    if (useIdb) {
      const idbVal = await idbGet<unknown>(storageKey);
      const parsed = idbVal ? validateSavedState(idbVal) : null;
      if (parsed) {
        parsed.events ??= {};
        return { state: parsed, raw: null, corrupt: false };
      }
    }
    if (localRaw) {
      const parsed = parseSavedState(localRaw);
      if (parsed) {
        parsed.events ??= {};
        return { state: parsed, raw: localRaw, corrupt: false };
      }
      return { state: null, raw: localRaw, corrupt: true };
    }
    const idbFallback = await idbGet<unknown>(storageKey);
    if (idbFallback) {
      const parsed = validateSavedState(idbFallback);
      if (parsed) {
        parsed.events ??= {};
        return { state: parsed, raw: null, corrupt: false };
      }
      return { state: null, raw: JSON.stringify(idbFallback), corrupt: true };
    }
  } catch {
    /* Storage unavailable */
  }
  return { state: null, raw: null, corrupt: false };
}

/** Real accounts and the local demonstration never share a storage key or seed data. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{
    user: FirebaseUser | null;
    state?: State;
    revision?: string;
    issue?: RestoreIssue;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let generation = 0;
    let previouslySignedIn = false;
    const unsubscribe = observeAuth(
      async (user) => {
        const run = ++generation;
        setError(null);
        if (!user) {
          if (previouslySignedIn) {
            try {
              const snap = await readLocalSnapshot("takufu-state-v4");
              if (snap.state) {
                snap.state.entered = false;
                const json = JSON.stringify(snap.state);
                if (json.length <= LOCAL_STORAGE_MAX_CHARS) {
                  localStorage.setItem("takufu-state-v4", json);
                  localStorage.removeItem("takufu-state-v4-idb");
                } else {
                  await idbSet("takufu-state-v4", snap.state);
                  localStorage.setItem("takufu-state-v4-idb", "1");
                }
              }
            } catch {
              /* Keep existing records intact when browser storage is unavailable. */
            }
          }
          previouslySignedIn = false;
          setRecovery(null);
          const demoSnap = await readLocalSnapshot("takufu-state-v4");
          if (!alive || run !== generation) return;
          if (demoSnap.state) {
            setSession({ user: null, state: demoSnap.state, issue: "none" });
            return;
          }
          const { seedState } = await import("./data/seed");
          if (!alive || run !== generation) return;
          setSession({
            user: null,
            state: seedState(),
            issue: demoSnap.corrupt ? "corrupt" : "missing",
          });
          return;
        }

        previouslySignedIn = true;
        setSession(null);
        try {
          const key = `takufu-cloud-${user.uid}`;
          const [localSnap, cloudMod] = await Promise.all([
            readLocalSnapshot(key),
            import("./lib/cloud-state"),
          ]);
          if (!alive || run !== generation) return;

          let knownRevision: string | null = null;
          let hasPendingLocal = false;
          try {
            knownRevision = localStorage.getItem(`${key}-cloud-revision`);
            hasPendingLocal = localStorage.getItem(`${key}-pending`) === "true";
          } catch {
            /* ignore storage read errors */
          }

          const manifest = await cloudMod.fetchCloudWorkspaceManifest(user.uid);
          if (!alive || run !== generation) return;

          const cacheMatchesCloud =
            localSnap.state?.me === user.uid && (knownRevision ?? null) === (manifest?.revision ?? null);

          let state: State | null = null;
          let effectiveRevision: string | undefined = manifest?.revision;

          if (cacheMatchesCloud && localSnap.state) {
            state = localSnap.state;
          } else {
            const cloud = manifest ? await cloudMod.loadCloudState(user.uid, localSnap.state) : null;
            if (!alive || run !== generation) return;
            effectiveRevision = cloud?.revision;
            const restored = cloud ? validateSavedState(cloud.state) : null;
            if (cloud && !restored)
              throw new Error("保存した記録を読み込めませんでした。元の記録は変更されていません。");
            const profile = firebaseUserProfile(user);
            state = restored ?? emptyState(profile);
            if (localSnap.state?.me === user.uid && hasPendingLocal) {
              const rawBackup = localSnap.raw ?? JSON.stringify(localSnap.state);
              try {
                localStorage.setItem(`${key}-backup-${Date.now()}`, rawBackup);
              } catch {
                /* best effort */
              }
              setRecovery(rawBackup);
            }
          }

          // 前の版で体験版の見本が記録に紛れ込んでいたら除き、クラウドへ書き戻す（src/lib/demo-cleanup.ts）
          if (hasDemoData(state, user.uid)) {
            const { seedState } = await import("./data/seed");
            if (!alive || run !== generation) return;
            const cleaned = stripDemoData(state, seedState(), user.uid);
            if (cleaned.removed > 0) {
              state = cleaned.state;
              try {
                localStorage.setItem(`${key}-pending`, "true");
              } catch {
                /* 書き戻しは次の変更のときにも行われる */
              }
            }
          }

          const profile = firebaseUserProfile(user);
          const existing = state.users[user.uid];
          state.entered = true;
          state.users[user.uid] = {
            ...profile,
            ...existing,
            id: user.uid,
            accounts: profile.accounts,
            email: profile.email ?? existing?.email,
            name: existing?.name || profile.name,
            image: existing?.image !== undefined ? existing.image : profile.image,
            profilePublic: existing?.profilePublic ?? true,
          };
          setSession({ user, state, revision: effectiveRevision, issue: "none" });
        } catch (cause) {
          if (alive && run === generation) console.error("[workspace] load failed", cause);
          setError(userFacingError(cause, "記録を読み込めませんでした。"));
        }
      },
      () => {
        if (alive) setError("ログイン情報を確認できませんでした。");
      },
    );
    return () => {
      alive = false;
      ++generation;
      unsubscribe();
    };
  }, []);

  if (error)
    return (
      <main className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md space-y-4" role="alert">
          <h1 className="text-xl font-bold">記録を開けませんでした</h1>
          <p>{error}</p>
          <p className="text-sm text-base-content/70">通信状態を確認して、もう一度お試しください。</p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => location.reload()}>
              再読み込み
            </button>
            <button className="btn btn-quiet" onClick={() => signOutAccount()}>
              ログアウト
            </button>
          </div>
        </div>
      </main>
    );
  if (!session)
    return (
      <main className="min-h-screen grid place-items-center" role="status">
        <span className="loading loading-spinner loading-sm text-primary" aria-hidden="true" />
        <span className="sr-only">記録を読み込んでいます</span>
      </main>
    );
  return (
    <StoreProvider
      key={session.user?.uid ?? "demo"}
      initialState={session.state}
      initialIssue={session.issue}
      authUser={session.user}
      cloudRevision={session.revision}
      storageKey={session.user ? `takufu-cloud-${session.user.uid}` : undefined}
    >
      {recovery && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 p-4 bg-warning text-warning-content text-sm"
        >
          <span className="grow">
            別の端末の更新を読み込みました。この端末の未同期の記録も残してあります。
          </span>
          <button
            className="btn btn-sm"
            onClick={() => download(`takufu-recovery-${todayStr()}.json`, recovery)}
          >
            未同期の記録をダウンロード
          </button>
        </div>
      )}
      {children}
    </StoreProvider>
  );
}
