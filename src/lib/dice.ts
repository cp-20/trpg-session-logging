/**
 * 基本的なダイスとチョイス（Discord の /roll・/choice）。BCDice の書き方に寄せ、結果も BCDice と同じ形で返す。
 * システムごとの判定（CoC のクリティカルなど）はしない。
 *
 * - `2D6+3`・`D6`・`(1D6+1)*2`・`10/3`（割り算は切り捨て）
 * - `1D100<=60`・`2D6>=7`（`<` `>` `=` `<>` も）: 成功・失敗
 * - `4D6KH3`・`2D20KL1`: 大きい（小さい）ほうから残す
 * - `D66`: 1 つ目を十の位、2 つ目を一の位に
 * - `x3 2D6`: 3 回振る
 * - `choice[A,B,C]`・`choice(A,B,C)`・`choice A B C`・`choice2[A,B,C]`（重ならないよう 2 つ）
 * - 式のあとに空白を空けて書いた言葉は、そのまま添える（`1D100<=60 目星`）
 * 全角の数字・記号（２Ｄ６、＜＝、≦）も読む。
 */

/** 0 以上 max 未満の整数 */
export type RandomInt = (max: number) => number;

/** 偏りのない乱数（crypto。剰余の偏りは捨てて引き直す） */
export const cryptoRandomInt: RandomInt = (max) => {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % max;
  }
};

export const DICE_LIMITS = {
  count: 100,
  totalDice: 300,
  sides: 10000,
  repeat: 20,
  choices: 100,
  length: 200,
};

export class DiceError extends Error {}

type Cmp = "<=" | ">=" | "<" | ">" | "=" | "<>";
type Node =
  | { k: "num"; v: number }
  | { k: "dice"; count: number; sides: number; keep?: { high: boolean; n: number } }
  | { k: "d66" }
  | { k: "neg"; x: Node }
  | { k: "paren"; x: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/"; l: Node; r: Node };

/* ---------- 読む ---------- */

function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/≦/g, "<=")
    .replace(/≧/g, ">=")
    .replace(/≠/g, "<>")
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/=</g, "<=")
    .replace(/=>/g, ">=")
    .replace(/!=/g, "<>")
    .toUpperCase();
}

function parseExpression(src: string): { node: Node; cmp?: { op: Cmp; node: Node } } {
  let i = 0;
  const peek = () => src[i];
  const fail = (): never => {
    throw new DiceError(`式を読めませんでした: ${src}`);
  };
  const int = (): number | null => {
    const m = /^\d+/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    const v = Number(m[0]);
    if (!Number.isSafeInteger(v)) fail();
    return v;
  };
  const primary = (): Node => {
    if (peek() === "(") {
      i++;
      const x = expr();
      if (peek() !== ")") fail();
      i++;
      return { k: "paren", x };
    }
    const count = int();
    if (peek() !== "D") return count === null ? fail() : { k: "num", v: count };
    i++;
    const sides = int();
    if (sides === null) return fail();
    if (count === null && sides === 66) return { k: "d66" };
    const n = count ?? 1;
    if (n < 1 || n > DICE_LIMITS.count)
      throw new DiceError(`ダイスは 1 度に ${DICE_LIMITS.count} 個までです。`);
    if (sides < 1 || sides > DICE_LIMITS.sides)
      throw new DiceError(`ダイスの面は 1〜${DICE_LIMITS.sides} です。`);
    const keep = /^K([HL])/.exec(src.slice(i));
    if (!keep) return { k: "dice", count: n, sides };
    i += 2;
    const kn = int();
    if (kn === null || kn < 1 || kn > n) throw new DiceError("残す個数は 1 から振った個数までです。");
    return { k: "dice", count: n, sides, keep: { high: keep[1] === "H", n: kn } };
  };
  const factor = (): Node => {
    if (peek() === "-") {
      i++;
      return { k: "neg", x: factor() };
    }
    if (peek() === "+") i++;
    return primary();
  };
  const term = (): Node => {
    let l = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[i++] as "*" | "/";
      l = { k: "bin", op, l, r: factor() };
    }
    return l;
  };
  const expr = (): Node => {
    let l = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[i++] as "+" | "-";
      l = { k: "bin", op, l, r: term() };
    }
    return l;
  };

  const node = expr();
  if (i === src.length) return { node };
  const m = /^(<=|>=|<>|<|>|=)/.exec(src.slice(i));
  if (!m) return fail();
  i += m[0].length;
  const target = expr();
  if (i !== src.length) fail();
  return { node, cmp: { op: m[0] as Cmp, node: target } };
}

/* ---------- 振る ---------- */

/** 振った結果の文の 1 片。捨てた出目は strike で表す（Discord なら打ち消し線） */
export interface Render {
  /** 式・出目（数字と記号だけ。打ち消しの印は含む） */
  expr: (text: string) => string;
  /** 利用者の書いた言葉（チョイスの候補） */
  text: (text: string) => string;
  strike: (text: string) => string;
  bold: (text: string) => string;
}

const PLAIN: Render = { expr: (s) => s, text: (s) => s, strike: (s) => `(${s})`, bold: (s) => s };

interface Rolled {
  value: number;
  /** 式（`2D6+3`） */
  source: string;
  /** 出目を入れた式（`8[3,5]+3`） */
  rolled: string;
  dice: number;
}

function safe(v: number): number {
  if (!Number.isSafeInteger(v)) throw new DiceError("数が大きすぎます。");
  return v;
}

function evaluate(node: Node, rnd: RandomInt, r: Render, budget: { dice: number }): Rolled {
  const roll = (sides: number) => {
    if (++budget.dice > DICE_LIMITS.totalDice)
      throw new DiceError(`ダイスは合わせて ${DICE_LIMITS.totalDice} 個までです。`);
    return rnd(sides) + 1;
  };
  switch (node.k) {
    case "num":
      return { value: node.v, source: String(node.v), rolled: String(node.v), dice: 0 };
    case "d66": {
      const a = roll(6);
      const b = roll(6);
      return { value: a * 10 + b, source: "D66", rolled: `${a * 10 + b}[${a},${b}]`, dice: 2 };
    }
    case "dice": {
      const faces = Array.from({ length: node.count }, () => roll(node.sides));
      const keep = node.keep;
      const source = `${node.count}D${node.sides}${keep ? `K${keep.high ? "H" : "L"}${keep.n}` : ""}`;
      if (!keep) {
        const value = faces.reduce((a, b) => a + b, 0);
        return {
          value,
          source,
          rolled: node.count === 1 ? String(value) : `${value}[${faces.join(",")}]`,
          dice: node.count,
        };
      }
      // 大きい（小さい）ほうから keep.n 個。同じ目は前のものを残す
      const order = faces
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => (keep.high ? b.v - a.v : a.v - b.v) || a.idx - b.idx);
      const kept = new Set(order.slice(0, keep.n).map((o) => o.idx));
      const value = faces.reduce((a, v, idx) => (kept.has(idx) ? a + v : a), 0);
      const list = faces.map((v, idx) => (kept.has(idx) ? String(v) : r.strike(String(v)))).join(",");
      return { value, source, rolled: `${value}[${list}]`, dice: node.count };
    }
    case "neg": {
      const x = evaluate(node.x, rnd, r, budget);
      return { value: safe(-x.value), source: `-${x.source}`, rolled: `-${x.rolled}`, dice: x.dice };
    }
    case "paren": {
      const x = evaluate(node.x, rnd, r, budget);
      return { value: x.value, source: `(${x.source})`, rolled: `(${x.rolled})`, dice: x.dice };
    }
    case "bin": {
      const l = evaluate(node.l, rnd, r, budget);
      const rr = evaluate(node.r, rnd, r, budget);
      if (node.op === "/" && rr.value === 0) throw new DiceError("0 では割れません。");
      const value =
        node.op === "+"
          ? l.value + rr.value
          : node.op === "-"
            ? l.value - rr.value
            : node.op === "*"
              ? l.value * rr.value
              : Math.floor(l.value / rr.value);
      return {
        value: safe(value),
        source: `${l.source}${node.op}${rr.source}`,
        rolled: `${l.rolled}${node.op}${rr.rolled}`,
        dice: l.dice + rr.dice,
      };
    }
  }
}

function compare(a: number, op: Cmp, b: number): boolean {
  switch (op) {
    case "<=":
      return a <= b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case ">":
      return a > b;
    case "=":
      return a === b;
    case "<>":
      return a !== b;
  }
}

export interface DiceLine {
  /** `(2D6+3) ＞ 8[3,5]+3 ＞ 11` */
  text: string;
  total?: number;
  success?: boolean;
}

export interface DiceResult {
  lines: DiceLine[];
  /** 式のあとに書いた言葉 */
  comment: string;
}

const STEP = " ＞ ";

/** 出目を入れた式と合計。ダイスが無ければ式は書かず、出目がそのまま合計なら合計は書かない（`(1D100) ＞ 42`） */
function totalSteps(x: Rolled, r: Render, bold: boolean): string[] {
  const value = String(x.value);
  const out = x.dice && x.rolled !== value ? [r.expr(x.rolled)] : [];
  out.push(bold ? r.bold(value) : value);
  return out;
}

function rollOne(src: string, rnd: RandomInt, r: Render, budget: { dice: number }): DiceLine {
  const { node, cmp } = parseExpression(src);
  const main = evaluate(node, rnd, r, budget);
  if (!cmp) {
    const head = `(${r.expr(main.source)})`;
    return { text: [head, ...totalSteps(main, r, true)].join(STEP), total: main.value };
  }
  const target = evaluate(cmp.node, rnd, r, budget);
  const success = compare(main.value, cmp.op, target.value);
  const head = `(${r.expr(`${main.source}${cmp.op}${target.source}`)})`;
  const parts = [head, ...totalSteps(main, r, false)];
  // 目標値にもダイスがあれば、その出目も見せる
  if (target.dice) parts.push(r.expr(`${main.value}${cmp.op}${target.rolled}`));
  parts.push(r.bold(success ? "成功" : "失敗"));
  return { text: parts.join(STEP), total: main.value, success };
}

/* ---------- チョイス ---------- */

/** 候補を区切る。「,」「、」があればそれで、なければ空白で */
export function splitChoices(text: string): string[] {
  const t = text.trim();
  const items = /[,、，]/.test(t) ? t.split(/[,、，]/) : t.split(/\s+/);
  return items.map((s) => s.trim()).filter(Boolean);
}

/** items から重ならないよう n 個を選ぶ（並びは選んだ順） */
export function choose(items: string[], n: number, rnd: RandomInt = cryptoRandomInt): string[] {
  if (items.length < 1) throw new DiceError("候補を 1 つ以上書いてください。");
  if (items.length > DICE_LIMITS.choices) throw new DiceError(`候補は ${DICE_LIMITS.choices} 個までです。`);
  if (!Number.isInteger(n) || n < 1 || n > items.length)
    throw new DiceError("選ぶ数は 1 から候補の数までです。");
  const pool = [...items];
  const out: string[] = [];
  for (let k = 0; k < n; k++) out.push(pool.splice(rnd(pool.length), 1)[0]!);
  return out;
}

export function choiceLine(
  items: string[],
  n: number,
  rnd: RandomInt = cryptoRandomInt,
  r: Render = PLAIN,
): DiceLine {
  const picked = choose(items, n, rnd);
  const head = `(CHOICE${n > 1 ? n : ""}[${items.map(r.text).join(",")}])`;
  return { text: `${head}${STEP}${r.bold(picked.map(r.text).join(", "))}` };
}

const CHOICE_RE = /^choice(\d*)(?:\[([^\]]*)\]|\(([^)]*)\))(?:\s+([\s\S]*))?$/i;
const CHOICE_SPACED_RE = /^choice(\d*)\s+([\s\S]+)$/i;

/* ---------- 入口 ---------- */

/**
 * 1 行のコマンドを振る。読めなければ DiceError（文はそのまま利用者に見せられる）
 */
export function rollCommand(input: string, rnd: RandomInt = cryptoRandomInt, r: Render = PLAIN): DiceResult {
  const text = input.trim();
  if (!text) throw new DiceError("式を書いてください。例: 2D6+3、1D100<=60 目星");
  if (text.length > DICE_LIMITS.length) throw new DiceError(`式は ${DICE_LIMITS.length} 文字までです。`);

  const head = text.normalize("NFKC");
  const bracket = CHOICE_RE.exec(head);
  if (bracket) {
    const items = splitChoices(bracket[2] ?? bracket[3] ?? "");
    return { lines: [choiceLine(items, Number(bracket[1] || 1), rnd, r)], comment: bracket[4]?.trim() ?? "" };
  }
  const spaced = CHOICE_SPACED_RE.exec(head);
  if (spaced)
    return { lines: [choiceLine(splitChoices(spaced[2]!), Number(spaced[1] || 1), rnd, r)], comment: "" };

  const tokens = text.split(/\s+/);
  let times = 1;
  const rep = /^(?:X|REP|\*)(\d+)$/.exec(normalize(tokens[0]!));
  if (rep && tokens.length > 1) {
    times = Number(rep[1]);
    if (times < 1 || times > DICE_LIMITS.repeat)
      throw new DiceError(`繰り返しは 1〜${DICE_LIMITS.repeat} 回です。`);
    tokens.shift();
  }
  const expr = normalize(tokens.shift()!);
  const comment = tokens.join(" ");
  const budget = { dice: 0 };
  const lines = Array.from({ length: times }, (_, k) => {
    const line = rollOne(expr, rnd, r, budget);
    return times > 1 ? { ...line, text: `#${k + 1} ${line.text}` } : line;
  });
  return { lines, comment };
}
