/**
 * シナリオの共有シナリオ一覧をサーバー（/api/scenarios）で探す。打つたびに少し待ってから問い合わせ、古い問い合わせは捨てる。
 * 読めなければ空のまま（画面は手元の写しだけで動く）
 */
import { useEffect, useState } from "react";
import type { DirectoryResult, DirectoryScenario } from "./scenario-directory";

/** 既定は同じオリジンの相対パス。アプリ（Expo）はサーバーの絶対 URL を `origin` で渡す */
const ENDPOINT = "/api/scenarios";
const endpointOf = (origin = "") => `${origin.replace(/\/+$/, "")}${ENDPOINT}`;
const DEBOUNCE_MS = 200;

export interface DirectorySearch {
  items: DirectoryScenario[];
  total: number;
  /** 問い合わせ中（最初の結果が出るまで、と続きを読んでいるあいだ） */
  loading: boolean;
  /** 読めなかった */
  failed: boolean;
  loadMore: () => void;
}

export function useScenarioSearch({
  q,
  systemId,
  prefer = [],
  pageSize = 30,
  enabled = true,
  origin,
}: {
  q: string;
  systemId?: string;
  prefer?: readonly string[];
  pageSize?: number;
  enabled?: boolean;
  origin?: string;
}): DirectorySearch {
  const [state, setState] = useState<{
    key: string;
    items: DirectoryScenario[];
    total: number;
    failed: boolean;
  }>({
    key: "",
    items: [],
    total: 0,
    failed: false,
  });
  const preferKey = prefer.join(",");
  const key = JSON.stringify([q.trim(), systemId ?? "", preferKey]);
  /** 何件まで読むか。問い合わせが変われば 1 ページ目から */
  const [wantFor, setWantFor] = useState({ key, n: pageSize });
  const want = wantFor.key === key ? wantFor.n : pageSize;

  const have = state.key === key ? state.items.length : 0;
  useEffect(() => {
    if (!enabled) return;
    const offset = state.key === key ? state.items.length : 0;
    if (state.key === key && (offset >= want || offset >= state.total)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams({ offset: String(offset), limit: String(want - offset) });
        const query = q.trim();
        if (query) params.set("q", query);
        if (systemId) params.set("system", systemId);
        if (preferKey) params.set("prefer", preferKey);
        fetch(`${endpointOf(origin)}?${params}`, { signal: ctrl.signal })
          .then((r) =>
            r.ok ? (r.json() as Promise<DirectoryResult>) : Promise.reject(new Error(String(r.status))),
          )
          .then((res) => {
            if (!Array.isArray(res?.items)) throw new Error("unexpected response");
            return res;
          })
          .then((res) =>
            setState((cur) => ({
              key,
              items: cur.key === key && offset > 0 ? [...cur.items, ...res.items] : res.items,
              total: res.total,
              failed: false,
            })),
          )
          .catch((error: unknown) => {
            if (ctrl.signal.aborted) return;
            console.error("[scenarios] search failed", error);
            setState({ key, items: [], total: 0, failed: true });
          });
      },
      offset > 0 ? 0 : DEBOUNCE_MS,
    );
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // state.items.length と state.total は「どこまで読んだか」。同じ問い合わせの続きを読むときだけ動く
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, want, state.key, have, origin]);

  const current = state.key === key;
  // 新しい問い合わせの答えが来るまでは前の結果を出したままにする（打つたびに一覧が消えないように）
  return {
    items: state.items,
    total: state.total,
    loading: enabled && (!current || (have < want && have < state.total)),
    failed: current && state.failed,
    loadMore: () => setWantFor({ key, n: want + pageSize }),
  };
}

const byIdCache = new Map<string, Promise<DirectoryScenario | null>>();

/** ID で 1 件。手元に写しがないとき（ほかの人が足したもの・TALTO のもの）に使う */
export function useDirectoryScenario(
  id: string | undefined,
  enabled = true,
  origin?: string,
): {
  scenario: DirectoryScenario | null;
  loading: boolean;
} {
  const [got, setGot] = useState<{ id: string; scenario: DirectoryScenario | null } | null>(null);
  useEffect(() => {
    if (!enabled || !id) return;
    let alive = true;
    const cacheKey = `${origin ?? ""}|${id}`;
    let p = byIdCache.get(cacheKey);
    if (!p) {
      p = fetch(`${endpointOf(origin)}?ids=${encodeURIComponent(id)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ items: DirectoryScenario[] }>) : { items: [] }))
        .then((r) => (Array.isArray(r?.items) ? (r.items[0] ?? null) : null))
        .catch(() => {
          byIdCache.delete(cacheKey);
          return null;
        });
      byIdCache.set(cacheKey, p);
    }
    void p.then((scenario) => {
      if (alive) setGot({ id, scenario });
    });
    return () => {
      alive = false;
    };
  }, [id, enabled, origin]);
  const current = got?.id === id;
  return { scenario: current ? got!.scenario : null, loading: enabled && Boolean(id) && !current };
}
