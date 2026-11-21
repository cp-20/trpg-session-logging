/**
 * LP の書体は、LP に出てくる文字だけに絞ったファイル（public/fonts/lp-*.woff2）を使う。
 * 日本語の書体を丸ごと（Unicode 範囲ごとの分割ファイル数十個）読ませないため。
 * 絞る文字は LP のソースから機械的に集める。文言を変えたら `pnpm run fonts:lp` で作り直す
 * （作り直し忘れは単体テストが落とす）。
 */

/** LP のソースの範囲（Landing.tsx のこの 2 つの見出しコメントの間: 外枠 + LP 本体） */
export const LP_SOURCE_START = "/* ---------- 公開ページの外枠";
export const LP_SOURCE_END = "/* ================= ライセンス・規約";

/** 入力欄や数字・記号など、ソースに無くても出しうる文字 */
const ALWAYS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~" +
  "　、。・「」『』（）〈〉【】ー〜…‥―–—→←↑↓×÷±＋－＝！？：；／％＆＃＠";

export function lpSourceSlice(landingSource: string): string {
  const start = landingSource.indexOf(LP_SOURCE_START);
  const end = landingSource.indexOf(LP_SOURCE_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Landing.tsx の LP の範囲を示すコメントが見つかりません");
  }
  return landingSource.slice(start, end);
}

/** 書体に入れる文字（重複なし・コードポイント順）。改行やタブなどの制御文字は除く */
export function lpFontChars(landingSource: string, extraSources: string[] = []): string {
  const set = new Set<string>();
  for (const text of [ALWAYS, lpSourceSlice(landingSource), ...extraSources]) {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) continue;
      // 絵文字・異体字セレクタなど、本文の書体で描かないもの
      if (cp >= 0xfe00 && cp <= 0xfe0f) continue;
      if (cp >= 0x1f000) continue;
      set.add(ch);
    }
  }
  return [...set].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join("");
}

/** rights.ts の LEGAL_LINKS のリンク名（外枠のフッターに出る） */
export function lpRightsLabels(rightsSource: string): string {
  const start = rightsSource.indexOf("export const LEGAL_LINKS");
  if (start < 0) throw new Error("rights.ts に LEGAL_LINKS が見つかりません");
  const block = rightsSource.slice(start, rightsSource.indexOf("] as const", start));
  return [...block.matchAll(/label: "([^"]*)"/g)].map((m) => m[1]).join("");
}

/** 足りない文字（作り直しが必要なもの）を返す */
export function missingChars(needed: string, available: string): string[] {
  const have = new Set(available);
  return [...new Set(needed)].filter((ch) => !have.has(ch));
}
