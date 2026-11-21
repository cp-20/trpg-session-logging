import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";
import Storage from "expo-sqlite/kv-store";
import * as Network from "expo-network";
import type { User as FirebaseUser } from "firebase/auth";
import { seedState } from "@shared/data/seed";
import { buildFeedIcs, publishFeed } from "@shared/lib/calendar-feed";
import {
  deleteSharedCharacter,
  deleteSharedLog,
  fetchCloudWorkspaceManifest,
  loadCloudState,
  publishSharedCharacter,
  publishSharedLog,
  saveCloudState,
  updateSharedMembership,
} from "@shared/lib/cloud-state";
import { parseSavedState } from "@shared/lib/state-schema";
import { todayStr } from "@shared/lib/time";
import type { State, User } from "@shared/types";
import { ensureMobileCloudRuntime, firebaseUserProfile, observeAuth } from "../lib/firebase-mobile";
import { reconcileWorkspaceStates } from "./reconcile";
import { nextRetryDelayMs, useDelayedSyncIndicator } from "./sync-controller";

const DEMO_KEY = "takufu-mobile-demo-v4";
const LAST_UID_KEY = "takufu-mobile-last-uid";
const cloudKey = (uid: string) => `takufu-mobile-cloud-${uid}`;
const cloudBaseKey = (uid: string) => `takufu-mobile-base-${uid}`;
const cloudRevKey = (uid: string) => `takufu-mobile-rev-${uid}`;
const cloudPendingKey = (uid: string) => `takufu-mobile-pending-${uid}`;
const cloudRecoveryKey = (uid: string) => `takufu-mobile-recovery-${uid}`;

export type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";

export interface MobileStoreApi {
  state: State;
  update: (fn: (s: State) => void) => void;
  authUser: FirebaseUser | null;
  authReady: boolean;
  syncStatus: SyncStatus;
  /** 250ms 閾値・500ms 最小保持の控えめ表示フラグ */
  showSyncIndicator: boolean;
  isOffline: boolean;
  hasPendingOutbox: boolean;
  syncError: string | null;
  recoveryJson: string | null;
  dismissRecovery: () => void;
  refreshNow: () => Promise<void>;
  retrySync: () => void;
  enterDemo: (userId?: string) => void;
  exitDemo: () => void;
  resetDemo: () => void;
  refreshProfile: () => void;
  exportData: () => string;
  importData: (next: State) => void;
}

const MobileStoreContext = createContext<MobileStoreApi>(null!);

export function emptyWorkspaceState(user: User): State {
  const normalizedUser: User = {
    ...user,
    profilePublic: user.profilePublic ?? true,
  };
  return {
    me: normalizedUser.id,
    entered: true,
    users: { [normalizedUser.id]: normalizedUser },
    prefs: { hideSelfOnShare: false, onboardingDone: false },
    tables: {},
    characters: {},
    scenarios: {},
    logs: {},
    events: {},
    editRequests: [],
  };
}

function readSyncState(key: string): State | null {
  try {
    const raw = Storage.getItemSync(key);
    if (!raw) return null;
    const parsed = parseSavedState(raw);
    if (parsed) parsed.events ??= {};
    return parsed;
  } catch {
    return null;
  }
}

function writeSyncJson(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    /* ベストエフォートのローカルキャッシュ */
  }
}

function getInitialWorkspace(): {
  state: State;
  uid: string | null;
  revision: string | null;
  pending: boolean;
} {
  try {
    const lastUid = Storage.getItemSync(LAST_UID_KEY);
    if (lastUid) {
      const cached = readSyncState(cloudKey(lastUid));
      if (cached && cached.me === lastUid) {
        return {
          state: cached,
          uid: lastUid,
          revision: Storage.getItemSync(cloudRevKey(lastUid)),
          pending: Storage.getItemSync(cloudPendingKey(lastUid)) === "true",
        };
      }
    }
  } catch {
    /* noop */
  }
  const demo = readSyncState(DEMO_KEY) ?? seedState();
  return { state: demo, uid: null, revision: null, pending: false };
}

export function MobileStoreProvider({ children }: { children: ReactNode }) {
  ensureMobileCloudRuntime();

  const boot = useMemo(() => getInitialWorkspace(), []);
  const [state, setState] = useState<State>(boot.state);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [hasPendingOutbox, setHasPendingOutbox] = useState(boot.pending);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(boot.uid ? "idle" : "idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [recoveryJson, setRecoveryJson] = useState<string | null>(() => {
    if (!boot.uid) return null;
    try {
      return Storage.getItemSync(cloudRecoveryKey(boot.uid));
    } catch {
      return null;
    }
  });

  const stateRef = useRef(state);
  const authUserRef = useRef(authUser);
  const revisionRef = useRef<string | null>(boot.revision);
  const baseStateRef = useRef<State | null>(boot.uid ? readSyncState(cloudBaseKey(boot.uid)) : null);
  const pendingRef = useRef(boot.pending);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncQueueRef = useRef(Promise.resolve());
  const aliveRef = useRef(true);
  const publishedLogsRef = useRef(new Map<string, string>());
  const publishedCharsRef = useRef(new Map<string, string>());
  const lastCalendarFeedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  const showSyncIndicator = useDelayedSyncIndicator(syncStatus === "syncing", {
    delayMs: 250,
    minVisibleMs: 500,
  });

  /* ---------- 共有ログ・共有キャラ・カレンダー配信をバックグラウンド反映 ---------- */
  const syncPublicArtifacts = useCallback(async (uid: string, snapshot: State) => {
    const owned = Object.values(snapshot.logs).filter((l) => l.ownerId === uid);
    const slugs = new Set(owned.map((l) => l.slug));
    for (const slug of publishedLogsRef.current.keys()) {
      if (!slugs.has(slug)) {
        await deleteSharedLog(slug);
        publishedLogsRef.current.delete(slug);
      }
    }
    for (const log of owned) {
      const sig = JSON.stringify([
        log,
        snapshot.users,
        snapshot.prefs,
        log.scenarioId ? snapshot.scenarios[log.scenarioId] : null,
      ]);
      if (publishedLogsRef.current.get(log.slug) === sig) continue;
      await publishSharedLog(log, snapshot);
      publishedLogsRef.current.set(log.slug, sig);
    }
    for (const log of Object.values(snapshot.logs).filter((l) => l.ownerId !== uid)) {
      const membership = log.players[uid];
      if (membership) {
        await updateSharedMembership(log.slug, {
          linked: membership.linked,
          hidden: membership.hidden,
        });
      }
    }
    const chars = Object.values(snapshot.characters).filter((c) => c.ownerId === uid);
    const charIds = new Set(chars.map((c) => c.id));
    for (const cid of publishedCharsRef.current.keys()) {
      if (!charIds.has(cid)) {
        await deleteSharedCharacter(cid);
        publishedCharsRef.current.delete(cid);
      }
    }
    for (const ch of chars) {
      const sig = JSON.stringify([ch, snapshot.logs, snapshot.users[uid]]);
      if (publishedCharsRef.current.get(ch.id) === sig) continue;
      await publishSharedCharacter(ch, snapshot);
      publishedCharsRef.current.set(ch.id, sig);
    }

    const feedToken = snapshot.prefs.calendarFeedToken;
    if (feedToken) {
      const ics = buildFeedIcs(snapshot, todayStr());
      const feedKey = `${feedToken}:${ics.replace(/^DTSTAMP:.*$/gm, "")}`;
      if (lastCalendarFeedKeyRef.current !== feedKey) {
        await publishFeed(feedToken, uid, ics);
        lastCalendarFeedKeyRef.current = feedKey;
      }
    }
  }, []);

  /* ---------- バックグラウンド SWR + 3-Way マージ + Outbox 送信 ---------- */
  const runSyncCycle = useCallback(
    async function syncCycle(reason: "auth" | "mutation" | "foreground" | "reconnect" | "manual") {
      const user = authUserRef.current;
      if (!user) return;
      const uid = user.uid;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      const net = await Network.getNetworkStateAsync().catch(() => ({
        isConnected: true,
        isInternetReachable: true,
      }));
      if (net.isConnected === false || net.isInternetReachable === false) {
        if (aliveRef.current) {
          setIsOffline(true);
          setSyncStatus("offline");
        }
        return;
      }

      syncQueueRef.current = syncQueueRef.current.then(async () => {
        if (!aliveRef.current || authUserRef.current?.uid !== uid) return;
        setSyncStatus("syncing");
        setSyncError(null);
        try {
          const manifest = await fetchCloudWorkspaceManifest(uid);
          const remoteRev = manifest?.revision ?? null;
          let workingState = stateRef.current;

          // マニフェストの revision が異なるときだけ実チャンクを読み込んで 3-Way マージする
          if (remoteRev && remoteRev !== revisionRef.current) {
            const cloud = await loadCloudState(uid);
            if (!aliveRef.current || authUserRef.current?.uid !== uid) return;
            if (cloud) {
              const parsedRemote = parseSavedState(JSON.stringify(cloud.state));
              if (!parsedRemote) {
                throw new Error("保存した記録を読み込めませんでした。元の記録は変更されていません。");
              }
              const profile = firebaseUserProfile(user);
              parsedRemote.users[uid] = { ...parsedRemote.users[uid], ...profile };
              parsedRemote.entered = true;

              if (pendingRef.current && workingState.me === uid) {
                const { merged, hadConflict } = reconcileWorkspaceStates(
                  baseStateRef.current,
                  workingState,
                  parsedRemote,
                );
                if (hadConflict) {
                  const backup = JSON.stringify(workingState, null, 2);
                  writeSyncJson(cloudRecoveryKey(uid), backup);
                  setRecoveryJson(backup);
                }
                workingState = merged;
                stateRef.current = merged;
                setState(merged);
                writeSyncJson(cloudKey(uid), JSON.stringify(merged));
              } else {
                workingState = parsedRemote;
                stateRef.current = parsedRemote;
                setState(parsedRemote);
                writeSyncJson(cloudKey(uid), JSON.stringify(parsedRemote));
              }

              revisionRef.current = cloud.revision;
              baseStateRef.current = structuredClone(parsedRemote);
              writeSyncJson(cloudRevKey(uid), cloud.revision);
              writeSyncJson(cloudBaseKey(uid), JSON.stringify(parsedRemote));
            }
          } else if (!remoteRev && workingState.me !== uid) {
            const profile = firebaseUserProfile(user);
            workingState = emptyWorkspaceState(profile);
            stateRef.current = workingState;
            setState(workingState);
            pendingRef.current = true;
            setHasPendingOutbox(true);
            writeSyncJson(cloudKey(uid), JSON.stringify(workingState));
            writeSyncJson(cloudPendingKey(uid), "true");
          }

          // 未送信の変更があればクラウドへ書き込む
          if (pendingRef.current || reason === "mutation") {
            const snapshotToSave = stateRef.current;
            const newRev = await saveCloudState(uid, snapshotToSave, revisionRef.current);
            revisionRef.current = newRev;
            baseStateRef.current = structuredClone(snapshotToSave);
            writeSyncJson(cloudRevKey(uid), newRev);
            writeSyncJson(cloudBaseKey(uid), JSON.stringify(snapshotToSave));

            await syncPublicArtifacts(uid, snapshotToSave);

            if (stateRef.current === snapshotToSave) {
              pendingRef.current = false;
              setHasPendingOutbox(false);
              writeSyncJson(cloudPendingKey(uid), "false");
            }
          }

          retryAttemptRef.current = 0;
          if (aliveRef.current) {
            setIsOffline(false);
            setSyncError(null);
            setSyncStatus("synced");
          }
        } catch (err) {
          if (!aliveRef.current) return;
          const message =
            err instanceof Error
              ? err.message
              : "記録を同期できませんでした。端末内の記録は保持されています。";
          setSyncError(message);
          setSyncStatus("error");
          const delay = nextRetryDelayMs(retryAttemptRef.current);
          retryAttemptRef.current += 1;
          retryTimerRef.current = setTimeout(() => {
            if (aliveRef.current && authUserRef.current?.uid === uid && pendingRef.current) {
              void syncCycle("reconnect");
            }
          }, delay);
        }
      });
      await syncQueueRef.current;
    },
    [syncPublicArtifacts],
  );

  /* ---------- ネットワーク接続状態の監視 ---------- */
  useEffect(() => {
    let mounted = true;
    Network.getNetworkStateAsync()
      .then((net) => {
        if (mounted) {
          const offline = net.isConnected === false || net.isInternetReachable === false;
          setIsOffline(offline);
          if (offline) setSyncStatus("offline");
        }
      })
      .catch(() => {});

    const sub = Network.addNetworkStateListener((net) => {
      const offline = net.isConnected === false || net.isInternetReachable === false;
      setIsOffline(offline);
      if (offline) {
        setSyncStatus("offline");
      } else if (authUserRef.current && pendingRef.current) {
        void runSyncCycle("reconnect");
      }
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [runSyncCycle]);

  /* ---------- Firebase Auth 状態監視（0ms キャッシュ描画後に裏で同期） ---------- */
  useEffect(() => {
    aliveRef.current = true;
    const unsubscribe = observeAuth(
      (user) => {
        setAuthUser(user);
        authUserRef.current = user;
        setAuthReady(true);

        if (!user) {
          Storage.removeItemSync(LAST_UID_KEY);
          revisionRef.current = null;
          baseStateRef.current = null;
          pendingRef.current = false;
          setHasPendingOutbox(false);
          setRecoveryJson(null);
          const demo = readSyncState(DEMO_KEY) ?? seedState();
          stateRef.current = demo;
          setState(demo);
          setSyncStatus("idle");
          setSyncError(null);
          return;
        }

        const uid = user.uid;
        writeSyncJson(LAST_UID_KEY, uid);
        const cached = readSyncState(cloudKey(uid));
        const profile = firebaseUserProfile(user);

        if (cached && cached.me === uid) {
          cached.users[uid] = { ...cached.users[uid], ...profile };
          cached.entered = true;
          stateRef.current = cached;
          setState(cached);
          revisionRef.current = Storage.getItemSync(cloudRevKey(uid));
          baseStateRef.current = readSyncState(cloudBaseKey(uid));
          const isPending = Storage.getItemSync(cloudPendingKey(uid)) === "true";
          pendingRef.current = isPending;
          setHasPendingOutbox(isPending);
        } else {
          const fresh = emptyWorkspaceState(profile);
          stateRef.current = fresh;
          setState(fresh);
          revisionRef.current = null;
          baseStateRef.current = null;
          pendingRef.current = false;
          setHasPendingOutbox(false);
        }

        try {
          setRecoveryJson(Storage.getItemSync(cloudRecoveryKey(uid)));
        } catch {
          setRecoveryJson(null);
        }

        publishedLogsRef.current = new Map(
          Object.values(stateRef.current.logs)
            .filter((l) => l.ownerId === uid)
            .map((l) => [l.slug, ""]),
        );
        publishedCharsRef.current = new Map(
          Object.values(stateRef.current.characters)
            .filter((c) => c.ownerId === uid)
            .map((c) => [c.id, ""]),
        );

        void runSyncCycle("auth");
      },
      () => {
        if (aliveRef.current) {
          setAuthReady(true);
          setSyncError("サインイン情報を確認できませんでした。");
        }
      },
    );
    return () => {
      aliveRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      unsubscribe();
    };
  }, [runSyncCycle]);

  /* ---------- フォアグラウンド復帰時にバックグラウンド SWR 実行 ---------- */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active" && authUserRef.current) {
        void runSyncCycle("foreground");
      }
    });
    return () => sub.remove();
  }, [runSyncCycle]);

  /* ---------- 楽観的即時更新 + 永続 Outbox ---------- */
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistLocalNow = useCallback((next: State, markPending: boolean) => {
    const user = authUserRef.current;
    if (!user) {
      writeSyncJson(DEMO_KEY, JSON.stringify(next));
      return;
    }
    const uid = user.uid;
    writeSyncJson(cloudKey(uid), JSON.stringify(next));
    if (markPending) {
      pendingRef.current = true;
      setHasPendingOutbox(true);
      writeSyncJson(cloudPendingKey(uid), "true");
    }
  }, []);

  const update = useCallback(
    (fn: (s: State) => void) => {
      setState((prev) => {
        const next = structuredClone(prev);
        fn(next);
        stateRef.current = next;
        persistLocalNow(next, true);
        return next;
      });
      if (authUserRef.current) {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          void runSyncCycle("mutation");
        }, 650);
      }
    },
    [persistLocalNow, runSyncCycle],
  );

  const api = useMemo<MobileStoreApi>(
    () => ({
      state,
      update,
      authUser,
      authReady,
      syncStatus,
      showSyncIndicator,
      isOffline,
      hasPendingOutbox,
      syncError,
      recoveryJson,
      dismissRecovery: () => {
        if (authUserRef.current) {
          Storage.removeItemSync(cloudRecoveryKey(authUserRef.current.uid));
        }
        setRecoveryJson(null);
      },
      refreshNow: () => runSyncCycle("manual"),
      retrySync: () => {
        retryAttemptRef.current = 0;
        void runSyncCycle("manual");
      },
      enterDemo: (userId = "u_mikan") => {
        setState((prev) => {
          const next = structuredClone(prev.users[userId] ? prev : seedState());
          next.events ??= {};
          next.me = userId;
          next.entered = true;
          stateRef.current = next;
          writeSyncJson(DEMO_KEY, JSON.stringify(next));
          return next;
        });
      },
      exitDemo: () => {
        setState((prev) => {
          const next = structuredClone(prev);
          next.entered = false;
          stateRef.current = next;
          writeSyncJson(DEMO_KEY, JSON.stringify(next));
          return next;
        });
      },
      resetDemo: () => {
        Storage.removeItemSync(DEMO_KEY);
        const fresh = seedState();
        fresh.entered = true;
        stateRef.current = fresh;
        writeSyncJson(DEMO_KEY, JSON.stringify(fresh));
        setState(fresh);
      },
      refreshProfile: () => {
        const user = authUserRef.current;
        if (!user) return;
        update((s) => {
          s.users[user.uid] = { ...s.users[user.uid], ...firebaseUserProfile(user) };
        });
      },
      exportData: () => JSON.stringify(stateRef.current, null, 2),
      importData: (next) => {
        const user = authUserRef.current;
        if (user && next.me !== user.uid) {
          throw new Error("このアカウントの記録を選んでください。");
        }
        const normalized: State = { ...next, events: next.events ?? {}, entered: true };
        stateRef.current = normalized;
        persistLocalNow(normalized, true);
        setState(normalized);
        if (user) void runSyncCycle("mutation");
      },
    }),
    [
      state,
      update,
      authUser,
      authReady,
      syncStatus,
      showSyncIndicator,
      isOffline,
      hasPendingOutbox,
      syncError,
      recoveryJson,
      runSyncCycle,
      persistLocalNow,
    ],
  );

  return <MobileStoreContext.Provider value={api}>{children}</MobileStoreContext.Provider>;
}

export function useMobileStore(): MobileStoreApi {
  return useContext(MobileStoreContext);
}

export function sessionsOfMe(state: State) {
  return Object.values(state.logs).filter((l) => l.ownerId === state.me || l.players[state.me]);
}
