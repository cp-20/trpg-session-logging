/**
 * 卓譜が扱う TRPG システムの権利表記。
 *
 * 文言は各権利者のガイドラインの表示例をそのまま写す（2026-11-21 に確認）。
 * - クトゥルフ神話TRPG: https://product.kadokawa.co.jp/cthulhu/guideline.html （2024-05-01 更新のシリーズ表記）
 * - ソード・ワールド2.5: https://fujimi-trpg-online.jp/info/entry-2587.html
 * - エモクロアTRPG: https://emoklore.dicetous.com/guideline/ （ダイスタス・コモンズ）
 * - 銀剣のステラナイツ: https://fujimi-trpg-online.jp/info/stellar_ug.html （2021-03-18 更新。表記は必須）
 * - キズナバレット・マモノスクランブル: https://karasuba-sei.biz/officialsite/?page_id=256 （2025-01-13 更新。表記は任意）
 *   以上 3 件は 2026-11-27 に確認。
 * - TRPGライツ事務局の共通ガイドラインの作品（ダブルクロス・シノビガミなど）:
 *   http://www.arclight.co.jp/trpg-rights/二次創作活動のガイドライン/ の書式 1「本作は、「(著作名)+(出版社/発売元)」が権利を有する
 *   「(製品名)」の二次創作作品です。」に、二次創作管理製品名リストの製品名・著者名・出版社を写して当てはめる（2026-11-27 に確認）。
 *   作品ごとの表示例は無いので、文はこの書式から作ったもの（運営者の判断、2026-11-27）。
 * Web ページは「トップページやタイトルページ」に表示する決まりなので、ログイン画面・設定・共有ページに出す。
 */

export type RightsHolderId =
  | "cthulhu"
  | "sword-world"
  | "emoklore"
  | "stellar-knights"
  | "kizuna-bullet"
  | "mamono-scramble"
  | "double-cross"
  | "arianrhod"
  | "night-wizard"
  | "shinobigami"
  | "magicalogia"
  | "kill-death-business"
  | "satasupe"
  | "futari-sousa"
  | "kamigakari";

export interface RightsNotice {
  id: RightsHolderId;
  /** 見出しに出す作品名 */
  title: string;
  /** 権利者が示す表記。1 要素 1 行で、文字を変えない */
  lines: readonly string[];
  guidelineUrl: string;
}

/** TRPGライツ事務局の共通ガイドラインの書式 1（権利者表示）。製品名・著者名・出版社は製品名リストのとおりに写す */
const TRPG_RIGHTS_GUIDELINE = "http://www.arclight.co.jp/trpg-rights/";
function trpgRightsNotice(
  id: RightsHolderId,
  product: string,
  author: string,
  publisher: string,
): RightsNotice {
  return {
    id,
    title: product,
    lines: [`本作は、「${author}、${publisher}」が権利を有する『${product}』の二次創作作品です。`],
    guidelineUrl: TRPG_RIGHTS_GUIDELINE,
  };
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
  "stellar-knights": {
    id: "stellar-knights",
    title: "銀剣のステラナイツ",
    lines: [
      "本作は「どらこにあん」及び「株式会社KADOKAWA」が権利を有する『銀剣のステラナイツ』の二次創作です。",
      "(C)Fuyu Takizato / Draconian",
      "(C)KADOKAWA",
    ],
    guidelineUrl: "https://fujimi-trpg-online.jp/info/stellar_ug.html",
  },
  "kizuna-bullet": {
    id: "kizuna-bullet",
    title: "キズナバレット",
    lines: [
      "本作は「からすば晴（Ｎ.Ｇ.Ｐ.）」および「株式会社アークライト出版事業部」が権利を有する『キズナバレット』の二次創作です。",
      "c2021 からすば晴／Ｎ.Ｇ.Ｐ.／アークライト／新紀元社",
    ],
    guidelineUrl: "https://karasuba-sei.biz/officialsite/?page_id=256",
  },
  "mamono-scramble": {
    id: "mamono-scramble",
    title: "マモノスクランブル",
    lines: [
      "本作は「からすば晴」および「株式会社KADOKAWA ゲーム・企画書籍編集部」が権利を有する『マモノスクランブル』の二次創作です。",
      "c Karasuba Sei 2023",
    ],
    guidelineUrl: "https://karasuba-sei.biz/officialsite/?page_id=256",
  },
  "double-cross": trpgRightsNotice(
    "double-cross",
    "ダブルクロス The 3rd Edition",
    "著：矢野俊策／F.E.A.R.",
    "KADOKAWA",
  ),
  arianrhod: trpgRightsNotice("arianrhod", "アリアンロッドRPG２E", "著：菊池たけし／F.E.A.R", "KADOKAWA"),
  "night-wizard": trpgRightsNotice(
    "night-wizard",
    "ナイトウィザード The 3rd Edition",
    "著：菊池たけし／F.E.A.R.",
    "KADOKAWA",
  ),
  shinobigami: trpgRightsNotice(
    "shinobigami",
    "忍術バトルRPG シノビガミ",
    "著：河嶋陶一朗／冒険企画局",
    "新紀元社",
  ),
  magicalogia: trpgRightsNotice(
    "magicalogia",
    "魔道書大戦RPG マギカロギア",
    "著：河嶋陶一朗／冒険企画局",
    "新紀元社",
  ),
  "kill-death-business": trpgRightsNotice(
    "kill-death-business",
    "リアリティショーRPG キルデスビジネス",
    "著：齋藤高吉／冒険企画局",
    "新紀元社",
  ),
  satasupe: trpgRightsNotice(
    "satasupe",
    "アジアンパンクRPG サタスペ",
    "著：河嶋陶一朗と速水螺旋人と暗転丸と池田朝佳とイケダサトシと泉信行と魚蹴と岡野繁浩と齋藤高吉とdczとぺらねこと吉井徹／冒険企画局",
    "新紀元社",
  ),
  "futari-sousa": trpgRightsNotice(
    "futari-sousa",
    "バディサスペンスTRPG フタリソウサ",
    "著：平野累次／冒険企画局",
    "新紀元社",
  ),
  kamigakari: trpgRightsNotice("kamigakari", "武装伝奇RPG 神我狩", "著：力造", "新紀元社"),
};

/** 表示順。複数出すときはこの順に並べる */
export const RIGHTS_ORDER: readonly RightsHolderId[] = [
  "cthulhu",
  "sword-world",
  "emoklore",
  "stellar-knights",
  "kizuna-bullet",
  "mamono-scramble",
  "double-cross",
  "arianrhod",
  "night-wizard",
  "shinobigami",
  "magicalogia",
  "kill-death-business",
  "satasupe",
  "futari-sousa",
  "kamigakari",
];

/**
 * システム ID ごとの権利者。権利表記が要らないシステムは null。
 * 能力値・技能まで持つシステム（DETAILED_SYSTEM_IDS）を足したら、ここに必ず決定を足す（単体テストで漏れを検出する）。
 * BCDice の一覧から作った汎用のシステムは、権利者の表示例を確かめたものだけを書く。書かないものは表記を出さない。
 */
export const SYSTEM_RIGHTS: Record<string, RightsHolderId | null> = {
  coc7: "cthulhu",
  coc6: "cthulhu",
  sw25: "sword-world",
  emoklore: "emoklore",
  madamis: null,
  general: null,
  // 『クトゥルフ神話TRPG』シリーズの日本語版（KADOKAWA）
  PulpCthulhu: "cthulhu",
  // 表示例が「ソード・ワールド2.0/2.5」を対象にしている
  "SwordWorld2.0": "sword-world",
  StellarKnights: "stellar-knights",
  KizunaBullet: "kizuna-bullet",
  MamonoScramble: "mamono-scramble",
  // TRPGライツ事務局の共通ガイドラインの作品（書式 1 から作った表記）
  DoubleCross: "double-cross",
  Arianrhod: "arianrhod",
  NightWizard3rd: "night-wizard",
  ShinobiGami: "shinobigami",
  MagicaLogia: "magicalogia",
  KillDeathBusiness: "kill-death-business",
  Satasupe: "satasupe",
  FutariSousa: "futari-sousa",
  Kamigakari: "kamigakari",
  /* 公式の二次創作ガイドラインを見つけられなかったもの（2026-11-27 調査）。表示例が分かるまで出さない */
  Insane: null,
  Nechronica: null,
  LogHorizon: null,
  GoblinSlayer: null,
  GranCrest: null,
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
    const holder = sid ? (SYSTEM_RIGHTS[sid] ?? null) : null;
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
