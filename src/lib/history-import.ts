import { SYSTEMS } from "../data/systems";
import { jstEpoch, todayStr } from "./format";

export interface PlayHistoryRow {
  date: string;
  title: string;
  scenarioTitle?: string;
  systemId: string;
  gmName?: string;
  playerNames: string[];
  characterNames: string[];
  durationMinutes?: number;
  memo?: string;
}

export interface PlayHistoryParseResult {
  format: "csv" | "tsv" | "markdown" | "json";
  rows: PlayHistoryRow[];
  skippedLines: number;
}

type ColumnKey =
  | "date"
  | "title"
  | "scenario"
  | "system"
  | "gm"
  | "players"
  | "character"
  | "duration"
  | "memo";

const HEADER_MATCHERS: [ColumnKey, RegExp][] = [
  ["date", /^(?:date|played.?at|日付|実施日|開催日|プレイ日|日時)$/i],
  ["scenario", /^(?:scenario|シナリオ名?|作品名?)$/i],
  ["title", /^(?:title|session|卓名|タイトル|セッション名?)$/i],
  ["system", /^(?:system|trpg|システム|ルール|使用システム)$/i],
  ["gm", /^(?:gm|kp|keeper|キーパー|進行|ゲームマスター)$/i],
  ["players", /^(?:players?|pl|members?|参加者|プレイヤー|同卓者)$/i],
  ["character", /^(?:characters?|pcs?|chars?|キャラ名?|キャラクター|探索者|使用キャラ)$/i],
  ["duration", /^(?:duration|time|hours?|所要時間|プレイ時間|時間)$/i],
  ["memo", /^(?:memo|notes?|impression|コメント|メモ|感想|ひとこと)$/i],
];

function matchHeader(cell: string): ColumnKey | null {
  const norm = cell.replace(/\s+/g, "");
  for (const [key, re] of HEADER_MATCHERS) {
    if (re.test(norm)) return key;
  }
  return null;
}

export function normalizeHistoryDate(raw: string): string | null {
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const jp = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    const y = Number(jp[1]);
    const m = Number(jp[2]);
    const d = Number(jp[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

export function normalizeHistorySystemId(raw: string | undefined): string {
  if (!raw) return "general";
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (SYSTEMS[lower]) return lower;
  if (/クトゥルフ.*6|coc\s*6|6版/i.test(t)) return "coc6";
  if (/クトゥルフ|coc|新クトゥルフ|call of cthulhu/i.test(t)) return "coc7";
  if (/エモクロア|emoklore/i.test(t)) return "emoklore";
  if (/ソード.?ワールド|sw\s*2/i.test(t)) return "sw25";
  if (/マーダーミステリー|マダミス/i.test(t)) return "madamis";
  return "general";
}

export function parseHistoryDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  const hm = t.match(/^(\d+)\s*時間(?:\s*(\d+)\s*分)?$/);
  if (hm) {
    return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  }
  const minsOnly = t.match(/^(\d+)\s*分$/);
  if (minsOnly) return Number(minsOnly[1]);
  const colon = t.match(/^(\d+):(\d{2})$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const hoursFloat = t.match(/^(\d+(?:\.\d+)?)\s*(?:h|時間)?$/i);
  if (hoursFloat) {
    const v = Number(hoursFloat[1]);
    return Number.isFinite(v) && v > 0 ? Math.round(v * (/h|時間/i.test(t) || v <= 24 ? 60 : 1)) : undefined;
  }
  return undefined;
}

function splitDelimitedRows(raw: string, sep: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      row.push(field);
      field = "";
      continue;
    }
    // CRLF の LF は空の行になり、最後の filter で落ちる
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function splitMarkdownTable(raw: string): string[][] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("|"));
  const rows: string[][] = [];
  for (const line of lines) {
    const inner = line.replace(/^\|/, "").replace(/\|$/, "");
    const cells = inner.split("|").map((c) => c.trim());
    //区切り行 | --- | :---: | は除外
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}

function splitNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,、/／・]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function rowToHistoryEntry(cellsByKey: Partial<Record<ColumnKey, string>>): PlayHistoryRow | null {
  const rawTitle = cellsByKey.title?.trim();
  const rawScenario = cellsByKey.scenario?.trim();
  const title = rawTitle || rawScenario;
  if (!title) return null;

  const normalizedDate = cellsByKey.date ? normalizeHistoryDate(cellsByKey.date) : null;
  const date = normalizedDate ?? todayStr();
  const scenarioTitle = rawScenario || rawTitle;
  const systemId = normalizeHistorySystemId(cellsByKey.system);
  const gmName = cellsByKey.gm?.trim() || undefined;
  const playerNames = splitNames(cellsByKey.players);
  const characterNames = splitNames(cellsByKey.character);
  const durationMinutes = parseHistoryDuration(cellsByKey.duration);
  const memo = cellsByKey.memo?.trim() || undefined;

  return {
    date,
    title,
    scenarioTitle,
    systemId,
    gmName,
    playerNames,
    characterNames,
    durationMinutes,
    memo,
  };
}

/** CSV / TSV / Markdown 表 / JSON 配列から通過履歴を一括で読み取る */
export function parsePlayHistory(raw: string): PlayHistoryParseResult | null {
  const trimmed = raw.trim();

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      const rows: PlayHistoryRow[] = [];
      let skippedLines = 0;
      for (const item of parsed) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          skippedLines++;
          continue;
        }
        const rec = item as Record<string, unknown>;
        const mapped: Partial<Record<ColumnKey, string>> = {};
        for (const [k, v] of Object.entries(rec)) {
          const col = matchHeader(k);
          if (col && typeof v === "string") mapped[col] = v;
          else if (col && typeof v === "number") mapped[col] = String(v);
        }
        const entry = rowToHistoryEntry(mapped);
        if (entry) rows.push(entry);
        else skippedLines++;
      }
      return rows.length > 0 ? { format: "json", rows, skippedLines } : null;
    } catch {
      return null;
    }
  }

  const lines = trimmed.split(/\r?\n/);

  let format: "csv" | "tsv" | "markdown";
  let grid: string[][];
  const isMarkdown = lines.filter((l) => l.trim().startsWith("|")).length >= 2;
  if (isMarkdown) {
    format = "markdown";
    grid = splitMarkdownTable(trimmed);
  } else if (lines[0]!.includes("\t")) {
    format = "tsv";
    grid = splitDelimitedRows(trimmed, "\t");
  } else if (lines[0]!.includes(",")) {
    format = "csv";
    grid = splitDelimitedRows(trimmed, ",");
  } else {
    return null;
  }

  if (grid.length < 2) return null;

  const headerCells = grid[0]!;
  const colMap: (ColumnKey | null)[] = headerCells.map(matchHeader);
  const rows: PlayHistoryRow[] = [];
  let skippedLines = 0;
  for (let i = 1; i < grid.length; i++) {
    const rowCells = grid[i]!;
    const mapped: Partial<Record<ColumnKey, string>> = {};
    for (let c = 0; c < colMap.length; c++) {
      const key = colMap[c];
      if (!key) continue;
      mapped[key] = rowCells[c] ?? "";
    }
    const entry = rowToHistoryEntry(mapped);
    if (entry) rows.push(entry);
    else skippedLines++;
  }

  return rows.length > 0 ? { format, rows, skippedLines } : null;
}

/** インポート行から開始・終了エポック（既定 21:00 JST）を計算する */
export function historyRowEpochs(row: PlayHistoryRow): { t0: number; t1: number } {
  const t0 = jstEpoch(row.date, "21:00");
  const mins = (row.durationMinutes ?? 0) > 0 ? row.durationMinutes! : 180;
  return { t0, t1: t0 + mins * 60 };
}
