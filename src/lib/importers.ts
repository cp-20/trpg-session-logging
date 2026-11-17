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

function guessSystemFromText(text: string): string | undefined {
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

function parseXmlDoc(raw: string): Document | null {
  if (typeof DOMParser === "undefined") return null;
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

function parseCharasheetJson(raw: string): ParsedCharacter | null {
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

function parseIacharaText(raw: string): ParsedCharacter | null {
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
        const sk = m[1]!.trim();
        const val = Number(m[2]);
        if (sk && Number.isFinite(val) && val <= 999) {
          stats[sk] = val;
        }
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

function parseUdonariumCharacterXml(raw: string): ParsedCharacter | null {
  if (!/^\uFEFF?\s*</.test(raw) || !/<character\b/i.test(raw)) return null;
  const doc = parseXmlDoc(raw);
  if (!doc) return null;
  const root = doc.querySelector("character");
  if (!root) return null;

  let name = "";
  let imageId: string | undefined;
  let memo = "";
  const stats: Record<string, number> = {};

  for (const el of root.querySelectorAll("data")) {
    const dataName = (el.getAttribute("name") ?? "").trim();
    const dataType = (el.getAttribute("type") ?? "").trim();
    const hasChildData = el.querySelector(":scope > data") !== null;
    if (hasChildData) continue;

    const textVal = (el.textContent ?? "").trim();
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

    const curVal = el.getAttribute("currentValue");
    const rawNum = curVal !== null && curVal.trim() !== "" ? curVal : textVal;
    const parsedNum = num(rawNum);
    if (dataName && parsedNum !== undefined) {
      stats[normalizeStatKey(dataName)] = parsedNum;
    }
  }

  if (!name) return null;

  const palette = root.querySelector("chat-palette");
  const dicebot = palette?.getAttribute("dicebot") ?? "";
  const paletteText = palette?.textContent ?? "";
  const systemId = guessSystemFromText(`${dicebot} ${paletteText} ${memo}`);

  return {
    name,
    memo: memo || undefined,
    systemId,
    stats,
    ...(imageId ? { imageId } : {}),
  };
}

export function importCharacterFromText(raw: string): CharacterImportResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. キャラクター保管所 JSON (pc_name 優先判定)
  const charasheet = parseCharasheetJson(trimmed);
  if (charasheet) {
    return { character: charasheet, sourceLabel: "キャラクター保管所" };
  }

  // 2. CCFOLIA JSON
  const ccfolia = parseCcfoliaCharacterJson(trimmed);
  if (ccfolia) {
    return { character: ccfolia, sourceLabel: "CCFOLIA" };
  }

  // 3. Udonarium XML
  const udonarium = parseUdonariumCharacterXml(trimmed);
  if (udonarium) {
    return { character: udonarium, sourceLabel: "Udonarium" };
  }

  // 4. いあきゃら テキスト
  const iachara = parseIacharaText(trimmed);
  if (iachara) {
    return { character: iachara, sourceLabel: "いあきゃら" };
  }

  return null;
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
  if (typeof DOMParser === "undefined") return null;

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
    const kind = typeAttr === "system" ? "SYSTEM" : mapKind(sp, typeAttr);
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

  // 3. 汎用 / Tekey テキストログ
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

    const txts = files.filter((f) => /\.txt$/i.test(f.name));
    for (const f of txts) {
      const res = importLogFromText(await f.async("string"));
      if (res && res.log.messageCount > 0) return res;
    }

    return null;
  }

  if (/\.html?$/i.test(lowerName)) {
    const html = await readFileText(file);
    const parsed = parseCcfoliaLogHtml(html);
    return parsed ? { log: parsed, sourceLabel: "CCFOLIA" } : null;
  }

  const text = await readFileText(file);
  return importLogFromText(text);
}
