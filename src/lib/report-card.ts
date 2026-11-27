/**
 * X の #卓報告 に貼る画像（卓報告カード）の中身。描画はサーバー（src/server/og-image.tsx の renderReportCard）。
 *
 * - ネタバレになるもの（SAN・HP・エンディング・生還かどうか）は載せない。載せるのは
 *   シナリオの題名・システム・遊んだ日・所要時間・卓・GM と、PC と PL の顔ぶれだけ。
 * - 画像は埋め込み（data URL）だけを描く。外の URL はサーバーから取りに行かない（無ければ ID から作る顔）。
 * - 記録した人のブラウザがこの形にしてサーバーへ送り、サーバーは画像にして返すだけで覚えない。
 */
import { SYSTEMS } from "../data/systems";
import type { Log, State } from "../types";
import { fmtDates, fmtDur } from "./format";
import { clip, safeImage, type OgSystem } from "./og-card";
import { roleLabel } from "./roles";
import { sessionTitle } from "./session-scenario";
import { sessionDays, sittingsMinutes } from "./sittings";

export interface ReportCardPerson {
  name: string;
  image?: string;
  /** 画像が無いときの顔の種（ユーザー ID・キャラクター ID） */
  seed: string;
  /** PC の職業など（ネタバレにならない紹介の 1 行） */
  note?: string;
}

export interface ReportCardCast {
  /** PC の名前。キャラクターを結んでいなければ無し（PL だけを出す） */
  pc?: ReportCardPerson;
  pl: ReportCardPerson;
}

export interface ReportCard {
  title: string;
  system?: OgSystem;
  /** 遊んだ日 */
  when: string;
  /** 所要時間（3時間2分） */
  duration?: string;
  /** 卓の名前 */
  table?: string;
  /** GM の呼び方（CoC なら KP）と人 */
  gm?: { label: string; person: ReportCardPerson };
  cast: ReportCardCast[];
}

/** 顔ぶれは 6 人まで（札に収まる数） */
export const REPORT_CAST_MAX = 6;
/** 1 枚の画像の上限（data URL の文字数）。大きすぎる画像は ID から作る顔にする */
const IMAGE_MAX = 400_000;

const person = (name: string, image: string | undefined, seed: string, note?: string): ReportCardPerson => {
  const img = image && image.length <= IMAGE_MAX ? safeImage(image) : undefined;
  const n = note?.trim() ? clip(note, 14) : undefined;
  return { name: clip(name, 14), seed, ...(img ? { image: img } : {}), ...(n ? { note: n } : {}) };
};

/** 遊んだ日を、年から書く（記録として残る 1 枚なので）: 2026年9月26日(土) */
function whenWithYear(days: string[]): string {
  const year = days[0]?.slice(0, 4);
  const label = fmtDates(days);
  return year && /^\d{4}$/.test(year) ? `${year}年${label}` : label;
}

/** 記録した人の手元の記録から、卓報告カードの中身を作る */
export function reportCardFromSession(log: Log, state: State): ReportCard {
  const sys = SYSTEMS[log.systemId];
  const minutes = sittingsMinutes(log.sittings);
  const table = log.tableId ? state.tables?.[log.tableId]?.name : undefined;
  const gmUser = state.users[log.ownerId];
  const cast: ReportCardCast[] = [];
  for (const [uid, link] of Object.entries(log.players)) {
    if (uid === log.ownerId || link.hidden) continue;
    const user = state.users[uid];
    if (!user) continue;
    const pl = person(user.name, user.image, user.handle ?? uid);
    const chars = link.characterIds.map((id) => state.characters[id]).filter((c) => c !== undefined);
    if (chars.length === 0) cast.push({ pl });
    for (const c of chars) cast.push({ pc: person(c.name, c.image, c.id, c.archetype), pl });
  }
  return {
    title: clip(sessionTitle(log, state.scenarios), 38),
    ...(sys ? { system: { name: sys.name, color: sys.color } } : {}),
    when: whenWithYear(sessionDays(log)),
    ...(minutes > 0 ? { duration: fmtDur(minutes) } : {}),
    ...(table ? { table: clip(table, 20) } : {}),
    ...(gmUser
      ? {
          gm: {
            label: roleLabel(log.systemId, "GM"),
            person: person(gmUser.name, gmUser.image, gmUser.handle ?? log.ownerId),
          },
        }
      : {}),
    cast: cast.slice(0, REPORT_CAST_MAX),
  };
}

/* ---------- サーバーで受け取るときの確かめ（送られてきたものは信じない） ---------- */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const text = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? clip(v, max) : undefined;

function parsePerson(v: unknown): ReportCardPerson | undefined {
  const r = rec(v);
  const name = text(r?.name, 14);
  const seed = text(r?.seed, 64);
  if (!r || !name || !seed) return undefined;
  const image = typeof r.image === "string" ? r.image : undefined;
  const note = text(r.note, 14);
  return person(name, image, seed, note);
}

/** 送られてきた中身を確かめて、描ける形にする。題名が無いなど描けないものは null */
export function parseReportCard(body: unknown): ReportCard | null {
  const r = rec(body);
  const title = text(r?.title, 38);
  const when = text(r?.when, 40);
  if (!r || !title || !when) return null;
  const sys = rec(r.system);
  const sysName = text(sys?.name, 40);
  const sysColor =
    typeof sys?.color === "string" && /^#[0-9a-f]{6}$/i.test(sys.color) ? sys.color : undefined;
  const gm = rec(r.gm);
  const gmPerson = parsePerson(gm?.person);
  const gmLabel = text(gm?.label, 12);
  const cast = (Array.isArray(r.cast) ? r.cast : [])
    .slice(0, REPORT_CAST_MAX)
    .flatMap((c): ReportCardCast[] => {
      const x = rec(c);
      const pl = parsePerson(x?.pl);
      if (!pl) return [];
      const pc = parsePerson(x?.pc);
      return [pc ? { pc, pl } : { pl }];
    });
  const duration = text(r.duration, 16);
  const table = text(r.table, 20);
  return {
    title,
    ...(sysName && sysColor ? { system: { name: sysName, color: sysColor } } : {}),
    when,
    ...(duration ? { duration } : {}),
    ...(table ? { table } : {}),
    ...(gmPerson && gmLabel ? { gm: { label: gmLabel, person: gmPerson } } : {}),
    cast,
  };
}
