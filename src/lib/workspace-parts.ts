import type { State } from "../types";

/**
 * 記録一式の分け方。重いもの（セッションのログ・キャラクター）は 1 件ずつの部品にし、残りを基本の部品にまとめる。
 * クラウドへは部品ごとに保存し、中身の変わった部品だけを送受信する（src/lib/cloud-state.ts）。
 */
const CORE = "core";
const LOG = "log:";
const CHARACTER = "character:";

type CorePart = Omit<State, "logs" | "characters"> & {
  /** 並び順。部品の置き場所（Firestore の map）は順序を保たない */
  logIds: string[];
  characterIds: string[];
};

export function splitWorkspace(state: State): Map<string, object> {
  const { logs, characters, ...rest } = state;
  const core: CorePart = { ...rest, logIds: Object.keys(logs), characterIds: Object.keys(characters) };
  const parts = new Map<string, object>([[CORE, core]]);
  for (const [id, log] of Object.entries(logs)) parts.set(LOG + id, log);
  for (const [id, character] of Object.entries(characters)) parts.set(CHARACTER + id, character);
  return parts;
}

export function joinWorkspace(parts: ReadonlyMap<string, unknown>): State {
  const part = (key: string) => {
    const content = parts.get(key);
    if (!content) throw new Error("保存データをすべて読み込めませんでした。もう一度お試しください。");
    return content;
  };
  const { logIds, characterIds, ...rest } = part(CORE) as CorePart;
  return {
    ...rest,
    logs: Object.fromEntries(logIds.map((id) => [id, part(LOG + id)])),
    characters: Object.fromEntries(characterIds.map((id) => [id, part(CHARACTER + id)])),
  } as State;
}

/** 文字列の指紋（長さ + 64bit）。同じ部品の前の版と比べるためだけに使い、秘密は守らない */
export function textTag(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${text.length.toString(36)}-${hex(a)}${hex(b)}`;
}

const tags = new WeakMap<object, string>();

/** 中身の指紋。記録は書き換えずに作り直す（src/lib/draft.ts）ので、同じオブジェクトなら計算し直さない */
export function contentTag(content: object): string {
  let tag = tags.get(content);
  if (tag === undefined) {
    tag = textTag(JSON.stringify(content));
    tags.set(content, tag);
  }
  return tag;
}
