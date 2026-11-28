import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import type { State } from "./types";
import { StoreProvider, emptyState, guestState, type RestoreIssue } from "./store";
import { observeAuth, firebaseUserProfile, signOutAccount } from "./lib/auth";
import { idbGet, idbSet, LOCAL_STORAGE_MAX_CHARS } from "./lib/local-db";
import { forgetLocalCopy } from "./lib/local-copy";
import { parseSavedState, validateSavedState } from "./lib/state-schema";
import { download, todayStr } from "./lib/time";
import { userFacingError } from "./lib/user-error";
import { hasDemoData, stripDemoData } from "./lib/demo-cleanup";
import { PageLoading } from "./components/ui";

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

/**
 * 読み込んだ記録を、ログインした人の画面に出せる形にする: 前の版で紛れ込んだ体験版の見本を除き（src/lib/demo-cleanup.ts）、
 * プロフィールをログインの情報と合わせる
 */
async function prepareSignedInState(loaded: State, user: FirebaseUser, pendingKey?: string): Promise<State> {
  let state = loaded;
  if (hasDemoData(state, user.uid)) {
    const { seedState } = await import("./data/seed");
    const cleaned = stripDemoData(state, seedState(), user.uid);
    if (cleaned.removed > 0) {
      state = cleaned.state;
      if (pendingKey)
        try {
          localStorage.setItem(`${pendingKey}-pending`, "true");
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
  return state;
}

/** Real accounts and the local demonstration never share a storage key or seed data. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{
    user: FirebaseUser | null;
    state?: State;
    revision?: string;
    issue?: RestoreIssue;
    /** 端末の控えを出したまま、クラウドの見出しと照合している（その間はクラウドへ書かない） */
    verifying?: boolean;
  } | null>(null);
  /** 控えの画面を外し終えるのを待っている読み込み（外れたときに保存待ちの変更が端末へ書き出される） */
  const unmountWaiters = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (session) return;
    const waiters = unmountWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve());
  }, [session]);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let generation = 0;
    let previouslySignedIn = false;
    let lastUid: string | null = null;
    const unsubscribe = observeAuth(
      async (user) => {
        const run = ++generation;
        setError(null);
        if (!user) {
          // ログアウトした人の控えは、記録の画面が外れて最後の書き出しを終えたあとに消す（送り終えた分だけ。src/lib/local-copy.ts）
          const signedOutUid = previouslySignedIn ? lastUid : null;
          lastUid = null;
          const forgetAfterUnmount = () => {
            if (signedOutUid)
              window.setTimeout(() => void forgetLocalCopy(localStorage, signedOutUid).catch(() => {}), 0);
          };
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
            forgetAfterUnmount();
            return;
          }
          setSession({
            user: null,
            state: guestState(),
            issue: demoSnap.corrupt ? "corrupt" : "missing",
          });
          forgetAfterUnmount();
          return;
        }

        previouslySignedIn = true;
        lastUid = user.uid;
        setSession(null);
        const key = `takufu-cloud-${user.uid}`;
        // 見出しと照合する前に控えを出していたか（照合が済むまでクラウドへは書かない）
        let shownFromCache = false;
        try {
          // Firestore の SDK（cloud-state）は読み始めておき、控えを出すのはそれを待たない
          const cloudModLoading = import("./lib/cloud-state");
          cloudModLoading.catch(() => {});
          let localSnap = await readLocalSnapshot(key);
          if (!alive || run !== generation) return;

          let knownRevision: string | null = null;
          let hasPendingLocal = false;
          const readMarkers = () => {
            try {
              knownRevision = localStorage.getItem(`${key}-cloud-revision`);
              hasPendingLocal = localStorage.getItem(`${key}-pending`) === "true";
            } catch {
              /* ignore storage read errors */
            }
          };
          readMarkers();

          // 体感の速さ: この端末に前回の控えがあれば、見出しの往復（数百 ms〜）を待たずにすぐ出す。
          // 見出しと版が同じなら、そのまま使い続ける（いちばん多い場合）。違えば外して、下の読み込みをやり直す
          if (localSnap.state?.me === user.uid && knownRevision) {
            const cachedState = await prepareSignedInState(localSnap.state, user);
            if (!alive || run !== generation) return;
            shownFromCache = true;
            setSession({ user, state: cachedState, revision: knownRevision, issue: "none", verifying: true });
          }

          let cloudMod: Awaited<typeof cloudModLoading>;
          let manifest: Awaited<ReturnType<typeof cloudMod.fetchCloudWorkspaceManifest>>;
          try {
            cloudMod = await cloudModLoading;
            manifest = await cloudMod.fetchCloudWorkspaceManifest(user.uid);
          } catch (cause) {
            if (!shownFromCache) throw cause;
            // 見出しを読めない（圏外など）: 控えのまま使えるようにする。保存は版を照合するので、食い違えばそこで断られる
            if (alive && run === generation) {
              console.warn("[workspace] manifest check failed; keep the local copy", cause);
              setSession((s) => (s && s.user === user ? { ...s, verifying: false } : s));
            }
            return;
          }
          if (!alive || run !== generation) return;

          if (shownFromCache && knownRevision === (manifest?.revision ?? null)) {
            setSession((s) => (s && s.user === user ? { ...s, verifying: false } : s));
            return;
          }
          if (shownFromCache) {
            // 別の端末で更新されていた: 控えの画面を外し（保存待ちの変更は外れるときに端末へ書き出される）、
            // 書き出した控えを読み直してから、未同期の変更の退避も含めて、いつもの読み込みをする
            setSession(null);
            await new Promise<void>((resolve) => unmountWaiters.current.push(resolve));
            if (!alive || run !== generation) return;
            localSnap = await readLocalSnapshot(key);
            if (!alive || run !== generation) return;
            readMarkers();
          }

          const cacheMatchesCloud =
            localSnap.state?.me === user.uid && (knownRevision ?? null) === (manifest?.revision ?? null);

          let state: State | null = null;
          let effectiveRevision: string | undefined = manifest?.revision;

          if (cacheMatchesCloud && localSnap.state) {
            state = localSnap.state;
          } else {
            const cloud = manifest
              ? await cloudMod.loadCloudState(user.uid, localSnap.state, manifest)
              : null;
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

          state = await prepareSignedInState(state, user, key);
          if (!alive || run !== generation) return;
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
      <main>
        <PageLoading full label="記録を読み込んでいます" />
      </main>
    );
  return (
    <StoreProvider
      key={session.user?.uid ?? "demo"}
      initialState={session.state}
      initialIssue={session.issue}
      authUser={session.user}
      cloudRevision={session.revision}
      cloudHold={session.verifying}
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
