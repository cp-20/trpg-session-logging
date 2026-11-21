import type { Channel, Msg, MsgKind } from "../types";
import {
  parseCcfoliaCharacterJson,
  parseCcfoliaCharacterZip,
  toCharacterFields,
  type ParsedCharacter,
} from "./ccfolia-character";
import {
  parseCcfoliaLog,
  parseCcfoliaLogHtml,
  parseCcfoliaLogZip,
  sessionDatesOf,
  summarizeParsed,
  type LogEntry,
  type ParsedLog,
} from "./ccfolia-parser";
import { jstEpoch, todayStr } from "./format";
import type { SheetProvider } from "./sheet";
import {
  parseCharaenoJson,
  parseCharashJson,
  sheetFromCharasheet,
  sheetFromStats,
  sheetFromYtsheet,
} from "./sheet-sources";
import {
  parseUdonariumCharacterFallback,
  parseUdonariumChatsFallback,
  type FallbackUdonariumCharData,
} from "./html-xml-fallback";

export { toCharacterFields, sessionDatesOf, summarizeParsed };
export type { ParsedCharacter, ParsedLog };

export interface CharacterImportResult {
  character: ParsedCharacter;
  sourceLabel: string;
}

export interface LogImportResult {
  log: ParsedLog;
  sourceLabel: string;
}

type Candidate = Record<string, unknown>;

function isRecord(v: unknown): v is Candidate {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(t)) {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function normalizeStatKey(raw: string): string {
  const k = raw.trim();
  if (/^[A-Z]{2,5}$/i.test(k)) return k.toLowerCase();
  if (k === "SAN値" || k === "正気度") return "san";
  return k;
}

export function guessSystemFromText(text: string): string | undefined {
  if (/Cthulhu7th|クトゥルフ.*7|CoC\s*7|7版/i.test(text)) return "coc7";
  if (/Cthulhu|CCB|クトゥルフ.*6|CoC\s*6|6版/i.test(text)) return "coc6";
  if (/SwordWorld|SW2|ソード.?ワールド/i.test(text)) return "sw25";
  if (/Emoklore|エモクロア|共鳴/i.test(text)) return "emoklore";
  if (/\bCC(?:<=|\s)/i.test(text)) return "coc7";
  return undefined;
}

function mapKind(sp: string, explicit?: string): MsgKind {
  const e = explicit?.toUpperCase();
  if (e === "PC" || e === "NPC" || e === "KP" || e === "PL" || e === "GM" || e === "SYSTEM") {
    return e as MsgKind;
  }
  if (/^(KP|GM)[\s:：]/i.test(sp) || sp === "KP" || sp === "GM") return "KP";
  if (sp.toLowerCase() === "system") return "SYSTEM";
  return "PC";
}

function assembleLogEntries(entries: LogEntry[]): ParsedLog | null {
  if (entries.length === 0) return null;
  const msgs: Msg[] = entries.map(
    (e, i) =>
      ({
        id: `p${i}`,
        ts: e.ts,
        sp: e.sp,
        kind: e.kind,
        type: e.type === "note" ? "note" : "text",
        text: e.text,
        ...(e.roll ? { roll: e.roll } : {}),
      }) as Msg,
  );

  const groups = new Map<string, Msg[]>();
  msgs.forEach((m, i) => {
    const rawCh = entries[i]!.channel;
    const arr = groups.get(rawCh) ?? [];
    arr.push(m);
    groups.set(rawCh, arr);
  });
  groups.forEach((arr) => arr.sort((a, b) => a.ts - b.ts));

  const nameFor = (raw: string, speakerCount: number): { name: string; secret: boolean } => {
    const lower = raw.toLowerCase();
    if (lower === "main" || raw === "メイン" || lower.includes("main")) {
      return { name: "メイン", secret: false };
    }
    if (lower === "info" || raw === "情報" || raw.includes("info")) {
      return { name: "情報", secret: false };
    }
    if (lower === "chat" || raw === "チャット" || raw.includes("chat") || raw === "雑談") {
      return { name: "チャット", secret: false };
    }
    return { name: raw, secret: speakerCount <= 2 };
  };

  const channels: Channel[] = [...groups.entries()]
    .map(([key, gmsgs]) => {
      const speakers = new Set(gmsgs.map((m) => m.sp));
      const { name, secret } = nameFor(key, speakers.size);
      return { id: key, name, secret, msgs: gmsgs };
    })
    .sort((a, b) => (a.name === "メイン" ? -1 : b.name === "メイン" ? 1 : 0));

  const kinds: Record<string, MsgKind> = {};
  channels.forEach((c) => c.msgs.forEach((m) => (kinds[m.sp] = m.kind)));

  const messageCount = channels.reduce((a, c) => a + c.msgs.length, 0);
  return { channels, kinds, messageCount };
}

/** 呼び出し元で DOMParser の有無を確かめてから使う */
function parseXmlDoc(raw: string): Document | null {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  return doc;
}

function arrayBufferToDataUrl(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function imageMimeFromName(name: string): string | null {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.webp$/i.test(name)) return "image/webp";
  return null;
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Response(file).text();
}

async function readFileArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Response(file).arrayBuffer();
}

/* ============================================================
   キャラクター取り込み:
   1. CCFOLIA JSON
   2. キャラクター保管所 JSON
   3. いあきゃら テキスト
   4. Udonarium XML
   ============================================================ */

const CHARASHEET_NP_MAP: Record<string, string> = {
  NP1: "str",
  NP2: "con",
  NP3: "pow",
  NP4: "dex",
  NP5: "app",
  NP6: "siz",
  NP7: "int",
  NP8: "edu",
  NP9: "hp",
  NP10: "mp",
  NP11: "san",
  NP12: "idea",
  NP13: "luck",
  NP14: "know",
};

export function parseCharasheetJson(raw: string): ParsedCharacter | null {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(root)) return null;
  const pcName = str(root.pc_name)?.trim();
  if (!pcName) return null;

  const stats: Record<string, number> = {};
  for (const [npKey, statKey] of Object.entries(CHARASHEET_NP_MAP)) {
    const v = num(root[npKey]);
    if (v !== undefined) stats[statKey] = v;
  }

  // 直接の SAN / HP / MP があれば優先
  const directPairs: [string, string[]][] = [
    ["san", ["SAN_Left", "SAN", "san"]],
    ["hp", ["HP", "hp"]],
    ["mp", ["MP", "mp"]],
  ];
  for (const [key, fields] of directPairs) {
    for (const f of fields) {
      const v = num(root[f]);
      if (v !== undefined) {
        stats[key] = v;
        break;
      }
    }
  }

  const works = str(root.works)?.trim();
  const shuzoku = str(root.shuzoku)?.trim();
  const makingMemo = str(root.pc_making_memo)?.trim();
  const memoLines: string[] = [];
  if (works) memoLines.push(`職業: ${works}`);
  else if (shuzoku) memoLines.push(`種族: ${shuzoku}`);
  if (makingMemo) memoLines.push(makingMemo);

  const game = str(root.game)?.toLowerCase() ?? "";
  let systemId: string | undefined;
  if (game.includes("coc7") || game.includes("7")) systemId = "coc7";
  else if (game === "coc" || game.includes("coc6")) systemId = "coc6";
  else if (game.includes("sw2")) systemId = "sw25";
  else if (game.includes("emo")) systemId = "emoklore";
  else if (shuzoku && stats.san === undefined) systemId = "sw25";
  else if (stats.san !== undefined || root.NP11 !== undefined) {
    systemId = (stats.str ?? 0) >= 25 || (stats.edu ?? 0) >= 25 ? "coc7" : "coc6";
  }

  return {
    name: pcName,
    memo: memoLines.join("\n") || undefined,
    systemId,
    stats,
  };
}

export function parseIacharaText(raw: string): ParsedCharacter | null {
  const nameMatch = raw.match(/^名前\s*[:：]\s*(.+)$/m);
  if (!nameMatch) return null;

  const hasMarker =
    /^職業\s*[:：]/m.test(raw) ||
    /【(?:能力値|ステータス|技能|メモ|基本情報|プロフィール)】/.test(raw) ||
    /\b(?:SAN|HP|MP)\s*[:：]\s*\d+/i.test(raw);
  if (!hasMarker) return null;

  const name = nameMatch[1]!.trim();
  if (!name) return null;

  const occMatch = raw.match(/^職業\s*[:：]\s*(.+)$/m);
  const occupation = occMatch?.[1]?.trim();

  // セクション分割
  const sections = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  let currentSection = "__header__";
  const buf: Record<string, string[]> = { __header__: [] };
  for (const line of lines) {
    const sec = line.match(/^【([^】]+)】\s*$/);
    if (sec) {
      currentSection = sec[1]!.trim();
      buf[currentSection] ??= [];
      continue;
    }
    buf[currentSection]!.push(line);
  }
  for (const [k, arr] of Object.entries(buf)) {
    sections.set(k, arr.join("\n").trim());
  }

  const stats: Record<string, number> = {};

  // 能力値・ステータス・ヘッダから数値キーを抽出
  const statSources = [
    sections.get("__header__") ?? "",
    sections.get("能力値") ?? "",
    sections.get("ステータス") ?? "",
  ].join("\n");

  const statRe = /\b(STR|CON|POW|DEX|APP|SIZ|INT|EDU|HP|MP|SAN|LUCK|IDEA|KNOW)\b\s*(?:[:：]\s*|\s+)(\d+)/gi;
  for (const m of statSources.matchAll(statRe)) {
    stats[m[1]!.toLowerCase()] = Number(m[2]);
  }
  // 日本語キー: SAN値: 65 / 幸運: 50
  const jpStatRe = /(SAN値|正気度|幸運|アイデア|知識)\s*[:：]\s*(\d+)/g;
  for (const m of statSources.matchAll(jpStatRe)) {
    const key = m[1] === "SAN値" || m[1] === "正気度" ? "san" : m[1]!;
    stats[key] = Number(m[2]);
  }

  // 【技能】から技能値を抽出
  const skillText = sections.get("技能") ?? "";
  if (skillText) {
    for (const line of skillText.split(/\r?\n/)) {
      const skillRe = /([^\s:：()（）【】\d]+(?:\([^)]+\)|（[^）]+）)?)\s*[:：\s]\s*(\d{1,3})%?/g;
      for (const m of line.matchAll(skillRe)) {
        // m[1] は空白以外で始まり ) / ） か技能名の文字で終わる。m[2] は 3 桁までの数字。
        stats[m[1]!] = Number(m[2]);
      }
    }
  }

  const memoBody = sections.get("メモ") ?? sections.get("探索者メモ") ?? sections.get("プロフィール") ?? "";
  const memoLines: string[] = [];
  if (occupation) memoLines.push(`職業: ${occupation}`);
  if (memoBody) memoLines.push(memoBody);

  let systemId = guessSystemFromText(raw);
  if (!systemId && (stats.san !== undefined || sections.has("技能"))) {
    const strVal = stats.str ?? 0;
    const eduVal = stats.edu ?? 0;
    systemId = strVal > 0 && strVal <= 21 && eduVal <= 21 ? "coc6" : "coc7";
  }

  return {
    name,
    memo: memoLines.join("\n") || undefined,
    systemId,
    stats,
  };
}

function buildUdonariumCharacter(
  leafData: FallbackUdonariumCharData[],
  dicebot: string,
  paletteText: string,
): ParsedCharacter | null {
  let name = "";
  let imageId: string | undefined;
  let memo = "";
  const stats: Record<string, number> = {};

  for (const item of leafData) {
    const { dataName, dataType, currentValue, text: textVal } = item;
    if (dataName === "name" && textVal && !name) {
      name = textVal;
      continue;
    }
    if (dataName === "imageIdentifier" && textVal && textVal !== "none") {
      imageId = textVal;
      continue;
    }
    if (
      (dataName === "メモ" || dataName === "memo" || dataName === "説明" || dataType === "note") &&
      textVal
    ) {
      memo = memo ? `${memo}\n${textVal}` : textVal;
      continue;
    }
    if (dataName === "size") continue;

    const rawNum = currentValue !== null && currentValue.trim() !== "" ? currentValue : textVal;
    const parsedNum = num(rawNum);
    if (dataName && parsedNum !== undefined) {
      stats[normalizeStatKey(dataName)] = parsedNum;
    }
  }

  if (!name) return null;

  const systemId = guessSystemFromText(`${dicebot} ${paletteText} ${memo}`);

  return {
    name,
    memo: memo || undefined,
    systemId,
    stats,
    ...(imageId ? { imageId } : {}),
  };
}

function parseUdonariumCharacterXml(raw: string): ParsedCharacter | null {
  if (!/^\uFEFF?\s*</.test(raw) || !/<character\b/i.test(raw)) return null;
  if (typeof DOMParser === "undefined") {
    const parsed = parseUdonariumCharacterFallback(raw);
    if (!parsed) return null;
    return buildUdonariumCharacter(parsed.leafData, parsed.dicebot, parsed.paletteText);
  }
  const doc = parseXmlDoc(raw);
  if (!doc) return null;
  const root = doc.querySelector("character");
  if (!root) return null;

  const leafData: FallbackUdonariumCharData[] = [];
  for (const el of root.querySelectorAll("data")) {
    if (el.querySelector(":scope > data") !== null) continue;
    leafData.push({
      dataName: (el.getAttribute("name") ?? "").trim(),
      dataType: (el.getAttribute("type") ?? "").trim(),
      currentValue: el.getAttribute("currentValue"),
      text: (el.textContent ?? "").trim(),
    });
  }

  const palette = root.querySelector("chat-palette");
  const dicebot = palette?.getAttribute("dicebot") ?? "";
  const paletteText = palette?.textContent ?? "";
  return buildUdonariumCharacter(leafData, dicebot, paletteText);
}

export function parseYtsheetJson(raw: string): ParsedCharacter | null {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(root)) return null;
  const name = (str(root.characterName) ?? str(root.pcName) ?? str(root.name))?.trim();
  if (!name) return null;

  const isYtsheet =
    root.characterName !== undefined ||
    root.sttStr !== undefined ||
    root.hpTotal !== undefined ||
    root.lv !== undefined ||
    root.level !== undefined ||
    root.gameSystem !== undefined ||
    root.ver !== undefined;
  if (!isYtsheet) return null;

  const stats: Record<string, number> = {};
  const ytStatPairs: [string, string[]][] = [
    ["hp", ["hpTotal", "HP", "hp", "statusHp"]],
    ["mp", ["mpTotal", "MP", "mp", "statusMp"]],
    ["san", ["sanTotal", "SAN", "san", "sanLeft"]],
    ["str", ["sttStr", "STR", "statusStr"]],
    ["dex", ["sttDex", "DEX", "statusDex"]],
    ["agi", ["sttAgi", "AGI"]],
    ["vit", ["sttVit", "CON", "statusCon"]],
    ["int", ["sttInt", "INT", "statusInt"]],
    ["mnd", ["sttMnd", "POW", "statusPow"]],
  ];
  for (const [statKey, candidates] of ytStatPairs) {
    for (const key of candidates) {
      const val = num(root[key]);
      if (val !== undefined) {
        stats[statKey] = val;
        break;
      }
    }
  }

  const race = str(root.race)?.trim();
  const job = (str(root.job) ?? str(root.class) ?? str(root.works))?.trim();
  const level = str(root.level) ?? str(root.lv);
  const note = (str(root.freeNote) ?? str(root.profile) ?? str(root.memo))?.trim();

  const memoLines: string[] = [];
  if (race || job)
    memoLines.push([race && `種族: ${race}`, job && `職業: ${job}`].filter(Boolean).join(" / "));
  if (level) memoLines.push(`Lv.${level}`);
  if (note) memoLines.push(note.replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "\n"));

  const gameHint = `${str(root.gameSystem) ?? ""} ${race ?? ""} ${job ?? ""} ${note ?? ""}`;
  let systemId = guessSystemFromText(gameHint);
  if (!systemId) {
    if (root.sttAgi !== undefined || root.sttMnd !== undefined || race) systemId = "sw25";
    else if (stats.san !== undefined) systemId = (stats.str ?? 0) >= 25 ? "coc7" : "coc6";
  }

  const imgRaw = str(root.imageURL) ?? str(root.imageUrl);
  const image = imgRaw && /^https:\/\//i.test(imgRaw.trim()) ? imgRaw.trim() : undefined;

  return {
    name,
    memo: memoLines.join("\n") || undefined,
    systemId,
    stats,
    ...(image ? { image } : {}),
  };
}

export function parseEmokloreCharacter(raw: string): ParsedCharacter | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    let root: unknown;
    try {
      root = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (!isRecord(root)) return null;
    const isEmo =
      str(root.system)?.toLowerCase().includes("emo") ||
      root.resonance !== undefined ||
      root.taisyo !== undefined ||
      root.von !== undefined ||
      root.emotion !== undefined;
    if (!isEmo) return null;
    const name = (str(root.name) ?? str(root.characterName))?.trim();
    if (!name) return null;
    const stats: Record<string, number> = {};
    const von = num(root.von ?? root.resonance);
    const taisyo = num(root.taisyo ?? root.ego);
    const hp = num(root.hp ?? root.HP);
    if (von !== undefined) stats.von = von;
    if (taisyo !== undefined) stats.taisyo = taisyo;
    if (hp !== undefined) stats.hp = hp;
    if (isRecord(root.skills)) {
      for (const [k, v] of Object.entries(root.skills)) {
        const n = num(v);
        if (n !== undefined) stats[k] = n;
      }
    }
    const memoParts = [
      str(root.roots) ? `ルーツ: ${str(root.roots)}` : "",
      str(root.emotion) ? `共鳴感情: ${str(root.emotion)}` : "",
      str(root.memo) ?? "",
    ].filter(Boolean);
    return {
      name,
      memo: memoParts.join("\n") || undefined,
      systemId: "emoklore",
      stats,
    };
  }

  const isEmoText = /共鳴者|共鳴感情|DM<=|emoklore|エモクロア/i.test(trimmed);
  if (!isEmoText) return null;
  const nameMatch = trimmed.match(/^(?:共鳴者名|名前)\s*[:：]\s*(.+)$/m);
  if (!nameMatch) return null;
  const name = nameMatch[1]!.trim();
  if (!name) return null;

  const stats: Record<string, number> = {};
  const vonMatch = trimmed.match(/共鳴(?:度)?\s*[:：]?\s*(\d+)/);
  if (vonMatch) stats.von = Number(vonMatch[1]);
  const hpMatch = trimmed.match(/HP\s*[:：]?\s*(\d+)/i);
  if (hpMatch) stats.hp = Number(hpMatch[1]);
  for (const m of trimmed.matchAll(/〈([^〉]+)〉\s*(?:\[(\d+)\]|[:：]?\s*(\d+))/g)) {
    stats[m[1]!.trim()] = Number(m[2] ?? m[3]);
  }
  const occ = trimmed.match(/^(?:職業|ルーツ)\s*[:：]\s*(.+)$/m)?.[1]?.trim();
  const emo = trimmed.match(/^共鳴感情\s*[:：]\s*(.+)$/m)?.[1]?.trim();
  const memoLines = [occ && `職業: ${occ}`, emo && `共鳴感情: ${emo}`].filter(Boolean) as string[];
  return {
    name,
    memo: memoLines.join("\n") || undefined,
    systemId: "emoklore",
    stats,
  };
}

/** 数値だけの取り込みにも汎用シートを付ける（キャラシの見せ方を同じにする） */
function withStatsSheet(c: ParsedCharacter, provider: SheetProvider): ParsedCharacter {
  if (c.sheet) return c;
  const sheet = sheetFromStats(c.stats, provider, c.systemId);
  return sheet ? { ...c, sheet } : c;
}

function jsonOrNull(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function importCharacterFromText(raw: string): CharacterImportResult | null {
  const result = importCharacterFromTextRaw(raw);
  if (!result) return null;
  const provider: SheetProvider =
    result.sourceLabel === "Udonarium"
      ? "udonarium"
      : result.sourceLabel === "いあきゃら"
        ? "iachara"
        : result.sourceLabel === "エモクロア"
          ? "emoklore"
          : "text";
  return { ...result, character: withStatsSheet(result.character, provider) };
}

function importCharacterFromTextRaw(raw: string): CharacterImportResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 0. キャラッシュ（書き出した JSON）・キャラエノ（API の JSON）
  if (trimmed.startsWith("{")) {
    const root = jsonOrNull(trimmed);
    const charash = root ? parseCharashJson(root) : null;
    if (charash) return { character: charash, sourceLabel: "キャラッシュ" };
    const charaeno = root ? parseCharaenoJson(root) : null;
    if (charaeno) return { character: charaeno, sourceLabel: "キャラエノ" };
  }

  // 1. ゆとシートⅡ JSON (characterName / sttStr 等を優先判定)
  const ytsheet = parseYtsheetJson(trimmed);
  if (ytsheet) {
    const sheet = sheetFromYtsheet(jsonOrNull(trimmed));
    return { character: sheet ? { ...ytsheet, sheet } : ytsheet, sourceLabel: "ゆとシートⅡ" };
  }

  // 2. キャラクター保管所 JSON (pc_name 優先判定)
  const charasheet = parseCharasheetJson(trimmed);
  if (charasheet) {
    const sheet = sheetFromCharasheet(jsonOrNull(trimmed));
    return { character: sheet ? { ...charasheet, sheet } : charasheet, sourceLabel: "キャラクター保管所" };
  }

  // 3. エモクロアキャラクターシート JSON / テキスト
  const emoklore = parseEmokloreCharacter(trimmed);
  if (emoklore) {
    return { character: emoklore, sourceLabel: "エモクロア" };
  }

  // 4. CCFOLIA JSON
  const ccfolia = parseCcfoliaCharacterJson(trimmed);
  if (ccfolia) {
    return { character: ccfolia, sourceLabel: "CCFOLIA" };
  }

  // 5. Udonarium XML
  const udonarium = parseUdonariumCharacterXml(trimmed);
  if (udonarium) {
    return { character: udonarium, sourceLabel: "Udonarium" };
  }

  // 6. いあきゃら テキスト
  const iachara = parseIacharaText(trimmed);
  if (iachara) {
    return { character: iachara, sourceLabel: "いあきゃら" };
  }

  return null;
}

/** 複数キャラを含む JSON 配列・テキスト・区切りブロックをまとめて読み取る */
export function importCharactersFromText(raw: string): CharacterImportResult[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const results: CharacterImportResult[] = [];
        for (const item of arr) {
          const single = importCharacterFromText(JSON.stringify(item));
          if (single) results.push(single);
        }
        return results;
      }
    } catch {
      /* 配列 JSON でなければ単体または分割テキストとして扱う */
    }
  }
  const blocks = trimmed
    .split(/\n-{3,}\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    const blockResults = blocks
      .map((b) => importCharacterFromText(b))
      .filter((r): r is CharacterImportResult => Boolean(r));
    if (blockResults.length > 1) return blockResults;
  }
  const single = importCharacterFromText(trimmed);
  return single ? [single] : [];
}

/** 複数ファイル・ZIP アーカイブ内の全キャラを一括で取り込む */
export async function importCharactersFromFiles(files: FileList | File[]): Promise<CharacterImportResult[]> {
  const list = Array.from(files);
  const out: CharacterImportResult[] = [];

  for (const file of list) {
    const lowerName = file.name.toLowerCase();
    const isZip =
      lowerName.endsWith(".zip") ||
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed";

    if (!isZip) {
      const text = await readFileText(file);
      out.push(...importCharactersFromText(text));
      continue;
    }

    const buf = await readFileArrayBuffer(file);
    const JSZip = (await import("jszip")).default;
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
    try {
      zip = await JSZip.loadAsync(buf);
    } catch {
      continue;
    }
    const entries = Object.values(zip.files).filter((f) => !f.dir);

    for (const f of entries.filter((entry) => /\.xml$/i.test(entry.name))) {
      const parsed = parseUdonariumCharacterXml(await f.async("string"));
      if (!parsed) continue;
      if (parsed.imageId) {
        const imgFile = entries.find((img) => {
          const mime = imageMimeFromName(img.name);
          if (!mime) return false;
          const base = img.name.split("/").pop() ?? "";
          const stem = base.replace(/\.(png|jpe?g|gif|webp)$/i, "");
          return stem === parsed.imageId || base === parsed.imageId;
        });
        if (imgFile) {
          parsed.image = arrayBufferToDataUrl(
            await imgFile.async("arraybuffer"),
            imageMimeFromName(imgFile.name)!,
          );
        }
      }
      out.push({ character: parsed, sourceLabel: "Udonarium" });
    }

    for (const f of entries.filter((entry) => /\.(json|txt)$/i.test(entry.name))) {
      const items = importCharactersFromText(await f.async("string"));
      for (const item of items) {
        if (item.sourceLabel === "CCFOLIA" && item.character.imageId && !item.character.image) {
          const img = entries.find((imgEntry) => {
            const mime = imageMimeFromName(imgEntry.name);
            if (!mime) return false;
            return (
              imgEntry.name === `images/${item.character.imageId}` ||
              imgEntry.name.replace(/\.(png|jpe?g|gif|webp)$/i, "") === `images/${item.character.imageId}`
            );
          });
          if (img) {
            item.character.image = arrayBufferToDataUrl(
              await img.async("arraybuffer"),
              imageMimeFromName(img.name)!,
            );
          }
        }
        out.push(item);
      }
    }
  }
  return out;
}

export async function importCharacterFromFile(file: File): Promise<CharacterImportResult | null> {
  const lowerName = file.name.toLowerCase();
  const isZip =
    lowerName.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  if (isZip) {
    const buf = await readFileArrayBuffer(file);
    const ccfoliaZip = await parseCcfoliaCharacterZip(buf);
    if (ccfoliaZip) {
      return { character: ccfoliaZip, sourceLabel: "CCFOLIA" };
    }

    const JSZip = (await import("jszip")).default;
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
    try {
      zip = await JSZip.loadAsync(buf);
    } catch {
      return null;
    }

    const files = Object.values(zip.files).filter((f) => !f.dir);

    // Udonarium XML in zip (+ 画像解決)
    const xmlFiles = files.filter((f) => /\.xml$/i.test(f.name));
    for (const xmlFile of xmlFiles) {
      const parsed = parseUdonariumCharacterXml(await xmlFile.async("string"));
      if (!parsed) continue;
      if (parsed.imageId) {
        const imgFile = files.find((f) => {
          const mime = imageMimeFromName(f.name);
          if (!mime) return false;
          const base = f.name.split("/").pop() ?? "";
          const stem = base.replace(/\.(png|jpe?g|gif|webp)$/i, "");
          return stem === parsed.imageId || base === parsed.imageId;
        });
        if (imgFile) {
          const mime = imageMimeFromName(imgFile.name)!;
          parsed.image = arrayBufferToDataUrl(await imgFile.async("arraybuffer"), mime);
        }
      }
      return { character: parsed, sourceLabel: "Udonarium" };
    }

    // テキスト系ファイル (JSON / TXT)
    for (const f of files.filter((entry) => /\.(json|txt)$/i.test(entry.name))) {
      const res = importCharacterFromText(await f.async("string"));
      if (res) return res;
    }

    return null;
  }

  const text = await readFileText(file);
  return importCharacterFromText(text);
}

/* ============================================================
   セッションログ取り込み:
   1. CCFOLIA JSON / HTML
   2. Udonarium chat.xml
   3. 汎用 / Tekey テキストログ
   ============================================================ */

function parseTimestampAttr(raw: string | null): number {
  if (!raw) return 0;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 1e12 ? Math.floor(n / 1000) : n > 1e9 ? n : 0;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

function parseUdonariumChatXml(raw: string): ParsedLog | null {
  if (!/^\uFEFF?\s*</.test(raw) || !/<chat\b/i.test(raw)) return null;
  if (typeof DOMParser === "undefined") {
    const entries: LogEntry[] = [];
    for (const chat of parseUdonariumChatsFallback(raw)) {
      if (!chat.text) continue;
      const sp = chat.name || "不明な発言者";
      const tab = chat.tab || "メイン";
      const ts = parseTimestampAttr(chat.time);
      const kind = mapKind(sp, chat.type);
      entries.push({
        sp,
        text: chat.text,
        ts,
        kind,
        type: chat.text.startsWith("◆") ? "note" : "text",
        channel: tab,
      });
    }
    return assembleLogEntries(entries);
  }

  let doc: Document | null = parseXmlDoc(raw);
  if (!doc) {
    const htmlDoc = new DOMParser().parseFromString(raw, "text/html");
    if (htmlDoc.querySelector("chat")) doc = htmlDoc;
  }
  if (!doc) return null;

  const chats = [...doc.querySelectorAll("chat")];
  if (chats.length === 0) return null;

  const entries: LogEntry[] = [];
  for (const el of chats) {
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const sp = (el.getAttribute("name") ?? el.getAttribute("from") ?? "").trim() || "不明な発言者";
    const tab = (el.getAttribute("tab") ?? "").trim() || "メイン";
    const ts = parseTimestampAttr(el.getAttribute("time") ?? el.getAttribute("timestamp"));
    const typeAttr = (el.getAttribute("type") ?? "").trim().toLowerCase();
    const kind = mapKind(sp, typeAttr);
    entries.push({
      sp,
      text,
      ts,
      kind,
      type: text.startsWith("◆") ? "note" : "text",
      channel: tab,
    });
  }

  return assembleLogEntries(entries);
}

function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function parsePlainTextLog(raw: string): ParsedLog | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // XML/HTML や JSON がパース失敗したものを誤ってテキストログ扱いしない
  if (trimmed.startsWith("{") || trimmed.startsWith("<")) {
    return null;
  }
  if (trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return null;
    } catch {
      /* [メイン] のようなチャンネル表記は許容する */
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const entries: LogEntry[] = [];
  let baseDate = todayStr();
  let lastMinuteOfDay = -1;
  let lastTs = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    let rest = line;
    let channel = "メイン";
    let ts = 0;

    // 先頭 [チャンネル] (時刻の形式 [21:05] ではない場合)
    const tabMatch = rest.match(/^\[([^\]\d][^\]]*)\]\s*(.+)$/);
    if (tabMatch) {
      channel = tabMatch[1]!.trim() || "メイン";
      rest = tabMatch[2]!.trim();
    }

    // 日付+時刻 (YYYY/MM/DD HH:mm(:ss)? または YYYY-MM-DD HH:mm(:ss)?)
    const fullDtMatch = rest.match(
      /^\[?(\d{4})[/-](\d{1,2})[/-](\d{1,2})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s+(.+)$/,
    );
    if (fullDtMatch) {
      const dateStr = `${fullDtMatch[1]}-${fullDtMatch[2]!.padStart(2, "0")}-${fullDtMatch[3]!.padStart(2, "0")}`;
      const hhmm = `${fullDtMatch[4]!.padStart(2, "0")}:${fullDtMatch[5]}`;
      const sec = Number(fullDtMatch[6] ?? 0);
      ts = jstEpoch(dateStr, hhmm) + sec;
      lastTs = ts;
      rest = fullDtMatch[7]!.trim();
    } else {
      // 時刻のみ (HH:mm(:ss)? または [HH:mm])
      const timeMatch = rest.match(/^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s+(.+)$/);
      if (timeMatch) {
        const hh = Number(timeMatch[1]);
        const mm = Number(timeMatch[2]);
        const sec = Number(timeMatch[3] ?? 0);
        if (hh <= 29 && mm <= 59) {
          const mod = hh * 60 + mm;
          if (lastMinuteOfDay >= 0 && mod + 720 < lastMinuteOfDay) {
            baseDate = addDays(baseDate, 1);
          }
          lastMinuteOfDay = mod;
          ts = jstEpoch(baseDate, `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`) + sec;
          lastTs = ts;
          rest = timeMatch[4]!.trim();
        }
      }
    }

    if (ts === 0 && lastTs > 0) {
      ts = lastTs;
    }

    let sp = "";
    let text = "";

    // 名前「本文」 または 名前: 本文
    const quoteMatch = rest.match(/^([^「」\s:：][^「」]{0,30}?)「(.+)」$/);
    if (quoteMatch) {
      sp = quoteMatch[1]!.trim();
      text = `「${quoteMatch[2]!}」`;
    } else {
      const colonMatch = rest.match(/^((?:(?:KP|GM|PL|PC)\s*[:：]\s*)?[^:：\n]{1,32}?)\s*[:：]\s+(.+)$/i);
      if (colonMatch) {
        const candidateSp = colonMatch[1]!.trim();
        if (!/^https?$/i.test(candidateSp) && !/^mailto$/i.test(candidateSp)) {
          sp = candidateSp;
          text = colonMatch[2]!.trim();
        }
      }
    }

    if (!sp || !text) continue;

    entries.push({
      sp,
      text,
      ts,
      kind: mapKind(sp),
      type: text.startsWith("◆") ? "note" : "text",
      channel,
    });
  }

  return assembleLogEntries(entries);
}

function extractDiscordDiceRoll(text: string): Msg["roll"] | undefined {
  // BCDice / CCFOLIA / Discord Bot の典型的出力: (1D100<=65) ＞ 32 ＞ 成功
  const m = text.match(/([^\n(]+)?\(([^)]+)\)\s*[＞>→]\s*([^＞>→\n]+)(?:[＞>→]\s*([^\n]+))?/);
  if (!m) return undefined;
  return {
    cmd: m[2]!.trim(),
    skill: (m[1] ?? "").trim().replace(/^【|】$/g, ""),
    dice: m[3]!.trim(),
    result: (m[4] ?? "").trim() || "判定",
  };
}

function parseDiscordLogJson(raw: string): ParsedLog | null {
  if (!raw.startsWith("{")) return null;
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(root) || !Array.isArray(root.messages)) return null;

  const channelMeta = isRecord(root.channel) ? root.channel : undefined;
  const channelName = str(channelMeta?.name)?.trim() || "メイン";
  const entries: LogEntry[] = [];

  for (const item of root.messages) {
    if (!isRecord(item)) continue;
    const author = isRecord(item.author) ? item.author : undefined;
    const sp = (str(author?.nickname) ?? str(author?.name) ?? str(item.authorName))?.trim() || "不明な発言者";
    const ts = parseTimestampAttr(str(item.timestamp) ?? null);
    const contentParts: string[] = [];
    const baseText = str(item.content)?.trim();
    if (baseText) contentParts.push(baseText);
    if (Array.isArray(item.embeds)) {
      for (const emb of item.embeds) {
        if (!isRecord(emb)) continue;
        const embParts = [str(emb.title)?.trim(), str(emb.description)?.trim()].filter(Boolean);
        if (embParts.length > 0) contentParts.push(embParts.join("\n"));
      }
    }
    const text = contentParts.join("\n").trim();
    if (!text) continue;
    const isBot = author?.isBot === true || /dice|bcdice|bot/i.test(sp);
    const roll =
      isBot || /[＞→]\s*(?:クリティカル|ファンブル|成功|失敗)/.test(text)
        ? extractDiscordDiceRoll(text)
        : undefined;
    entries.push({
      sp,
      text,
      ts,
      kind: isBot ? "SYSTEM" : mapKind(sp),
      type: text.startsWith("◆") ? "note" : "text",
      channel: channelName,
      ...(roll ? { roll } : {}),
    });
  }
  return assembleLogEntries(entries);
}

function parseDiscordDateStamp(rawDate: string, rawTime: string): number {
  const m = rawDate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const tm = rawTime.match(/^(\d{1,2}):(\d{2})/);
  if (!m || !tm) return 0;
  const date = `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  const hhmm = `${tm[1]!.padStart(2, "0")}:${tm[2]}`;
  return jstEpoch(date, hhmm);
}

function parseDiscordLogText(raw: string): ParsedLog | null {
  const lines = raw.split(/\r?\n/);
  const entries: LogEntry[] = [];
  let current: { sp: string; ts: number; body: string[]; channel: string } | null = null;
  let channel = "メイン";

  const flush = () => {
    if (!current) return;
    const text = current.body.join("\n").trim();
    if (text) {
      const roll = extractDiscordDiceRoll(text);
      entries.push({
        sp: current.sp,
        text,
        ts: current.ts,
        kind: mapKind(current.sp),
        type: text.startsWith("◆") ? "note" : "text",
        channel: current.channel,
        ...(roll ? { roll } : {}),
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const chLine = rawLine.match(/^Channel:\s*(.+)$/i);
    if (chLine && entries.length === 0 && !current) {
      channel = chLine[1]!.trim() || "メイン";
      continue;
    }
    // DiscordChatExporter TXT: [2026/11/08 21:05] Name  or [2026-11-08 21:05:00] Name
    const exporterMatch = rawLine.match(
      /^\[(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+?)(?:\s*\([^)]+\))?\s*$/,
    );
    if (exporterMatch) {
      flush();
      current = {
        ts: parseDiscordDateStamp(exporterMatch[1]!, exporterMatch[2]!),
        sp: exporterMatch[3]!.trim(),
        body: [],
        channel,
      };
      continue;
    }
    // Discord Web コピペ（名前と日付時刻が並ぶ行）
    const copyMatch = rawLine.match(
      /^(.+?)\s+[\u2014-]\s+(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(\d{1,2}:\d{2})\s*$/,
    );
    if (copyMatch) {
      flush();
      current = {
        sp: copyMatch[1]!.trim(),
        ts: parseDiscordDateStamp(copyMatch[2]!, copyMatch[3]!),
        body: [],
        channel,
      };
      continue;
    }
    if (current) {
      if (!rawLine.trim() && current.body.length === 0) continue;
      if (/^={5,}$/.test(rawLine.trim())) continue;
      current.body.push(rawLine);
    }
  }
  flush();
  return entries.length > 0 ? assembleLogEntries(entries) : null;
}

function parseGenericHtmlLog(raw: string): ParsedLog | null {
  if (!/^\uFEFF?\s*</.test(raw)) return null;
  const cleaned = raw
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr)>/gi, "\n");
  const lines = cleaned
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split(/\r?\n/);

  const entries: LogEntry[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // どどんとふ / 整形HTML: [タブ] 発言者：本文  または 発言者：本文
    const m = t.match(/^(?:\[([^\]]+)\]\s*)?([^:：\n]{1,32}?)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const ch = m[1]?.trim() || "メイン";
    const sp = m[2]!.trim();
    const text = m[3]!.trim();
    if (!sp || !text || /^https?$/i.test(sp)) continue;
    entries.push({
      sp,
      text,
      ts: 0,
      kind: mapKind(sp),
      type: text.startsWith("◆") ? "note" : "text",
      channel: ch,
    });
  }
  return assembleLogEntries(entries);
}

export function importLogFromText(raw: string): LogImportResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Udonarium chat.xml (CCFOLIA HTML より前に <chat> を判定)
  const udonarium = parseUdonariumChatXml(trimmed);
  if (udonarium) {
    return { log: udonarium, sourceLabel: "Udonarium" };
  }

  // 2. DiscordChatExporter JSON
  const discordJson = parseDiscordLogJson(trimmed);
  if (discordJson) {
    return { log: discordJson, sourceLabel: "Discord" };
  }

  // 3. CCFOLIA JSON / HTML
  const ccfolia = parseCcfoliaLog(trimmed);
  if (ccfolia) {
    return { log: ccfolia, sourceLabel: "CCFOLIA" };
  }

  // 4. どどんとふ / 汎用整形 HTML
  const genericHtml = parseGenericHtmlLog(trimmed);
  if (genericHtml) {
    return { log: genericHtml, sourceLabel: "どどんとふ / HTML" };
  }

  // 5. Discord テキストログ (ヘッダ行 + 本文行)
  const discordTxt = parseDiscordLogText(trimmed);
  if (discordTxt) {
    return { log: discordTxt, sourceLabel: "Discord" };
  }

  // 6. 汎用 / Tekey テキストログ
  const plain = parsePlainTextLog(trimmed);
  if (plain) {
    return { log: plain, sourceLabel: "テキストログ" };
  }

  return null;
}

export async function importLogFromFile(file: File): Promise<LogImportResult | null> {
  const lowerName = file.name.toLowerCase();
  const isZip =
    lowerName.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";

  if (isZip) {
    const buf = await readFileArrayBuffer(file);
    const ccfoliaZip = await parseCcfoliaLogZip(buf);
    if (ccfoliaZip) {
      return { log: ccfoliaZip, sourceLabel: "CCFOLIA" };
    }

    const JSZip = (await import("jszip")).default;
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
    try {
      zip = await JSZip.loadAsync(buf);
    } catch {
      return null;
    }
    const files = Object.values(zip.files).filter((f) => !f.dir);

    const xmls = files
      .filter((f) => /\.xml$/i.test(f.name))
      .sort((a, b) => {
        const aScore = /chat/i.test(a.name) ? 0 : 1;
        const bScore = /chat/i.test(b.name) ? 0 : 1;
        return aScore - bScore || a.name.split("/").length - b.name.split("/").length;
      });
    for (const f of xmls) {
      const res = importLogFromText(await f.async("string"));
      if (res && res.log.messageCount > 0) return res;
    }

    const jsonsAndTxts = files.filter((f) => /\.(json|txt|html?)$/i.test(f.name));
    for (const f of jsonsAndTxts) {
      const res = importLogFromText(await f.async("string"));
      if (res && res.log.messageCount > 0) return res;
    }

    return null;
  }

  if (/\.html?$/i.test(lowerName)) {
    const html = await readFileText(file);
    const ccfoliaHtml = parseCcfoliaLogHtml(html);
    if (ccfoliaHtml) return { log: ccfoliaHtml, sourceLabel: "CCFOLIA" };
    const fallbackHtml = parseGenericHtmlLog(html);
    return fallbackHtml ? { log: fallbackHtml, sourceLabel: "どどんとふ / HTML" } : null;
  }

  const text = await readFileText(file);
  return importLogFromText(text);
}

export async function importLogsFromFiles(
  files: FileList | File[],
): Promise<(LogImportResult & { fileName: string })[]> {
  const results: (LogImportResult & { fileName: string })[] = [];
  for (const f of Array.from(files)) {
    const parsed = await importLogFromFile(f);
    if (parsed && parsed.log.messageCount > 0) {
      results.push({ ...parsed, fileName: f.name });
    }
  }
  return results;
}
