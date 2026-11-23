/**
 * 人・卓・キャラクターの既定の画像（P9）。変わらない ID を種に、同じ種からは必ず同じ絵を作る。
 *
 * 人とキャラは顔が分かるよう、胸から上の平たい人の姿（髪形・髪色・肌・服・襟・眼鏡を種から選ぶ）。
 * 卓は判子と和柄の版木の意匠。文字（頭文字）は使わない。
 * - user（人）: 無地の薄い地に人の姿
 * - character（キャラクター）: 和柄を薄く敷いた地に人の姿（人と見分けられるよう地だけ変える）
 * - table（卓）: 角印。和柄の面の中央に、卓を囲むダイスの目
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

/** 人の髪の形 */
export type HairStyle =
  | "short"
  | "sidePart"
  | "bob"
  | "long"
  | "bun"
  | "curly"
  | "buzz"
  | "ponytail"
  | "beanie";

export const HAIR_STYLES: readonly HairStyle[] = [
  "short",
  "sidePart",
  "bob",
  "long",
  "bun",
  "curly",
  "buzz",
  "ponytail",
  "beanie",
];

/** 肌の色（明るい順） */
export const SKIN_TONES = ["#f3d9c0", "#e9c3a0", "#d6a47e", "#b98260", "#8d5e42"] as const;

/** 髪の色（墨・焦茶・栗・赤茶・灰・藍墨） */
export const HAIR_TONES = ["#2a221d", "#4a3426", "#6e4528", "#8f4a2c", "#8b8177", "#2f3a48"] as const;

/** 襟元の形 */
export type Neckline = "crew" | "vee" | "collar";
export const NECKLINES: readonly Neckline[] = ["crew", "vee", "collar"];

export interface IdenticonSpec {
  kind: IdenticonKind;
  /** 人・キャラは服の色、卓は印の色 */
  ink: string;
  pattern: PatternId;
  /** 和柄の向き（度） */
  rotate: number;
  /** 和柄の大きさ（倍） */
  scale: number;
  /** 卓の印のダイスの目（1〜6）。卓以外は 0 */
  pips: number;
  /** 人・キャラの姿。卓は null */
  figure: FigureSpec | null;
}

export interface FigureSpec {
  hair: HairStyle;
  hairTone: string;
  skin: string;
  neckline: Neckline;
  /** 地の色（服とは別の顔料を紙で薄めた色） */
  ground: string;
  glasses: boolean;
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
  const ink = pick(r, IDENTICON_INKS);
  const pattern = pick(r, PATTERN_IDS);
  const rotate = pick(r, [0, 15, 30, 45, 60, 90]);
  const scale = pick(r, [1, 1.3, 1.6]);
  const pips = kind === "table" ? 1 + Math.floor(r() * 6) : 0;
  let figure: FigureSpec | null = null;
  if (kind !== "table") {
    // 地は服と別の顔料にして、肩が地に溶けないようにする
    const others = IDENTICON_INKS.filter((c) => c !== ink);
    figure = {
      hair: pick(r, HAIR_STYLES),
      hairTone: pick(r, HAIR_TONES),
      skin: pick(r, SKIN_TONES),
      neckline: pick(r, NECKLINES),
      ground: mix(pick(r, others), IDENTICON_PAPER, 0.72),
      glasses: r() < 0.22,
    };
  }
  return { kind, ink, pattern, rotate, scale, pips, figure };
}

/** 2 色を混ぜる（t は b の割合） */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(a, i) * (1 - t) + ch(b, i) * t)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

const P = IDENTICON_PAPER;

/** 和柄の 1 枚（userSpaceOnUse の単位）。色は紙、濃さは呼び出し側の opacity で決める */
function patternTile(id: PatternId, P: string): { w: number; h: number; body: string } {
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

function patternDef(spec: IdenticonSpec, pid: string, color: string = IDENTICON_PAPER): string {
  const t = patternTile(spec.pattern, color);
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

/** 顔のパーツの色（墨） */
const FACE_INK = "#2a221d";

/** 髪の後ろ側（頭と体より奥に描く） */
function hairBack(style: HairStyle): string {
  switch (style) {
    case "bob":
      return "M18.5 31C18 19.5 24 14 32 14s14 5.5 13.5 17l.5 10.5c-2.5 1-5 1-7 0H25.5c-2 1-4.5 1-7 0z";
    case "long":
      return "M18.5 30C18 19 24 14 32 14s14 5 13.5 16L47 54H17z";
    case "bun":
      return "M32 6.5a6 6 0 1 1 0 12 6 6 0 1 1 0-12z";
    case "ponytail":
      return "M39 17c9-1.5 12.5 7.5 10 17.5-1.5 4-3 6-4.5 7 .5-6-1-12.5-5-16z";
    default:
      return "";
  }
}

/** 髪の前側（額と頭頂）。頭の輪郭（中心 32,29・横 10.5・縦 11.5）にかぶせる */
function hairFront(style: HairStyle): string {
  switch (style) {
    case "short":
      return "M21 30.5C20 21 25 15.5 32 15.5S44 21 43 30.5c-1.4-4.2-3.6-6.8-6.8-8-3.8 2.8-9.4 4-15.2 8z";
    case "sidePart":
      return "M21 31C20 21 25.5 15 32 15s12.5 5.5 11 15c-2.6-5.4-8.6-7.8-15.4-8.4-2.8 2-5 5.2-6.6 9.4z";
    case "bob":
      return "M21.3 28C21.5 20 26 16.3 32 16.3S42.5 20 42.7 28c-3-2-6.6-2.8-10.7-2.8S24.3 26 21.3 28z";
    case "long":
      return "M21.2 30C20.6 21 25.5 16 32 16s11.4 5 10.8 14c-1.5-4.6-4.6-7.4-8.6-8.4-1.8 3.2-6.4 6-13 8.4z";
    case "bun":
      return "M21.2 29C21 21 25.6 16.5 32 16.5S43 21 42.8 29c-2.4-4.4-6.2-6.4-10.8-6.4s-8.4 2-10.8 6.4z";
    case "curly":
      return "M19 31a3.6 3.6 0 0 1 0-6.6 4.4 4.4 0 0 1 3.6-6.6 5 5 0 0 1 7-4.2 5 5 0 0 1 7.6.6 4.4 4.4 0 0 1 5.4 5.4 4 4 0 0 1 2.4 6.2 3.4 3.4 0 0 1-1.4 5.4c-1-2.6-2.4-4.6-4.2-5.8-4.8 1.6-10.4 1.4-15.2 0-2 1.4-3.4 3.4-4.2 5.6z";
    case "buzz":
      return "M21.4 28.5C21 20.5 25.8 16.8 32 16.8s11 3.7 10.6 11.7c-2.6-3.6-6.2-5.2-10.6-5.2s-8 1.6-10.6 5.2z";
    case "ponytail":
      return "M21.2 29.5C20.8 21 25.6 16 32 16s11.2 5 10.8 13.5c-2.2-4.8-6.4-7.4-10.8-7.4s-8.6 2.6-10.8 7.4z";
    case "beanie":
      return "M19.6 27.5C19.6 18 25 12.6 32 12.6S44.4 18 44.4 27.5z";
  }
}

/** 襟元。体の上に重ねる */
function neckline(n: Neckline, skin: string, ink: string): string {
  switch (n) {
    case "crew":
      return `<path d="M26.4 46.6c1.4 2.6 3.4 3.8 5.6 3.8s4.2-1.2 5.6-3.8z" fill="${skin}"/>`;
    case "vee":
      return `<path d="M26.6 46.4 32 54l5.4-7.6z" fill="${skin}"/>`;
    case "collar":
      return `<path d="M27 46.6 32 51.5l5-4.9z" fill="${skin}"/><path d="M26.4 45.8 32 51.5l-3.6 4.2-4.2-8.4zM37.6 45.8 32 51.5l3.6 4.2 4.2-8.4z" fill="${P}" stroke="${ink}" stroke-opacity=".25" stroke-width=".6" stroke-linejoin="round"/>`;
  }
}

/** 胸から上の人の姿（64×64 の座標）。地は呼び出し側が敷く */
function figureSvg(ink: string, f: FigureSpec): string {
  const back = hairBack(f.hair);
  const front = hairFront(f.hair);
  const shade = `<path d="M28 38h8v6c-2.6 1.4-5.4 1.4-8 0z" fill="${FACE_INK}" opacity=".12"/>`;
  const beanieBand =
    f.hair === "beanie" ? `<path d="M19.4 24.6h25.2v4.2H19.4z" fill="${FACE_INK}" opacity=".22"/>` : "";
  const glasses = f.glasses
    ? `<g fill="none" stroke="${FACE_INK}" stroke-width="1.3"><circle cx="27.4" cy="30.6" r="3.5"/><circle cx="36.6" cy="30.6" r="3.5"/><path d="M30.9 30.4h2.2"/></g>`
    : "";
  return [
    back ? `<path d="${back}" fill="${f.hairTone}"/>` : "",
    `<path d="M28 36h8v9h-8z" fill="${f.skin}"/>`,
    shade,
    `<path d="M8 66c0-12.5 9.5-20 24-20s24 7.5 24 20z" fill="${ink}"/>`,
    neckline(f.neckline, f.skin, ink),
    `<circle cx="21.6" cy="31" r="2.4" fill="${f.skin}"/><circle cx="42.4" cy="31" r="2.4" fill="${f.skin}"/>`,
    `<ellipse cx="32" cy="29" rx="10.5" ry="11.5" fill="${f.skin}"/>`,
    `<path d="${front}" fill="${f.hairTone}"/>`,
    beanieBand,
    `<g fill="${FACE_INK}"><circle cx="27.4" cy="30.8" r="1.35"/><circle cx="36.6" cy="30.8" r="1.35"/></g>`,
    `<path d="M29.8 35.6c1.4 1.1 3 1.1 4.4 0" fill="none" stroke="${FACE_INK}" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/>`,
    glasses,
  ].join("");
}

/** SVG の文字列。64×64 の viewBox で、どの大きさにも縮む */
export function identiconSvg(seed: string, kind: IdenticonKind): string {
  const spec = identiconSpec(seed, kind);
  const pid = `tk${fnv1a(`${kind}:${seed}`).toString(36)}`;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`;
  if (spec.figure) {
    // 人: 無地の薄い地に胸から上の姿。キャラ: 和柄の地に同じ姿（人と見分けられるよう地を変える）
    const f = spec.figure;
    const clip = `${pid}c`;
    const ground =
      kind === "user"
        ? `<rect width="64" height="64" fill="${f.ground}"/>`
        : `<rect width="64" height="64" fill="${f.ground}"/><rect width="64" height="64" fill="url(#${pid})" opacity=".08"/>`;
    const groundDefs =
      kind === "user"
        ? `<defs><clipPath id="${clip}"><circle cx="32" cy="32" r="32"/></clipPath></defs>`
        : `<defs>${patternDef(spec, pid, FACE_INK)}<clipPath id="${clip}"><rect width="64" height="64" rx="12"/></clipPath></defs>`;
    return `${open}${groundDefs}<g clip-path="url(#${clip})">${ground}<g transform="matrix(1.1 0 0 1.1 -3.2 -6)">${figureSvg(spec.ink, f)}</g></g></svg>`;
  }
  // 卓の角印: 和柄の面の中央にダイスの目
  const defs = `<defs>${patternDef(spec, pid)}</defs>`;
  const pips = (PIPS[spec.pips] ?? PIPS[1]!)
    .map(([x, y]) => `<circle cx="${32 + x * 7}" cy="${32 + y * 7}" r="${spec.pips === 1 ? 4.2 : 2.9}"/>`)
    .join("");
  return `${open}${defs}<rect width="64" height="64" rx="12" fill="${spec.ink}"/><rect x="5" y="5" width="54" height="54" rx="8" fill="url(#${pid})" opacity=".4"/><rect x="16" y="16" width="32" height="32" rx="7" fill="${P}"/><g fill="${spec.ink}">${pips}</g></svg>`;
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
