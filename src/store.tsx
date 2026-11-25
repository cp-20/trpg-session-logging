import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import type { State, User } from "./types";
import { isSharedByUser } from "./lib/scenario-directory";
import {
  characterPublishSignature,
  logPublishSignature,
  scenarioPublishSignature,
} from "./lib/publish-signature";
import type { TablePollSync } from "./lib/table-polls";
import { parseSavedState, RestoredStateSchema } from "./lib/state-schema";
export { RestoredStateSchema };
import { firebaseUserProfile } from "./lib/auth";
import { ENTERED_HINT_KEY, writeEnteredHint } from "./lib/entered-hint";
import { produceDraft } from "./lib/draft";
import { idbDelete, idbSet, LOCAL_STORAGE_MAX_CHARS } from "./lib/local-db";
import { userFacingError } from "./lib/user-error";

const KEY = "takufu-state-v4";

/** リセット要求フラグ: flush が古い state を書き戻すのを防ぐ */
let persistBlocked = false;

export function resetData() {
  persistBlocked = true;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ENTERED_HINT_KEY);
    localStorage.removeItem(`${KEY}-idb`);
  } catch (e) {
    persistBlocked = false;
    throw e;
  }
  void idbDelete(KEY);
}

export function emptyState(user: User): State {
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

function minimalFallbackState(): State {
  return {
    ...emptyState({ id: "u_mikan", name: "みかん", color: "#b85d27", accounts: [] }),
    entered: false,
  };
}

/** 復元結果: 正常 / データなし / 破損(自動上書きしない) */
export type RestoreIssue = "none" | "missing" | "corrupt";
type RestoreResult = { state: State; issue: RestoreIssue };

function restore(storageKey = KEY): RestoreResult {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { state: minimalFallbackState(), issue: "missing" };
    const parsed = parseSavedState(raw);
    if (parsed) {
      parsed.events ??= {};
      return { state: parsed, issue: "none" };
    }
    return { state: minimalFallbackState(), issue: "corrupt" };
  } catch {
    return { state: minimalFallbackState(), issue: "corrupt" };
  }
}

function readPendingFlag(storageKey: string): boolean {
  try {
    return localStorage.getItem(`${storageKey}-pending`) === "true";
  } catch {
    return false;
  }
}

interface Toast {
  id: number;
  msg: string;
}

export interface StoreStateApi {
  state: State;
  update: (fn: (s: State) => void) => void;
  toast: (msg: string) => void;
  authUser: FirebaseUser | null;
  enterDemo: (userId?: string) => void;
  refreshProfile: () => void;
  exportData: () => string;
  importData: (next: State) => void;
}

export interface SyncStatusApi {
  /** 保存に失敗した(エクスポートを促す) */
  saveError: string | null;
  dismissSaveError: () => void;
  /** 保存データが破損していて、このセッションは保存しない */
  dataCorrupt: boolean;
  /** 別タブで更新があった(このタブの保存を停止中) */
  otherTabUpdated: boolean;
  cloudStatus: "idle" | "saving" | "saved" | "error";
  retrySave: () => void;
}

export type StoreApi = StoreStateApi & SyncStatusApi;

const StateCtx = createContext<StoreStateApi>(null!);
const SyncStatusCtx = createContext<SyncStatusApi>(null!);

export function StoreProvider({
  children,
  initialState,
  initialIssue,
  storageKey = KEY,
  authUser = null,
  cloudRevision = null,
}: {
  children: ReactNode;
  initialState?: State;
  initialIssue?: RestoreIssue;
  storageKey?: string;
  authUser?: FirebaseUser | null;
  cloudRevision?: string | null;
}) {
  const initial = useMemo<RestoreResult>(() => {
    const restored: RestoreResult = initialState
      ? { state: initialState, issue: initialIssue ?? "none" }
      : restore(storageKey);
    return restored;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const needsInitialCloudSync = Boolean(authUser && (!cloudRevision || readPendingFlag(storageKey)));

  const [state, setState] = useState<State>(initial.state);
  // 公開ページ（ストアを読まない）のヘッダーが「ホームを開く」を出せるように、使い始めているかの目印を残す
  useEffect(() => {
    if (storageKey === KEY) writeEnteredHint(state.entered);
  }, [state.entered, storageKey]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [otherTabUpdated, setOtherTabUpdated] = useState(false);
  const [dataCorrupt, setDataCorrupt] = useState(initial.issue === "corrupt");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cloudStatus, setCloudStatus] = useState<SyncStatusApi["cloudStatus"]>(
    authUser ? (needsInitialCloudSync ? "saving" : "saved") : "idle",
  );
  const [retry, setRetry] = useState(0);

  const revision = useRef(cloudRevision);
  const lastSavedState = useRef<State | null>(needsInitialCloudSync ? null : initial.state);
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const dirtyLocalRef = useRef(false);

  const published = useRef(
    new Map(
      Object.values(initial.state.logs)
        .filter((l) => l.ownerId === authUser?.uid)
        .map((l) => [l.slug, needsInitialCloudSync ? "" : logPublishSignature(l, initial.state)]),
    ),
  );
  const publishedCharacters = useRef(
    new Map(
      Object.values(initial.state.characters)
        .filter((c) => c.ownerId === authUser?.uid)
        .map((c) => [
          c.id,
          needsInitialCloudSync ? "" : characterPublishSignature(c, initial.state, authUser!.uid),
        ]),
    ),
  );
  /** 共有シナリオ一覧へ出した、自分が足したシナリオ（中身の署名） */
  const publishedScenarios = useRef(
    new Map(
      authUser
        ? Object.values(initial.state.scenarios)
            .filter((sc) => isSharedByUser(sc, authUser.uid))
            .map((sc) => [sc.id, needsInitialCloudSync ? "" : scenarioPublishSignature(sc, authUser.uid)])
        : [],
    ),
  );
  const publishedMemberships = useRef(
    new Map(
      authUser
        ? Object.values(initial.state.logs)
            .filter((l) => l.ownerId !== authUser.uid && l.players[authUser.uid])
            .map((l) => {
              const m = l.players[authUser.uid]!;
              return [l.slug, needsInitialCloudSync ? "" : `${m.linked}:${m.hidden}`];
            })
        : [],
    ),
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const pollSync = useRef<TablePollSync | null>(null);

  /* 卓の日程調整: 自分が回答できる共有の文書を見張り、回答と確定を記録へ取り込む（src/lib/table-polls.ts） */
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    void import("./lib/table-polls").then(({ TablePollSync }) => {
      if (cancelled) return;
      const sync = new TablePollSync(
        authUser.uid,
        (merge) => {
          setState((prev) => {
            const events = merge(prev);
            if (!events) return prev;
            dirtyLocalRef.current = true;
            return { ...prev, events };
          });
        },
        {
          onReady: () => void sync.push(stateRef.current).catch(() => undefined),
        },
      );
      pollSync.current = sync;
      stop = sync.start();
    });
    return () => {
      cancelled = true;
      stop?.();
      pollSync.current = null;
    };
  }, [authUser]);
  const staleRef = useRef(false);
  const blockedRef = useRef(persistBlocked || initial.issue === "corrupt");

  const persist = useCallback(async () => {
    if (persistBlocked || blockedRef.current || staleRef.current) return;
    const snapshot = stateRef.current;
    try {
      const json = JSON.stringify(snapshot);
      if (json.length <= LOCAL_STORAGE_MAX_CHARS) {
        try {
          localStorage.setItem(storageKey, json);
          localStorage.removeItem(`${storageKey}-idb`);
          if (authUser) {
            localStorage.setItem(
              `${storageKey}-pending`,
              snapshot === lastSavedState.current ? "false" : "true",
            );
          }
          if (stateRef.current === snapshot) dirtyLocalRef.current = false;
          if (!authUser) setSaveError(null);
          return;
        } catch {
          // 5MB 上限超過等は IndexedDB へフォールバック
        }
      }
      const idbOk = await idbSet(storageKey, snapshot);
      if (idbOk) {
        try {
          localStorage.setItem(`${storageKey}-idb`, "1");
          localStorage.removeItem(storageKey);
          if (authUser) {
            localStorage.setItem(
              `${storageKey}-pending`,
              snapshot === lastSavedState.current ? "false" : "true",
            );
          }
        } catch {
          /* marker best effort */
        }
        if (stateRef.current === snapshot) dirtyLocalRef.current = false;
        if (!authUser) setSaveError(null);
      } else {
        setSaveError("この端末に保存できません。記録をダウンロードしてから、空き容量を確認してください。");
      }
    } catch {
      setSaveError("この端末に保存できません。記録をダウンロードしてから、空き容量を確認してください。");
    }
  }, [storageKey, authUser]);

  /* アイドル時デバウンス書き込み: ローカル更新が起きたときだけ実行 */
  useEffect(() => {
    if (!dirtyLocalRef.current) return;
    let idleId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const t = window.setTimeout(() => {
      if (typeof win.requestIdleCallback === "function") {
        idleId = win.requestIdleCallback(() => void persist(), { timeout: 1000 });
      } else {
        void persist();
      }
    }, 400);
    return () => {
      window.clearTimeout(t);
      if (idleId !== null && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
    };
  }, [state, persist]);

  /* クラウド同期: 中身の変わった部品・共有ページだけを送る（src/lib/workspace-parts.ts） */
  useEffect(() => {
    if (!authUser || blockedRef.current || staleRef.current) return;
    if (state === lastSavedState.current && retry === 0) return;

    setCloudStatus("saving");
    const timer = window.setTimeout(() => {
      if (!authUser || blockedRef.current || staleRef.current) return;
      queue.current = queue.current.then(async () => {
        if (!alive.current || staleRef.current) return;
        try {
          const {
            saveCloudState,
            publishSharedLog,
            deleteSharedLog,
            publishSharedCharacter,
            deleteSharedCharacter,
            updateSharedMembership,
            publishSharedScenario,
          } = await import("./lib/cloud-state");

          revision.current = await saveCloudState(authUser.uid, state, revision.current);
          lastSavedState.current = state;
          if (!alive.current) return;

          try {
            localStorage.setItem(`${storageKey}-cloud-revision`, revision.current);
            if (stateRef.current === state) {
              localStorage.setItem(`${storageKey}-pending`, "false");
            }
          } catch {
            /* Cloud save succeeded; cache marker is best effort. */
          }
          if (stateRef.current === state) {
            void persist();
          }

          const owned = Object.values(state.logs).filter((l) => l.ownerId === authUser.uid);
          const slugs = new Set(owned.map((l) => l.slug));
          for (const slug of published.current.keys()) {
            if (!slugs.has(slug)) {
              await deleteSharedLog(slug);
              published.current.delete(slug);
            }
          }
          for (const log of owned) {
            const signature = logPublishSignature(log, state);
            if (published.current.get(log.slug) === signature) continue;
            await publishSharedLog(log, state);
            published.current.set(log.slug, signature);
          }

          for (const log of Object.values(state.logs).filter((l) => l.ownerId !== authUser.uid)) {
            const membership = log.players[authUser.uid];
            if (!membership) continue;
            const memSig = `${membership.linked}:${membership.hidden}`;
            if (publishedMemberships.current.get(log.slug) === memSig) continue;
            await updateSharedMembership(log.slug, {
              linked: membership.linked,
              hidden: membership.hidden,
            });
            publishedMemberships.current.set(log.slug, memSig);
          }

          const characters = Object.values(state.characters).filter((c) => c.ownerId === authUser.uid);
          const characterIds = new Set(characters.map((c) => c.id));
          for (const id of publishedCharacters.current.keys()) {
            if (!characterIds.has(id)) {
              await deleteSharedCharacter(id);
              publishedCharacters.current.delete(id);
            }
          }
          for (const character of characters) {
            const signature = characterPublishSignature(character, state, authUser.uid);
            if (publishedCharacters.current.get(character.id) === signature) continue;
            await publishSharedCharacter(character, state);
            publishedCharacters.current.set(character.id, signature);
          }

          for (const sc of Object.values(state.scenarios)) {
            if (!isSharedByUser(sc, authUser.uid)) continue;
            const signature = scenarioPublishSignature(sc, authUser.uid);
            if (publishedScenarios.current.get(sc.id) === signature) continue;
            await publishSharedScenario(sc, authUser.uid);
            publishedScenarios.current.set(sc.id, signature);
          }

          await pollSync.current?.push(state);

          if (alive.current) {
            setSaveError(null);
            setCloudStatus(stateRef.current === state ? "saved" : "saving");
          }
        } catch (error) {
          console.error("[cloud] save failed", error);
          if (alive.current) {
            setSaveError(
              userFacingError(
                error,
                "記録を同期できませんでした。通信状態を確認して、もう一度保存してください。",
              ),
            );
            setCloudStatus("error");
          }
        }
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state, retry, authUser, storageKey, persist]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* 単一writer: 他タブの更新を検知したら保存を停止し、再読み込みを促す */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if ((e.key !== storageKey && e.key !== `${storageKey}-idb`) || e.newValue === null) return;
      staleRef.current = true;
      setOtherTabUpdated(true);
    };
    const flushOnUnload = () => {
      if (!dirtyLocalRef.current || persistBlocked || blockedRef.current || staleRef.current) return;
      const snapshot = stateRef.current;
      try {
        const json = JSON.stringify(snapshot);
        if (json.length <= LOCAL_STORAGE_MAX_CHARS) {
          localStorage.setItem(storageKey, json);
          localStorage.removeItem(`${storageKey}-idb`);
          if (authUser) {
            localStorage.setItem(
              `${storageKey}-pending`,
              snapshot === lastSavedState.current ? "false" : "true",
            );
          }
          dirtyLocalRef.current = false;
          return;
        }
      } catch {
        /* try idb best-effort below */
      }
      void idbSet(storageKey, snapshot);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", flushOnUnload);
    window.addEventListener("pagehide", flushOnUnload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", flushOnUnload);
      window.removeEventListener("pagehide", flushOnUnload);
      // ストアが外れるとき（記録を使わない公開ページへの移動・ログインの切り替え）も、保存待ちの変更を書き出す。
      // 遅延保存のタイマーは片付けで止まるので、ここで書かないと失われる
      flushOnUnload();
    };
  }, [storageKey, authUser]);

  const update = useCallback((fn: (s: State) => void) => {
    dirtyLocalRef.current = true;
    setState((prev) => {
      return produceDraft(prev, fn);
    });
  }, []);

  const enterDemo = useCallback((userId = "u_mikan") => {
    dirtyLocalRef.current = true;
    if (stateRef.current.users[userId]) {
      setState((prev) =>
        produceDraft(prev, (draft) => {
          draft.events ??= {};
          draft.me = userId;
          draft.entered = true;
        }),
      );
      return;
    }
    void import("./data/seed").then(({ seedState }) => {
      if (!alive.current) return;
      setState((prev) => {
        if (prev.users[userId]) {
          return produceDraft(prev, (draft) => {
            draft.events ??= {};
            draft.me = userId;
            draft.entered = true;
          });
        }
        const seeded = seedState();
        seeded.events ??= {};
        seeded.me = seeded.users[userId] ? userId : seeded.me;
        seeded.entered = true;
        return seeded;
      });
    });
  }, []);

  const refreshProfile = useCallback(() => {
    if (!authUser) return;
    dirtyLocalRef.current = true;
    setState((prev) =>
      produceDraft(prev, (draft) => {
        const profile = firebaseUserProfile(authUser);
        const existing = draft.users[authUser.uid];
        draft.users[authUser.uid] = {
          ...profile,
          ...existing,
          id: authUser.uid,
          accounts: profile.accounts,
          email: profile.email ?? existing?.email,
          name: existing?.name || profile.name,
          image: existing?.image !== undefined ? existing.image : profile.image,
          profilePublic: existing?.profilePublic ?? true,
        };
      }),
    );
  }, [authUser]);

  const exportData = useCallback(
    () =>
      initial.issue === "corrupt"
        ? (localStorage.getItem(storageKey) ?? JSON.stringify(stateRef.current))
        : JSON.stringify(stateRef.current, null, 2),
    [initial.issue, storageKey],
  );

  const importData = useCallback(
    (next: State) => {
      if (authUser && next.me !== authUser.uid) throw new Error("このアカウントの記録を選んでください。");
      if (dataCorrupt) {
        const raw = localStorage.getItem(storageKey);
        if (raw) localStorage.setItem(`${storageKey}-backup-${Date.now()}`, raw);
      }
      blockedRef.current = false;
      dirtyLocalRef.current = true;
      setDataCorrupt(false);
      setState({ ...next, events: next.events ?? {}, entered: true });
    },
    [authUser, dataCorrupt, storageKey],
  );

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);

  const retrySave = useCallback(() => setRetry((n) => n + 1), []);
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  const stateApi = useMemo<StoreStateApi>(
    () => ({
      state,
      authUser,
      update,
      enterDemo,
      refreshProfile,
      exportData,
      importData,
      toast,
    }),
    [state, authUser, update, enterDemo, refreshProfile, exportData, importData, toast],
  );

  const syncApi = useMemo<SyncStatusApi>(
    () => ({
      cloudStatus,
      saveError,
      dismissSaveError,
      dataCorrupt,
      otherTabUpdated,
      retrySave,
    }),
    [cloudStatus, saveError, dismissSaveError, dataCorrupt, otherTabUpdated, retrySave],
  );

  return (
    <StateCtx.Provider value={stateApi}>
      <SyncStatusCtx.Provider value={syncApi}>
        {children}
        <div
          className="toast toast-bottom toast-center z-[99] pointer-events-none"
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div key={t.id} className="alert alert-neutral py-2.5 px-4 text-sm">
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      </SyncStatusCtx.Provider>
    </StateCtx.Provider>
  );
}

export const useStoreState = () => useContext(StateCtx);
export const useSyncStatus = () => useContext(SyncStatusCtx);

export function useStore(): StoreApi {
  const s = useContext(StateCtx);
  const sync = useContext(SyncStatusCtx);
  return useMemo(() => ({ ...s, ...sync }), [s, sync]);
}

/** 自分が関わっているセッション(GM or 参加者) */
export function sessionsOfMe(state: State) {
  return Object.values(state.logs).filter((l) => l.ownerId === state.me || l.players[state.me]);
}
