/**
 * アイコンを iconify のデータから React / React Native 部品として書き出し、
 * モバイルアプリ用の PNG アセット（アイコン・スプラッシュ）も生成する。
 * 使うアイコンを足すときは ICONS に 1 行足して `pnpm run gen:icons` を実行する。
 * tabler = UI 用、logos / simple-icons = ブランド用。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);

const ICONS: Record<string, string> = {
  IconSearch: "tabler/search",
  IconPlus: "tabler/plus",
  IconX: "tabler/x",
  IconPencil: "tabler/pencil",
  IconTrash: "tabler/trash",
  IconCheck: "tabler/check",
  IconUpload: "tabler/upload",
  IconFileText: "tabler/file-text",
  IconUserPlus: "tabler/user-plus",
  IconUsersGroup: "tabler/users-group",
  IconIdBadge: "tabler/id-badge",
  IconBooks: "tabler/books",
  IconSettings: "tabler/settings",
  IconCalendarTime: "tabler/calendar-time",
  IconDice: "tabler/dice-5",
  IconTrendingUp: "tabler/trending-up",
  IconBrain: "tabler/brain",
  IconShieldLock: "tabler/shield-lock",
  IconHistory: "tabler/history",
  IconWand: "tabler/wand",
  IconSend: "tabler/send",
  IconShare: "tabler/share",
  IconSparkles: "tabler/sparkles",
  IconListDetails: "tabler/list-details",
  IconHome: "tabler/home",
  IconExternal: "tabler/external-link",
  IconLink: "tabler/link",
  IconUnlink: "tabler/unlink",
  IconGoogle: "logos/google-icon",
  IconDiscord: "simple-icons/discord",
  IconBrandX: "simple-icons/x",
  IconFilter: "tabler/filter",
  IconLock: "tabler/lock",
  IconAlert: "tabler/alert-triangle",
  IconChevronDown: "tabler/chevron-down",
  IconCalendar: "tabler/calendar",
  IconChevronLeft: "tabler/chevron-left",
  IconChevronRight: "tabler/chevron-right",
  IconDots: "tabler/dots",
  IconClock: "tabler/clock",
  IconWorld: "tabler/world",
  IconUsers: "tabler/users",
  IconDownload: "tabler/download",
  IconEyeOff: "tabler/eye-off",
  IconCalendarPlus: "tabler/calendar-plus",
  IconBookmark: "tabler/bookmark",
  IconClipboard: "tabler/clipboard",
  IconBell: "tabler/bell",
  IconFingerprint: "tabler/fingerprint",
  IconRefresh: "tabler/refresh",
  IconArrowUp: "tabler/arrow-up",
  IconArrowDown: "tabler/arrow-down",
  IconWifiOff: "tabler/wifi-off",
  IconEye: "tabler/eye",
  IconMinus: "tabler/minus",
  IconVideo: "tabler/video",
  IconMicrophone: "tabler/microphone",
  IconBroadcast: "tabler/broadcast",
  IconMovie: "tabler/movie",
  IconMessageCircle: "tabler/message-circle",
  IconTrophy: "tabler/trophy",
  IconPhoto: "tabler/photo",
  IconPalette: "tabler/palette",
  IconBook: "tabler/book",
  IconNotes: "tabler/notes",
  IconPlayerPlay: "tabler/player-play-filled",
  IconLayoutList: "tabler/list",
};

interface IconSet {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
}

const sets = new Map<string, IconSet>();
function load(prefix: string): IconSet {
  if (!sets.has(prefix)) {
    const path = require.resolve(`@iconify-json/${prefix}/icons.json`);
    sets.set(prefix, JSON.parse(readFileSync(path, "utf8")) as IconSet);
  }
  return sets.get(prefix)!;
}

/** SVG の属性名を JSX の書き方に直す（stroke-width → strokeWidth など） */
function toJsx(body: string): string {
  return body
    .replace(
      /\s([a-z]+(?:-[a-z]+)+)=/g,
      (_, name: string) => ` ${name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())}=`,
    )
    .replace(/\sxlink:href=/g, " href=")
    .replace(/\sclass=/g, " className=");
}

const webOut: string[] = [
  "// このファイルは scripts/gen-icons.ts が生成する。直接編集しない。",
  'import type { SVGProps } from "react";',
  "",
  "export type IconProps = SVGProps<SVGSVGElement>;",
  "",
  "/**",
  " * 線の太さ。tabler の線は 24 四方で 2 なので、14〜16px に縮めると 1.2px ほどに痩せて見える。",
  " * 小さく描くほど太くして、どの大きさでも 1.4px 前後の線に揃える。strokeWidth を渡せば上書きできる。",
  " */",
  'function iconStroke(size: IconProps["width"]): number {',
  '  const n = typeof size === "number" ? size : Number(size);',
  "  if (!Number.isFinite(n)) return 2;",
  "  return n <= 14 ? 2.5 : n <= 16 ? 2.3 : n <= 20 ? 2.1 : 2;",
  "}",
  "",
];

const mobileOut: string[] = [
  "// このファイルは scripts/gen-icons.ts が生成する。直接編集しない。",
  'import { SvgXml } from "react-native-svg";',
  "",
  "export interface MobileIconProps {",
  "  size?: number;",
  "  color?: string;",
  "  strokeWidth?: number;",
  "}",
  "",
  "function renderIcon(viewBox: string, body: string, size: number, color: string, strokeWidth?: number) {",
  '  let colored = body.split("currentColor").join(color);',
  "  if (strokeWidth !== undefined) {",
  '    colored = colored.replace(/stroke-width="[^"]+"/g, `stroke-width="${strokeWidth}"`);',
  "  }",
  '  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${colored}</svg>`;',
  "  return <SvgXml xml={xml} width={size} height={size} />;",
  "}",
  "",
];

for (const [name, ref] of Object.entries(ICONS)) {
  const [prefix, id] = ref.split("/") as [string, string];
  const set = load(prefix);
  const icon = set.icons[id] ?? set.icons[set.aliases?.[id]?.parent ?? ""];
  if (!icon) throw new Error(`Icon not found: ${ref}`);
  const w = icon.width ?? set.width ?? 16;
  const h = icon.height ?? set.height ?? 16;
  // tabler の線アイコンは線の太さを <svg> に持たせ、大きさに応じて変える（iconStroke）
  const stroked = prefix === "tabler" && icon.body.includes('stroke-width="2"');

  webOut.push(
    `export function ${name}(props: IconProps) {`,
    `  return (`,
    `    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 ${w} ${h}" aria-hidden${stroked ? " strokeWidth={iconStroke(props.width)}" : ""} {...props}>`,
    `      ${stroked ? toJsx(icon.body).replace(/\sstrokeWidth="2"/g, "") : toJsx(icon.body)}`,
    `    </svg>`,
    `  );`,
    `}`,
    "",
  );

  if (name === "IconWand" || name === "IconSparkles") continue;
  const safeBody = JSON.stringify(icon.body);
  mobileOut.push(
    `export function ${name}({ size = 20, color = "#221c17", strokeWidth }: MobileIconProps) {`,
    `  return renderIcon("0 0 ${w} ${h}", ${safeBody}, size, color, strokeWidth);`,
    `}`,
    "",
  );
}

writeFileSync(new URL("../src/components/icons.tsx", import.meta.url), webOut.join("\n"));

const mobileIconsDir = new URL("../mobile/src/components", import.meta.url);
mkdirSync(mobileIconsDir, { recursive: true });
writeFileSync(new URL("../mobile/src/components/icons.tsx", import.meta.url), mobileOut.join("\n"));

/* ---------- 卓譜モバイル PNG アセット生成（純粋 TypeScript + zlib） ---------- */
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePngRgba(width: number, height: number, rgba: Uint8Array): Buffer {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function distSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function renderTakufuMarkPng(size: number, transparentBg: boolean): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const bg = transparentBg ? [242, 235, 224, 0] : [242, 235, 224, 255];
  const fg = [184, 71, 36]; // #b84724 terracotta
  const scale = size / 24;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5) / scale;
      const gy = (y + 0.5) / scale;

      const staffDist = Math.min(
        distSegment(gx, gy, 4, 7.2, 20, 7.2),
        distSegment(gx, gy, 4, 11.4, 20, 11.4),
        distSegment(gx, gy, 4, 15.6, 20, 15.6),
      );
      const staffAlpha = Math.max(0, Math.min(1, (0.72 - staffDist) / 0.35)) * 0.45;

      const stemDist = Math.min(
        distSegment(gx, gy, 11.4, 14.5, 11.4, 5.8),
        distSegment(gx, gy, 11.4, 5.8, 16.5, 7.2),
      );
      const head1 = Math.hypot(gx - 9.0, gy - 14.5) - 2.4;
      const head2 = Math.hypot(gx - 16.4, gy - 10.2) - 2.05;
      const noteDist = Math.min(stemDist - 0.85, head1, head2);
      const noteAlpha = Math.max(0, Math.min(1, (0.25 - noteDist) / 0.35));

      const a = Math.max(staffAlpha, noteAlpha);
      const idx = (y * size + x) * 4;
      if (transparentBg) {
        rgba[idx] = fg[0]!;
        rgba[idx + 1] = fg[1]!;
        rgba[idx + 2] = fg[2]!;
        rgba[idx + 3] = Math.round(a * 255);
      } else {
        rgba[idx] = Math.round(bg[0]! * (1 - a) + fg[0]! * a);
        rgba[idx + 1] = Math.round(bg[1]! * (1 - a) + fg[1]! * a);
        rgba[idx + 2] = Math.round(bg[2]! * (1 - a) + fg[2]! * a);
        rgba[idx + 3] = 255;
      }
    }
  }
  return encodePngRgba(size, size, rgba);
}

const assetsDir = new URL("../mobile/assets", import.meta.url);
mkdirSync(assetsDir, { recursive: true });
writeFileSync(new URL("../mobile/assets/icon.png", import.meta.url), renderTakufuMarkPng(256, false));
writeFileSync(new URL("../mobile/assets/adaptive-icon.png", import.meta.url), renderTakufuMarkPng(256, true));
writeFileSync(new URL("../mobile/assets/splash-icon.png", import.meta.url), renderTakufuMarkPng(256, true));
writeFileSync(new URL("../mobile/assets/favicon.png", import.meta.url), renderTakufuMarkPng(64, false));

for (const name of ["booth-icon.png", "talto-icon.png"]) {
  const src = new URL(`../public/${name}`, import.meta.url);
  if (existsSync(src)) {
    copyFileSync(src, new URL(`../mobile/assets/${name}`, import.meta.url));
  }
}

console.log(
  `Generated ${Object.keys(ICONS).length} icons → src/components/icons.tsx & mobile/src/components/icons.tsx`,
);
