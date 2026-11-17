/**
 * アイコンを iconify のデータから React 部品として書き出す（ビルドツールに依存せずオフラインで動く）。
 * 使うアイコンを足すときは ICONS に 1 行足して `pnpm run gen:icons` を実行する。
 * tabler = UI 用、logos / simple-icons = ブランド用。
 */
import { readFileSync, writeFileSync } from "node:fs";
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

const out: string[] = [
  "// このファイルは scripts/gen-icons.ts が生成する。直接編集しない。",
  'import type { SVGProps } from "react";',
  "",
  "export type IconProps = SVGProps<SVGSVGElement>;",
  "",
];
for (const [name, ref] of Object.entries(ICONS)) {
  const [prefix, id] = ref.split("/") as [string, string];
  const set = load(prefix);
  const icon = set.icons[id] ?? set.icons[set.aliases?.[id]?.parent ?? ""];
  if (!icon) throw new Error(`Icon not found: ${ref}`);
  const w = icon.width ?? set.width ?? 16;
  const h = icon.height ?? set.height ?? 16;
  out.push(
    `export function ${name}(props: IconProps) {`,
    `  return (`,
    `    <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 ${w} ${h}" aria-hidden {...props}>`,
    `      ${toJsx(icon.body)}`,
    `    </svg>`,
    `  );`,
    `}`,
    "",
  );
}
writeFileSync(new URL("../src/components/icons.tsx", import.meta.url), out.join("\n"));
console.log(`Generated ${Object.keys(ICONS).length} icons → src/components/icons.tsx`);
