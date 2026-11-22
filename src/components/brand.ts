/**
 * 卓譜のブランドマーク（盤と一手）。
 * 「譜」は棋譜の譜: 盤の上の一手を書き留めたもの。卓譜は卓の上の一回一回を書き留める道具なので、
 * 3×3 の盤（卓・マップ）と、その交点に置いた一つの駒で表す。
 *
 * ここが唯一の出所。アプリ内のロゴ（`LogoMark`）、卓報告カード、favicon・アプリアイコン・OG 画像
 * （`scripts/gen-brand.ts` が書き出す）はすべてこの形を使う。形を変えたら `pnpm run gen:brand` を実行する。
 * JSX を含めない（生成スクリプトから node で直接読み込むため）。
 */

export const BRAND_COLORS = {
  /** 主色テラコッタ（tailwind.config.ts の takufu primary と同じ） */
  tile: "#ab4120",
  /** 面の白（base-100） */
  paper: "#fffdf9",
  /** 地（base-200） */
  ground: "#f2ebe0",
  /** 墨 */
  ink: "#221c17",
} as const;

/** マークの座標系は 32 四方。16px で描くと 1 単位 = 0.5px なので、線（2 単位）は 1px で画素にそろう */
export const MARK_VIEWBOX = 32;
export const MARK_RADIUS = 7;
/** 盤: 外枠と内側の線（3×3 のます） */
export const MARK_BOARD = "M7 7h18v18H7zM13 7v18M19 7v18M7 13h18M7 19h18";
export const MARK_BOARD_WIDTH = 2;
export const MARK_BOARD_OPACITY = 0.5;
/** 一手（右上寄りの交点に置いた駒） */
export const MARK_STONE = { cx: 19, cy: 13, r: 4.75 } as const;

export interface MarkSvgOptions {
  /** 出力の幅・高さ（px）。省略すると viewBox のまま */
  size?: number;
  tile?: string;
  on?: string;
  /** 角の丸み（viewBox 単位）。iOS・マスカブルのように OS が角を切るものは 0 */
  radius?: number;
  /** 盤と駒を縮める割合（マスカブルアイコンの安全域に収めるとき 0.8 など） */
  contentScale?: number;
}

/** マークの中身（盤と駒）だけ。ほかの SVG に埋め込むとき使う */
export function markContent(on: string, contentScale = 1): string {
  const c = MARK_VIEWBOX / 2;
  const t =
    contentScale === 1
      ? ""
      : ` transform="translate(${c} ${c}) scale(${contentScale}) translate(${-c} ${-c})"`;
  return (
    `<g${t}>` +
    `<path d="${MARK_BOARD}" fill="none" stroke="${on}" stroke-opacity="${MARK_BOARD_OPACITY}" stroke-width="${MARK_BOARD_WIDTH}" stroke-linejoin="round"/>` +
    `<circle cx="${MARK_STONE.cx}" cy="${MARK_STONE.cy}" r="${MARK_STONE.r}" fill="${on}"/>` +
    `</g>`
  );
}

/** 単独の SVG 文書としてのマーク（favicon・アイコンの原稿） */
export function markSvg(opts: MarkSvgOptions = {}): string {
  const {
    size,
    tile = BRAND_COLORS.tile,
    on = BRAND_COLORS.paper,
    radius = MARK_RADIUS,
    contentScale = 1,
  } = opts;
  const dim = size ? ` width="${size}" height="${size}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}"${dim}>` +
    `<rect width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}" rx="${radius}" fill="${tile}"/>` +
    markContent(on, contentScale) +
    `</svg>`
  );
}
