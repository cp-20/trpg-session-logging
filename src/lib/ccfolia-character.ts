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
  if (depth > 4 || !isRecord(node)) return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "number" && Number.isFinite(v) && /^(HP|MP|SAN|DB|[A-Z]{2,4})$/i.test(k) && v >= -100 && v <= 999) {
      out[k] = v;
    } else if (isRecord(v) || Array.isArray(v)) {
      collectStats(v, out, depth + 1);
    }
  }
}

/** システムの推定: メモとコマンドから判定 */
function guessSystem(text: string): string | undefined {
  if (/CCB|CoC|クトゥルフ|1d100/i.test(text)) return "coc7";
  if (/SW2|キーパー|レンジャー/i.test(text)) return "sw2";
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
  const single = isRecord(root.name) ? [root] : [];
  const candidates = [...chars, ...single].filter((c): c is Candidate => isRecord(c) && typeof c.name === "string");
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
    color: str(c.color),
    memo: memo || undefined,
    systemId: guessSystem(memo + " " + commands),
    stats,
    image: undefined,
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
  /* imageId が一致するファイルを優先し、無ければ先頭の画像 */
  const match = parsed.imageId ? images.find((f) => f.name.startsWith(`images/${parsed.imageId}`)) : undefined;
  const img = match ?? images[0];
  const mime = /\.jpe?g$/i.test(img.name) ? "image/jpeg" : /\.svg$/i.test(img.name) ? "image/svg+xml" : "image/png";
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
