/**
 * 共有ページの OG 画像（1200×630）。LP の OG 画像（scripts/gen-brand.ts）と同じ柿色の地に、紙の札を一枚置く。
 * 中身は src/lib/og-card.ts が決め、ここは描くだけ。
 */
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import {
  BRAND_COLORS,
  MARK_BOARD,
  MARK_BOARD_OPACITY,
  MARK_BOARD_WIDTH,
  MARK_STONE,
} from "../components/brand";
import { identiconDataUri } from "../lib/identicon";
import { phraseText, titleSize, type OgCard, type OgPerson, type OgSystem } from "../lib/og-card";

export const OG_SIZE = { width: 1200, height: 630 };

/** LP のポスターの色（scripts/gen-brand.ts・src/styles.css の .pst-hero と同じ） */
const C = {
  field: "#bf3a16",
  paper: "#fff9f1",
  tint: "#f5cdb9",
  yellow: "#ffc233",
  ink: BRAND_COLORS.ink,
  ink2: "#5f554d",
  line: "#eadfd2",
};

/* ---------- 書体: Noto Sans JP（satori は woff2 を読めないので、Google Fonts から TTF を一度だけ取る） ---------- */

type Font = { name: string; data: ArrayBuffer; weight: 500 | 800; style: "normal" };
let fontsPromise: Promise<Font[]> | null = null;

async function loadFont(weight: 500 | 800): Promise<Font> {
  // 利用者の文字は送らない（text= で絞らず、書体全体を取って覚えておく）
  const css = await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}`).then((r) =>
    r.ok ? r.text() : Promise.reject(new Error(`font css ${r.status}`)),
  );
  const url = /src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(css)?.[1];
  if (!url) throw new Error("font url not found");
  const data = await fetch(url).then((r) =>
    r.ok ? r.arrayBuffer() : Promise.reject(new Error(`font ${r.status}`)),
  );
  return { name: "Noto Sans JP", data, weight, style: "normal" };
}

function fonts(): Promise<Font[]> {
  fontsPromise ??= Promise.all([loadFont(500), loadFont(800)]).catch((error: unknown) => {
    fontsPromise = null; // 次の要求でやり直す
    throw error;
  });
  return fontsPromise;
}

/* ---------- 部品 ---------- */

const row = (style: CSSProperties = {}): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  ...style,
});

function Mark({ size, tile, on }: { size: number; tile: string; on: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill={tile} />
      <path
        d={MARK_BOARD}
        fill="none"
        stroke={on}
        strokeOpacity={MARK_BOARD_OPACITY}
        strokeWidth={MARK_BOARD_WIDTH}
        strokeLinejoin="round"
      />
      <circle cx={MARK_STONE.cx} cy={MARK_STONE.cy} r={MARK_STONE.r} fill={on} />
    </svg>
  );
}

/** 盤の大きな透かし（LP の OG 画像と同じ盤と一手） */
function Board({
  size,
  color,
  opacity,
  style,
}: {
  size: number;
  color: string;
  opacity: number;
  style: CSSProperties;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ position: "absolute", ...style }}>
      <path d={MARK_BOARD} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={0.5} />
      <circle cx={MARK_STONE.cx} cy={MARK_STONE.cy} r={MARK_STONE.r * 0.7} fill={C.yellow} />
    </svg>
  );
}

function Brand() {
  return (
    <div style={row({ gap: 14 })}>
      <Mark size={44} tile={C.field} on={C.paper} />
      <span style={{ fontSize: 30, fontWeight: 800, color: C.ink }}>卓譜</span>
    </div>
  );
}

/** システムの印（アプリの SysBadge と同じく、色の点と名前） */
function SystemPill({ system }: { system: OgSystem }) {
  return (
    <div
      style={row({
        gap: 10,
        padding: "8px 20px 8px 16px",
        borderRadius: 999,
        border: `2px solid ${C.line}`,
        background: "#fff",
        fontSize: 24,
        fontWeight: 800,
        color: C.ink,
      })}
    >
      <div style={{ width: 14, height: 14, borderRadius: 999, background: system.color, flexShrink: 0 }} />
      <span style={{ display: "block", lineClamp: 1, maxWidth: 420 }}>{system.name}</span>
    </div>
  );
}

/** 札の上の段: 左にサービス、右にシステム */
function Header({ system }: { system?: OgSystem }) {
  return (
    <div style={row({ justifyContent: "space-between", gap: 24 })}>
      <Brand />
      {system && <SystemPill system={system} />}
    </div>
  );
}

function Face({ person, size, ring }: { person: OgPerson; size: number; ring?: string }) {
  return (
    // oxlint-disable-next-line nextjs/no-img-element -- satori は <img> で描く
    <img
      src={person.image ?? identiconDataUri(person.seed, "user")}
      width={size}
      height={size}
      style={{ borderRadius: 999, objectFit: "cover", ...(ring ? { border: `4px solid ${ring}` } : {}) }}
    />
  );
}

/**
 * 見出し。文節ごとに折る（P19）。satori は日本語の keep-all・auto-phrase を持たないので、
 * 文節を 1 つずつ折り返す箱に入れる。2 行を超える分は隠す（長さは og-card の clip と titleSize で収める）
 */
function Phrases({ text, size, lineHeight }: { text: string; size: number; lineHeight: number }) {
  const parts = phraseText(text)
    .split(/\u200B|(?<= )/)
    .filter(Boolean);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        maxHeight: size * lineHeight * 2,
        overflow: "hidden",
        fontSize: size,
        fontWeight: 800,
        lineHeight,
        letterSpacing: "0.01em",
      }}
    >
      {parts.map((p, i) => (
        <span key={i} style={{ whiteSpace: "pre" }}>
          {p}
        </span>
      ))}
    </div>
  );
}

/** 柿色の地に、紙の札を一枚 */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: 36,
        background: C.field,
        fontFamily: "Noto Sans JP",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "48px 64px",
          borderRadius: 28,
          background: C.paper,
          color: C.ink,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------- 札の種類 ---------- */

/** 顔と名前は同じ人を同じ数だけ並べ、残りは「ほか N 人」 */
const PEOPLE_SHOWN = 4;

function SessionCard({ card }: { card: Extract<OgCard, { kind: "session" }> }) {
  const shown = card.people.slice(0, PEOPLE_SHOWN);
  const rest = card.people.length - shown.length;
  const meta = { fontSize: 30, fontWeight: 500, color: C.ink2 } as const;
  return (
    <Sheet>
      <Header system={card.system} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
        <Phrases text={card.title} size={titleSize(card.title)} lineHeight={1.25} />
        <div style={{ display: "flex", marginTop: 20, ...meta }}>{card.when}</div>
      </div>
      {shown.length > 0 && (
        <div style={row({ gap: 28, fontSize: 26, fontWeight: 500, color: C.ink })}>
          {shown.map((p, i) => (
            <div key={i} style={row({ gap: 12 })}>
              <Face person={p} size={52} />
              {p.role && <span style={{ fontWeight: 800, color: C.field }}>{p.role}</span>}
              <span>{p.name}</span>
            </div>
          ))}
          {rest > 0 && <span style={{ color: C.ink2 }}>{`ほか${rest}人`}</span>}
        </div>
      )}
    </Sheet>
  );
}

function Portrait({ card, size }: { card: Extract<OgCard, { kind: "character" }>; size: number }) {
  // 生成した姿は自分の角丸を持つので、少し大きく描いて枠で切る（角に地が出ないように）
  const scale = card.image ? 1 : 1.14;
  const inner = Math.round(size * scale);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: 24,
      }}
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- satori は <img> で描く */}
      <img
        src={card.image ?? identiconDataUri(card.id, "character")}
        width={inner}
        height={inner}
        style={{ objectFit: "cover", flexShrink: 0 }}
      />
    </div>
  );
}

function CharacterCard({ card }: { card: Extract<OgCard, { kind: "character" }> }) {
  const portrait = 420;
  return (
    <Sheet>
      <div style={row({ flex: 1, gap: 56 })}>
        <Portrait card={card} size={portrait} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, height: portrait, minWidth: 0 }}>
          <Header system={card.system} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
            <Phrases text={card.name} size={Math.round(titleSize(card.name) * 0.9)} lineHeight={1.2} />
            {card.archetype && (
              <div
                style={{
                  display: "block",
                  marginTop: 14,
                  fontSize: 30,
                  fontWeight: 500,
                  color: C.ink2,
                  lineClamp: 1,
                }}
              >
                {card.archetype}
              </div>
            )}
            {card.tags.length > 0 && (
              <div style={row({ marginTop: 16, gap: 20, fontSize: 26, fontWeight: 500, color: C.ink2 })}>
                {card.tags.map((t) => (
                  <span key={t}>{`#${t}`}</span>
                ))}
              </div>
            )}
          </div>
          {card.owner && (
            <div style={row({ gap: 12, fontSize: 26, fontWeight: 500, color: C.ink })}>
              <Face person={card.owner} size={52} />
              <span style={{ fontWeight: 800, color: C.ink2 }}>PL</span>
              <span>{card.owner.name}</span>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** 中身を見せられないときの札。LP の OG 画像と同じく柿色一面 */
function GenericCard({ card }: { card: Extract<OgCard, { kind: "generic" }> }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        padding: "72px 88px",
        background: C.field,
        color: C.paper,
        fontFamily: "Noto Sans JP",
      }}
    >
      <Board size={640} color={C.paper} opacity={0.16} style={{ right: -150, top: -40 }} />
      <div style={row({ gap: 20, fontSize: 44, fontWeight: 800 })}>
        <Mark size={64} tile={C.paper} on={C.field} />
        卓譜
      </div>
      <div style={{ display: "flex", marginTop: "auto", fontSize: 84, fontWeight: 800, lineHeight: 1.25 }}>
        {card.heading}
      </div>
      <div style={{ display: "flex", marginTop: 32, fontSize: 34, fontWeight: 800, color: C.tint }}>
        TRPG のセッション記録をひとつのページに
      </div>
    </div>
  );
}

function Card({ card }: { card: OgCard }) {
  if (card.kind === "session") return <SessionCard card={card} />;
  if (card.kind === "character") return <CharacterCard card={card} />;
  return <GenericCard card={card} />;
}

/**
 * 札を PNG にする。書体を取れないとき（外に出られない環境など）は LP の OG 画像へ回す
 * （日本語が豆腐になった画像を SNS に覚えられるよりよい）。
 */
export async function renderOgCard(card: OgCard): Promise<Response> {
  let loaded: Font[];
  try {
    loaded = await fonts();
  } catch {
    return new Response(null, { status: 307, headers: { Location: "/opengraph-image.png" } });
  }
  return new ImageResponse(<Card card={card} />, {
    ...OG_SIZE,
    fonts: loaded,
    headers: {
      // 共有の中身は書き換わる。SNS 側も覚えるので、こちらは短めに
      "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
    },
  });
}
