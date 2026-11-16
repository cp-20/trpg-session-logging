import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { z } from "zod";
import type { State } from "./types";
import { seedState } from "./data/seed";

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
export const RestoredStateSchema = z.object({
  me: z.string().min(1),
  entered: z.boolean(),
  prefs: z.looseObject({ hideSelfOnShare: z.boolean() }),
  users: z.record(z.string(), z.looseObject({ id: z.string(), name: z.string(), color: z.string(), accounts: z.array(z.unknown()) })),
  tables: z.record(z.string(), z.looseObject({ id: z.string(), name: z.string(), ownerId: z.string(), memberIds: z.array(z.string()) })),
  characters: z.record(z.string(), z.looseObject({ id: z.string(), ownerId: z.string(), name: z.string(), sessions: z.array(z.unknown()), growth: z.array(z.unknown()) })),
  scenarios: z.record(z.string(), z.looseObject({ id: z.string(), title: z.string(), policy: z.enum(["public", "members", "unknown"]) })),
  logs: z.record(
    z.string(),
    z.looseObject({
      id: z.string(),
      title: z.string(),
      systemId: z.string(),
      ownerId: z.string(),
      scope: z.enum(["members", "passed", "public"]),
      hasLog: z.boolean(),
      dates: z.array(z.string()),
      t0: z.number(),
      t1: z.number(),
      slug: z.string().min(1),
      channels: z.array(z.unknown()),
      players: z.record(z.string(), z.unknown()),
    })
  ),
  editRequests: z.array(z.unknown()),
});

/** 復元結果: 正常 / データなし / 破損(自動上書きしない) */
type RestoreResult = { state: State; issue: "none" | "missing" | "corrupt" };

function restore(): RestoreResult {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: seedState(), issue: "missing" };
    const parsed = RestoredStateSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { state: parsed.data as unknown as State, issue: "none" };
    // 破損しているが、データを上書きしない(seedも使わず、保存も停止)
    try { return { state: JSON.parse(raw) as unknown as State, issue: "corrupt" }; } catch { return { state: seedState(), issue: "missing" }; }
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
}

const Ctx = createContext<StoreApi>(null!);

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => restore(), []);
  const [state, setState] = useState<State>(initial.state);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [otherTabUpdated, setOtherTabUpdated] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const staleRef = useRef(false);
  const blockedRef = useRef(persistBlocked || initial.issue === "corrupt");

  const persist = () => {
    if (blockedRef.current || staleRef.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(stateRef.current));
      setSaveError(null);
    } catch {
      setSaveError("端末に保存できません（容量または設定の問題）。再読み込み前にJSONをエクスポートしてください。");
    }
  };

  /* デバウンス書き込み: state 変更のたびに再スケジュール */
  useEffect(() => {
    const t = setTimeout(persist, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /* 単一writer: 他タブの更新を検知したら保存を停止し、再読み込みを促す */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue === null) return;
      staleRef.current = true;
      setOtherTabUpdated(true);
    };
    const flushOnUnload = () => {
      if (blockedRef.current || staleRef.current) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(stateRef.current));
      } catch {
        /* noop */
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", flushOnUnload);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", flushOnUnload);
    };
  }, []);

  const api = useMemo<StoreApi>(
    () => ({
      state,
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
      dataCorrupt: initial.issue === "corrupt",
      otherTabUpdated,
    }),
    [state, saveError, otherTabUpdated, initial.issue]
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast toast-bottom toast-center z-[99] pointer-events-none">
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
