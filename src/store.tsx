import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseSavedState, RestoredStateSchema } from "./lib/state-schema";
export { RestoredStateSchema };
import type { State } from "./types";
import { seedState } from "./data/seed";
import type { User as FirebaseUser } from "firebase/auth";
import type { User } from "./types";
import { firebaseUserProfile } from "./lib/auth";
import { saveCloudState, publishSharedLog, deleteSharedLog, publishSharedCharacter, deleteSharedCharacter, updateSharedMembership } from "./lib/cloud-state";

const KEY = "takufu-state-v4";

/** リセット要求フラグ: flush が古い state を書き戻すのを防ぐ */
let persistBlocked = false;

export function resetData() {
  persistBlocked = true;
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    persistBlocked = false;
    throw e;
  }
}

/**
 * localStorage から復元するデータの最低限の検証(zod)。
 * looseObject なので未知キーは保持(前方互換)。不整合なら seed へフォールバック。
 */
/** 復元結果: 正常 / データなし / 破損(自動上書きしない) */
type RestoreResult = { state: State; issue: "none" | "missing" | "corrupt" };

function restore(): RestoreResult {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: seedState(), issue: "missing" };
    const parsed = parseSavedState(raw);
    if (parsed) return { state: parsed, issue: "none" };
    return { state: seedState(), issue: "corrupt" };
  } catch {
    return { state: seedState(), issue: "corrupt" };
  }
}

interface Toast {
  id: number;
  msg: string;
}

interface StoreApi {
  state: State;
  update: (fn: (s: State) => void) => void;
  toast: (msg: string) => void;
  /** 保存に失敗した(エクスポートを促す) */
  saveError: string | null;
  dismissSaveError: () => void;
  /** 保存データが破損していて、このセッションは保存しない */
  dataCorrupt: boolean;
  /** 別タブで更新があった(このタブの保存を停止中) */
  otherTabUpdated: boolean;
  authUser: FirebaseUser | null;
  cloudStatus: "idle" | "saving" | "saved" | "error";
  retrySave: () => void;
  enterDemo: (userId?: string) => void;
  refreshProfile: () => void;
  exportData: () => string;
  importData: (next: State) => void;
}

const Ctx = createContext<StoreApi>(null!);

export function emptyState(user: User): State {
  return { me: user.id, entered: true, users: { [user.id]: user }, prefs: { hideSelfOnShare: false }, tables: {}, characters: {}, scenarios: {}, logs: {}, editRequests: [] };
}

export function StoreProvider({ children, initialState, storageKey = KEY, authUser = null, cloudRevision = null }: {
  children: ReactNode; initialState?: State; storageKey?: string; authUser?: FirebaseUser | null; cloudRevision?: string | null;
}) {
  const initial = useMemo(() => initialState ? { state: initialState, issue: "none" as const } : restore(), []);
  const [state, setState] = useState<State>(initial.state);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [otherTabUpdated, setOtherTabUpdated] = useState(false);
  const [dataCorrupt, setDataCorrupt] = useState(initial.issue === "corrupt");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cloudStatus, setCloudStatus] = useState<StoreApi["cloudStatus"]>(authUser ? "saving" : "idle");
  const [retry, setRetry] = useState(0);
  const revision = useRef(cloudRevision);
  const lastSavedState = useRef<State | null>(null);
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const published = useRef(new Map(Object.values(initial.state.logs).filter((l) => l.ownerId === authUser?.uid).map((l) => [l.slug, ""])));
  const publishedCharacters = useRef(new Map(Object.values(initial.state.characters).filter((c) => c.ownerId === authUser?.uid).map((c) => [c.id, ""])));

  const stateRef = useRef(state);
  stateRef.current = state;
  const staleRef = useRef(false);
  const blockedRef = useRef(persistBlocked || initial.issue === "corrupt");

  const persist = () => {
    if (persistBlocked || blockedRef.current || staleRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(stateRef.current));
      if (authUser) localStorage.setItem(`${storageKey}-pending`, stateRef.current === lastSavedState.current ? "false" : "true");
      if (!authUser) setSaveError(null);
    } catch {
      setSaveError("この端末に保存できません。記録をダウンロードしてから、空き容量を確認してください。");
    }
  };

  /* デバウンス書き込み: state 変更のたびに再スケジュール */
  useEffect(() => {
    const t = setTimeout(persist, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!authUser || blockedRef.current || staleRef.current) return;
      setCloudStatus("saving");
      queue.current = queue.current.then(async () => {
        if (!alive.current || staleRef.current) return;
        try {
          revision.current = await saveCloudState(authUser.uid, state, revision.current);
          lastSavedState.current = state;
          if (!alive.current) return;
          try {
            localStorage.setItem(`${storageKey}-cloud-revision`, revision.current);
            if (stateRef.current === state) {
              localStorage.setItem(storageKey, JSON.stringify(state));
              localStorage.setItem(`${storageKey}-pending`, "false");
            }
          } catch { /* Cloud save succeeded; the cache is best effort. */ }
          const owned = Object.values(state.logs).filter((l) => l.ownerId === authUser.uid);
          const slugs = new Set(owned.map((l) => l.slug));
          for (const slug of published.current.keys()) {
            if (!slugs.has(slug)) { await deleteSharedLog(slug); published.current.delete(slug); }
          }
          for (const log of owned) {
            const signature = JSON.stringify([log, state.users, state.prefs, log.scenarioId ? state.scenarios[log.scenarioId] : null]);
            if (published.current.get(log.slug) === signature) continue;
            await publishSharedLog(log, state);
            published.current.set(log.slug, signature);
          }
          for (const log of Object.values(state.logs).filter((l) => l.ownerId !== authUser.uid)) {
            const membership = log.players[authUser.uid];
            if (membership) await updateSharedMembership(log.slug, { linked: membership.linked, hidden: membership.hidden });
          }
          const characters = Object.values(state.characters).filter((c) => c.ownerId === authUser.uid);
          const characterIds = new Set(characters.map((c) => c.id));
          for (const id of publishedCharacters.current.keys()) {
            if (!characterIds.has(id)) { await deleteSharedCharacter(id); publishedCharacters.current.delete(id); }
          }
          for (const character of characters) {
            const signature = JSON.stringify([character, state.logs, state.users[authUser.uid]]);
            if (publishedCharacters.current.get(character.id) === signature) continue;
            await publishSharedCharacter(character, state);
            publishedCharacters.current.set(character.id, signature);
          }
          if (alive.current) { setSaveError(null); setCloudStatus(stateRef.current === state ? "saved" : "saving"); }
        } catch (error) {
          if (alive.current) {
            setSaveError(error instanceof Error ? error.message : "記録を同期できませんでした。通信状態を確認して、もう一度保存してください。");
            setCloudStatus("error");
          }
        }
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [state, retry, authUser]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /* 単一writer: 他タブの更新を検知したら保存を停止し、再読み込みを促す */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey || e.newValue === null) return;
      staleRef.current = true;
      setOtherTabUpdated(true);
    };
    const flushOnUnload = () => {
      if (persistBlocked || blockedRef.current || staleRef.current) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(stateRef.current));
        if (authUser) localStorage.setItem(`${storageKey}-pending`, stateRef.current === lastSavedState.current ? "false" : "true");
      } catch {
        /* noop */
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", flushOnUnload);
    window.addEventListener("pagehide", flushOnUnload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", flushOnUnload);
      window.removeEventListener("pagehide", flushOnUnload);
    };
  }, []);

  const api = useMemo<StoreApi>(
    () => ({
      state,
      authUser,
      cloudStatus,
      retrySave: () => setRetry((n) => n + 1),
      enterDemo: (userId = "u_mikan") => setState((prev) => {
        const next = structuredClone(prev.users[userId] ? prev : seedState());
        next.me = userId;
        next.entered = true;
        return next;
      }),
      refreshProfile: () => {
        if (authUser) setState((prev) => ({ ...prev, users: { ...prev.users, [authUser.uid]: { ...prev.users[authUser.uid], ...firebaseUserProfile(authUser) } } }));
      },
      exportData: () => initial.issue === "corrupt" ? (localStorage.getItem(storageKey) ?? JSON.stringify(stateRef.current)) : JSON.stringify(stateRef.current, null, 2),
      importData: (next) => {
        if (authUser && next.me !== authUser.uid) throw new Error("このアカウントの記録を選んでください。");
        if (dataCorrupt) {
          const raw = localStorage.getItem(storageKey);
          if (raw) localStorage.setItem(`${storageKey}-backup-${Date.now()}`, raw);
        }
        blockedRef.current = false;
        setDataCorrupt(false);
        setState({ ...next, entered: true });
      },
      update: (fn) =>
        setState((prev) => {
          const next = structuredClone(prev);
          fn(next);
          return next;
        }),
      toast: (msg) => {
        const id = Date.now() + Math.random();
        setToasts((t) => [...t, { id, msg }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
      },
      saveError,
      dismissSaveError: () => setSaveError(null),
      dataCorrupt,
      otherTabUpdated,
    }),
    [state, saveError, otherTabUpdated, initial.issue, authUser, cloudStatus, dataCorrupt]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast toast-bottom toast-center z-[99] pointer-events-none" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="alert alert-neutral py-2 px-4 text-[13px] shadow-lg">
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);

/** 自分が関わっているセッション(KP or 参加者) */
export function sessionsOfMe(state: State) {
  return Object.values(state.logs).filter((l) => l.ownerId === state.me || l.players[state.me]);
}
