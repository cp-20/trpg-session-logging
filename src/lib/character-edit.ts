/**
 * キャラクターの編集（P3: 一つの事実に出所は一つ）。
 *
 * キャラシと結び付いたキャラクターは、名前・職業・能力値・技能をキャラシが持つ。卓譜で直せるのは
 * 卓譜だけが持つ項目（ひとこと紹介・タグ）とキャラシの URL だけで、編集の型にキャラシの項目を入れられない。
 */
import type { Character } from "../types";
import { parseExternalUrl } from "./external-sync";
import { cleanTags } from "./tags";

/** 卓譜だけが持つ項目 */
export interface CharacterOwnedEdit {
  bio: string;
  tags: string[];
  /** キャラシの URL。空なら結び付けを外す */
  sheetUrl: string;
}

/** キャラシと結び付いたキャラクターの編集。キャラシが持つ項目は持てない */
export interface LinkedCharacterEdit extends CharacterOwnedEdit {
  name?: never;
  archetype?: never;
  stats?: never;
}

/** キャラシのないキャラクターの編集。名前・職業・続く値（SAN など）も手で持つ */
export interface ManualCharacterEdit extends CharacterOwnedEdit {
  name: string;
  archetype: string;
  stats: Record<string, number>;
}

/** キャラシの URL の入力を確かめる。空は「外す」なので通す */
export function validateSheetUrl(raw: string): true | string {
  const t = raw.trim();
  if (!t) return true;
  const parsed = parseExternalUrl(t);
  if (!parsed.ok) return parsed.error;
  if (parsed.kind !== "character") return "キャラクターシートの URL を指定してください。";
  return true;
}

function applyOwned(ch: Character, v: CharacterOwnedEdit): void {
  ch.bio = v.bio.trim();
  ch.tags = cleanTags(v.tags);
  const url = v.sheetUrl.trim();
  if (!url) {
    delete ch.externalSync;
    return;
  }
  const parsed = parseExternalUrl(url);
  if (!parsed.ok || parsed.kind !== "character") return;
  const same = ch.externalSync?.url === parsed.displayUrl;
  /* URL を変えたら次に開いたときに読み直す（最終更新を消す） */
  ch.externalSync = {
    provider: parsed.provider,
    url: parsed.displayUrl,
    lastSyncedAt: same ? ch.externalSync?.lastSyncedAt : undefined,
    contentHash: same ? ch.externalSync?.contentHash : undefined,
    autoSync: true,
  };
}

export function applyLinkedEdit(ch: Character, v: LinkedCharacterEdit): void {
  applyOwned(ch, v);
}

/** `carriedKeys` は手で直せる続く値（システムの `carry`）。それ以外の値は受け取っても書かない */
export function applyManualEdit(ch: Character, v: ManualCharacterEdit, carriedKeys: readonly string[]): void {
  ch.name = v.name.trim();
  ch.archetype = v.archetype.trim();
  for (const key of carriedKeys) {
    const n = v.stats[key];
    if (typeof n === "number" && Number.isFinite(n)) ch.stats[key] = n;
  }
  applyOwned(ch, v);
}
