import type { Channel, Msg, MsgKind } from "../types";
import { parseCcfoliaHtmlEntriesFallback } from "./html-xml-fallback";
import { rollTone } from "./roll-tone";
import { sceneHeadingIndexes } from "./scene-headings";
import { inferSpeakerKinds } from "./speaker-kinds";
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

const KINDS = ["PC", "NPC", "KP", "PL", "GM", "NARRATION", "SYSTEM"];
export const isExplicitKind = (v: unknown) => KINDS.includes(str(v)?.toUpperCase() ?? "");

/**
 * 発言者の種別。明示があればそれを使い、無ければ名前から推す（KP・GM・キーパー・system）。
 * CCFOLIA は大文字の「KP」だけを見る（小文字の kp は PC 名にありうる）。Udonarium は ignoreCase で「gm：」も拾う
 */
export function mapKind(sp: string, explicit?: unknown, ignoreCase = false): MsgKind {
  const e = str(explicit)?.toUpperCase();
  if (e && KINDS.includes(e)) return e as MsgKind;
  const name = sp.trim();
  if ((ignoreCase ? /^(KP|GM|キーパー)(?:$|[\s:：(（])/i : /^(KP|GM|キーパー)(?:$|[\s:：(（])/).test(name))
    return "KP";
  if (name.toLowerCase() === "system") return "SYSTEM";
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
    const isNote = explicitType === "note";
    const ts = toSeconds(c.createdAt) ?? toSeconds(c.t) ?? toSeconds(c.time) ?? 0;
    const roll = buildRoll(c);
    return {
      sp,
      text,
      ts,
      kind: mapKind(sp, c.kind ?? c.role),
      kindExplicit: isExplicitKind(c.kind ?? c.role),
      /* type: system は Msg では text と同じ扱いなので区別しない */
      type: isNote ? "note" : "text",
      channel: str(c.channel) ?? str(c.channelId) ?? str(c.tab) ?? "メイン",
      ...(roll ? { roll } : {}),
    };
  });
  return assembleLogEntries(entries);
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
  /** 種別がログに書かれていた（推定で NPC に変えない） */
  kindExplicit?: boolean;
}

/** 公開チャンネルの正規名。main と メイン のように表記の違う同じタブを 1 つにまとめる */
function publicChannelName(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  if (lower.includes("main") || raw === "メイン") return "メイン";
  if (lower === "info" || raw.includes("info") || raw === "情報") return "情報";
  if (lower === "chat" || raw.includes("chat") || raw === "チャット" || raw === "雑談") return "チャット";
  return undefined;
}

/**
 * メッセージ列を Channel[] に組み立てる（CCFOLIA JSON / HTML・Udonarium 共用）。
 * - ダイス結果は roll を付けて type: "roll" にする。生ログのように結果が本文にしか無いものは本文から読む
 * - 表記の違う公開タブ（main / メイン）は文書順のまま 1 つにまとめる
 */
export function assembleLogEntries(entries: LogEntry[]): ParsedLog | null {
  if (entries.length === 0) return null;
  const msgs: Msg[] = entries.map((e, i) => {
    const roll = e.roll ?? (e.type === "note" ? undefined : parseBcdiceRoll(e.text));
    return {
      id: `p${i}`,
      ts: e.ts,
      sp: e.sp,
      kind: e.kind,
      type: roll ? "roll" : e.type === "note" ? "note" : "text",
      text: e.text,
      ...(roll ? { roll } : {}),
    } as Msg;
  });

  /* 種別の書かれていない発言者は、発言の様子から PC / NPC / 描写を推す */
  const explicit = new Set(entries.filter((e) => e.kindExplicit).map((e) => e.sp));
  const inferred = inferSpeakerKinds(msgs.filter((m) => !explicit.has(m.sp)));
  for (const m of msgs) m.kind = inferred.get(m.sp) ?? m.kind;

  /* 場面の見出し。記号を決め打ちせず、形と中身から見分ける */
  for (const i of sceneHeadingIndexes(msgs)) msgs[i]!.type = "note";

  /* チャンネルごとに集めた上で、チャンネル内だけ時系列ソートする(混線防止)。ts が同じなら文書順 */
  const groups = new Map<string, { id: string; name?: string; msgs: Msg[] }>();
  msgs.forEach((m, i) => {
    const raw = entries[i]!.channel;
    const pub = publicChannelName(raw);
    const key = pub ?? `raw:${raw}`;
    const g = groups.get(key) ?? { id: raw, name: pub, msgs: [] };
    g.msgs.push(m);
    groups.set(key, g);
  });
  groups.forEach((g) => g.msgs.sort((a, b) => a.ts - b.ts));

  const channels: Channel[] = [...groups.values()]
    .map((g) => {
      /* 発言者が2人以下の非標準チャンネルはシークレットタブとして扱う */
      const secret = !g.name && new Set(g.msgs.map((m) => m.sp)).size <= 2;
      return { id: g.id, name: g.name ?? g.id, secret, msgs: g.msgs };
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
   新形式(article.message)は datetime を ts に使う。旧形式にはタイムスタンプが無いため ts=0(順序は文書順で維持)。
   ============================================================ */

const JUDGE_LABEL: Record<string, string> = {
  success: "成功",
  failure: "失敗",
  critical: "クリティカル",
  fumble: "ファンブル",
};

/** 「1D100」「2DM」「d6」のようなダイスの式 */
const DICE_EXPR = /\d[dD]|[dD]\d/;
/** 表のロールの出目「狂気表(4)」「金銭財宝表(445[3,2])」 */
const TABLE_TAIL = /\([\d[\],\s]+\)\s*$/;

/** コマンド部分にあるダイスの式。最後の「(1D100<=45)」のようなもの。表のロールは末尾の「(4)」 */
function formulaIn(head: string): RegExpExecArray | undefined {
  const groups = [...head.matchAll(/\(([^()]*)\)/g)];
  const dice = groups.filter((g) => DICE_EXPR.test(g[1]!)).at(-1);
  return dice ?? (TABLE_TAIL.test(head) ? groups.at(-1) : undefined);
}

/**
 * BCDice の結果文を Roll にする。ダイスの結果でなければ undefined。
 * 形は「コマンド (式) ＞ 途中 ＞ 結果」（生ログ・旧形式の本文）か「コマンド ＞ (式) ＞ … ＞ 結果」（新形式の .roll-result）。
 * CoC 7 版の「CC<=85 【知識】 (1D100<=85) ボーナス・ペナルティダイス[0] ＞ …」のように式の後ろに続きがあってもよい。
 * 繰り返しロール（x3 … #1 / #2）は parseBcdiceRepeat で各回に分ける。
 */
export function parseBcdiceRoll(raw: string, judge?: string): Msg["roll"] | undefined {
  const all = raw.trim();
  if (/^x\d+\s/i.test(all)) return parseBcdiceRepeat(all);
  /* 表の説明が次の行に続くことがある（交友表(31) ＞ 見出し⏎説明）。結果は 1 行目から読む */
  const text = all.split("\n")[0]!.trim();
  if (!text) return undefined;
  const parts = text.split(/\s*＞\s*/);
  if (parts.length < 2 || parts.some((p) => !p)) return undefined;
  const head = parts[0]!;
  /* 先頭に「(式)」があるか、2 つ目が「(式)」のときだけダイスとみなす（会話の「A ＞ B」を拾わない） */
  const formulaAt2 = /^\([^()]*\d[^()]*\)$/.test(parts[1]!);
  const formula = formulaAt2 ? undefined : formulaIn(head);
  if (!formula && !formulaAt2) return undefined;
  const cmd = (formula ? head.slice(0, formula.index).trim() : head) || head;
  const sm = /【([^】]+)】|〈([^〉]+)〉/.exec(cmd);
  const skill = sm?.[1] ?? sm?.[2] ?? "";
  /* 表のロールは結果の文に「＞」を含むことがあるので、最初の「＞」から後ろ全部を結果にする */
  if (formula && !DICE_EXPR.test(formula[1]!)) {
    return {
      cmd,
      skill,
      dice: formula[1]!.replace(/\s+/g, ""),
      result: (judge && JUDGE_LABEL[judge]) || parts.slice(1).join(" ＞ "),
    };
  }
  const steps = parts.slice(formulaAt2 ? 2 : 1);
  const last = steps.at(-1) ?? "";
  const judged = steps.length >= 2 && !/^-?\d+$/.test(last);
  const bracket = steps.map((p) => /\[([^\]]*)\]/.exec(p)?.[1]).find((d) => d !== undefined);
  const dice = (bracket ?? (judged ? steps.at(-2)! : last)).replace(/\s+/g, "");
  return { cmd, skill, dice, result: (judge && JUDGE_LABEL[judge]) || last };
}

/**
 * 繰り返しロール「x3 CC<=70 【目星】 #1⏎(1D100<=70) ＞ 57 ＞ 成功⏎⏎#2⏎…」を、各回の結果（repeats）を持つ 1 つの Roll にする
 */
function parseBcdiceRepeat(text: string): Msg["roll"] | undefined {
  const m = /^x(\d+)\s+(.*?)\s*#1\s*\n/i.exec(text);
  if (!m) return undefined;
  const cmd = `x${m[1]} ${m[2]!.trim()}`;
  const repeats = text
    .slice(m[0].length)
    .split(/\n\s*#\d+\s*\n/)
    .map((block) => parseBcdiceRoll(block.trim()))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map(({ dice, result }) => ({ dice, result }));
  if (repeats.length === 0) return undefined;
  const sm = /【([^】]+)】|〈([^〉]+)〉/.exec(cmd);
  return {
    cmd,
    skill: sm?.[1] ?? sm?.[2] ?? "",
    dice: repeats.map((r) => r.dice).join(","),
    result: summarizeOutcomes(repeats.map((r) => r.result)),
    repeats,
  };
}

/** 各回の結果のまとめ。数だけなら並べ、判定なら種類ごとの回数（成功 2・失敗 1） */
function summarizeOutcomes(results: string[]): string {
  if (results.every((r) => /^-?\d+$/.test(r))) return results.join(", ");
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r, (counts.get(r) ?? 0) + 1);
  /* 良い結果から順に（クリティカル → … → ファンブル）、判定の無い結果は後ろ */
  const order = ["crit", "special", "success", "fail", "fumble"];
  const rank = (r: string) => {
    const t = rollTone(r);
    return t ? order.indexOf(t) : order.length;
  };
  return [...counts]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([r, n]) => `${r} ${n}`)
    .join("・");
}

/**
 * 新形式 HTML の .roll-result を Roll にする。結果が「(式) ＞ …」で始まるときはコマンドが .message-text にだけあるので前に付ける。
 * どうしても読めなければ結果文をそのまま結果にする（ダイスであることは要素から確か）。
 */
export function parseRollResultText(raw: string, judge?: string, command = ""): Msg["roll"] | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const full = text.startsWith("(") && command.trim() ? `${command.trim()} ${text}` : text;
  const parsed = parseBcdiceRoll(full, judge) ?? parseBcdiceRoll(text, judge);
  if (parsed) return parsed;
  const parts = text.split(/\s*＞\s*/).filter(Boolean);
  return {
    cmd: command.trim() || parts[0] || text,
    skill: "",
    dice: /\[([^\]]*)\]/.exec(text)?.[1]?.replace(/\s+/g, "") ?? "",
    result: (judge && JUDGE_LABEL[judge]) || (parts.length > 1 ? parts.at(-1)! : text),
  };
}

/** DOM 要素の本文。<br> は改行として残す(textContent だと落ちる) */
function textWithBreaks(el: Element | null | undefined): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return clone.textContent;
}

/**
 * 新形式のチャンネル名の解決。data-channel(内部 ID)ごとに、どこかの発言にある表示名(.channel-name)を共有する。
 * 表示名の無い発言(システム表示など)が別チャンネルに分かれるのを防ぐ。
 */
export function resolveChannelLabels(items: { dc: string; label: string }[]): string[] {
  const labelOf = new Map<string, string>();
  for (const it of items) if (it.dc && it.label && !labelOf.has(it.dc)) labelOf.set(it.dc, it.label);
  return items.map((it) => it.label || labelOf.get(it.dc) || it.dc || "メイン");
}

function epochOfDatetime(raw: string | null | undefined): number {
  if (!raw) return 0;
  const ms = Date.parse(raw.trim());
  return Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
}

export function parseCcfoliaLogHtml(html: string): ParsedLog | null {
  if (typeof DOMParser === "undefined") {
    const fb = parseCcfoliaHtmlEntriesFallback(html.replace(/\r\n?/g, "\n"));
    const labels = resolveChannelLabels(fb.map((e) => ({ dc: e.dataChannel ?? "", label: e.label ?? "" })));
    const entries: LogEntry[] = fb.map((e, i) => {
      const roll = e.rollText ? parseRollResultText(e.rollText, e.rollClass, e.text) : undefined;
      return {
        sp: e.sp || (e.system ? "system" : "不明な発言者"),
        text: e.text,
        ts: epochOfDatetime(e.datetime),
        kind: e.system ? "SYSTEM" : mapKind(e.sp),
        type: "text",
        channel: e.dataChannel !== undefined ? labels[i]! : e.tab,
        ...(roll ? { roll } : {}),
      };
    });
    return assembleLogEntries(entries);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries: LogEntry[] = [];
  let chIndex = 0;

  /* (0) 新形式: article.message(時刻・チャンネル・ダイス結果つき) */
  const dcs: { dc: string; label: string }[] = [];
  for (const art of doc.querySelectorAll("article.message")) {
    const text = textWithBreaks(art.querySelector(".message-text")).trim();
    const rollEl = art.querySelector(".roll-result");
    const rollText = rollEl?.textContent.trim() ?? "";
    if (!text && !rollText) continue;
    const system = art.classList.contains("system");
    const sp = art.querySelector(".speaker")?.textContent.trim() ?? "";
    const label = (art.querySelector(".channel-name")?.textContent ?? "").trim().replace(/^\[|\]$/g, "");
    const judge = ["success", "failure", "critical", "fumble"].find((c) => rollEl?.classList.contains(c));
    const roll = rollText ? parseRollResultText(rollText, judge, text) : undefined;
    dcs.push({ dc: (art.getAttribute("data-channel") ?? "").trim(), label });
    entries.push({
      sp: sp || (system ? "system" : "不明な発言者"),
      text,
      ts: epochOfDatetime(art.querySelector("time.timestamp")?.getAttribute("datetime")),
      kind: system ? "SYSTEM" : mapKind(sp),
      type: "text",
      channel: "",
      ...(roll ? { roll } : {}),
    });
  }
  resolveChannelLabels(dcs).forEach((c, i) => (entries[i]!.channel = c));
  if (entries.length > 0) return assembleLogEntries(entries);

  /* (1) 生ログ: 3つ以上の span を持つ <p> を順に読む */
  const rawPs = [...doc.querySelectorAll("p")].filter((p) => {
    const spans = p.querySelectorAll(":scope > span");
    return spans.length >= 3;
  });
  for (const p of rawPs) {
    const spans = [...p.querySelectorAll(":scope > span")];
    const tab = spans[0].textContent.trim().replace(/^\[|\]$/g, "");
    const sp = spans[1].textContent.trim() || "不明な発言者";
    const text = spans
      .slice(2)
      .map((s) => textWithBreaks(s))
      .join("\n")
      .trim();
    if (!text) continue;
    entries.push({
      sp,
      text,
      ts: 0,
      kind: mapKind(sp),
      type: "text",
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
          kind: mapKind(sp),
          type: "text",
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
          kind: mapKind(sp),
          type: "text",
          channel: title || `ch${chIndex}`,
        });
      }
    }
  }

  /* どの形式でも取れなければ null */
  return assembleLogEntries(entries);
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
