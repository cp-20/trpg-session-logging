import type { Character, ExternalSyncConfig, ExternalSyncProvider, GrowthRecord } from "../types";
import { SYSTEMS } from "../data/systems";
import { toCharacterFields, type ParsedCharacter } from "./ccfolia-character";
import { guessSystemFromText, parseCharasheetJson, parseYtsheetJson } from "./importers";
import { uid } from "./format";
import { diffSheetSkills, type SheetProvider } from "./sheet";
import { defaultGrowthSession, growthFromSync, growthRecords } from "./character-growth";
import {
  SOUKO_SYSTEMS,
  parseCharaenoJson,
  parseCharashJson,
  isIacharaSheet,
  isIacharaSheetPublic,
  parseIacharaSheet,
  parseLhrpgJson,
  parseSoukoJson,
  sheetFromCharasheet,
  sheetFromStats,
  sheetFromYtsheet,
  ytsheetSystemFromUrl,
} from "./sheet-sources";

export const EXTERNAL_PROVIDER_LABELS: Record<ExternalSyncProvider, string> = {
  iachara: "いあきゃら",
  charasheet: "キャラクター保管所",
  ytsheet: "ゆとシートⅡ",
  emoklore: "エモクロアキャラクターシート",
  charaeno: "キャラエノ",
  charash: "キャラッシュ",
  souko: "キャラクターシート倉庫",
  lhrpg: "冒険窓口",
  booth: "BOOTH",
  talto: "TALTO",
};

export interface ImportedScenario {
  title: string;
  author?: string;
  systemId?: string;
  source: "booth" | "talto";
  sourceUrl: string;
  tags: string[];
  description?: string;
}

export type ExternalImportPayload =
  | {
      kind: "character";
      provider: ExternalSyncProvider;
      providerLabel: string;
      url: string;
      character: ParsedCharacter;
      contentHash: string;
    }
  | {
      kind: "scenario";
      provider: ExternalSyncProvider;
      providerLabel: string;
      url: string;
      scenario: ImportedScenario;
      contentHash: string;
    };

export type ParsedExternalUrlResult =
  | {
      ok: true;
      provider: ExternalSyncProvider;
      kind: "character" | "scenario";
      displayUrl: string;
      fetchUrls: string[];
    }
  | { ok: false; error: string };

/** いあきゃらの閲覧ページが読む API */
export const IACHARA_API_ORIGIN = "https://apiv3.iachara.com";

/**
 * いあきゃらの API は取得できないときも HTTP 200 で { success: false } を返すので、本文から理由を出す。
 * 読めるシートなら undefined
 */
export function iacharaSheetError(raw: string): string | undefined {
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (isIacharaSheetPublic(root) && isIacharaSheet(root)) return undefined;
  const outer = asRecord(asRecord(root)?.data);
  const meta = asRecord(asRecord(outer?.data)?.metadata);
  if (outer?.public === false || meta?.isPublic === false) {
    return "このキャラクターシートは非公開です。いあきゃらで公開に設定してから、もう一度お試しください。";
  }
  if (asRecord(root)?.success === true && outer?.deleted !== true && outer?.data) {
    return "このキャラクターシートの形式は読み取れませんでした。";
  }
  return "いあきゃらにこのキャラクターシートが見つかりませんでした。URL をお確かめください。";
}

const SAFE_BOOTH_SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const BANNED_BOOTH_SUBDOMAINS = new Set(["admin", "accounts", "manage", "checkout", "api"]);

/** IP リテラルか（IPv4、括弧付き/無しの IPv6、整数・16進 IP を含む） */
export function isIpLiteral(rawHost: string): boolean {
  const host = rawHost
    .replace(/^\[|\]$/g, "")
    .split("%")[0]!
    .toLowerCase();
  if (!host) return false;
  if (host.includes(":")) return true;
  if (/^\d+$/.test(host) || /^0x[\da-f]+$/i.test(host)) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return false;
}

function parseIpv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p); // 1〜3 桁の数字なので 0〜999 の整数
    if (n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isPrivateIpv4Octets(octets: number[]): boolean {
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return true; // Link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF / TEST-NET-1
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // Multicast & reserved
  return false;
}

function expandIpv6Hextets(raw: string): number[] | null {
  const ip = raw.toLowerCase();
  const [left, right, ...rest] = ip.split("::");
  if (rest.length > 0) return null;

  const parseGroups = (seg: string, allowEmbeddedIpv4: boolean): number[] | null => {
    if (!seg) return [];
    const tokens = seg.split(":");
    const out: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.includes(".")) {
        // 末尾の埋め込み IPv4 (例: ::ffff:127.0.0.1 / 0:0:0:0:0:ffff:127.0.0.1)
        if (!allowEmbeddedIpv4 || i !== tokens.length - 1) return null;
        const v4 = parseIpv4Octets(tok);
        if (!v4) return null;
        out.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
      } else {
        if (!/^[\da-f]{1,4}$/.test(tok)) return null;
        out.push(parseInt(tok, 16));
      }
    }
    return out;
  };

  const l = parseGroups(left ?? "", right === undefined);
  const r = right !== undefined ? parseGroups(right, true) : [];
  if (!l || !r) return null;

  if (right === undefined) {
    return l.length === 8 ? l : null;
  }
  const missing = 8 - (l.length + r.length);
  if (missing < 1) return null;
  return [...l, ...Array<number>(missing).fill(0), ...r];
}

/** SSRF 対策: プライベート・ループバック・リンクローカル・予約済み IP かを判定（不正文字列は安全側で true） */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp
    .trim()
    .replace(/^\[|\]$/g, "")
    .split("%")[0]!;
  if (!ip) return true;

  if (!ip.includes(":")) {
    const octets = parseIpv4Octets(ip);
    return octets ? isPrivateIpv4Octets(octets) : true;
  }

  const hextets = expandIpv6Hextets(ip);
  if (!hextets) return true;

  // :: / ::1 は下の IPv4 互換判定（0.0.0.0 / 0.0.0.1 → 0.0.0.0/8）で拒否される
  const isIpv4Mapped =
    hextets.slice(0, 5).every((x) => x === 0) && (hextets[5] === 0xffff || hextets[5] === 0);
  if (isIpv4Mapped) {
    const hi = hextets[6]!;
    const lo = hextets[7]!;
    return isPrivateIpv4Octets([(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]);
  }

  const first = hextets[0]!;
  if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7 Unique local
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10 Link-local
  if (first >= 0xff00) return true; // ff00::/8 Multicast
  return false;
}

/** 外部キャラクター・シナリオ URL を検証し、正規化と取得先 URL 候補を返す */
export function parseExternalUrl(rawUrl: string): ParsedExternalUrlResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, error: "外部サービスの URL を入力してください。" };
  }
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: "URL の形式が正しくありません（https:// から入力してください）。" };
  }
  if (u.protocol !== "https:") {
    return { ok: false, error: "https:// の URL のみ読み込めます。" };
  }
  if (u.username || u.password) {
    return { ok: false, error: "認証情報付きの URL は指定できません。" };
  }
  if (u.port) {
    // URL は既定ポート 443 を空文字に正規化するため、ここに来るのは標準外ポートのみ
    return { ok: false, error: "標準外のポートを含む URL は指定できません。" };
  }
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || isIpLiteral(host)) {
    return { ok: false, error: "対応していないホストです。" };
  }

  // 1. いあきゃら (https://iachara.com/view/{id})。閲覧ページと同じ API を、閲覧者用の匿名の鍵で読む
  //    （鍵の受け取りは external-import-server.ts の取得手順）
  if (host === "iachara.com" || host === "www.iachara.com") {
    const m = u.pathname.match(/^\/(?:char\/)?(?:view|edit)\/(\d{1,12})\/?$/);
    if (!m) {
      return {
        ok: false,
        error: "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
      };
    }
    return {
      ok: true,
      provider: "iachara",
      kind: "character",
      displayUrl: `https://iachara.com/view/${m[1]}`,
      fetchUrls: [`${IACHARA_API_ORIGIN}/v3/charasheet/${m[1]}`],
    };
  }

  // 2. キャラクター保管所 (https://charasheet.vampire-blood.net/{id} or /m{id})
  if (host === "charasheet.vampire-blood.net") {
    const m = u.pathname.match(/^\/(m?\d+)(?:\.js|\.html)?\/?$/);
    if (!m) {
      return {
        ok: false,
        error:
          "キャラクター保管所のキャラシート URL（例: https://charasheet.vampire-blood.net/1234567）を指定してください。",
      };
    }
    const id = m[1]!;
    const displayUrl = `https://charasheet.vampire-blood.net/${id}`;
    return {
      ok: true,
      provider: "charasheet",
      kind: "character",
      displayUrl,
      fetchUrls: [`https://charasheet.vampire-blood.net/${id}.js`],
    };
  }

  // 3. ゆとシートⅡ (https://yutorize.work/ytsheet/{sys}/?id={id})。各地のサーバーも /ytsheet を含むパスなら受ける
  const isYutorize = host === "yutorize.2-d.jp" || host === "yutorize.work" || host === "www.yutorize.work";
  if (isYutorize || /\/ytsheet/i.test(u.pathname)) {
    const sheetId = u.searchParams.get("id")?.trim();
    if (!/\/ytsheet/i.test(u.pathname) || !sheetId || !/^[a-zA-Z0-9_-]+$/.test(sheetId)) {
      return {
        ok: false,
        error: "ゆとシートⅡのキャラシート URL（?id=… 付き）を指定してください。",
      };
    }
    const clean = new URL(u.origin + u.pathname);
    clean.searchParams.set("id", sheetId);
    const jsonUrl = new URL(clean.toString());
    jsonUrl.searchParams.set("mode", "json");
    return {
      ok: true,
      provider: "ytsheet",
      kind: "character",
      displayUrl: clean.toString(),
      fetchUrls: [jsonUrl.toString(), clean.toString()],
    };
  }

  // 3b. キャラエノ (https://charaeno.com/{6th|7th}/{id})。公開 API /api/v1/{版}/{id}/summary を読む
  if (host === "charaeno.com" || host === "www.charaeno.com" || host === "charaeno.sakasin.net") {
    const m = u.pathname.match(/^\/(6th|7th)\/([A-Za-z0-9_-]{6,64})\/?$/);
    if (!m) {
      return {
        ok: false,
        error: "キャラエノのキャラクター URL（例: https://charaeno.com/7th/…）を指定してください。",
      };
    }
    const displayUrl = `https://charaeno.com/${m[1]}/${m[2]}`;
    return {
      ok: true,
      provider: "charaeno",
      kind: "character",
      displayUrl,
      fetchUrls: [`https://charaeno.com/api/v1/${m[1]}/${m[2]}/summary`],
    };
  }

  // 3c. キャラッシュ (https://charash.jp/view/{id})。公開 API /api/v1/characters/{id} を読む
  if (host === "charash.jp" || host === "www.charash.jp") {
    /* 閲覧 URL は /view/{id}/{システム} に転送されるので、後ろのシステムの道も受ける */
    const m = u.pathname.match(
      /^\/(?:view|api\/v1\/characters)\/([A-Za-z0-9_-]{4,64})(?:\/[a-z0-9_-]+)?\/?$/,
    );
    if (!m) {
      return {
        ok: false,
        error: "キャラッシュのキャラクター URL（例: https://charash.jp/view/…）を指定してください。",
      };
    }
    return {
      ok: true,
      provider: "charash",
      kind: "character",
      displayUrl: `https://charash.jp/view/${m[1]}`,
      fetchUrls: [`https://charash.jp/api/v1/characters/${m[1]}`],
    };
  }

  // 3d. TRPGキャラクターシート倉庫 (https://character-sheets.appspot.com/{システム}/edit.html?key=…)。公開 JSON の display?ajax=1 を読む
  if (host === "character-sheets.appspot.com") {
    const m = u.pathname.match(/^\/([a-z0-9]+)\/(?:edit\.html|display)$/);
    const key = u.searchParams.get("key")?.trim();
    if (!m || !key || !/^[A-Za-z0-9_-]{8,200}$/.test(key)) {
      return {
        ok: false,
        error: "キャラクターシート倉庫のキャラシート URL（…/edit.html?key=…）を指定してください。",
      };
    }
    const sys = m[1]!;
    if (!SOUKO_SYSTEMS[sys]) {
      return {
        ok: false,
        error: `キャラクターシート倉庫は${Object.values(SOUKO_SYSTEMS)
          .map((x) => x.label)
          .join("・")}のキャラシに対応しています。`,
      };
    }
    const base = `https://character-sheets.appspot.com/${sys}`;
    return {
      ok: true,
      provider: "souko",
      kind: "character",
      displayUrl: `${base}/edit.html?key=${encodeURIComponent(key)}`,
      fetchUrls: [`${base}/display?ajax=1&key=${encodeURIComponent(key)}`],
    };
  }

  // 3e. ログ・ホライズンTRPG 冒険窓口 (https://lhrpg.com/lhz/pc?id=…)。公開 JSON API /lhz/api/{id}.json を読む
  if (host === "lhrpg.com" || host === "www.lhrpg.com") {
    const id =
      u.pathname === "/lhz/pc"
        ? u.searchParams.get("id")?.trim()
        : u.pathname.match(/^\/lhz\/api\/(\d+)\.json$/)?.[1];
    if (!id || !/^\d{1,10}$/.test(id)) {
      return {
        ok: false,
        error: "冒険窓口のキャラクター URL（例: https://lhrpg.com/lhz/pc?id=…）を指定してください。",
      };
    }
    return {
      ok: true,
      provider: "lhrpg",
      kind: "character",
      displayUrl: `https://lhrpg.com/lhz/pc?id=${id}`,
      fetchUrls: [`https://lhrpg.com/lhz/api/${id}.json`],
    };
  }

  // 4. エモクロアキャラクターシート。キャラッシュに移ったので、キャラッシュの URL を貼ってもらう
  if (host === "emoklore.charasheet.jp") {
    return { ok: false, error: "エモクロアのキャラシはキャラッシュの URL を貼ってください。" };
  }

  // 5. BOOTH (https://booth.pm/ja/items/{id} or https://{shop}.booth.pm/items/{id})
  const isBoothRoot = host === "booth.pm";
  const isBoothShop = host.endsWith(".booth.pm") && host.split(".").length === 3;
  if (isBoothRoot || isBoothShop) {
    if (isBoothShop) {
      const sub = host.slice(0, -".booth.pm".length);
      if (!SAFE_BOOTH_SUBDOMAIN.test(sub) || BANNED_BOOTH_SUBDOMAINS.has(sub)) {
        return { ok: false, error: "BOOTH の商品 URL（items/番号）を指定してください。" };
      }
    }
    const m = u.pathname.match(/^(\/[a-z]{2})?\/items\/(\d+)/);
    if (!m) {
      return { ok: false, error: "BOOTH の商品ページ URL（/items/番号）を指定してください。" };
    }
    const langPrefix = m[1] ?? (isBoothRoot ? "/ja" : "");
    const itemId = m[2]!;
    const displayUrl = `https://${host}${langPrefix}/items/${itemId}`;
    return {
      ok: true,
      provider: "booth",
      kind: "scenario",
      displayUrl,
      fetchUrls: [`${displayUrl}.json`, displayUrl],
    };
  }

  // 6. TALTO (https://talto.cc/projects/{id})
  if (host === "talto.cc" || host === "www.talto.cc") {
    const m = u.pathname.match(/^\/projects\/([a-zA-Z0-9_-]+)/);
    if (!m) {
      return { ok: false, error: "TALTO のシナリオページ URL（/projects/…）を指定してください。" };
    }
    const displayUrl = `https://talto.cc/projects/${m[1]!}`;
    return {
      ok: true,
      provider: "talto",
      kind: "scenario",
      displayUrl,
      fetchUrls: [displayUrl],
    };
  }

  return {
    ok: false,
    error: `未対応の URL です。${SHEET_SITES.map((x) => x.label).join("・")}・BOOTH・TALTO に対応しています。`,
  };
}

/* ================= HTML / JSON 抽出ヘルパー（Node / ブラウザ両対応） ================= */

export function decodeHtmlEntities(input: string): string {
  return (
    input
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&#x27;/gi, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code: string) => {
        const n = Number(code);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _;
      })
      .replace(/&#x([\da-f]+);/gi, (_, hex: string) => {
        const n = parseInt(hex, 16);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _;
      })
      // &amp; は最後に戻す（"&amp;lt;" を "<" に二重デコードしない）
      .replace(/&amp;/g, "&")
  );
}

function extractMetaTags(html: string): Record<string, string> {
  const metas: Record<string, string> = {};
  const tagRe = /<meta\s+([^>]+?)\/?>/gi;
  for (const m of html.matchAll(tagRe)) {
    const attrs = m[1]!;
    const keyMatch =
      attrs.match(/(?:property|name)\s*=\s*"([^"]+)"/i) ?? attrs.match(/(?:property|name)\s*=\s*'([^']+)'/i);
    const valMatch = attrs.match(/content\s*=\s*"([^"]*)"/i) ?? attrs.match(/content\s*=\s*'([^']*)'/i);
    if (keyMatch && valMatch) {
      metas[keyMatch[1]!.trim().toLowerCase()] = decodeHtmlEntities(valMatch[1]!.trim());
    }
  }
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && !metas.title) {
    metas.title = decodeHtmlEntities(titleMatch[1]!.trim());
  }
  return metas;
}

function safeHttpsUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("https://")) return undefined;
  try {
    return new URL(trimmed).toString();
  } catch {
    return undefined;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function strVal(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** キャラクター保管所の JSON / JSONP レスポンスを解析する */
export function parseCharasheetResponse(raw: string): ParsedCharacter | null {
  let body = raw.trim();
  if (!body) return null;
  const jsonpMatch = body.match(/^[a-zA-Z_$][\w$.]*\s*\(([\s\S]*)\)\s*;?\s*$/);
  if (jsonpMatch) body = jsonpMatch[1]!.trim();

  const base = parseCharasheetJson(body);
  if (!base) return null;

  // parseCharasheetJson が同じ body の JSON.parse に成功しているので例外は起きない
  const obj = JSON.parse(body) as Record<string, unknown>;
  const img = safeHttpsUrl(obj.pc_image ?? obj.image ?? obj.image_url);
  return img ? { ...base, image: img } : base;
}

/** ゆとシートⅡの JSON / HTML レスポンスを解析する */
export function parseYtsheetResponse(raw: string): ParsedCharacter | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const direct = parseYtsheetJson(trimmed);
  if (direct) return direct;

  if (trimmed.startsWith("<")) {
    const metas = extractMetaTags(trimmed);
    const title = (metas["og:title"] ?? metas.title ?? "").replace(/\s*[-|｜]\s*ゆとシート.*$/i, "").trim();
    if (!title) return null;
    const desc = metas["og:description"] ?? metas.description ?? "";
    const img = safeHttpsUrl(metas["og:image"]);
    return {
      name: title,
      memo: desc || undefined,
      systemId: guessSystemFromText(`${title} ${desc}`) ?? "sw25",
      stats: {},
      ...(img ? { image: img } : {}),
    };
  }
  return null;
}

function inferScenarioSystemFromText(text: string): string {
  if (/クトゥルフ.*7|CoC\s*7|7版|新クトゥルフ/i.test(text)) return "coc7";
  if (/クトゥルフ.*6|CoC\s*6|6版/i.test(text)) return "coc6";
  if (/クトゥルフ|\bCoC\b|Call of Cthulhu/i.test(text)) return "coc7";
  if (/エモクロア|Emoklore/i.test(text)) return "emoklore";
  if (/ソード.?ワールド|SW2/i.test(text)) return "sw25";
  if (/マーダーミステリー|マダミス/i.test(text)) return "madamis";
  return "general";
}

function trimDescription(raw: string | undefined, max = 420): string | undefined {
  if (!raw) return undefined;
  const clean = raw
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

/** BOOTH の商品 JSON / HTML レスポンスをシナリオ情報に解析する */
export function parseBoothResponse(raw: string, url: string): ImportedScenario | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const title = strVal(obj.name);
      if (title) {
        const shop = asRecord(obj.shop);
        const author = strVal(shop?.name);
        const desc = strVal(obj.description);
        const rawTags = Array.isArray(obj.tags)
          ? obj.tags
              .map((t) => strVal(asRecord(t)?.name) ?? (typeof t === "string" ? t.trim() : undefined))
              .filter((t): t is string => Boolean(t))
          : [];
        const tags = [...new Set(rawTags)].slice(0, 8);
        const systemId = inferScenarioSystemFromText(`${title} ${tags.join(" ")} ${desc ?? ""}`);
        return {
          title,
          author,
          systemId,
          source: "booth",
          sourceUrl: url,
          tags,
          description: trimDescription(desc),
        };
      }
    } catch {
      /* HTML フォールバック */
    }
  }

  if (trimmed.startsWith("<")) {
    const metas = extractMetaTags(trimmed);
    const rawTitle = metas["og:title"] ?? metas.title ?? "";
    const cleaned = rawTitle.replace(/\s*[-|｜]\s*BOOTH.*$/i, "").trim();
    if (!cleaned) return null;

    let title = cleaned;
    let author: string | undefined;
    const parts = cleaned.split(/\s+[-|｜]\s+/);
    if (parts.length >= 2) {
      author = parts.pop()!.trim();
      title = parts.join(" - ").trim();
    }
    const desc = metas["og:description"] ?? metas.description;
    const systemId = inferScenarioSystemFromText(`${title} ${desc ?? ""}`);
    return {
      title,
      author,
      systemId,
      source: "booth",
      sourceUrl: url,
      tags: [],
      description: trimDescription(desc),
    };
  }

  return null;
}

/** TALTO の HTML / JSON-LD レスポンスをシナリオ情報に解析する */
export function parseTaltoResponse(raw: string, url: string): ImportedScenario | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const title = strVal(obj.title) ?? strVal(obj.name);
      if (!title) return null;
      const author = strVal(obj.author) ?? strVal(asRecord(obj.creator)?.name);
      const desc = strVal(obj.description);
      const tags = Array.isArray(obj.tags)
        ? obj.tags.filter((x): x is string => typeof x === "string").slice(0, 8)
        : [];
      return {
        title,
        author,
        systemId: inferScenarioSystemFromText(`${title} ${strVal(obj.system) ?? ""} ${desc ?? ""}`),
        source: "talto",
        sourceUrl: url,
        tags,
        description: trimDescription(desc),
      };
    } catch {
      return null;
    }
  }

  const metas = extractMetaTags(trimmed);
  const stripSite = (t: string) => t.replace(/\s*[-|｜]\s*TALTO.*$/i, "").trim();
  let title = stripSite(metas["og:title"] ?? metas.title ?? "");

  let author: string | undefined = metas.author;
  let description: string | undefined = metas["og:description"] ?? metas.description;
  for (const m of trimmed.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const ld = JSON.parse(m[1]!.trim()) as Record<string, unknown>;
      // og:title が無いページでも JSON-LD の name から題名を拾う
      if (!title) title = stripSite(strVal(ld.name) ?? "");
      if (!author) author = strVal(asRecord(ld.author)?.name) ?? strVal(ld.author);
      if (!description) description = strVal(ld.description);
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  if (!title) return null;

  return {
    title,
    author,
    systemId: inferScenarioSystemFromText(`${title} ${description ?? ""}`),
    source: "talto",
    sourceUrl: url,
    tags: [],
    description: trimDescription(description),
  };
}

/** 値から安定したハッシュ文字列（64bit FNV-1a 相当の16進文字列）を作る */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(",")}}`;
}

export function computeExternalContentHash(payload: unknown): string {
  const s = canonicalize(payload);
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseExternalResponse(
  provider: ExternalSyncProvider,
  raw: string,
  _contentType: string,
  displayUrl: string,
): ExternalImportPayload | null {
  const providerLabel = EXTERNAL_PROVIDER_LABELS[provider];
  if (provider === "booth" || provider === "talto") {
    const scenario =
      provider === "booth" ? parseBoothResponse(raw, displayUrl) : parseTaltoResponse(raw, displayUrl);
    if (!scenario) return null;
    return {
      kind: "scenario",
      provider,
      providerLabel,
      url: displayUrl,
      scenario,
      contentHash: computeExternalContentHash(scenario),
    };
  }

  let character: ParsedCharacter | null = null;
  if (provider === "charasheet") character = parseCharasheetResponse(raw);
  else if (provider === "ytsheet") character = parseYtsheetResponse(raw);
  else if (provider === "charaeno") character = parseCharaenoJson(raw.trim(), displayUrl);
  else if (provider === "charash") character = parseCharashJson(raw.trim(), displayUrl);
  else if (provider === "iachara") character = parseIacharaSheet(raw.trim(), displayUrl);
  else if (provider === "souko") {
    const sys = displayUrl.match(/^https:\/\/character-sheets\.appspot\.com\/([a-z0-9]+)\//)?.[1] ?? "";
    character = parseSoukoJson(jsonBody(raw), sys, displayUrl);
  } else if (provider === "lhrpg") character = parseLhrpgJson(jsonBody(raw), displayUrl);

  if (!character) return null;
  character = withSheet(provider, character, raw, displayUrl);
  return {
    kind: "character",
    provider,
    providerLabel,
    url: displayUrl,
    character,
    contentHash: computeExternalContentHash(character),
  };
}

function jsonBody(raw: string): unknown {
  let body = raw.trim();
  const jsonp = body.match(/^[a-zA-Z_$][\w$.]*\s*\(([\s\S]*)\)\s*;?\s*$/);
  if (jsonp) body = jsonp[1]!.trim();
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** 取り込み結果に汎用シートを付ける（サイトの JSON から作れなければ数値から作る） */
function withSheet(
  provider: ExternalSyncProvider,
  character: ParsedCharacter,
  raw: string,
  displayUrl: string,
): ParsedCharacter {
  let next = character;
  let sheet = character.sheet;
  if (!sheet && provider === "charasheet") sheet = sheetFromCharasheet(jsonBody(raw), displayUrl);
  if (!sheet && provider === "ytsheet") {
    const root = jsonBody(raw);
    sheet = sheetFromYtsheet(root, displayUrl);
    const sys = ytsheetSystemFromUrl(displayUrl);
    if (sys) next = { ...next, systemId: sys.id };
    const r = (root ?? {}) as Record<string, unknown>;
    if (next.systemId === "sw25") {
      const extra: Record<string, number> = {};
      for (const [key, field] of [
        ["lv", "level"],
        ["exp", "expTotal"],
        ["honor", "historyHonorTotal"],
      ] as const) {
        const n = typeof r[field] === "number" ? r[field] : Number(r[field]);
        if (r[field] !== undefined && r[field] !== "" && Number.isFinite(n)) extra[key] = n as number;
      }
      next = { ...next, stats: { ...next.stats, ...extra } };
    }
  }
  if (!sheet) sheet = sheetFromStats(next.stats, provider as SheetProvider, next.systemId);
  return sheet ? { ...next, sheet: { ...sheet, url: displayUrl } } : next;
}

export function extractArchetypeFromMemo(memo: string | undefined): string {
  if (!memo) return "";
  const occ = memo.match(/^(?:職業|種族|ルーツ)\s*[:：]\s*(.+)$/m);
  return occ ? occ[1]!.trim() : "";
}

function statLabelFor(systemId: string, key: string): string {
  const found = SYSTEMS[systemId]?.stats.find((s) => s.key === key)?.label;
  if (found) return found;
  return /^[a-z0-9_]+$/i.test(key) ? key.toUpperCase() : key;
}

export interface StatChangeDiff {
  key: string;
  label: string;
  from: number;
  to: number;
}

export interface MergeExternalCharacterResult {
  next: Character;
  changed: boolean;
  statChanges: StatChangeDiff[];
  profileChanges: string[];
  /** 同期で上がった技能から自動で残した成長（どのセッションのあとかは既定で決め、あとから付け替えられる） */
  growth: GrowthRecord[];
}

/**
 * 既存の探索者データに外部シートからの最新データを非破壊マージする。
 * キャラシが正なので名前・職業・システム・画像・能力値・シートは置き換える。
 * 卓譜だけの項目（ひとこと紹介・タグ・共有設定・sessions・過去の growth）は絶対に失わない。
 * 上がった技能は成長として残す。どのセッションのあとかの既定は、前の同期のあとに遊んだうちいちばん新しいもの
 * （セッションが 1 つもなければ成長としては残さない。値はキャラシに残る）。
 */
export function mergeExternalCharacterUpdate(
  existing: Character,
  incoming: ParsedCharacter,
  opts: {
    url: string;
    provider: ExternalSyncProvider;
    syncedAt: string;
    contentHash?: string;
    autoSync?: boolean;
  },
): MergeExternalCharacterResult {
  // fields.systemId は使わない（nextSystemId を下で決める）ので既定システムは渡すだけ
  const fields = toCharacterFields(incoming, existing.systemId);
  const nextHash = opts.contentHash ?? computeExternalContentHash(incoming);
  const nextArchetype = extractArchetypeFromMemo(incoming.memo) || existing.archetype;
  const nextName = fields.name || existing.name;
  const nextSystemId = incoming.systemId ?? existing.systemId;
  const nextImage = fields.image ?? existing.image;

  const statChanges: StatChangeDiff[] = [];
  const nextStats: Record<string, number> = { ...existing.stats, ...fields.stats };
  for (const [k, nextVal] of Object.entries(fields.stats)) {
    const prevVal = existing.stats[k];
    if (typeof prevVal === "number" && typeof nextVal === "number" && prevVal !== nextVal) {
      statChanges.push({
        key: k,
        label: statLabelFor(nextSystemId, k),
        from: prevVal,
        to: nextVal,
      });
    }
  }

  const profileChanges: string[] = [];
  if (nextName !== existing.name) profileChanges.push("名前");
  if (nextArchetype !== existing.archetype) profileChanges.push("職業など");
  if (nextSystemId !== existing.systemId) profileChanges.push("システム");
  if (nextImage !== existing.image) profileChanges.push("画像");

  /* 技能の伸びはシート同士で比べる（stats に同じ名前があればそちらで数えたので除く） */
  const skillChanges = diffSheetSkills(existing.sheet, incoming.sheet).filter(
    (d) => !statChanges.some((x) => x.label === d.label),
  );
  const sheetChanged =
    computeExternalContentHash(stripFetchedAt(existing.sheet)) !==
    computeExternalContentHash(stripFetchedAt(incoming.sheet ?? existing.sheet));

  const hashSame = Boolean(
    existing.externalSync?.contentHash && existing.externalSync.contentHash === nextHash,
  );
  const changed =
    !hashSame &&
    (statChanges.length > 0 || profileChanges.length > 0 || skillChanges.length > 0 || sheetChanged);

  const session = changed
    ? defaultGrowthSession(existing, existing.externalSync?.lastSyncedAt ?? existing.sheet?.fetchedAt)
    : undefined;
  const newGrowth: GrowthRecord[] = session
    ? growthRecords(growthFromSync(nextSystemId, skillChanges, statChanges), session, () => `g_${uid()}`)
    : [];

  const externalSync: ExternalSyncConfig = {
    provider: opts.provider,
    url: opts.url,
    lastSyncedAt: opts.syncedAt,
    lastStatus: "ok",
    contentHash: nextHash,
    autoSync: opts.autoSync ?? existing.externalSync?.autoSync ?? true,
  };

  const next: Character = {
    ...existing,
    name: nextName,
    systemId: nextSystemId,
    archetype: nextArchetype,
    image: nextImage,
    stats: nextStats,
    ...(incoming.sheet ? { sheet: { ...incoming.sheet, fetchedAt: opts.syncedAt } } : {}),
    sessions: existing.sessions,
    share: existing.share,
    growth: newGrowth.length > 0 ? [...existing.growth, ...newGrowth] : existing.growth,
    externalSync,
  };

  return {
    next,
    changed,
    statChanges: [...statChanges, ...skillChanges.map((d) => ({ key: d.label, ...d }))],
    profileChanges,
    growth: newGrowth,
  };
}

function stripFetchedAt(sheet: Character["sheet"]): unknown {
  if (!sheet) return null;
  const { fetchedAt: _fetchedAt, ...rest } = sheet;
  return rest;
}

/** 開いたときに自動で更新するまでの間隔（1 日） */
export const SHEET_REFRESH_INTERVAL_MS = 24 * 3600 * 1000;

export function shouldAutoSync(
  sync: ExternalSyncConfig | undefined,
  nowMs: number,
  intervalMs = SHEET_REFRESH_INTERVAL_MS,
): boolean {
  if (!sync || !sync.autoSync || !sync.url) return false;
  if (!sync.lastSyncedAt) return true;
  const lastMs = Date.parse(sync.lastSyncedAt);
  if (!Number.isFinite(lastMs)) return true;
  return nowMs - lastMs >= intervalMs;
}

/** URL から読めるキャラシサイト（取り込みの画面にこの順で名前を並べる） */
export const SHEET_SITES: { label: string; example: string }[] = [
  { label: "キャラエノ", example: "https://charaeno.com/7th/…" },
  { label: "キャラッシュ", example: "https://charash.jp/view/…" },
  { label: "いあきゃら", example: "https://iachara.com/view/…" },
  { label: "キャラクター保管所", example: "https://charasheet.vampire-blood.net/…" },
  { label: "ゆとシートⅡ", example: "https://yutorize.work/ytsheet/sw2.5/?id=…" },
  { label: "キャラクターシート倉庫", example: "https://character-sheets.appspot.com/dx3/edit.html?key=…" },
  { label: "冒険窓口", example: "https://lhrpg.com/lhz/pc?id=…" },
];

export type SheetUrlStatus =
  | { state: "empty" }
  | { state: "invalid"; message: string }
  | { state: "ok"; provider: ExternalSyncProvider; label: string; url: string };

/** 入力中の URL がどのキャラシサイトか（通信しない）。URL から読めないサイトは受け付けない（P6） */
export function describeSheetUrl(raw: string): SheetUrlStatus {
  const t = raw.trim();
  if (!t) return { state: "empty" };
  const parsed = parseExternalUrl(t);
  if (!parsed.ok) return { state: "invalid", message: parsed.error };
  if (parsed.kind !== "character") {
    return { state: "invalid", message: "キャラクターシートの URL を貼ってください。" };
  }
  return {
    state: "ok",
    provider: parsed.provider,
    label: EXTERNAL_PROVIDER_LABELS[parsed.provider],
    url: parsed.displayUrl,
  };
}

/** キャラシと結び付いているか（名前・能力値・技能をキャラシ側で直すキャラクター） */
export function isSheetLinked(c: Pick<Character, "externalSync" | "sheet">): boolean {
  return Boolean(c.externalSync?.url || c.sheet);
}

/** URL から更新できるか。以前エモクロアキャラクターシートから取り込んだものは、キャラシで開くだけ */
export function canFetchSheet(c: Pick<Character, "externalSync">): boolean {
  const ext = c.externalSync;
  return Boolean(ext?.url && parseExternalUrl(ext.url).ok);
}

/** キャラシのメモから卓譜の「ひとこと紹介」の初期値を作る（職業・種族などの行は除く） */
export function bioFromMemo(memo: string | undefined): string {
  if (!memo) return "";
  return memo
    .split(/\r?\n/)
    .filter((l) => !/^(?:職業|種族|ルーツ|共鳴感情)\s*[:：]/.test(l.trim()) && !/^Lv\.\d+$/.test(l.trim()))
    .join("\n")
    .trim();
}
