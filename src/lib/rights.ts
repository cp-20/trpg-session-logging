/**
 * 卓譜が扱う TRPG システムの権利表記。
 *
 * 文言は各権利者のガイドラインの表示例をそのまま写す（2026-11-21 に確認）。
 * - クトゥルフ神話TRPG: https://product.kadokawa.co.jp/cthulhu/guideline.html （2024-05-01 更新のシリーズ表記）
 * - ソード・ワールド2.5: https://fujimi-trpg-online.jp/info/entry-2587.html
 * - エモクロアTRPG: https://emoklore.dicetous.com/guideline/ （ダイスタス・コモンズ）
 * Web ページは「トップページやタイトルページ」に表示する決まりなので、ログイン画面・設定・共有ページに出す。
 */

export type RightsHolderId = "cthulhu" | "sword-world" | "emoklore";

export interface RightsNotice {
  id: RightsHolderId;
  /** 見出しに出す作品名 */
  title: string;
  /** 権利者が示す表記。1 要素 1 行で、文字を変えない */
  lines: readonly string[];
  guidelineUrl: string;
}

export const RIGHTS_NOTICES: Record<RightsHolderId, RightsNotice> = {
  cthulhu: {
    id: "cthulhu",
    title: "クトゥルフ神話TRPG・新クトゥルフ神話TRPG",
    lines: [
      "本作は、「株式会社アークライト」及び「株式会社KADOKAWA」が権利を有する『クトゥルフ神話TRPG』シリーズの二次創作物です。",
      "Call of Cthulhu is copyright ©1981, 2015, 2019 by Chaosium Inc. ; all rights reserved. Arranged by Arclight Inc.",
      "Call of Cthulhu is a registered trademark of Chaosium Inc.",
      "PUBLISHED BY KADOKAWA CORPORATION　「クトゥルフ神話TRPG」「新クトゥルフ神話TRPG」",
    ],
    guidelineUrl: "https://product.kadokawa.co.jp/cthulhu/guideline.html",
  },
  "sword-world": {
    id: "sword-world",
    title: "ソード・ワールド2.5",
    lines: [
      "本作は、「グループＳＮＥ」及び「株式会社ＫＡＤＯＫＡＷＡ」が権利を有する『ソード・ワールド2.0/2.5』の、二次創作です。",
      "(C)GroupSNE",
      "(C)KADOKAWA",
    ],
    guidelineUrl: "https://fujimi-trpg-online.jp/info/entry-2587.html",
  },
  emoklore: {
    id: "emoklore",
    title: "エモクロアTRPG",
    lines: [
      "本作は、ダイスタス・チームが制作・公開する『エモクロアTRPG』の二次創作物です。",
      "二次創作ガイドラインに基づき、ダイスタス・コモンズによるライセンス表記を行っています。",
    ],
    guidelineUrl: "https://emoklore.dicetous.com/guideline/",
  },
};

/** 表示順。複数出すときはこの順に並べる */
export const RIGHTS_ORDER: readonly RightsHolderId[] = ["cthulhu", "sword-world", "emoklore"];

/**
 * システム ID ごとの権利者。権利表記が要らないシステムは null。
 * システムを足したら、ここに必ず決定を足す（単体テストで漏れを検出する）。
 */
export const SYSTEM_RIGHTS: Record<string, RightsHolderId | null> = {
  coc7: "cthulhu",
  coc6: "cthulhu",
  sw25: "sword-world",
  emoklore: "emoklore",
  madamis: null,
  general: null,
};

/**
 * 卓譜自体のダイスタス・コモンズ表記（エモクロアTRPG の二次創作ガイドラインが求めるもの）。
 * 公開後は内容を変えない決まりがある。画像は公式配布のアイコンを重ねたもの（public/dicetous-commons.png）。
 */
export const DICETOUS_COMMONS = {
  image: "/dicetous-commons.png",
  imageWidth: 520,
  imageHeight: 50,
  text: "クレジット表示【不要】｜改変利用【許可】｜公演利用【許可・収益化OK】｜営利利用【許諾制】",
  contactLabel: "営利利用のご相談",
  contactUrl: "/feedback",
} as const;

/** 指定したシステムに必要な権利表記を、重複なく表示順で返す。引数なしならすべて */
export function rightsNoticesFor(systemIds?: Iterable<string | undefined>): RightsNotice[] {
  if (!systemIds) return RIGHTS_ORDER.map((id) => RIGHTS_NOTICES[id]);
  const wanted = new Set<RightsHolderId>();
  for (const sid of systemIds) {
    const holder = sid ? SYSTEM_RIGHTS[sid] : null;
    if (holder) wanted.add(holder);
  }
  return RIGHTS_ORDER.filter((id) => wanted.has(id)).map((id) => RIGHTS_NOTICES[id]);
}

/** ご意見・不具合の報告フォーム（Discord に届く） */
export const FEEDBACK_PATH = "/feedback";

/** ライセンス・規約まわりのページ。入口のフッター・設定・共有ページからリンクする */
export const LEGAL_LINKS = [
  { to: "/licenses", label: "ライセンス・権利表記" },
  { to: "/terms", label: "利用規約" },
  { to: "/privacy", label: "プライバシーポリシー" },
  { to: FEEDBACK_PATH, label: "ご意見・不具合の報告" },
] as const;

/** 卓譜が同梱・利用している主なオープンソースソフトウェアと素材 */
export const OSS_LICENSES: readonly { name: string; license: string; url: string }[] = [
  { name: "Next.js", license: "MIT", url: "https://github.com/vercel/next.js" },
  { name: "React", license: "MIT", url: "https://github.com/facebook/react" },
  {
    name: "Firebase JavaScript SDK",
    license: "Apache-2.0",
    url: "https://github.com/firebase/firebase-js-sdk",
  },
  { name: "Tailwind CSS", license: "MIT", url: "https://github.com/tailwindlabs/tailwindcss" },
  { name: "daisyUI", license: "MIT", url: "https://github.com/saadeghi/daisyui" },
  { name: "Zod", license: "MIT", url: "https://github.com/colinhacks/zod" },
  { name: "React Hook Form", license: "MIT", url: "https://github.com/react-hook-form/react-hook-form" },
  { name: "JSZip", license: "MIT", url: "https://github.com/Stuk/jszip" },
  { name: "Noto Sans JP（Fontsource）", license: "OFL-1.1", url: "https://github.com/fontsource/font-files" },
  {
    name: "Dela Gothic One（Fontsource）",
    license: "OFL-1.1",
    url: "https://github.com/syakuzen/DelaGothic",
  },
  { name: "Tabler Icons", license: "MIT", url: "https://github.com/tabler/tabler-icons" },
  { name: "Simple Icons", license: "CC0-1.0", url: "https://github.com/simple-icons/simple-icons" },
  { name: "SVG Logos", license: "CC0-1.0", url: "https://github.com/gilbarbara/logos" },
];
