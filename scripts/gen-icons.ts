/**
 * アイコンを iconify のデータから React / React Native 部品として書き出し、
 * モバイルアプリが使う外部サービスのロゴ画像も mobile/assets に写す。
 * 使うアイコンを足すときは ICONS に 1 行足して `pnpm run gen:icons` を実行する。
 * tabler = UI 用、logos / simple-icons = ブランド用。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

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
  IconTable: "custom/table",
  IconCharacter: "tabler/masks-theater",
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

/**
 * tabler に合うものがない概念は、tabler と同じ約束（24 四方・線のみ・stroke-width 2・丸い端）で描いてここに置く。
 * - table: 卓（卓を囲む人）。tabler の users-group は「人の集まり」で、卓（テーブルを囲む場）に見えない
 */
const CUSTOM: IconSet = {
  width: 24,
  height: 24,
  icons: {
    table: {
      body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="7.5" cy="4.75" r="2.25"/><circle cx="16.5" cy="4.75" r="2.25"/><path d="M3.75 11c.55-1.75 1.95-2.75 3.75-2.75s3.2 1 3.75 2.75m1.5 0c.55-1.75 1.95-2.75 3.75-2.75s3.2 1 3.75 2.75"/><ellipse cx="12" cy="17.5" rx="9" ry="3.5"/></g>',
    },
  },
};

const sets = new Map<string, IconSet>([["custom", CUSTOM]]);
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
  " * 線の太さ（画面上の px）。線には vector-effect: non-scaling-stroke を付けているので、",
  " * stroke-width は viewBox の単位ではなく描画後の px になる。どの大きさ・どの指定方法（width 属性・CSS・em）で",
  " * 描いても 1.8px を下回らない（P13: 16px で 1.53px でも細いと言われた。検査は audit:icon-stroke の 1.75px）。",
  " * 大きく描くときは tabler 本来の比率（24 で 2）まで太くする。strokeWidth を渡せば上書きできる（px）。",
  " */",
  'function iconStroke(size: IconProps["width"]): number {',
  '  const n = typeof size === "number" ? size : Number(size);',
  "  return Number.isFinite(n) ? Math.max(1.8, Math.round((n / 12) * 100) / 100) : 1.85;",
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
  const stroked = (prefix === "tabler" || prefix === "custom") && icon.body.includes('stroke-width="2"');
  // 線を描く要素に non-scaling-stroke を付ける（vector-effect は継承されないので要素ごと）
  const body = stroked
    ? icon.body.replace(
        /<(path|circle|ellipse|rect|line|polyline|polygon)\b/g,
        '<$1 vector-effect="non-scaling-stroke"',
      )
    : icon.body;

  webOut.push(
    `export function ${name}(props: IconProps) {`,
    `  return (`,
    `    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 ${w} ${h}" aria-hidden${stroked ? " strokeWidth={iconStroke(props.width)}" : ""} {...props}>`,
    `      ${stroked ? toJsx(body).replace(/\sstrokeWidth="2"/g, "") : toJsx(body)}`,
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

/* モバイルアプリのアイコン・スプラッシュは scripts/gen-brand.ts がブランドマークから書き出す */
mkdirSync(new URL("../mobile/assets", import.meta.url), { recursive: true });
for (const name of ["booth-icon.png", "talto-icon.png"]) {
  const src = new URL(`../public/${name}`, import.meta.url);
  if (existsSync(src)) {
    copyFileSync(src, new URL(`../mobile/assets/${name}`, import.meta.url));
  }
}

console.log(
  `Generated ${Object.keys(ICONS).length} icons → src/components/icons.tsx & mobile/src/components/icons.tsx`,
);
