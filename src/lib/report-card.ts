/**
 * X に貼る画像（卓報告カード）の中身。描画はサーバー（src/server/og-image.tsx の renderReportCard）。
 *
 * - 載せるのは、卓報告で書かれているもの（システム・『題名』・作者・KP/GM・PL と PC・遊んだ日）。
 *   ネタバレになるもの（SAN・HP・エンディング・生還かどうか）は載せない。
 * - 人の画像（アイコン・立ち絵）は載せない。本文に画像を入れないので、本文は小さい（REPORT_BODY_MAX）。
 *   本番の前段（CloudFront）は大きな POST を断るので、この上限を超えない形にしておく。
 * - 名前を載せるかは作る人が選ぶ（ReportCardOptions）。共有ページで非表示の参加者と、
 *   「共有ページで名前を隠す」にした自分は、選んでも載せない（src/lib/share-gate.ts と同じ規則）。
 * - 記録した人のブラウザがこの形にしてサーバーへ送り、サーバーは画像にして返すだけで覚えない。
 */
import { SYSTEMS } from "../data/systems";
import type { Log, State } from "../types";
import { fmtDates, fmtDur } from "./format";
import { clip, type OgSystem } from "./og-card";
import { roleLabel } from "./roles";
import { sessionTitle } from "./session-scenario";
import { sessionDays, sittingsMinutes } from "./sittings";

/** 顔ぶれの 1 行。名前を載せない項目は無し（PC も PL も無ければ、その人は載せない）。人ごとの色は付けない */
export interface ReportCardMember {
  /** PC の名前 */
  pc?: string;
  /** PL の名前 */
  pl?: string;
}

export interface ReportCard {
  title: string;
  system?: OgSystem;
  /** シナリオの作者 */
  author?: string;
  /** 遊んだ日（2026年9月26日(土)） */
  when?: string;
  /** 遊んだ時間（3時間2分） */
  duration?: string;
  /** 卓の名前 */
  table?: string;
  /** 進行役の呼び方（CoC なら KP）と名前。名前を載せないときは無し */
  gm?: { label: string; name: string };
  /** 遊び手の呼び方（PL） */
  plLabel: string;
  members: ReportCardMember[];
  /** 札に収まらず載せなかった顔ぶれの数（「ほか N 人」） */
  more?: number;
}

/** 何を載せるか。作る人が選ぶ */
export interface ReportCardOptions {
  /** PC の名前 */
  pc: boolean;
  /** KP/GM と PL の名前 */
  names: boolean;
  /** シナリオの作者 */
  author: boolean;
  /** 遊んだ日 */
  when: boolean;
  /** 遊んだ時間 */
  duration: boolean;
  /** 卓の名前 */
  table: boolean;
}

/**
 * 既定。X の卓報告は「システム『題名』（作者）/ KP / PL（PC）/ 日付」を書くのが普通なので、それに合わせる。
 * 卓の名前は卓報告に書かれず、内輪の集まりの名前のことが多いので既定で載せない
 */
export const REPORT_DEFAULTS: ReportCardOptions = {
  pc: true,
  names: true,
  author: true,
  when: true,
  duration: true,
  table: false,
};

/** 顔ぶれは 6 人まで（札に収まる数）。多い分は「ほか N 人」 */
export const REPORT_CAST_MAX = 6;
/** 送る本文の上限（バイト）。本番の前段が断る大きさ（およそ 1〜2 万バイト）より十分小さく */
export const REPORT_BODY_MAX = 8_192;

const LIMIT = { title: 40, name: 14, author: 20, table: 20, when: 40, duration: 16, label: 12, system: 40 };

/**
 * 文字数で切り、さらにコード単位でも切る（結合文字を重ねた 1 文字で本文が膨らまないように）
 */
function short(v: string, max: number): string {
  const s = clip(v, max);
  return s.length <= max * 4 ? s : `${s.slice(0, max * 4)}…`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** 遊んだ日を、年から書く（記録として残る 1 枚なので）: 2026年9月26日(土) */
function whenWithYear(days: string[]): string {
  const year = days[0]?.slice(0, 4);
  const label = fmtDates(days);
  return year && /^\d{4}$/.test(year) ? `${year}年${label}` : label;
}

/** 卓報告カードに名前を載せてよい人か（共有ページで非表示の人・名前を隠すにした自分は載せない） */
function nameVisible(log: Log, state: State, uid: string): boolean {
  if (log.players[uid]?.hidden) return false;
  return !(state.prefs.hideSelfOnShare && uid === state.me);
}

/** 投稿文に添える遊び手の人数（進行役と、共有ページで非表示の人は数えない）。カードには載せない */
export function reportPlayerCount(log: Log, state: State): number {
  return Object.entries(log.players).filter(
    ([uid, link]) => uid !== log.ownerId && !link.hidden && Boolean(state.users[uid]),
  ).length;
}

/** 記録した人の手元の記録から、卓報告カードの中身を作る */
export function reportCardFromSession(
  log: Log,
  state: State,
  options: ReportCardOptions = REPORT_DEFAULTS,
): ReportCard {
  const sys = SYSTEMS[log.systemId];
  const minutes = sittingsMinutes(log.sittings);
  const days = sessionDays(log);
  const table = log.tableId ? state.tables?.[log.tableId]?.name : undefined;
  const author = state.scenarios[log.scenarioId]?.author?.trim();
  const gmUser = state.users[log.ownerId];
  const gmName = gmUser && options.names && nameVisible(log, state, log.ownerId) ? gmUser.name : undefined;

  const members: ReportCardMember[] = [];
  for (const [uid, link] of Object.entries(log.players)) {
    if (uid === log.ownerId || link.hidden) continue;
    const user = state.users[uid];
    if (!user) continue;
    // 名前を隠すにした自分は、PC も含めて載せない（PC から人が分かるため）
    if (!nameVisible(log, state, uid)) continue;
    const pl = options.names ? short(user.name, LIMIT.name) : undefined;
    const chars = options.pc
      ? link.characterIds.map((id) => state.characters[id]).filter((c) => c !== undefined)
      : [];
    if (chars.length === 0) {
      if (pl) members.push({ pl });
      continue;
    }
    for (const c of chars)
      members.push({
        pc: short(c.name, LIMIT.name),
        ...(pl ? { pl } : {}),
      });
  }

  return {
    title: short(sessionTitle(log, state.scenarios), LIMIT.title),
    ...(sys ? { system: { name: sys.name, color: sys.color } } : {}),
    ...(options.author && author ? { author: short(author, LIMIT.author) } : {}),
    ...(options.when && days.length > 0 ? { when: whenWithYear(days) } : {}),
    ...(options.duration && minutes > 0 ? { duration: fmtDur(minutes) } : {}),
    ...(options.table && table ? { table: short(table, LIMIT.table) } : {}),
    ...(gmName ? { gm: { label: roleLabel(log.systemId, "GM"), name: short(gmName, LIMIT.name) } } : {}),
    plLabel: roleLabel(log.systemId, "PL"),
    members: members.slice(0, REPORT_CAST_MAX),
    ...(members.length > REPORT_CAST_MAX ? { more: members.length - REPORT_CAST_MAX } : {}),
  };
}

/* ---------- サーバーで受け取るときの確かめ（送られてきたものは信じない） ---------- */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const text = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? short(v, max) : undefined;
const color = (v: unknown): string | undefined => (typeof v === "string" && HEX.test(v) ? v : undefined);

/** 送られてきた中身を確かめて、描ける形にする。題名が無いなど描けないものは null */
export function parseReportCard(body: unknown): ReportCard | null {
  const r = rec(body);
  const title = text(r?.title, LIMIT.title);
  if (!r || !title) return null;
  const sys = rec(r.system);
  const sysName = text(sys?.name, LIMIT.system);
  const sysColor = color(sys?.color);
  const gm = rec(r.gm);
  const gmLabel = text(gm?.label, LIMIT.label);
  const gmName = text(gm?.name, LIMIT.name);
  const members = (Array.isArray(r.members) ? r.members : [])
    .slice(0, REPORT_CAST_MAX)
    .flatMap((m): ReportCardMember[] => {
      const x = rec(m);
      const pc = text(x?.pc, LIMIT.name);
      const pl = text(x?.pl, LIMIT.name);
      if (!pc && !pl) return [];
      return [{ ...(pc ? { pc } : {}), ...(pl ? { pl } : {}) }];
    });
  const count = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) ? Math.min(Math.max(v, 0), 99) : 0;
  const more = count(r.more);
  const optional = (key: keyof typeof LIMIT, v: unknown) => {
    const t = text(v, LIMIT[key]);
    return t ? { [key]: t } : {};
  };
  return {
    title,
    ...(sysName && sysColor ? { system: { name: sysName, color: sysColor } } : {}),
    ...optional("author", r.author),
    ...optional("when", r.when),
    ...optional("duration", r.duration),
    ...optional("table", r.table),
    ...(gmLabel && gmName ? { gm: { label: gmLabel, name: gmName } } : {}),
    plLabel: text(r.plLabel, LIMIT.label) ?? "PL",
    members,
    ...(more > 0 ? { more } : {}),
  };
}

/** 選んだ「何を載せるか」を覚えておく場所（この端末だけ。人の名前などは入れない） */
export const REPORT_OPTIONS_KEY = "takufu-report-card-options";

/** 覚えておいた選択を読む。壊れていれば既定に戻す（足りない項目も既定） */
export function parseReportOptions(raw: string | null): ReportCardOptions {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : undefined;
  } catch {
    v = undefined;
  }
  const r = rec(v);
  const out = { ...REPORT_DEFAULTS };
  if (!r) return out;
  for (const key of Object.keys(out) as (keyof ReportCardOptions)[])
    if (typeof r[key] === "boolean") out[key] = r[key];
  return out;
}

/**
 * 選べる項目。この記録にあるものだけ（無い作者・卓・時間や、載せられる人のいない名前を選ばせない）。
 * Web と モバイルで同じものを出す
 */
export function reportCardChoices(log: Log, state: State): { key: keyof ReportCardOptions; label: string }[] {
  const all = reportCardFromSession(log, state, {
    pc: true,
    names: true,
    author: true,
    when: true,
    duration: true,
    table: true,
  });
  const gm = roleLabel(log.systemId, "GM");
  const pl = roleLabel(log.systemId, "PL");
  const list: { key: keyof ReportCardOptions; label: string }[] = [];
  if (all.members.some((m) => m.pc)) list.push({ key: "pc", label: "PC の名前" });
  if (all.gm || all.members.some((m) => m.pl)) list.push({ key: "names", label: `${gm}・${pl} の名前` });
  if (all.author) list.push({ key: "author", label: "作者" });
  if (all.when) list.push({ key: "when", label: "日付" });
  if (all.duration) list.push({ key: "duration", label: "遊んだ時間" });
  if (all.table) list.push({ key: "table", label: "卓の名前" });
  return list;
}
