/**
 * 共有ページの OG 画像（SNS・Discord に貼ったときの札）に載せる中身。描画は src/server/og-image.tsx。
 * 見せてよいのは、共有ページを誰でも読めるときにそのページに出ている分だけ（src/server/shared-pages.ts）。
 */
import { SYSTEMS } from "../data/systems";
import type { SharedCharacterData, SharedLogData } from "./cloud-state";
import { fmtDates } from "./format";
import { roleLabel } from "./roles";
import { UNKNOWN_SCENARIO_TITLE } from "./session-scenario";
import { sessionDays } from "./sittings";

export interface OgPerson {
  name: string;
  /** 画像（data URL のみ）か、ID から作る人の姿の種 */
  image?: string;
  seed: string;
  /** GM / KP など。PL は付けない */
  role?: string;
}

export interface OgSystem {
  name: string;
  color: string;
}

export type OgCard =
  | {
      kind: "session";
      title: string;
      system?: OgSystem;
      /** 遊んだ日（時刻・遊んだ時間は札では判断に使わないので載せない） */
      when: string;
      people: OgPerson[];
    }
  | {
      kind: "character";
      name: string;
      id: string;
      system?: OgSystem;
      archetype?: string;
      tags: string[];
      image?: string;
      owner?: OgPerson;
    }
  /** 中身を見せられない（参加者だけの記録・無い記録）。題名などは出さない */
  | { kind: "generic"; heading: string };

/** 画像として描けるのは埋め込みの PNG・JPEG・GIF・SVG だけ。外の URL は取りに行かない */
export function safeImage(src: string | undefined): string | undefined {
  if (!src) return undefined;
  return /^data:image\/(png|jpe?g|gif|svg\+xml)[;,]/i.test(src) ? src : undefined;
}

/** 長い文字列を文字数（書記素）で切り、末尾を … にする */
export function clip(text: string, max: number): string {
  const chars = Array.from(
    new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(text.trim()),
    (s) => s.segment,
  );
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

const systemOf = (id: string | undefined): OgSystem | undefined => {
  const sys = id ? SYSTEMS[id] : undefined;
  return sys ? { name: sys.name, color: sys.color } : undefined;
};

export function sessionCard({ log, users, scenario }: SharedLogData): OgCard {
  const people: OgPerson[] = Object.keys(log.players)
    .filter((id) => users[id] && log.players[id]?.linked && !log.players[id]?.hidden)
    .map((id) => ({
      name: clip(users[id]!.name, 12),
      image: safeImage(users[id]!.image),
      seed: users[id]!.handle ?? id,
      ...(id === log.ownerId ? { role: roleLabel(log.systemId, "GM") } : {}),
    }))
    // GM を先頭に
    .sort((a, b) => Number(Boolean(b.role)) - Number(Boolean(a.role)));
  return {
    kind: "session",
    // セッションの呼び名はシナリオの題名
    title: clip(scenario?.title?.trim() || UNKNOWN_SCENARIO_TITLE, 38),
    system: systemOf(log.systemId),
    when: fmtDates(sessionDays(log)),
    people,
  };
}

export function characterCard({ character: c, owner }: SharedCharacterData): OgCard {
  return {
    kind: "character",
    id: c.id,
    name: clip(c.name || "名前のないキャラクター", 24),
    system: systemOf(c.systemId),
    ...(c.archetype?.trim() ? { archetype: clip(c.archetype, 30) } : {}),
    tags: c.tags
      .filter((t) => t.trim())
      .slice(0, 3)
      .map((t) => clip(t, 8)),
    image: safeImage(c.image),
    ...(owner
      ? {
          owner: {
            name: clip(owner.name, 16),
            image: safeImage(owner.image),
            seed: owner.handle ?? owner.id,
          },
        }
      : {}),
  };
}

/**
 * 題名の大きさ: 文節で折っても 2 行に収まる大きさ。札の文字の幅は 960px ほどで、
 * 1 行に入る全角の数（960 / 大きさ）の 2 行分から、文節で折る余りを引いた数までをその大きさにする
 */
export function titleSize(title: string): number {
  const n = Array.from(title).length;
  if (n <= 10) return 88;
  if (n <= 20) return 72;
  if (n <= 26) return 60;
  if (n <= 32) return 52;
  return 44;
}

/** 札の説明（og:image:alt と、題名の下の説明文） */
export function cardDescription(card: OgCard): string {
  switch (card.kind) {
    case "session":
      return [card.system?.name, card.when].filter(Boolean).join(" ・ ");
    case "character":
      return [card.system?.name, card.archetype, card.owner && `PL ${card.owner.name}`]
        .filter(Boolean)
        .join(" ・ ");
    case "generic":
      return card.heading;
  }
}

type CharClass = "kanji" | "kana" | "hira" | "alnum" | "open" | "other";
function charClass(ch: string | undefined): CharClass {
  if (!ch) return "other";
  if (/[\p{Script=Han}々〆ヵヶ]/u.test(ch)) return "kanji";
  if (/[\p{Script=Katakana}ー]/u.test(ch)) return "kana";
  if (/\p{Script=Hiragana}/u.test(ch)) return "hira";
  if (/[\p{L}\p{N}]/u.test(ch)) return "alnum";
  if (/[「『（(【〈《［\[〔]/u.test(ch)) return "open";
  return "other";
}

/**
 * 文節のおおよその切れ目に改行してよい印（U+200B）を入れる。描画は word-break: keep-all で、
 * 印と空白でだけ折る（P19。satori は auto-phrase を持たない）。
 * 切れ目: 漢字・カタカナ・英数字・開き括弧で始まる語の前。ただし同じ種類の文字が続くとき（「第三|話」）と、
 * 開き括弧の直後は切らない。ひらがなで始まる語（助詞・送り仮名）は前の語に付ける。
 */
export function phraseText(text: string): string {
  let out = "";
  let prev = "";
  for (const { segment } of new Intl.Segmenter("ja", { granularity: "word" }).segment(text)) {
    const head = charClass(segment[0]);
    const tail = charClass(prev.at(-1));
    const starts = head === "kanji" || head === "kana" || head === "alnum" || head === "open";
    if (prev && starts && head !== tail && tail !== "open" && !/\s$/.test(prev)) out += "​";
    out += segment;
    prev = segment;
  }
  return out;
}
