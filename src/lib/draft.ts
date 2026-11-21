/**
 * 構造共有（Copy-on-Write）ベースのイミュータブル更新ユーティリティ。
 * 変更されたパス上のオブジェクト・配列だけを浅くコピーし、未変更のサブツリーは元の参照を保つ。
 */

const DRAFT_STATE = Symbol("takufu.draft.state");

interface DraftState<T extends object = object> {
  base: T;
  copy: T | null;
  modified: boolean;
  parent: DraftState | null;
  parentKey: PropertyKey | null;
  children: Map<PropertyKey, DraftState>;
  proxy: T;
}

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isDraftable(value: unknown): value is object {
  return Array.isArray(value) || isPlainObject(value);
}

function shallowClone<T extends object>(value: T): T {
  return (Array.isArray(value) ? value.slice() : { ...value }) as T;
}

function getDraftState(value: unknown): DraftState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<symbol, DraftState | undefined>)[DRAFT_STATE];
}

function latest<T extends object>(state: DraftState<T>): T {
  return state.copy ?? state.base;
}

function prepareCopy<T extends object>(state: DraftState<T>): T {
  if (!state.copy) {
    state.copy = shallowClone(state.base);
  }
  return state.copy;
}

function markChanged(state: DraftState): void {
  if (state.modified) return;
  state.modified = true;
  prepareCopy(state);
  if (state.parent && state.parentKey !== null) {
    markChanged(state.parent);
    const parentCopy = prepareCopy(state.parent);
    Reflect.set(parentCopy, state.parentKey, state.copy);
  }
}

/** 外部から新しく代入された値の中に残ったドラフト Proxy を実体へ戻す */
function unwrapAssignedValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  const ds = getDraftState(value);
  if (ds) {
    return ds.modified ? latest(ds) : ds.base;
  }
  if (!isDraftable(value)) return value;
  if (seen.has(value)) return seen.get(value);
  seen.set(value, value);

  if (Array.isArray(value)) {
    let next: unknown[] | null = null;
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const unwrapped = unwrapAssignedValue(item, seen);
      if (unwrapped !== item) {
        if (!next) {
          next = value.slice();
          seen.set(value, next);
        }
        next[i] = unwrapped;
      }
    }
    return next ?? value;
  }

  const obj = value as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;
  for (const key of Object.keys(obj)) {
    const prop = obj[key];
    const unwrapped = unwrapAssignedValue(prop, seen);
    if (unwrapped !== prop) {
      if (!next) {
        next = { ...obj };
        seen.set(value, next);
      }
      next[key] = unwrapped;
    }
  }
  return next ?? value;
}

export function produceDraft<T>(base: T, recipe: (draft: T) => void): T {
  if (!isDraftable(base)) {
    recipe(base);
    return base;
  }

  const revokers: (() => void)[] = [];

  function createDraft<U extends object>(
    target: U,
    parent: DraftState | null,
    parentKey: PropertyKey | null,
  ): DraftState<U> {
    const state: DraftState<U> = {
      base: target,
      copy: null,
      modified: false,
      parent,
      parentKey,
      children: new Map(),
      proxy: null as unknown as U,
    };

    const shadow = Object.isExtensible(target) ? target : shallowClone(target);
    const { proxy, revoke } = Proxy.revocable(shadow, {
      get(_t, prop, receiver) {
        if (prop === DRAFT_STATE) return state;
        const src = latest(state);
        const value = Reflect.get(src, prop, receiver);
        if (typeof value === "function") return value;
        if (!isDraftable(value)) return value;

        // 自分の所有プロパティだけ子ドラフト化する（プロトタイプ上のオブジェクト等はそのまま）
        const own = Object.prototype.hasOwnProperty.call(src, prop);
        if (!own) return value;

        let child = state.children.get(prop);
        if (!child || (child.copy ?? child.base) !== value) {
          child = createDraft(value as object, state, prop);
          state.children.set(prop, child);
        }
        return child.proxy;
      },

      set(_t, prop, value) {
        const src = latest(state);
        const existing = Reflect.get(src, prop);
        const unwrapped = unwrapAssignedValue(value, new WeakMap());

        // 同値代入でかつ既存の所有プロパティがある場合はコピーを作らない
        if (
          Object.is(existing, unwrapped) &&
          (Object.prototype.hasOwnProperty.call(src, prop) || (Array.isArray(src) && prop === "length"))
        ) {
          return true;
        }

        const copy = prepareCopy(state);
        markChanged(state);
        state.children.delete(prop);
        return Reflect.set(copy, prop, unwrapped);
      },

      deleteProperty(_t, prop) {
        const src = latest(state);
        if (!Object.prototype.hasOwnProperty.call(src, prop)) {
          return true;
        }
        const copy = prepareCopy(state);
        markChanged(state);
        state.children.delete(prop);
        return Reflect.deleteProperty(copy, prop);
      },

      has(_t, prop) {
        return prop in latest(state);
      },

      ownKeys() {
        return Reflect.ownKeys(latest(state));
      },

      getOwnPropertyDescriptor(_t, prop) {
        const desc = Reflect.getOwnPropertyDescriptor(latest(state), prop);
        if (!desc) return undefined;
        return desc;
      },

      defineProperty(_t, prop, descriptor) {
        const copy = prepareCopy(state);
        markChanged(state);
        state.children.delete(prop);
        if ("value" in descriptor) {
          descriptor = { ...descriptor, value: unwrapAssignedValue(descriptor.value, new WeakMap()) };
        }
        return Reflect.defineProperty(copy, prop, descriptor);
      },
    });

    state.proxy = proxy;
    revokers.push(revoke);
    return state;
  }

  function finalize(state: DraftState, unwrapSeen: WeakMap<object, unknown>): unknown {
    if (!state.modified) return state.base;
    const copy = state.copy!;
    // 変更されたノード内の、新しく挿入された値（子ドラフトが混ざっている可能性）を整える
    for (const key of Object.keys(copy)) {
      const val = Reflect.get(copy, key);
      const child = state.children.get(key);
      if (child && child.modified && val === child.copy) {
        finalize(child, unwrapSeen);
      } else if (val !== Reflect.get(state.base, key)) {
        const cleaned = unwrapAssignedValue(val, unwrapSeen);
        if (cleaned !== val) Reflect.set(copy, key, cleaned);
      }
    }
    return copy;
  }

  const root = createDraft(base as object, null, null);
  try {
    recipe(root.proxy as T);
    return finalize(root, new WeakMap()) as T;
  } finally {
    for (const revoke of revokers) revoke();
  }
}
