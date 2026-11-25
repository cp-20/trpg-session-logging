/**
 * 場面の見出し（「～昼2～」「◆ シーン1 終了」「―――」など、話の区切りとして書かれた発言）を見分ける。
 * 記号は卓ごとに違うので、特定の記号を決め打ちしない。2 つの手がかりがそろったものだけを見出しにする:
 *   形   = 1 行の短い文が、飾りの記号で始まる・はさまれる
 *   中身 = 場面・時間の言葉（シーン・◯日目・昼2・導入…）がある
 * 中身が分からなくても、GM が同じ飾り（両端が同じ記号）を 2 回以上使っていれば、その卓の見出しの書き方とみなす。
 *
 * 実ログ 13 本（8,815 件、2026-11-25 に集計）では ◆ は 0 件、見出しは「～昼2～」の形が 5、「シーン1」「翌日……」が各 1。
 * 似た形の「【連続失踪、三人目】」（新聞の見出し）「〈目星〉を振りますか？」（技能）「『手記』山田太郎」（資料）
 * 「まだシーンは続きますか？」（会話）は見出しではない。場面の名前を発言者名にしたものは speaker-kinds.ts が見る。
 */
import type { Msg, MsgKind } from "../types";

const MAX_CORE = 24;
/** 飾りにならない記号: 台詞・資料・技能・補足の括弧と、文の句読点 */
const NOT_DECORATION = /[「」『』（）()〈〉、。，．,.！？!?…‥・:：;；'"“”％%+^\\￥/@]/u;
const SYMBOL = /[\p{S}\p{P}]/u;
const DIGIT = "[0-9０-９一二三四五六七八九十]";
const SCENE_WORD = new RegExp(
  [
    "シーン|場面|幕間|[開閉終]幕|プロローグ|エピローグ|オープニング|エンディング|クライマックス|導入|後日談",
    `第?${DIGIT}+(?:日目|章|幕|話|夜)`,
    `^[朝昼夕夜]${DIGIT}*$|^(?:早朝|午前|昼間|夕方|深夜|翌日|翌朝|数日後|数時間後)$`,
    "^(?:OP|ED|MD|CL)[0-9]*(?:\\s|$)",
    "^(?:セッション)?(?:開始|終了)(?:宣言)?$",
  ].join("|"),
  "i",
);
/** 飾りがなくても見出しと分かる、番号だけの題 */
const NUMBERED = new RegExp(`^(?:(?:シーン|scene)\\s*${DIGIT}+|第?${DIGIT}+(?:日目|章|幕|話))$`, "i");
/** GM が時間を飛ばす一言 */
const TIME_SKIP = /^(?:翌日|翌朝|数日後|数時間後)[…‥・。]*$/;
/** 線だけの発言（伸ばし棒・三点リーダーの沈黙は含めない） */
const RULE_LINE = /^[―─━═＝=＊*＿_#\-]{4,}$/u;

const isGm = (k: MsgKind) => k === "GM" || k === "KP";

interface Parts {
  lead: string;
  core: string;
  trail: string;
}

/** 両端の飾りを外す。飾りの形が合わなければ null */
function undecorate(text: string): Parts | null {
  const chars = [...text.trim()];
  if (chars.some((c) => c === "\n")) return null;
  const deco = (c: string | undefined) => c !== undefined && SYMBOL.test(c) && !NOT_DECORATION.test(c);
  let a = 0;
  let b = chars.length;
  while (a < b && deco(chars[a])) a++;
  while (b > a && deco(chars[b - 1])) b--;
  const core = chars.slice(a, b).join("").trim();
  if (a === 0 || !core || [...core].length > MAX_CORE) return null;
  return { lead: chars.slice(0, a).join(""), core, trail: chars.slice(b).join("") };
}

/** 両端が同じ飾り（～…～、■…■）なら、その形の名前。波線の表記の違いはまとめる */
function symmetricStyle(p: Parts): string | null {
  const norm = (s: string) => s.replace(/[~〜～]/gu, "~").replace(/[―─━ー]/gu, "-");
  return p.trail && norm(p.lead) === norm([...p.trail].reverse().join("")) ? norm(p.lead) : null;
}

/** 見出しとみなす発言の番号（msgs の添字） */
export function sceneHeadingIndexes(
  msgs: readonly Pick<Msg, "text" | "kind" | "sp" | "type">[],
): Set<number> {
  const out = new Set<number>();
  const styles = new Map<string, { core: string; i: number }[]>();
  msgs.forEach((m, i) => {
    const text = m.text?.trim();
    if (!text || m.type === "roll") return;
    if (RULE_LINE.test(text) || NUMBERED.test(text) || (isGm(m.kind) && TIME_SKIP.test(text))) {
      out.add(i);
      return;
    }
    const p = undecorate(text);
    if (!p) return;
    if (SCENE_WORD.test(p.core) && !/[！？!?]/u.test(p.core)) {
      out.add(i);
      return;
    }
    const style = isGm(m.kind) ? symmetricStyle(p) : null;
    if (!style) return;
    const key = `${m.sp}\u0000${style}`;
    const list = styles.get(key) ?? [];
    list.push({ core: p.core, i });
    styles.set(key, list);
  });
  // 同じ飾りで違う題を 2 回以上書いていれば、その卓の見出しの書き方
  for (const list of styles.values())
    if (new Set(list.map((x) => x.core)).size >= 2) for (const x of list) out.add(x.i);
  return out;
}
