import { toCharacterFields, type ParsedCharacter } from "./ccfolia-character";
import {
  assembleLogEntries,
  isExplicitKind,
  mapKind,
  parseCcfoliaLog,
  parseCcfoliaLogHtml,
  parseCcfoliaLogZip,
  sessionDatesOf,
  summarizeParsed,
  type LogEntry,
  type ParsedLog,
} from "./ccfolia-parser";
import { parseUdonariumChatsFallback } from "./html-xml-fallback";

export { toCharacterFields, sessionDatesOf, summarizeParsed };
export type { ParsedCharacter, ParsedLog };

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

export function guessSystemFromText(text: string): string | undefined {
  if (/Cthulhu7th|クトゥルフ.*7|CoC\s*7|7版/i.test(text)) return "coc7";
  if (/Cthulhu|CCB|クトゥルフ.*6|CoC\s*6|6版/i.test(text)) return "coc6";
  if (/SwordWorld|SW2|ソード.?ワールド/i.test(text)) return "sw25";
  if (/Emoklore|エモクロア|共鳴/i.test(text)) return "emoklore";
  if (/\bCC(?:<=|\s)/i.test(text)) return "coc7";
  return undefined;
}

/** 呼び出し元で DOMParser の有無を確かめてから使う */
function parseXmlDoc(raw: string): Document | null {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  return doc;
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
   キャラシサイトの JSON（URL から読んだもの。src/lib/external-sync.ts から使う）:
   キャラクター保管所・ゆとシートⅡ。ファイルやコマの貼り付けからは読まない（P6）
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

/* ============================================================
   セッションログ取り込み（機械が確実に読める構造化形式だけ）:
   1. CCFOLIA JSON / HTML 書き出し / ZIP
   2. Udonarium chat.xml / ZIP（中の chat xml）
   Discord・テキストログ・どどんとふ等の自由形式は推測になるため受け付けない。
   ============================================================ */

export const SUPPORTED_LOG_FORMATS_LABEL = "CCFOLIA（JSON・HTML・ZIP）・Udonarium（chat.xml・ZIP）";
export const UNSUPPORTED_LOG_MESSAGE =
  "読み取れませんでした。CCFOLIA か Udonarium から書き出したログを選んでください。";
export const LOG_FILE_ACCEPT = ".json,.html,.htm,.xml,.zip";

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
      const kind = mapKind(sp, chat.type, true);
      entries.push({
        sp,
        text: chat.text,
        ts,
        kind,
        kindExplicit: isExplicitKind(chat.type),
        type: "text",
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
    const kind = mapKind(sp, typeAttr, true);
    entries.push({
      sp,
      text,
      ts,
      kind,
      kindExplicit: isExplicitKind(typeAttr),
      type: "text",
      channel: tab,
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

  // 2. CCFOLIA JSON / HTML
  const ccfolia = parseCcfoliaLog(trimmed);
  if (ccfolia) {
    return { log: ccfolia, sourceLabel: "CCFOLIA" };
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
    const xmls = Object.values(zip.files)
      .filter((f) => !f.dir && /\.xml$/i.test(f.name))
      .sort((a, b) => {
        const aScore = /chat/i.test(a.name) ? 0 : 1;
        const bScore = /chat/i.test(b.name) ? 0 : 1;
        return aScore - bScore || a.name.split("/").length - b.name.split("/").length;
      });
    for (const f of xmls) {
      const udonarium = parseUdonariumChatXml((await f.async("string")).trim());
      if (udonarium && udonarium.messageCount > 0) return { log: udonarium, sourceLabel: "Udonarium" };
    }
    return null;
  }

  if (/\.html?$/i.test(lowerName)) {
    const ccfoliaHtml = parseCcfoliaLogHtml(await readFileText(file));
    return ccfoliaHtml ? { log: ccfoliaHtml, sourceLabel: "CCFOLIA" } : null;
  }

  if (!/\.(json|xml)$/i.test(lowerName) && lowerName.includes(".")) return null;

  return importLogFromText(await readFileText(file));
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
