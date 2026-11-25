import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedState } from "../data/seed";
import type { State } from "../types";

/** 文書の置き場だけを真似た Firestore。書いた・読んだ数を数える */
const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  writes: [] as string[],
  reads: [] as string[],
  onTransaction: null as null | ((commit: () => void) => void),
  onRead: null as null | ((path: string) => Promise<void>),
  onManifestRead: null as null | (() => void),
}));

vi.mock("firebase/firestore", () => {
  const path = (args: unknown[]) => args.slice(1).join("/");
  const snapshot = (key: string) => ({
    id: key.split("/").at(-1),
    ref: { key },
    exists: () => store.docs.has(key),
    data: () => store.docs.get(key),
  });
  return {
    doc: (...args: unknown[]) => ({ key: path(args) }),
    collection: (...args: unknown[]) => ({ key: path(args) }),
    query: () => ({}),
    where: () => ({}),
    serverTimestamp: () => 0,
    Timestamp: class {},
    setDoc: async () => {},
    updateDoc: async () => {},
    getDocFromServer: async (ref: { key: string }) => {
      store.onManifestRead?.();
      return snapshot(ref.key);
    },
    getDocs: async (ref: { key: string }) => {
      store.reads.push(ref.key);
      await store.onRead?.(ref.key);
      const docs = [...store.docs.keys()].filter((key) => key.startsWith(`${ref.key}/`)).map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    writeBatch: () => {
      const ops: (() => void)[] = [];
      return {
        set: (ref: { key: string }, data: Record<string, unknown>) =>
          ops.push(() => {
            store.writes.push(ref.key);
            store.docs.set(ref.key, data);
          }),
        delete: (ref: { key: string }) => ops.push(() => store.docs.delete(ref.key)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async (
      _db: unknown,
      fn: (t: {
        get: (ref: { key: string }) => Promise<unknown>;
        set: (ref: { key: string }, data: Record<string, unknown>) => void;
      }) => Promise<void>,
    ) => {
      const ops: (() => void)[] = [];
      await fn({
        get: async (ref) => snapshot(ref.key),
        set: (ref, data) =>
          ops.push(() => {
            store.writes.push(ref.key);
            store.docs.set(ref.key, data);
          }),
      });
      const commit = () => ops.forEach((op) => op());
      if (store.onTransaction) store.onTransaction(commit);
      else commit();
    },
  };
});

const { configureCloudRuntime, fetchCloudWorkspaceManifest, loadCloudState, saveCloudState } =
  await import("./cloud-state");

const UID = "u_mikan";
const MANIFEST = `users/${UID}/workspace/manifest`;
const plain = (state: State) => JSON.parse(JSON.stringify(state)) as State;
const chunkPaths = () => [...store.docs.keys()].filter((key) => key.includes("/chunks/"));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function workspace(): State {
  const state = seedState();
  state.me = UID;
  return state;
}

function editOne(state: State): { next: State; id: string } {
  const next = structuredClone(state);
  const id = Object.keys(next.logs)[0]!;
  next.logs[id]!.importedFrom = "変更";
  return { next, id };
}

beforeEach(() => {
  store.docs.clear();
  store.writes.length = 0;
  store.reads.length = 0;
  store.onTransaction = store.onRead = store.onManifestRead = null;
  configureCloudRuntime({ getFirestore: () => ({}) as never });
});

describe("記録をクラウドに分けて保存する", () => {
  it("保存して読むと元どおり", async () => {
    const state = workspace();
    const revision = await saveCloudState(UID, state, null);
    expect(await loadCloudState(UID)).toEqual({ state: plain(state), revision });
  });

  it("1 件だけ変えたときは、その 1 件と見出しだけを書き、古い切れ端を片付ける", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const { next, id } = editOne(state);
    const old = (await fetchCloudWorkspaceManifest(UID))!.parts.get(`log:${id}`)!;
    store.writes.length = 0;
    await saveCloudState(UID, next, first);
    await settle();
    const part = (await fetchCloudWorkspaceManifest(UID))!.parts.get(`log:${id}`)!;
    expect(store.writes).toHaveLength(part.chunkCount + 1);
    expect(store.writes.at(-1)).toBe(MANIFEST);
    expect(store.writes.slice(0, -1).every((key) => key.includes(part.revision))).toBe(true);
    expect(chunkPaths().some((key) => key.includes(old.revision))).toBe(false);
    expect((await loadCloudState(UID))!.state).toEqual(plain(next));
  });

  it("消したセッションの切れ端は残らない。何も変わっていなければ書かない", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const next = structuredClone(state);
    const id = Object.keys(next.logs)[0]!;
    const gone = (await fetchCloudWorkspaceManifest(UID))!.parts.get(`log:${id}`)!;
    delete next.logs[id];
    const second = await saveCloudState(UID, next, first);
    await settle();
    expect(chunkPaths().some((key) => key.includes(gone.revision))).toBe(false);
    store.writes.length = 0;
    expect(await saveCloudState(UID, structuredClone(next), second)).toBe(second);
    expect(store.writes).toEqual([]);
  });

  it("全体が前の上限（2,400 万字）を超えても、セッションごとに収まれば保存できる", async () => {
    const state = workspace();
    const [a, b] = Object.values(state.logs);
    a!.importedFrom = "あ".repeat(13_000_000);
    b!.importedFrom = "い".repeat(13_000_000);
    const revision = await saveCloudState(UID, state, null);
    expect((await loadCloudState(UID))?.revision).toBe(revision);
  });

  it("手元の控えと同じ部品は読み込まない", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const { next, id } = editOne(state);
    await saveCloudState(UID, next, first);
    const part = (await fetchCloudWorkspaceManifest(UID))!.parts.get(`log:${id}`)!;
    await settle();
    store.reads.length = 0;
    expect((await loadCloudState(UID, plain(state)))!.state).toEqual(plain(next));
    expect(store.reads).toEqual([`users/${UID}/revisions/${part.revision}/chunks`]);
  });

  it("別の端末が先に保存していたら、何も書かずに断る", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const { next } = editOne(state);
    const other = await saveCloudState(UID, next, first);
    await settle();
    store.writes.length = 0;
    await expect(saveCloudState(UID, state, first)).rejects.toThrow("別の端末");
    expect(store.writes).toEqual([]);
    expect((await loadCloudState(UID))?.revision).toBe(other);
  });

  it("切り替えに失敗したら、書きかけを片付けて前の記録を残す", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const before = chunkPaths().sort();
    store.onTransaction = () => {
      throw new Error("offline");
    };
    await expect(saveCloudState(UID, editOne(state).next, first)).rejects.toThrow("offline");
    expect(chunkPaths().sort()).toEqual(before);
    expect((await loadCloudState(UID))!.state).toEqual(plain(state));
  });

  it("切り替わったのに失敗と返ってきても、保存した部品を消さない", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const { next } = editOne(state);
    store.onTransaction = (commit) => {
      commit();
      throw new Error("response lost");
    };
    const second = await saveCloudState(UID, next, first);
    expect(await loadCloudState(UID)).toEqual({ state: plain(next), revision: second });
  });

  it("切り替わったか確かめられないときは、書いた部品を消さない", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const { next } = editOne(state);
    store.onTransaction = (commit) => {
      commit();
      store.onManifestRead = () => {
        throw new Error("offline");
      };
      throw new Error("response lost");
    };
    await expect(saveCloudState(UID, next, first)).rejects.toThrow("response lost");
    store.onManifestRead = null;
    expect((await loadCloudState(UID))!.state).toEqual(plain(next));
  });

  it("読んでいる途中で別の端末が保存したら、新しい記録を読み直す", async () => {
    const state = workspace();
    const first = await saveCloudState(UID, state, null);
    const { next, id } = editOne(state);
    const old = (await fetchCloudWorkspaceManifest(UID))!.parts.get(`log:${id}`)!;
    let second: string | null = null;
    store.onRead = async (key) => {
      if (second !== null || !key.includes(old.revision)) return;
      // 別の端末が保存する（見出しが切り替わり、古い切れ端は消える）
      second = "";
      second = await saveCloudState(UID, next, first);
      await settle();
      expect(chunkPaths().some((chunk) => chunk.includes(old.revision))).toBe(false);
    };
    const loaded = await loadCloudState(UID);
    expect(loaded).toEqual({ state: plain(next), revision: second });
  });

  it("壊れた見出しや、欠けた切れ端は開かない", async () => {
    const state = workspace();
    const revision = await saveCloudState(UID, state, null);
    const broken = chunkPaths()[0]!;
    const data = store.docs.get(broken)!;
    store.docs.set(broken, { data: `${data.data as string} ` });
    await expect(loadCloudState(UID)).rejects.toThrow("構成を確認できません");
    store.docs.delete(broken);
    await expect(loadCloudState(UID)).rejects.toThrow("すべて読み込めませんでした");
    store.docs.set(MANIFEST, { revision, parts: { core: "?" } });
    await expect(loadCloudState(UID)).rejects.toThrow("構成を確認できません");
    await expect(saveCloudState(UID, state, revision)).rejects.toThrow("構成を確認できません");
  });
});
