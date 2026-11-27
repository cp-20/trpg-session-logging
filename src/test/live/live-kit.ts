/**
 * 本物の外部サービスに繋ぐ確認（*.live.test.ts）の道具。`pnpm run test:live` だけが使う（`pnpm test`・CI では動かない）。
 *
 * - 相手に迷惑をかけない: 同じホストへは 1 本ずつ、間を空けて送る。1 サイトに送るのは数件まで
 * - User-Agent は卓譜の確認だと分かる固定の文字列（個人の情報は入れない）
 * - 見本のキャラシは、なるべくその場でサイトの公開一覧から拾う（消されても別のもので確かめられる）
 */
import { IACHARA_API_ORIGIN } from "../../lib/external-sync";
import {
  IACHARA_FIREBASE_API_KEY,
  handleExternalImport,
  type ExternalImportServerResponse,
} from "../../lib/external-import-server";
import type { CharacterSheet, SheetSection } from "../../lib/sheet";

export const LIVE_USER_AGENT = "TakufuLiveTest/1.0 (+https://takufu.app)";

/** 同じホストへ続けて送るときに空ける時間 */
const HOST_GAP_MS = 1200;
const lastByHost = new Map<string, number>();
const queueByHost = new Map<string, Promise<unknown>>();

/** 同じホストへの問い合わせを 1 本ずつ、間を空けて行う */
export function politely<T>(host: string, task: () => Promise<T>): Promise<T> {
  const prev = queueByHost.get(host) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const wait = (lastByHost.get(host) ?? 0) + HOST_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await task();
      } finally {
        lastByHost.set(host, Date.now());
      }
    });
  queueByHost.set(host, next);
  return next;
}

/** 一覧ページなどを読む（取り込みそのものではなく、見本を探すため） */
export async function fetchText(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; body: string; headers: Headers }> {
  return politely(new URL(url).hostname, async () => {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": LIVE_USER_AGENT, ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status, body: await res.text(), headers: res.headers };
  });
}

/** 一覧ページから、型に合う URL を出てきた順に重ねずに拾う */
export async function discover(listUrl: string, pattern: RegExp, limit = 3): Promise<string[]> {
  const { status, body } = await fetchText(listUrl);
  if (status !== 200) throw new Error(`見本の一覧を読めなかった（HTTP ${status}）: ${listUrl}`);
  const base = new URL(listUrl);
  const found: string[] = [];
  for (const m of body.matchAll(
    new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`),
  )) {
    const url = new URL((m[1] ?? m[0]).replace(/&amp;/g, "&"), base).toString();
    if (!found.includes(url)) found.push(url);
    if (found.length >= limit) break;
  }
  if (found.length === 0) throw new Error(`見本の一覧に URL が見つからなかった（形が変わった?）: ${listUrl}`);
  return found;
}

export type ImportedCharacter = Extract<ExternalImportServerResponse, { ok: true; kind: "character" }>;
export type ImportedScenario = Extract<ExternalImportServerResponse, { ok: true; kind: "scenario" }>;

/** 画面の取り込みと同じ入口（/api/import/external の中身）を、本物のサイトに対して通す */
export function liveImport(url: string): Promise<ExternalImportServerResponse> {
  return politely(new URL(url).hostname, () => handleExternalImport({ url }, { timeoutMs: 20_000 }));
}

/**
 * 候補を順に取り込み、最初に読めたものを返す（消された・非公開にされた見本は飛ばす）。
 * どれも読めなければ、候補ごとの理由を並べて落とす
 */
export async function importFirst(urls: string[]): Promise<ExternalImportServerResponse & { ok: true }> {
  const failures: string[] = [];
  for (const url of urls) {
    const r = await liveImport(url);
    if (r.ok) return r;
    failures.push(`${url} → ${r.status} ${r.error}`);
  }
  throw new Error(`どの見本も取り込めなかった:\n${failures.join("\n")}`);
}

export async function importCharacter(urls: string[]): Promise<ImportedCharacter> {
  const r = await importFirst(urls);
  if (r.kind !== "character") throw new Error(`キャラクターではなく ${r.kind} として読まれた: ${r.url}`);
  return r;
}

export function sheetOf(r: ImportedCharacter): CharacterSheet {
  const sheet = r.character.sheet;
  if (!sheet) throw new Error(`シートが作られなかった: ${r.url}`);
  return sheet;
}

/** 欄を id で引く。無ければ、ある欄の一覧を添えて落とす */
export function sectionOf(r: ImportedCharacter, id: string): SheetSection {
  const sheet = sheetOf(r);
  const s = sheet.sections.find((x) => x.id === id);
  if (!s) {
    throw new Error(
      `欄「${id}」が無い（${r.url}）。ある欄: ${sheet.sections.map((x) => `${x.id}:${x.title}`).join(", ")}`,
    );
  }
  return s;
}

export function labelsOf(section: SheetSection): string[] {
  return section.entries.map((e) => e.label);
}

/** いあきゃらの閲覧ページと同じ匿名の鍵で、タグの一覧（公開のキャラシ）から ID を拾う */
export async function discoverIachara(tag: string, limit = 3): Promise<{ id: number; version: string }[]> {
  const custom = await fetchText(`${IACHARA_API_ORIGIN}/v3/auth/guestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const customToken = (JSON.parse(custom.body) as { token?: string }).token;
  if (!customToken) throw new Error(`いあきゃらの匿名の鍵を受け取れなかった（HTTP ${custom.status}）`);
  const signIn = await fetchText(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${IACHARA_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const idToken = (JSON.parse(signIn.body) as { idToken?: string }).idToken;
  if (!idToken) throw new Error(`いあきゃらの鍵を ID トークンに替えられなかった（HTTP ${signIn.status}）`);
  const list = await fetchText(`${IACHARA_API_ORIGIN}/v3/charasheet/tag?tag=${encodeURIComponent(tag)}`, {
    headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" },
  });
  const rows = JSON.parse(list.body) as { id?: number; data?: { version?: string } }[];
  if (!Array.isArray(rows)) throw new Error(`いあきゃらのタグ一覧の形が違う（HTTP ${list.status}）`);
  return rows
    .filter((r) => typeof r.id === "number")
    .map((r) => ({ id: r.id!, version: r.data?.version ?? "" }))
    .slice(0, limit * 4);
}

/**
 * 候補を順に取り込み、check（expect を並べた関数）を満たすものが 1 つあれば通す。
 * 見本の書きかけ（名前だけ・値が空）で落ちないよう候補を数件見るが、読み取りの誤りならどの候補でも落ちる。
 * どれも満たさなければ、候補ごとの理由を並べて落とす
 */
export async function expectSomeCharacter(
  urls: string[],
  check: (r: ImportedCharacter) => void,
): Promise<ImportedCharacter> {
  const failures: string[] = [];
  for (const url of urls) {
    const r = await liveImport(url);
    if (!r.ok) {
      failures.push(`${url} → 取り込めなかった: ${r.status} ${r.error}`);
      continue;
    }
    if (r.kind !== "character") {
      failures.push(`${url} → キャラクターではなく ${r.kind} として読まれた`);
      continue;
    }
    try {
      check(r);
      return r;
    } catch (error) {
      failures.push(`${url} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`どの見本も期待を満たさなかった:\n${failures.join("\n")}`);
}

/** 欄の値が数（または数にできる文字）か */
export function isNumeric(v: unknown): boolean {
  return typeof v === "number" || (typeof v === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(v.trim()));
}
