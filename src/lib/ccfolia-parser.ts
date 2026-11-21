import type { Channel, Msg, MsgKind } from "../types";
import { parseCcfoliaHtmlEntriesFallback } from "./html-xml-fallback";
import { sessionDay } from "./time";

/**
 * CCFOLIA 書き出しログ(v1.37 MessageData JSON、旧HTML、HTML zip)の tolerant パーサー。
 * 未知の形式にも耐えるように、メッセージっぽい要素を走査して復元する。
 * 返す Channel[] は卓譜の内部形式(シークレット判定はチャンネル名ヒューリスティック)。
 */

export interface ParsedLog {
  channels: Channel[];
  kinds: Record<string, MsgKind>;
  messageCount: number;
}

type Candidate = Record<string, unknown>;

function isRecord(v: unknown): v is Candidate {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** createdAt の epoch 変換: ms / s の両対応 */
function toSeconds(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 1e9) {
    return v > 1e12 ? Math.floor(v / 1000) : v;
  }
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const n = Number(v);
    return n > 1e12 ? Math.floor(n / 1000) : n > 1e9 ? n : undefined;
  }
  return undefined;
}

/** メッセージ候補か: テキストか時刻を持ち、名前か発言者情報を持つ */
function looksLikeMessage(c: Candidate): boolean {
  const text = str(c.text) ?? str(c.message) ?? str(c.body);
  const hasText = typeof text === "string";
  const hasTime = c.createdAt !== undefined || c.t !== undefined || c.time !== undefined;
  const hasName = c.name !== undefined || c.speakerId !== undefined || c.cn !== undefined;
  return hasText && hasName && hasTime;
}

function collectMessages(node: unknown, out: Candidate[]): void {
  if (Array.isArray(node)) {
    for (const v of node) collectMessages(v, out);
    return;
  }
  if (!isRecord(node)) return;
  if (looksLikeMessage(node)) {
    out.push(node);
    return; // メッセージ自体の下は走査しない
  }
  for (const k of Object.keys(node)) {
    if (k === "extend") continue; // roll など装飾は走査しない
    collectMessages(node[k], out);
  }
}

function mapKind(sp: string, explicit: unknown): MsgKind {
  const e = str(explicit)?.toUpperCase();
  if (e === "PC" || e === "NPC" || e === "KP" || e === "PL" || e === "GM" || e === "SYSTEM")
    return e as MsgKind;
  if (/^(KP|GM)[\s:：]/.test(sp) || sp === "KP" || sp === "GM") return "KP";
  return "PC";
}

function buildRoll(m: Candidate): Msg["roll"] | undefined {
  const ext = isRecord(m.extend) ? m.extend : undefined;
  const roll = ext && isRecord(ext.roll) ? ext.roll : undefined;
  if (!roll) return undefined;
  const cmd = str(roll.cmd) ?? "ロール";
  const result =
    str(roll.result) ??
    (roll.critical === true ? "クリティカル" : roll.fumble === true ? "ファンブル" : "成功");
  const diceArr = Array.isArray(roll.dice) ? roll.dice : [];
  const dice = diceArr
    .map((d) => (isRecord(d) ? `${str(d.value) ?? ""}` : ""))
    .filter(Boolean)
    .join(",");
  return { cmd, skill: str(roll.skill) ?? "", dice: dice || String(roll.value ?? ""), result };
}

export function parseCcfoliaLog(raw: string): ParsedLog | null {
  /* HTML書き出しは JSON と異なり "<" から始まる(先頭の BOM/空白は許容) */
  if (/^\uFEFF?\s*</.test(raw)) {
    return parseCcfoliaLogHtml(raw);
  }
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return null;
  }
  const candidates: Candidate[] = [];
  collectMessages(root, candidates);

  /* 候補が無ければ assembleChannels が null を返す */
  const entries = candidates.map((c): LogEntry => {
    const sp = str(c.name) ?? str(c.speakerId) ?? str(c.cn) ?? "不明な発言者";
    const text = str(c.text) ?? str(c.message) ?? str(c.body) ?? "";
    const explicitType = str(c.type)?.toLowerCase();
    const isNote = explicitType === "note" || text.startsWith("◆");
    const ts = toSeconds(c.createdAt) ?? toSeconds(c.t) ?? toSeconds(c.time) ?? 0;
    const roll = buildRoll(c);
    return {
      sp,
      text,
      ts,
      kind: mapKind(sp, c.kind ?? c.role),
      /* type: system は Msg では text と同じ扱いなので区別しない */
      type: isNote ? "note" : "text",
      channel: str(c.channel) ?? str(c.channelId) ?? str(c.tab) ?? "メイン",
      ...(roll ? { roll } : {}),
    };
  });
  return assembleChannels(entries);
}

/* ---------- 共通: メッセージ列を Channel[] に組み立てる(JSON/HTML 共用) ---------- */

export interface LogEntry {
  sp: string;
  text: string;
  ts: number;
  kind: MsgKind;
  type: "text" | "note" | "system";
  channel: string;
  roll?: Msg["roll"];
}

function assembleChannels(entries: LogEntry[]): ParsedLog | null {
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
  /* グローバルソートはしない: チャンネル対応を保ち、各チャンネル内でソートする */

  /* チャンネルごとに集めた上で、チャンネル内だけ時系列ソートする(混線防止) */
  const groups = new Map<string, Msg[]>();
  msgs.forEach((m, i) => {
    const rawCh = entries[i].channel;
    if (!groups.has(rawCh)) groups.set(rawCh, []);
    groups.get(rawCh)!.push(m);
  });
  groups.forEach((arr) => arr.sort((a, b) => a.ts - b.ts));

  /* 正規チャンネル名の判定(ヒューリスティック) */
  const nameFor = (raw: string, speakerCount: number): { name: string; secret: boolean } => {
    const lower = raw.toLowerCase();
    if (lower.includes("main") || raw === "メイン") return { name: "メイン", secret: false };
    if (lower === "info" || raw === "情報" || raw.includes("info")) return { name: "情報", secret: false };
    if (lower === "chat" || raw === "チャット" || raw.includes("chat") || raw === "雑談")
      return { name: "チャット", secret: false };
    /* 発言者が2人以下の非標準チャンネルはシークレットタブとして扱う(plan のヒューリスティック) */
    return { name: raw, secret: speakerCount <= 2 };
  };

  const channels: Channel[] = [...groups.entries()]
    .map(([key, gmsgs]) => {
      const speakers = new Set(gmsgs.map((m) => m.sp));
      const { name, secret } = nameFor(key, speakers.size);
      return { id: key, name, secret, msgs: gmsgs };
    })
    /* メインっぽいチャンネルを先頭に */
    .sort((a, b) => (a.name === "メイン" ? -1 : b.name === "メイン" ? 1 : 0));

  const kinds: Record<string, MsgKind> = {};
  channels.forEach((c) => c.msgs.forEach((m) => (kinds[m.sp] = m.kind)));

  const messageCount = channels.reduce((a, c) => a + c.msgs.length, 0);
  return { channels, kinds, messageCount };
}

/** デバッグ用: チャンネル構成の要約 */
export function summarizeParsed(parsed: ParsedLog): string[] {
  return parsed.channels.map((c) => `${c.name}(${c.msgs.length})${c.secret ? " [シークレット]" : ""}`);
}

/* ============================================================
   HTML 書き出しの解析
   - 生ログ: <p><span>[main]</span><span>発言者</span><span>本文</span></p>
   - 旧整形ログ: div.tab > p.tabtitle + p.player > b(発言者) + 本文
   - 新整形ログ: section.tab > h2.tabtitle + ol > li.player (.speaker-text + .player-message)
   HTML にはタイムスタンプが含まれないため ts=0(順序は文書順で維持)。
   ============================================================ */

export function parseCcfoliaLogHtml(html: string): ParsedLog | null {
  if (typeof DOMParser === "undefined") {
    const entries: LogEntry[] = parseCcfoliaHtmlEntriesFallback(html).map((e) => ({
      sp: e.sp,
      text: e.text,
      ts: 0,
      kind: e.sp === "system" ? "SYSTEM" : mapKind(e.sp, undefined),
      type: e.text.startsWith("◆") ? "note" : "text",
      channel: e.tab,
    }));
    return assembleChannels(entries);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries: LogEntry[] = [];
  let chIndex = 0;

  /* (1) 生ログ: 3つ以上の span を持つ <p> を順に読む */
  const rawPs = [...doc.querySelectorAll("p")].filter((p) => {
    const spans = p.querySelectorAll(":scope > span");
    return spans.length >= 3;
  });
  for (const p of rawPs) {
    const spans = [...p.querySelectorAll(":scope > span")];
    const tab = spans[0].textContent.trim().replace(/^\[|\]$/g, "");
    const sp = spans[1].textContent.trim();
    const text = spans
      .slice(2)
      .map((s) => s.textContent)
      .join("\n")
      .trim();
    if (!sp || !text) continue;
    entries.push({
      sp,
      text,
      ts: 0,
      kind: sp === "system" ? "SYSTEM" : mapKind(sp, undefined),
      type: text.startsWith("◆") ? "note" : "text",
      channel: tab || `ch${chIndex}`,
    });
  }

  /* (2) 旧整形ログ: div.tab 単位 */
  if (entries.length === 0) {
    for (const tab of doc.querySelectorAll("div.tab")) {
      const title = tab.querySelector(":scope > .tabtitle")?.textContent.trim() ?? "";
      chIndex++;
      for (const row of tab.querySelectorAll(":scope > p.player")) {
        const rawSp = row.querySelector(":scope > b")?.textContent ?? "";
        const sp = rawSp.trim();
        const text = withoutFirst(row.textContent, rawSp).trim();
        if (!sp || !text) continue;
        entries.push({
          sp,
          text,
          ts: 0,
          kind: sp === "system" ? "SYSTEM" : mapKind(sp, undefined),
          type: text.startsWith("◆") ? "note" : "text",
          channel: title || `ch${chIndex}`,
        });
      }
    }
  }

  /* (3) 新整形ログ: section.tab 単位 */
  if (entries.length === 0) {
    for (const tab of doc.querySelectorAll("section.tab")) {
      const title = tab.querySelector(":scope > .tabtitle")?.textContent.trim() ?? "";
      chIndex++;
      for (const row of tab.querySelectorAll(".player")) {
        const sp = row.querySelector(".speaker-text")?.textContent.trim() ?? "";
        const text = row.querySelector(".player-message")?.textContent.trim() ?? "";
        if (!sp || !text) continue;
        entries.push({
          sp,
          text,
          ts: 0,
          kind: sp === "system" ? "SYSTEM" : mapKind(sp, undefined),
          type: text.startsWith("◆") ? "note" : "text",
          channel: title || `ch${chIndex}`,
        });
      }
    }
  }

  /* どの形式でも取れなければ null */
  return assembleChannels(entries);
}

/* ============================================================
   HTML zip 書き出しの解析(JSZip)
   zip 内の *.json → JSON パーサー、*.html → HTML パーサーの順に試す。
   ============================================================ */

export async function parseCcfoliaLogZip(data: ArrayBuffer | Blob): Promise<ParsedLog | null> {
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    return null;
  }
  const files = Object.values(zip.files).filter((f) => !f.dir);

  /* ログJSONは zip 直下に置かれることが多い(ルート優先) */
  const jsons = files
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length);
  for (const f of jsons) {
    const parsed = parseCcfoliaLog(await f.async("string"));
    if (parsed) return parsed; // null でなければ 1 件以上ある
  }
  const htmls = files
    .filter((f) => /\.html?$/i.test(f.name))
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length);
  for (const f of htmls) {
    const parsed = parseCcfoliaLogHtml(await f.async("string"));
    if (parsed) return parsed; // null でなければ 1 件以上ある
  }
  return null;
}

export function sessionDatesOf(parsed: ParsedLog): string[] {
  const all = parsed.channels.flatMap((c) => c.msgs.map((m) => m.ts));
  const dates: string[] = [];
  let cur = "";
  for (const ts of [...all].sort((a, b) => a - b)) {
    const d = sessionDay(ts);
    if (d !== cur) {
      dates.push(d);
      cur = d;
    }
  }
  return dates;
}

/** 行の文字列から発言者部分（<b> の生の文字列）を 1 回だけ取り除く。前後の空白や位置に依らない */
function withoutFirst(text: string, part: string): string {
  if (!part) return text;
  const i = text.indexOf(part);
  return i < 0 ? text : text.slice(0, i) + text.slice(i + part.length);
}
