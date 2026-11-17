import type { Character } from "../types";

/**
 * CCFOLIA キャラクターJSON(コマの「クリップボードにコピー」/ 書き出しzip)の tolerant パーサー。
 * 名前・パラメータ・キャラ画像(imageId → zip 内 images/)を復元する。
 */

export interface ParsedCharacter {
  name: string;
  color?: string;
  memo?: string;
  /** 卓譜のシステムid(推定できなければ undefined) */
  systemId?: string;
  /** 数値パラメータ(HP/SAN等。キーは元JSONのまま) */
  stats: Record<string, number>;
  /** キャラ画像(data URL)。zip の images/ から復元した場合のみ入る */
  image?: string;
  /** コマJSONの画像参照id(zip 画像の解決に使う) */
  imageId?: string;
}

type Candidate = Record<string, unknown>;

function isRecord(v: unknown): v is Candidate {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** 数値パラメータの収集: params / status / parameters 配下の数値を拾う */
function collectStats(node: unknown, out: Record<string, number>, depth = 0): void {
  if (depth > 4) return;
  if (Array.isArray(node)) {
    node.forEach((entry) => collectStats(entry, out, depth + 1));
    return;
  }
  if (!isRecord(node)) return;
  if (typeof node.label === "string") {
    const value = typeof node.value === "number" ? node.value : typeof node.value === "string" && node.value.trim() ? Number(node.value) : NaN;
    if (Number.isFinite(value)) out[node.label.toLowerCase()] = value;
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "number" && Number.isFinite(v) && /^(HP|MP|SAN|DB|[A-Z]{2,4})$/i.test(k) && v >= -100 && v <= 999) {
      out[k.toLowerCase()] = v;
    } else if (isRecord(v) || Array.isArray(v)) {
      collectStats(v, out, depth + 1);
    }
  }
}

/** システムの推定: メモとコマンドから判定 */
function guessSystem(text: string): string | undefined {
  if (/CCB|クトゥルフ.*6|CoC\s*6/i.test(text)) return "coc6";
  if (/\bCC(?:<=|\s)|CoC\s*7|クトゥルフ.*7/i.test(text)) return "coc7";
  if (/SW2|ソード.?ワールド/i.test(text)) return "sw25";
  return undefined;
}

/** クリップボード形式の JSON を解析 */
export function parseCcfoliaCharacterJson(raw: string): ParsedCharacter | null {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(root)) return null;

  /* 形式A: {characters: {id: {...}}} (コマのクリップボード) */
  const chars = isRecord(root.characters) ? Object.values(root.characters) : [];
  /* 形式B: 単体キャラ({name, ...}) */
  const single = typeof root.name === "string" ? [root] : [];
  const clipboard = root.kind === "character" && isRecord(root.data) ? [root.data] : [];
  const candidates = [...clipboard, ...chars, ...single].filter((c): c is Candidate => isRecord(c) && typeof c.name === "string" && Boolean(c.name.trim()));
  if (candidates.length === 0) return null;

  const c = candidates[0];
  const stats: Record<string, number> = {};
  collectStats(c.params, stats);
  collectStats(c.status, stats);
  collectStats(c.parameters, stats);

  const memo = str(c.memo) ?? "";
  const commands = str(c.commands) ?? "";
  return {
    name: c.name as string,
    color: typeof c.color === "string" && /^#[\da-f]{6}$/i.test(c.color) ? c.color : undefined,
    memo: memo || undefined,
    systemId: guessSystem(memo + " " + commands),
    stats,
    image: typeof c.iconUrl === "string" && (/^https:\/\//i.test(c.iconUrl) || /^data:image\/(png|jpeg|gif|webp);base64,/i.test(c.iconUrl)) ? c.iconUrl : undefined,
    imageId: str(c.imageId),
  };
}

/** 書き出しzip: 直下のキャラJSON + images/{imageId} を1件復元 */
export async function parseCcfoliaCharacterZip(data: ArrayBuffer | Blob): Promise<ParsedCharacter | null> {
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return null;
  }
  const files = Object.values(zip.files).filter((f) => !f.dir);

  /* キャラJSONは複数入ることがある。最初に解析できた1件を採る */
  const jsons = files.filter((f) => f.name.endsWith(".json"));
  for (const f of jsons) {
    const parsed = parseCcfoliaCharacterJson(await f.async("string"));
    if (parsed) {
      await attachImage(zip, parsed);
      return parsed;
    }
  }
  /* JSONが無くても画像だけの zip は無視 */
  return null;
}

/** キャラJSONの imageId を zip 内の images/ から data URL に復元 */
async function attachImage(zip: import("jszip"), parsed: ParsedCharacter): Promise<void> {
  const images = Object.values(zip.files).filter((f) => !f.dir && /^images\//.test(f.name));
  if (images.length === 0) return;
  /* 別のキャラクターの画像を誤って使わない。参照先がなければ画像は付けない。 */
  const imageId = parsed.imageId ?? parsed.image?.split("/").at(-1)?.split("?")[0];
  if (!imageId) return;
  const img = images.find((f) => f.name === `images/${imageId}` || f.name.replace(/\.(png|jpe?g|gif|webp)$/i, "") === `images/${imageId}`);
  if (!img || !/\.(png|jpe?g|gif|webp)$/i.test(img.name)) return;
  const mime = /\.jpe?g$/i.test(img.name) ? "image/jpeg" : /\.gif$/i.test(img.name) ? "image/gif" : /\.webp$/i.test(img.name) ? "image/webp" : "image/png";
  const blob = new Blob([await img.async("arraybuffer")], { type: mime });
  parsed.image = await blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** 解析結果 → 卓譜 Character 型への変換(save で使う共通部分) */
export function toCharacterFields(parsed: ParsedCharacter, sysId: string) {
  return {
    name: parsed.name.trim() || "名前未設定",
    systemId: parsed.systemId ?? sysId,
    color: parsed.color ?? "#5348c8",
    bio: parsed.memo ?? "",
    stats: parsed.stats,
    image: parsed.image,
  } satisfies Partial<Character>;
}
