/**
 * 卓譜のブランドマーク（喋るダイス）。
 * 吹き出しがそのままダイスの三の目になっている。卓で交わした言葉（ログ）と振ったダイスを、1 つの形で残す。
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

/** マークの座標系は 32 四方。16px で描くと 1 単位 = 0.5px なので、本体の辺（偶数の座標）は画素にそろう */
export const MARK_VIEWBOX = 32;
export const MARK_RADIUS = 7;
/** 本体: 20 四方のダイスの面に、左下のしっぽ（吹き出し） */
export const MARK_BODY =
  "M11 4H21A5 5 0 0 1 26 9V19A5 5 0 0 1 21 24H16.4L11.2 28.1A0.8 0.8 0 0 1 9.9 27.5V23.9A5 5 0 0 1 6 19V9A5 5 0 0 1 11 4Z";
/** 三の目 */
export const MARK_PIPS = [
  { cx: 11, cy: 9 },
  { cx: 16, cy: 14 },
  { cx: 21, cy: 19 },
] as const;
export const MARK_PIP_R = 2.4;
/** 目を抜いた本体（fill-rule: evenodd で塗る）。地の色を渡さなくても、目に地が透ける */
export const MARK_SHAPE =
  MARK_BODY +
  MARK_PIPS.map(
    ({ cx, cy }) =>
      `M${cx - MARK_PIP_R} ${cy}a${MARK_PIP_R} ${MARK_PIP_R} 0 1 0 ${MARK_PIP_R * 2} 0a${MARK_PIP_R} ${MARK_PIP_R} 0 1 0 ${-MARK_PIP_R * 2} 0Z`,
  ).join("");

export interface MarkSvgOptions {
  /** 出力の幅・高さ（px）。省略すると viewBox のまま */
  size?: number;
  tile?: string;
  on?: string;
  /** 角の丸み（viewBox 単位）。iOS・マスカブルのように OS が角を切るものは 0 */
  radius?: number;
  /** 中身を縮める割合（マスカブルアイコンの安全域に収めるとき 0.9 など） */
  contentScale?: number;
}

/** マークの中身（吹き出しのダイス）だけ。ほかの SVG に埋め込むとき使う */
export function markContent(on: string, contentScale = 1): string {
  const c = MARK_VIEWBOX / 2;
  const t =
    contentScale === 1
      ? ""
      : ` transform="translate(${c} ${c}) scale(${contentScale}) translate(${-c} ${-c})"`;
  return `<g${t}><path d="${MARK_SHAPE}" fill="${on}" fill-rule="evenodd"/></g>`;
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
