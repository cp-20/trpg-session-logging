/**
 * 人・卓・キャラクターの既定の画像（P9）。変わらない ID を種に、同じ種からは必ず同じ絵を作る。
 *
 * 卓譜は遊んだ記録を残す「譜」なので、判子と和柄の版木の意匠にする。文字（頭文字）は使わない。
 * - user（人）: 丸い印。朱肉の面に和柄を白く彫った「白文」の円印
 * - table（卓）: 角印。和柄の面の中央に、卓を囲むダイスの目
 * - character（キャラクター）: 和柄の地に、盤に置くコマ（駒）の形
 *
 * 色は暖色の紙と墨に合う顔料の色だけ。面は不透明で塗り切るので、ライトでもダークでも同じ絵が地から浮く。
 */

export type IdenticonKind = "user" | "table" | "character";

export type PatternId =
  | "ichimatsu"
  | "kanoko"
  | "hishi"
  | "kikko"
  | "uroko"
  | "shippo"
  | "yagasuri"
  | "shima";

/** 顔料の色（朱・弁柄・藍・松葉・栗・紫・鉄・黄土・墨） */
export const IDENTICON_INKS = [
  "#b1452a",
  "#8e3b2a",
  "#36566f",
  "#4e6845",
  "#6d4a33",
  "#644a6b",
  "#3e6264",
  "#94671f",
  "#5a4d43",
] as const;

/** 彫った部分（紙の色）。DESIGN の面の色より少し暖かい */
export const IDENTICON_PAPER = "#f6eee3";

export const PATTERN_IDS: readonly PatternId[] = [
  "ichimatsu",
  "kanoko",
  "hishi",
  "kikko",
  "uroko",
  "shippo",
  "yagasuri",
  "shima",
];

export interface IdenticonSpec {
  kind: IdenticonKind;
  ink: string;
  pattern: PatternId;
  /** 和柄の向き（度） */
  rotate: number;
  /** 和柄の大きさ（倍） */
  scale: number;
  /** 卓の印のダイスの目（1〜6）。卓以外は 0 */
  pips: number;
}

/** FNV-1a（32bit）。種の文字列を数に直す */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 決定的な乱数列（mulberry32） */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

/** 種から絵の要素を決める（描画とは分けて、テストで違いを確かめられるようにする） */
export function identiconSpec(seed: string, kind: IdenticonKind): IdenticonSpec {
  const r = rng(fnv1a(`${kind}:${seed}`));
  return {
    kind,
    ink: pick(r, IDENTICON_INKS),
    pattern: pick(r, PATTERN_IDS),
    rotate: pick(r, [0, 15, 30, 45, 60, 90]),
    scale: pick(r, [1, 1.3, 1.6]),
    pips: kind === "table" ? 1 + Math.floor(r() * 6) : 0,
  };
}

const P = IDENTICON_PAPER;

/** 和柄の 1 枚（userSpaceOnUse の単位）。色は紙、濃さは呼び出し側の opacity で決める */
function patternTile(id: PatternId): { w: number; h: number; body: string } {
  switch (id) {
    case "ichimatsu":
      return { w: 8, h: 8, body: `<path d="M0 0h4v4H0zM4 4h4v4H4z" fill="${P}"/>` };
    case "kanoko":
      return {
        w: 8,
        h: 8,
        body: `<circle cx="4" cy="4" r="1.7" fill="${P}"/><circle cx="0" cy="0" r="1.1" fill="${P}"/><circle cx="8" cy="0" r="1.1" fill="${P}"/><circle cx="0" cy="8" r="1.1" fill="${P}"/><circle cx="8" cy="8" r="1.1" fill="${P}"/>`,
      };
    case "hishi":
      return {
        w: 8,
        h: 8,
        body: `<path d="M4 .8 7.2 4 4 7.2.8 4z" fill="none" stroke="${P}" stroke-width="1.1"/><path d="M4 2.8 5.2 4 4 5.2 2.8 4z" fill="${P}"/>`,
      };
    case "kikko": {
      // 尖り上の六角形の格子（一辺 4）
      const w = 6.928;
      return {
        w,
        h: 12,
        body: `<path d="M${w / 2} 0 ${w} 2v6l-${w / 2} 2L0 8V2zM${w / 2} 10v2" fill="none" stroke="${P}" stroke-width="1"/>`,
      };
    }
    case "uroko":
      return { w: 8, h: 7, body: `<path d="M0 7 4 0l4 7z" fill="${P}"/>` };
    case "shippo":
      return {
        w: 8,
        h: 8,
        body: `<g fill="none" stroke="${P}" stroke-width=".9"><circle cx="0" cy="0" r="4"/><circle cx="8" cy="0" r="4"/><circle cx="0" cy="8" r="4"/><circle cx="8" cy="8" r="4"/><circle cx="4" cy="4" r="4"/></g>`,
      };
    case "yagasuri":
      return { w: 8, h: 10, body: `<path d="M0 0l4 3 4-3v5l-4 3-4-3z" fill="${P}"/>` };
    case "shima":
      return { w: 6, h: 6, body: `<path d="M0 0h2.2v6H0z" fill="${P}"/>` };
  }
}

function patternDef(spec: IdenticonSpec, pid: string): string {
  const t = patternTile(spec.pattern);
  return `<pattern id="${pid}" width="${t.w}" height="${t.h}" patternUnits="userSpaceOnUse" patternTransform="rotate(${spec.rotate} 32 32) scale(${spec.scale})">${t.body}</pattern>`;
}

/** ダイスの目の位置（中心からのずれ、目の間隔を 1 とする） */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-1, -1],
    [1, 1],
  ],
  3: [
    [-1, -1],
    [0, 0],
    [1, 1],
  ],
  4: [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ],
  5: [
    [-1, -1],
    [1, -1],
    [0, 0],
    [-1, 1],
    [1, 1],
  ],
  6: [
    [-1, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [1, 1],
  ],
};

/** SVG の文字列。64×64 の viewBox で、どの大きさにも縮む */
export function identiconSvg(seed: string, kind: IdenticonKind): string {
  const spec = identiconSpec(seed, kind);
  const pid = `tk${fnv1a(`${kind}:${seed}`).toString(36)}`;
  const defs = `<defs>${patternDef(spec, pid)}</defs>`;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`;
  if (kind === "user") {
    // 円印: 朱肉の円、内側に枠、枠の中に彫った和柄
    return `${open}${defs}<circle cx="32" cy="32" r="32" fill="${spec.ink}"/><circle cx="32" cy="32" r="25.5" fill="url(#${pid})" opacity=".62"/><circle cx="32" cy="32" r="28.2" fill="none" stroke="${P}" stroke-width="2"/></svg>`;
  }
  if (kind === "table") {
    // 角印: 和柄の面の中央にダイスの目
    const pips = (PIPS[spec.pips] ?? PIPS[1]!)
      .map(([x, y]) => `<circle cx="${32 + x * 7}" cy="${32 + y * 7}" r="${spec.pips === 1 ? 4.2 : 2.9}"/>`)
      .join("");
    return `${open}${defs}<rect width="64" height="64" rx="12" fill="${spec.ink}"/><rect x="5" y="5" width="54" height="54" rx="8" fill="url(#${pid})" opacity=".4"/><rect x="16" y="16" width="32" height="32" rx="7" fill="${P}"/><g fill="${spec.ink}">${pips}</g></svg>`;
  }
  // コマ: 和柄の地に将棋の駒の形
  return `${open}${defs}<rect width="64" height="64" fill="${spec.ink}"/><rect width="64" height="64" fill="url(#${pid})" opacity=".42"/><path d="M32 11 46 18.5 50 53H14l4-34.5z" fill="${P}" stroke="${spec.ink}" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 18 41.5 23 44 46H20l2.5-23z" fill="none" stroke="${spec.ink}" stroke-opacity=".35" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
}

const uriCache = new Map<string, string>();

/** <img src> にそのまま渡せる data URI。描画のたびに作り直さないよう覚えておく */
export function identiconDataUri(seed: string, kind: IdenticonKind): string {
  const key = `${kind}\0${seed}`;
  const hit = uriCache.get(key);
  if (hit !== undefined) return hit;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(identiconSvg(seed, kind))}`;
  if (uriCache.size >= 1000) {
    const first = uriCache.keys().next().value;
    if (first !== undefined) uriCache.delete(first);
  }
  uriCache.set(key, uri);
  return uri;
}
