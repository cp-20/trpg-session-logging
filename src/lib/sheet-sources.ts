/**
 * キャラシサイトごとのデータを、卓譜の汎用シート（src/lib/sheet.ts）と取り込み結果に読み替える。
 * どれも純粋関数。通信は src/lib/external-import-server.ts が行う。
 */
import type { ParsedCharacter } from "./ccfolia-character";
import { INSANE_SKILLS, SHINOBIGAMI_SKILLS } from "./skill-tables";
import {
  buildSheet,
  compact,
  entry,
  listEntry,
  numOf,
  section,
  textOf,
  textSection,
  type CharacterSheet,
  type SheetEntry,
  type SheetProvider,
  type SheetSection,
} from "./sheet";

type Rec = Record<string, unknown>;

function rec(v: unknown): Rec | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function httpsUrl(v: unknown): string | undefined {
  const t = textOf(v);
  if (!t || !/^https:\/\//i.test(t)) return undefined;
  try {
    return new URL(t).toString();
  } catch {
    return undefined;
  }
}
/** 「運転（）」の空の括弧を落とし、半角括弧を全角にそろえる */
function skillName(name: string, specialty?: string): string {
  const base = name.replace(/[（(]\s*[)）]/g, "").trim();
  const spec = specialty?.trim();
  if (spec && !base.includes(spec)) return `${base}（${spec}）`;
  return base.replace(/\(([^)]*)\)/g, "（$1）");
}

/* ================= クトゥルフ神話TRPG 共通 ================= */

const COC_ABILITIES = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"] as const;

/** 技能名 → 分類。6 版・7 版の基本技能（サイトが分類を持たないとき用） */
const COC_SKILL_GROUP: Record<string, string> = {};
for (const [group, names] of [
  [
    "戦闘技能",
    "回避 キック 組み付き こぶし こぶし（パンチ） 頭突き 投擲 マーシャルアーツ 拳銃 サブマシンガン ショットガン マシンガン ライフル 近接戦闘 射撃 爆破 砲",
  ],
  [
    "探索技能",
    "応急手当 鍵開け 隠す 隠れる 聞き耳 忍び歩き 写真術 精神分析 追跡 登攀 図書館 目星 手さばき 隠密 鑑定 読唇術",
  ],
  [
    "行動技能",
    "運転 機械修理 重機械操作 乗馬 水泳 製作 操縦 跳躍 電気修理 ナビゲート 変装 芸術/製作 ダイビング 動物使い",
  ],
  ["交渉技能", "言いくるめ 信用 説得 値切り 母国語 ほかの言語 他の言語 威圧 魅惑"],
  [
    "知識技能",
    "医学 オカルト 化学 クトゥルフ神話 芸術 経理 考古学 コンピューター 心理学 人類学 生物学 地質学 電子工学 天文学 博物学 物理学 法律 薬学 歴史 科学 自然 サバイバル 伝承 ヒプノーシス",
  ],
] as const) {
  for (const n of names.split(" ")) COC_SKILL_GROUP[n] = group;
}
export function cocSkillGroup(label: string): string | undefined {
  return COC_SKILL_GROUP[label] ?? COC_SKILL_GROUP[label.replace(/[（(].*$/, "").trim()];
}

const COC_CATEGORY: Record<string, string> = {
  combat: "戦闘技能",
  search: "探索技能",
  action: "行動技能",
  negotiate: "交渉技能",
  knowledge: "知識技能",
};

/** 継続する値（SAN・7 版の幸運）だけを stats に入れる。HP・MP は毎回もとに戻るので入れない */
function cocStats(
  san: number | undefined,
  luck: number | undefined,
  systemId: string,
): Record<string, number> {
  const stats: Record<string, number> = {};
  if (san !== undefined) stats.san = san;
  if (luck !== undefined && systemId === "coc7") stats.luck = luck;
  return stats;
}

/* ================= キャラエノ（charaeno.com） ================= */

/** キャラエノの /api/v1/{6th|7th}/{id}/summary の応答か */
export function isCharaenoJson(root: unknown): boolean {
  const r = rec(root);
  return Boolean(r && typeof r.name === "string" && rec(r.characteristics) && rec(r.attribute));
}

export function parseCharaenoJson(raw: string | unknown, url?: string): ParsedCharacter | null {
  let root: unknown = raw;
  if (typeof raw === "string") {
    try {
      root = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isCharaenoJson(root)) return null;
  const r = root as Rec;
  const name = textOf(r.name);
  if (!name) return null;
  const ch = rec(r.characteristics)!;
  const at = rec(r.attribute)!;
  const san = rec(at.san);
  /* 版は URL（/6th/・/7th/）で決まる。URL が無いときだけ 7 版にしかない項目から推定する */
  const edition = url?.match(/\/(6th|7th)\//)?.[1];
  const is7th = edition
    ? edition === "7th"
    : at.mov !== undefined || at.build !== undefined || Array.isArray(r.backstory);
  const systemId = is7th ? "coc7" : "coc6";

  const skills = arr(r.skills).map((s) => {
    const x = rec(s);
    const label = x && textOf(x.name) ? skillName(textOf(x.name)!) : "";
    return label
      ? entry(label, x!.value, { grown: x!.edited === true || undefined, group: cocSkillGroup(label) })
      : null;
  });
  const weapons = arr(r.weapons).map((w) => {
    const x = rec(w);
    const label = textOf(x?.name);
    if (!label) return null;
    const note = compact([textOf(x!.damage) && `ダメージ ${textOf(x!.damage)}`, textOf(x!.range)]).join("　");
    return listEntry(label, textOf(x!.value) ?? "", { note: note || undefined });
  });
  const items = arr(r.possessions).map((p) => {
    const x = rec(p);
    const label = textOf(x?.name);
    return label ? listEntry(label, textOf(x!.count) ?? "", { note: textOf(x!.detail) }) : null;
  });
  const backstory = arr(r.backstory)
    .map((b) => {
      const x = rec(b);
      const body = arr(x?.entries)
        .map((e) => textOf(rec(e)?.text))
        .filter(Boolean)
        .join("\n");
      return body ? `【${textOf(x?.name) ?? ""}】\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const sheet = buildSheet("charaeno", {
    url,
    profile: [
      entry("職業", r.occupation),
      entry("年齢", r.age),
      entry("性別", r.sex),
      entry("出身", r.birthplace),
      entry("学位", r.degree),
    ],
    sections: [
      section(
        "abilities",
        "能力値",
        "abilities",
        COC_ABILITIES.map((k) => entry(k, ch[k.toLowerCase()])),
      ),
      section("resources", "副能力値", "resources", [
        entry("HP", at.hp),
        entry("MP", at.mp),
        entry("SAN", san?.value, { max: numOf(san?.max) }),
        entry("幸運", at.luck),
        entry("DB", at.db),
        entry("ビルド", at.build),
        entry("MOV", at.mov),
      ]),
      section("skills", "技能", "skills", skills),
      section("weapons", "武器", "list", weapons),
      section("items", "所持品", "list", items),
      textSection("backstory", "バックストーリー", backstory),
      textSection("memo", "メモ", r.note),
    ],
  });

  const occupation = textOf(r.occupation);
  return {
    name,
    memo: occupation ? `職業: ${occupation}` : undefined,
    systemId,
    stats: cocStats(numOf(san?.value), numOf(at.luck), systemId),
    ...(httpsUrl(r.portraitURL) ? { image: httpsUrl(r.portraitURL) } : {}),
    ...(sheet ? { sheet } : {}),
  };
}

/* ================= キャラッシュ（charash.jp） ================= */

export function isCharashJson(root: unknown): boolean {
  const r = rec(root);
  return Boolean(r && r.format === "charash-character" && rec(r.profile));
}

const CHARASH_SYSTEM: Record<string, { id: string; label?: string }> = {
  coc7: { id: "coc7" },
  coc6: { id: "coc6" },
  emoklore: { id: "emoklore" },
  gaiacare: { id: "general", label: "ガイアケアTRPG" },
  "10_st": { id: "general", label: "10_st（ロスト）" },
};

const EMOKLORE_ABILITIES: [string, string][] = [
  ["body", "身体"],
  ["dexterity", "器用"],
  ["mind", "精神"],
  ["senses", "五感"],
  ["intellect", "知力"],
  ["charm", "魅力"],
  ["social", "社会"],
  ["fortune", "運勢"],
];
const EMOKLORE_ABILITY_LABEL = Object.fromEntries(EMOKLORE_ABILITIES);

function listOfNamed(raw: unknown, nameKey = "name", countKey = "quantity", noteKey = "note"): SheetEntry[] {
  return compact(
    arr(raw).map((v) => {
      const x = rec(v);
      const label = textOf(x?.[nameKey]);
      return label ? listEntry(label, textOf(x![countKey]) ?? "", { note: textOf(x![noteKey]) }) : null;
    }),
  );
}

export function parseCharashJson(raw: string | unknown, url?: string): ParsedCharacter | null {
  let root: unknown = raw;
  if (typeof raw === "string") {
    try {
      root = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isCharashJson(root)) return null;
  const r = root as Rec;
  const profile = rec(r.profile)!;
  const name = textOf(profile.name);
  if (!name) return null;

  const systems = rec(r.systems) ?? {};
  const sysKey = Object.keys(systems).find((k) => rec(systems[k])) ?? "";
  const sys = rec(systems[sysKey]) ?? {};
  const known = CHARASH_SYSTEM[sysKey];
  const systemId = known?.id ?? "general";
  const systemLabel = known?.label ?? (sysKey && !known ? sysKey : undefined);
  const abil = rec(sys.abilities) ?? {};
  const der = rec(sys.derived) ?? {};
  const val = (v: unknown) => rec(v)?.value ?? v;

  const sections: (SheetSection | null)[] = [];
  let stats: Record<string, number> = {};

  if (systemId === "coc7" || systemId === "coc6") {
    const san = rec(der.san);
    sections.push(
      section(
        "abilities",
        "能力値",
        "abilities",
        COC_ABILITIES.map((k) => entry(k, val(abil[k]))),
      ),
      section("resources", "副能力値", "resources", [
        entry("HP", val(der.hp)),
        entry("MP", val(der.mp)),
        entry("SAN", san?.value, { max: numOf(san?.max) }),
        entry("幸運", val(der.luck)),
        entry("アイデア", val(der.idea)),
        entry("知識", val(der.knowledge)),
        entry("DB", val(der.damageBonus)),
        entry("ビルド", val(der.build)),
        entry("MOV", val(der.mov)),
      ]),
      section(
        "skills",
        "技能",
        "skills",
        arr(sys.skills).map((s) => {
          const x = rec(s);
          const n = textOf(x?.name);
          if (!n) return null;
          const label = skillName(n, textOf(x!.specialty));
          const growth = numOf(x!.growth) ?? 0;
          return entry(label, x!.value, {
            base: numOf(rec(x!.base)?.value),
            grown: growth > 0 || undefined,
            group: COC_CATEGORY[textOf(x!.category) ?? ""] ?? cocSkillGroup(label),
          });
        }),
      ),
    );
    stats = cocStats(numOf(san?.value), numOf(val(der.luck)), systemId);
  } else if (systemId === "emoklore") {
    const resonance = rec(rec(sys.resonance)?.level);
    sections.push(
      section(
        "abilities",
        "能力値",
        "abilities",
        EMOKLORE_ABILITIES.map(([k, label]) => entry(label, val(abil[k]))),
      ),
      section("resources", "副能力値", "resources", [
        entry("HP", val(der.hp)),
        entry("MP", val(der.mp)),
        entry("共鳴", resonance?.value),
      ]),
      section(
        "skills",
        "技能",
        "skills",
        arr(sys.skills).map((s) => {
          const x = rec(s);
          const n = textOf(x?.name);
          if (!n) return null;
          const level = numOf(x!.level) ?? 0;
          const ability = EMOKLORE_ABILITY_LABEL[textOf(x!.ability) ?? ""];
          return entry(skillName(n, textOf(x!.specialty)), x!.value, {
            rank: { value: level, max: 3 },
            note: ability,
          });
        }),
      ),
      section(
        "echoes",
        "残響",
        "list",
        arr(sys.echoes).map((e) => {
          const x = rec(e);
          const label = textOf(x?.scenario);
          return label
            ? listEntry(label, textOf(x!.emotion) ?? "", { note: x!.consumed ? "消費済み" : undefined })
            : null;
        }),
      ),
    );
    const emo = rec(rec(sys.resonance)?.emotions);
    if (emo) {
      sections.push(
        section("emotions", "共鳴感情", "list", [
          entry("表", emo.surface),
          entry("裏", emo.hidden),
          entry("ルーツ", emo.roots),
        ]),
      );
    }
    const von = numOf(resonance?.value);
    if (von !== undefined) stats.von = von;
  } else {
    /* 卓譜にないシステム: 能力値と技能を形のまま並べる */
    sections.push(
      section(
        "abilities",
        "能力値",
        "abilities",
        Object.entries(abil).map(([k, v]) => entry(k, val(v))),
      ),
      section(
        "resources",
        "副能力値",
        "resources",
        Object.entries(der).map(([k, v]) => entry(k.toUpperCase(), val(v))),
      ),
      section(
        "skills",
        "技能",
        "skills",
        arr(sys.skills).map((s) => {
          const x = rec(s);
          const n = textOf(x?.name);
          return n ? entry(skillName(n, textOf(x!.specialty)), x!.value ?? x!.level) : null;
        }),
      ),
    );
  }

  sections.push(
    section("weapons", "武器", "list", listOfNamed(sys.weapons)),
    section("items", "所持品", "list", [...listOfNamed(profile.belongings), ...listOfNamed(sys.items)]),
    textSection(
      "backstory",
      "バックストーリー",
      arr(sys.backstory)
        .map((b) => {
          const x = rec(b);
          const t = textOf(x?.text);
          return t ? `【${textOf(x?.label) ?? ""}】\n${t}` : "";
        })
        .filter(Boolean)
        .join("\n\n"),
    ),
    textSection("background", "経歴", profile.background),
  );

  const age = rec(profile.age)?.value ?? profile.age;
  const sheet = buildSheet("charash", {
    url,
    systemLabel,
    profile: [
      entry("職業", profile.occupation),
      entry("年齢", age),
      entry("性別", profile.gender),
      entry("出身", profile.origin),
    ],
    sections,
  });

  const images = arr(r.images).map(rec);
  const main = images.find((i) => i?.main) ?? images[0];
  const image = httpsUrl(main?.url);
  const occupation = textOf(profile.occupation);
  return {
    name,
    memo: occupation ? `職業: ${occupation}` : undefined,
    systemId,
    stats,
    ...(image ? { image } : {}),
    ...(sheet ? { sheet } : {}),
  };
}

/* ================= キャラクター保管所（charasheet.vampire-blood.net） ================= */

/** 6 版の技能欄。保管所は欄ごとに既定の技能名の順で値を配列に持つ */
const CHARASHEET_COC6_SKILLS: [
  prefix: string,
  group: string,
  names: string[],
  fields?: Record<number, string>,
][] = [
  [
    "TBA",
    "戦闘技能",
    "回避 キック 組み付き こぶし（パンチ） 頭突き 投擲 マーシャルアーツ 拳銃 サブマシンガン ショットガン マシンガン ライフル".split(
      " ",
    ),
  ],
  [
    "TFA",
    "探索技能",
    "応急手当 鍵開け 隠す 隠れる 聞き耳 忍び歩き 写真術 精神分析 追跡 登攀 図書館 目星".split(" "),
  ],
  [
    "TAA",
    "行動技能",
    "運転 機械修理 重機械操作 乗馬 水泳 製作 操縦 跳躍 電気修理 ナビゲート 変装".split(" "),
    { 0: "unten_bunya", 5: "seisaku_bunya", 6: "main_souju_norimono" },
  ],
  ["TCA", "交渉技能", "言いくるめ 信用 説得 値切り 母国語".split(" "), { 4: "mylang_name" }],
  [
    "TKA",
    "知識技能",
    "医学 オカルト 化学 クトゥルフ神話 芸術 経理 考古学 コンピューター 心理学 人類学 生物学 地質学 電子工学 天文学 博物学 物理学 法律 薬学 歴史".split(
      " ",
    ),
    { 4: "geijutu_bunya" },
  ],
];

const CHARASHEET_SW_ABILITIES: [string, string][] = [
  ["NP1", "器用度"],
  ["NP2", "敏捷度"],
  ["NP3", "筋力"],
  ["NP4", "生命力"],
  ["NP5", "知力"],
  ["NP6", "精神力"],
];

/** 保管所の JSON からシートを作る（名前などは parseCharasheetJson が読む） */
export function sheetFromCharasheet(root: unknown, url?: string): CharacterSheet | undefined {
  const r = rec(root);
  if (!r || !textOf(r.pc_name)) return undefined;
  const game = (textOf(r.game) ?? "").toLowerCase();
  const memo = textSection("memo", "メモ", r.pc_making_memo);
  const items = section(
    "items",
    "所持品",
    "list",
    arr(r.item_name).map((n, i) => {
      const label = textOf(n);
      return label
        ? listEntry(label, textOf(arr(r.item_num)[i]) ?? "", { note: textOf(arr(r.item_memo)[i]) })
        : null;
    }),
  );

  if (game === "coc" || game === "coc7") {
    const skills: (SheetEntry | null)[] = [];
    if (game === "coc") {
      for (const [prefix, group, names, fields] of CHARASHEET_COC6_SKILLS) {
        const totals = arr(r[`${prefix}P`]);
        const bases = arr(r[`${prefix}D`]);
        const growth = arr(r[`${prefix}A`]);
        const extra = arr(r[`${prefix}Name`]);
        totals.forEach((total, i) => {
          let label = names[i] ?? textOf(extra[i - names.length]);
          if (!label) return;
          const spec = fields?.[i] ? textOf(r[fields[i]!]) : undefined;
          if (spec) label = `${label.replace(/（.*$/, "")}（${spec}）`;
          skills.push(
            entry(label, total, {
              base: numOf(bases[i]),
              grown: (numOf(growth[i]) ?? 0) > 0 || undefined,
              group,
            }),
          );
        });
      }
    }
    return buildSheet("charasheet", {
      url,
      profile: [
        entry("職業", r.shuzoku ?? r.works),
        entry("年齢", r.age),
        entry("性別", r.sex),
        entry("出身", r.pc_kigen),
      ],
      sections: [
        section(
          "abilities",
          "能力値",
          "abilities",
          COC_ABILITIES.map((k, i) => entry(k, r[`NP${i + 1}`])),
        ),
        section("resources", "副能力値", "resources", [
          entry("HP", r.NP9),
          entry("MP", r.NP10),
          entry("SAN", r.SAN_Left ?? r.NP11, { max: numOf(r.SAN_Max) }),
          entry("アイデア", r.NP12),
          entry("幸運", r.NP13),
          entry("知識", r.NP14),
          entry("DB", r.dmg_bonus),
        ]),
        section("skills", "技能", "skills", skills),
        items,
        memo,
      ],
    });
  }

  if (game.startsWith("sw")) {
    const feats = Object.keys(r)
      .filter((k) => k.startsWith("ST_name_"))
      .map((k) => {
        const label = textOf(r[k]);
        return label ? listEntry(label, "", { note: textOf(r[k.replace("ST_name_", "ST_kouka_")]) }) : null;
      });
    return buildSheet("charasheet", {
      url,
      systemLabel: game.includes("2.0") ? "ソード・ワールド2.0" : undefined,
      profile: [
        entry("種族", r.shuzoku_name),
        entry("生まれ", r.umare_name),
        entry("年齢", r.age),
        entry("性別", r.sex),
      ],
      sections: [
        section("levels", "レベル", "levels", [entry("冒険者レベル", r.lv)]),
        section(
          "abilities",
          "能力値",
          "abilities",
          CHARASHEET_SW_ABILITIES.map(([k, label]) => entry(label, r[k])),
        ),
        section("resources", "副能力値", "resources", [
          entry("HP", r.HP),
          entry("MP", r.MP),
          entry("生命抵抗力", r.life_resist),
          entry("精神抵抗力", r.mental_resist),
          entry("経験点", r.now_exp),
        ]),
        section("feats", "戦闘特技", "list", feats),
        items,
        memo,
      ],
    });
  }

  return buildSheet("charasheet", {
    url,
    systemLabel: game || undefined,
    profile: [entry("年齢", r.age), entry("性別", r.sex)],
    sections: [items, memo],
  });
}

/* ================= ゆとシートⅡ（各システム・各サーバー） ================= */

const YTSHEET_SYSTEMS: Record<string, { id: string; label?: string }> = {
  "sw2.5": { id: "sw25" },
  "sw2.0": { id: "general", label: "ソード・ワールド2.0" },
  sw2: { id: "general", label: "ソード・ワールド2.0" },
  dx3rd: { id: "general", label: "ダブルクロス The 3rd Edition" },
  ar2e: { id: "general", label: "アリアンロッドRPG 2E" },
  gc: { id: "general", label: "グランクレストRPG" },
  gs: { id: "general", label: "ゴブリンスレイヤーTRPG" },
  kiz: { id: "general", label: "キズナバレット" },
  blp: { id: "general", label: "ブラッドパス" },
  vc: { id: "general", label: "ヴィジランテ・コード" },
  ms: { id: "general", label: "マモノスクランブル" },
};

/** URL のパス（/ytsheet/sw2.5/ など）からシステムを決める */
export function ytsheetSystemFromUrl(url: string | undefined): { id: string; label?: string } | undefined {
  if (!url) return undefined;
  try {
    const parts = new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
    for (const p of parts.reverse()) {
      if (YTSHEET_SYSTEMS[p]) return YTSHEET_SYSTEMS[p];
    }
  } catch {
    /* 不正な URL は推定しない */
  }
  return undefined;
}

const SW_ABILITIES: [string, string, string][] = [
  ["sttDex", "器用度", "bonusDex"],
  ["sttAgi", "敏捷度", "bonusAgi"],
  ["sttStr", "筋力", "bonusStr"],
  ["sttVit", "生命力", "bonusVit"],
  ["sttInt", "知力", "bonusInt"],
  ["sttMnd", "精神力", "bonusMnd"],
];

function ytText(v: unknown): string | undefined {
  const t = textOf(v);
  return t
    ?.replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** sheetDescriptionM（「種族:人間 性別: 年齢:」のように全角空白で区切った行）を項目に分ける */
function ytDescriptionEntries(raw: unknown): SheetEntry[] {
  const t = textOf(raw);
  if (!t) return [];
  const out: SheetEntry[] = [];
  for (const part of t.split(/[\n\u3000]+/)) {
    const m = part.match(/^([^:：]+)[:：](.*)$/);
    if (!m) continue;
    const e = entry(m[1]!, m[2]!.trim());
    if (e && e.value !== "－" && e.value !== "-") out.push(e);
  }
  return out;
}

export function sheetFromYtsheet(root: unknown, url?: string): CharacterSheet | undefined {
  const r = rec(root);
  if (!r) return undefined;
  const sys =
    ytsheetSystemFromUrl(url ?? textOf(r.sheetURL)) ??
    (textOf(r.gameVersion) === "2.5" || r.sttDex !== undefined ? { id: "sw25" } : undefined);
  const desc = ytDescriptionEntries(r.sheetDescriptionM);
  const descMap = new Map(desc.map((e) => [e.label, e.value]));
  const status = arr(r.unitStatus).flatMap((s) => {
    const x = rec(s);
    return x ? compact(Object.entries(x).map(([k, v]) => entry(k, v))) : [];
  });
  const memo = textSection("memo", "メモ", ytText(r.freeNote));
  const sheetUrl = url ?? httpsUrl(r.sheetURL);

  if (sys?.id === "sw25" || sys?.label === "ソード・ワールド2.0") {
    const classes = String(descMap.get("技能") ?? "")
      .split(/[／/]/)
      .map((c) => {
        const m = c.trim().match(/^(.+?)(\d+)$/);
        return m ? entry(m[1]!, Number(m[2])) : null;
      });
    const feats = Object.keys(r)
      .filter((k) => /^combatFeatsLv\d+$/.test(k))
      .sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")))
      .map((k) => listEntry(String(r[k] ?? ""), "", { note: `Lv${k.replace(/\D/g, "")}` }));
    return buildSheet("ytsheet", {
      url: sheetUrl,
      systemLabel: sys.label,
      profile: [
        entry("種族", r.race),
        entry("生まれ", r.birth),
        entry("年齢", r.age),
        entry("性別", r.gender),
        entry("信仰", r.faith),
        entry("ランク", r.rank),
      ],
      sections: [
        section("levels", "技能", "levels", [entry("冒険者レベル", r.level), ...classes]),
        section(
          "abilities",
          "能力値",
          "abilities",
          SW_ABILITIES.map(([k, label, bonus]) =>
            entry(label, r[k], { note: numOf(r[bonus]) !== undefined ? `+${numOf(r[bonus])}` : undefined }),
          ),
        ),
        section("resources", "副能力値", "resources", [
          entry("HP", r.hpTotal),
          entry("MP", r.mpTotal),
          entry("生命抵抗力", r.vitResistTotal),
          entry("精神抵抗力", r.mndResistTotal),
          entry("回避力", r.defenseTotalAllEva),
          entry("防護点", r.defenseTotalAllDef),
          entry("移動力", r.mobilityTotal),
          entry("経験点", r.expTotal),
          entry("名誉点", r.historyHonorTotal),
        ]),
        section("feats", "戦闘特技", "list", feats),
        textSection("items", "所持品", ytText(r.items)),
        memo,
      ],
    });
  }

  return buildSheet("ytsheet", {
    url: sheetUrl,
    systemLabel: sys?.label,
    profile: desc,
    sections: [section("resources", "ステータス", "resources", status), memo],
  });
}

const ABILITY_KEYS = new Set(["str", "con", "pow", "dex", "app", "siz", "int", "edu", "agi", "vit", "mnd"]);
const RESOURCE_LABEL: Record<string, string> = {
  hp: "HP",
  mp: "MP",
  san: "SAN",
  luck: "幸運",
  idea: "アイデア",
  know: "知識",
  db: "DB",
};

/** stats（英字の能力値と日本語の技能名が混ざったもの）からシートを作る */
export function sheetFromStats(
  stats: Record<string, number>,
  provider: SheetProvider,
  systemId?: string,
): CharacterSheet | undefined {
  const abilities: SheetEntry[] = [];
  const resources: SheetEntry[] = [];
  const skills: SheetEntry[] = [];
  const isCoc = systemId === "coc6" || systemId === "coc7";
  for (const [k, v] of Object.entries(stats)) {
    const lower = k.toLowerCase();
    if (ABILITY_KEYS.has(lower)) abilities.push({ label: k.toUpperCase(), value: v });
    else if (RESOURCE_LABEL[lower]) resources.push({ label: RESOURCE_LABEL[lower]!, value: v });
    else if (/^[a-z_]+$/i.test(k)) continue;
    else skills.push({ label: skillName(k), value: v, ...(isCoc ? { group: cocSkillGroup(k) } : {}) });
  }
  return buildSheet(provider, {
    sections: [
      section("abilities", "能力値", "abilities", abilities),
      section("resources", "副能力値", "resources", resources),
      section("skills", "技能", "skills", skills),
    ],
  });
}

/* ================= TRPGキャラクターシート倉庫（character-sheets.appspot.com） =================
 * 公開 JSON（/{システム}/display?ajax=1&key=…）を読む。JSON にシステムは入っていないので URL の道で決める。
 * 読み方を持つのはダブルクロス 3rd・シノビガミ・インセインだけ。ほかのシステムの URL は受け付けない（推測で埋めない）。
 */

/** 倉庫の道（/dx3/ など）→ 卓譜のシステム */
export const SOUKO_SYSTEMS: Record<string, { id: string; label: string }> = {
  dx3: { id: "DoubleCross", label: "ダブルクロス3rd" },
  shinobigami: { id: "ShinobiGami", label: "シノビガミ" },
  insane: { id: "Insane", label: "インセイン" },
};

/** 習得した特技（learned[].id = "skills.row{行}.name{列}"）。表にない番号は読まない */
function soukoLearnedSkills(root: Rec, table: [string, string[]][]): SheetEntry[] {
  const out: SheetEntry[] = [];
  for (const l of arr(root.learned)) {
    const id = textOf(rec(l)?.id);
    const m = id?.match(/^skills\.row(\d+)\.name(\d+)$/);
    if (!m) continue;
    const [group, names] = table[Number(m[2])] ?? [];
    const label = names?.[Number(m[1])];
    if (!group || !label || out.some((e) => e.label === label)) continue;
    out.push({ label, value: "習得", group });
  }
  return out;
}

/** 忍法・アビリティ・エフェクトの一覧（名前つきの行） */
function soukoNamedList(raw: unknown, valueKey: string, noteKeys: string[]): SheetEntry[] {
  return compact(
    arr(raw).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const note = compact(noteKeys.map((k) => textOf(r[k]))).join("　");
      return listEntry(name, r[valueKey], { note: note || undefined });
    }),
  );
}

const DX3_SKILLS: [string, string, string][] = [
  ["hak", "白兵", "肉体"],
  ["kai", "回避", "肉体"],
  ["sha", "射撃", "感覚"],
  ["tik", "知覚", "感覚"],
  ["rc", "RC", "精神"],
  ["isi", "意志", "精神"],
  ["kou", "交渉", "社会"],
  ["tyo", "調達", "社会"],
];
/* 追加の技能（B の name1〜4）は、運転・芸術・知識・情報の順 */
const DX3_EXTRA_SKILLS: [string, string][] = [
  ["運転", "肉体"],
  ["芸術", "感覚"],
  ["知識", "精神"],
  ["情報", "社会"],
];

function soukoDx3(root: Rec): {
  sections: (SheetSection | null)[];
  profile: (SheetEntry | null)[];
  stats: Record<string, number>;
} {
  const base = rec(root.base) ?? {};
  const ab = rec(root.baseAbility) ?? {};
  const sub = rec(root.subAbility) ?? {};
  const skills = rec(root.skills) ?? {};
  const syn = rec(base.syndromes) ?? {};
  const syndromes = compact(
    ["primary", "secondary", "tertiary"].map((k) => textOf(rec(syn[k])?.syndrome)),
  ).join("／");
  const skillEntries: (SheetEntry | null)[] = DX3_SKILLS.map(([key, label, group]) =>
    entry(label, rec(rec(skills[key])?.A)?.lv, { group }),
  );
  for (const row of arr(skills.B)) {
    const r = rec(row);
    if (!r) continue;
    DX3_EXTRA_SKILLS.forEach(([kind, group], i) => {
      const name = textOf(r[`name${i + 1}`]);
      if (name) skillEntries.push(entry(`${kind}：${name}`, r[`lv${i + 1}`], { group }));
    });
  }
  const hp = numOf(rec(sub.hp)?.total);
  const erosion = numOf(rec(sub.erotion)?.total);
  return {
    profile: [
      entry("カヴァー", base.cover),
      entry("ワークス", base.works),
      entry("シンドローム", syndromes),
      entry("年齢", base.age),
      entry("性別", base.sex),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("肉体", rec(ab.body)?.total),
        entry("感覚", rec(ab.sense)?.total),
        entry("精神", rec(ab.mind)?.total),
        entry("社会", rec(ab.society)?.total),
      ]),
      section("resources", "副能力値", "resources", [
        entry("HP", hp),
        entry("侵蝕率基本値", erosion),
        entry("行動値", rec(sub.action)?.total),
        entry("戦闘移動", rec(sub.moveSen)?.total),
        entry("全力移動", rec(sub.moveZen)?.total),
        entry("常備化ポイント", rec(sub.property)?.total),
      ]),
      section("skills", "技能", "skills", skillEntries),
      section(
        "arts",
        "エフェクト",
        "levels",
        soukoNamedList(root.arts, "level", ["timing", "judge", "target", "range", "cost"]),
      ),
      section("lois", "ロイス", "list", soukoNamedList(root.lois, "type", ["Pfeel", "Nfeel"])),
      textSection("memo", "メモ", base.memo),
    ],
    stats: hp != null ? { hp } : {},
  };
}

function soukoGrid(root: Rec, table: [string, string[]][], abilityTitle: string) {
  const base = rec(root.base) ?? {};
  return {
    profile: [
      entry("表の顔", base.cover),
      entry("階級", base.level),
      entry("信念", base.belief),
      entry("年齢", base.age),
      entry("性別", base.sex),
    ],
    sections: [
      section("skills", "特技", "skills", soukoLearnedSkills(root, table)),
      section(
        "abilities-list",
        abilityTitle,
        "list",
        soukoNamedList(root.ninpou ?? root.ability, "type", ["targetSkill", "effect"]),
      ),
      section("items", "アイテム", "list", soukoNamedList(root.item, "count", ["effect"])),
      textSection("memo", "メモ", base.memo),
    ] as (SheetSection | null)[],
  };
}

/** 倉庫の JSON をシステムの道（/dx3/ など）で読む。対応外の道や「データが存在しません」は読まない */
export function parseSoukoJson(
  raw: string | unknown,
  systemPath: string,
  url?: string,
): ParsedCharacter | null {
  let root: unknown = raw;
  if (typeof raw === "string") {
    try {
      root = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = rec(root);
  const base = rec(r?.base);
  const name = textOf(base?.name);
  const sys = SOUKO_SYSTEMS[systemPath];
  if (!r || !base || !name || r.error || !sys) return null;
  let parts: {
    profile: (SheetEntry | null)[];
    sections: (SheetSection | null)[];
    stats?: Record<string, number>;
  };
  if (systemPath === "dx3") parts = soukoDx3(r);
  else if (systemPath === "shinobigami") parts = soukoGrid(r, SHINOBIGAMI_SKILLS, "忍法");
  else {
    parts = soukoGrid(r, INSANE_SKILLS, "アビリティ");
    const hp = rec(r.hitpoint);
    const sp = rec(r.sanepoint);
    parts.sections.unshift(
      section("resources", "能力値", "resources", [
        entry("生命力", hp?.value, { max: numOf(hp?.max) }),
        entry("正気度", sp?.value, { max: numOf(sp?.max) }),
      ]),
    );
    parts.profile.push(entry("恐怖心", base.nightmare));
  }
  const sheet = buildSheet("souko", {
    url,
    systemLabel: sys.label,
    profile: parts.profile,
    sections: parts.sections,
  });
  const cover = textOf(base.cover);
  return {
    name,
    memo: cover ? `職業: ${cover}` : undefined,
    systemId: sys.id,
    stats: parts.stats ?? {},
    ...(sheet ? { sheet } : {}),
  };
}

/* ================= ログ・ホライズンTRPG 冒険窓口（lhrpg.com） =================
 * 公開 JSON API（/lhz/api/{id}.json）。持ち主が「外部ツールからの参照を許可」したキャラクターだけ読める。
 */
export function parseLhrpgJson(raw: string | unknown, url?: string): ParsedCharacter | null {
  let root: unknown = raw;
  if (typeof raw === "string") {
    try {
      root = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const r = rec(root);
  const name = textOf(r?.name);
  if (!r || !name || r.main_job === undefined) return null;
  const level = numOf(r.level);
  const hp = numOf(r.max_hitpoint);
  const sheet = buildSheet("lhrpg", {
    url,
    systemLabel: "ログ・ホライズンTRPG",
    profile: [
      entry("種族", r.race),
      entry("アーキ職業", r.archetype),
      entry("メイン職業", r.main_job),
      entry("サブ職業", r.sub_job),
      entry("CR", r.character_rank),
      entry("性別", r.gender),
    ],
    sections: [
      section("abilities", "能力値", "abilities", [
        entry("STR", r.str_value),
        entry("DEX", r.dex_value),
        entry("POW", r.pow_value),
        entry("INT", r.int_value),
      ]),
      section("resources", "副能力値", "resources", [entry("HP", hp), entry("レベル", level)]),
      section(
        "skills",
        "特技",
        "levels",
        compact(
          arr(r.skills).map((x) => {
            const s = rec(x);
            const label = textOf(s?.name);
            return label ? entry(label, s!.skill_rank, { note: textOf(s!.timing) }) : null;
          }),
        ),
      ),
      section("items", "アイテム", "list", soukoNamedList(r.items, "type", [])),
      textSection("memo", "メモ", r.remarks),
    ],
  });
  const archetype = textOf(r.main_job);
  return {
    name,
    memo: archetype ? `職業: ${archetype}` : undefined,
    systemId: "LogHorizon",
    stats: { ...(hp != null ? { hp } : {}), ...(level != null ? { lv: level } : {}) },
    ...(sheet ? { sheet } : {}),
  };
}

/* ================= いあきゃら（iachara.com） =================
 * 閲覧ページが読む API（apiv3.iachara.com/v3/charasheet/{id}）の応答。公開のシートだけ読む。
 * 能力値・技能はサイトが保存している内訳（初期値 + 補正、職業 P + 興味 P + 成長 + その他）から、
 * いあきゃらの閲覧ページと同じ式で合計を出す。
 */

/** 「0」は未入力の印なので空として扱う */
function iaText(v: unknown): string | undefined {
  const t = textOf(v);
  return t && t !== "0" ? t : undefined;
}
function iaNum(v: unknown): number {
  return numOf(v) ?? 0;
}
/** 能力値の合計（値 + 固定の補正 + 一時的な補正） */
function iaSum(ab: Rec | undefined, key: string, base?: number): number {
  const a = rec(ab?.[key]);
  return (base ?? iaNum(a?.value)) + iaNum(a?.fixedDiff) + iaNum(a?.tmpFixedDiff);
}

function iaDb6(n: number): string {
  if (n < 13) return "-1D6";
  if (n < 17) return "-1D4";
  if (n < 25) return "+0";
  if (n < 33) return "+1D4";
  if (n < 41) return "+1D6";
  if (n < 57) return "+2D6";
  if (n < 73) return "+3D6";
  if (n < 89) return "+4D6";
  if (n < 105) return "+5D6";
  if (n < 121) return "+6D6";
  return `+${Math.ceil((n - 40) / 16) + 1}D6`;
}
/** 7 版のダメージ・ボーナスとビルド（STR + SIZ） */
function iaDbBuild7(n: number): [string, number] {
  if (n <= 64) return ["-2", -2];
  if (n <= 84) return ["-1", -1];
  if (n <= 124) return ["+0", 0];
  if (n <= 164) return ["+1D4", 1];
  if (n <= 204) return ["+1D6", 2];
  if (n <= 284) return ["+2D6", 3];
  if (n <= 364) return ["+3D6", 4];
  if (n <= 444) return ["+4D6", 5];
  const k = Math.floor((n - 204) / 80 + 1);
  return [`+${k}D6`, k];
}

const IACHARA_SKILL_GROUPS: [key: string, group: string][] = [
  ["battleSkills", "戦闘技能"],
  ["searchSkills", "探索技能"],
  ["actionSkills", "行動技能"],
  ["negotiationSkills", "交渉技能"],
  ["knowledgeSkills", "知識技能"],
];
/** 専門分野（additionalName）を持つ基本技能 */
const IACHARA_SPECIALTY_SKILLS = {
  coc6: new Set(["運転", "製作", "操縦", "母国語", "芸術"]),
  coc7: new Set(["射撃", "運転", "芸術/製作", "操縦", "母国語", "言語", "科学", "サバイバル", "近接戦闘"]),
};
/** 7 版の射撃・近接戦闘・科学は専門分野で初期値が決まる */
const IACHARA_7TH_SPECIALTY_BASE: Record<string, number> = {
  拳銃: 20,
  "ライフル/ショットガン": 25,
  弓: 15,
  マシンガン: 15,
  重火器: 10,
  サブマシンガン: 15,
  火炎放射器: 10,
  斧: 15,
  格闘: 25,
  絞殺ひも: 15,
  チェーンソー: 10,
  刀剣: 20,
  フレイル: 10,
  むち: 5,
  槍: 20,
  暗号学: 1,
  化学: 1,
  気象学: 1,
  工学: 1,
  植物学: 1,
  数学: 10,
  生物学: 1,
  地質学: 1,
  天文学: 1,
  動物学: 1,
  物理学: 1,
  法医学: 1,
  薬学: 1,
};

/** いあきゃらの API 応答（{ success, data: { public, data: シート } }）か */
export function isIacharaSheet(root: unknown): boolean {
  const outer = rec(rec(root)?.data);
  const body = rec(outer?.data);
  return Boolean(
    body && rec(body.profile) && rec(body.abilities) && /^(?:6th|7th)$/.test(String(body.version)),
  );
}

/** いあきゃらのシートが公開されているか（公開のものだけ取り込む） */
export function isIacharaSheetPublic(root: unknown): boolean {
  const outer = rec(rec(root)?.data);
  const meta = rec(rec(outer?.data)?.metadata);
  return (
    rec(root)?.success === true &&
    outer?.public === true &&
    outer?.deleted !== true &&
    meta?.isPublic !== false &&
    meta?.isDeleted !== true
  );
}

export function parseIacharaSheet(raw: string | unknown, url?: string): ParsedCharacter | null {
  let root: unknown = raw;
  if (typeof raw === "string") {
    try {
      root = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isIacharaSheet(root) || !isIacharaSheetPublic(root)) return null;
  const outer = rec(rec(root)!.data)!;
  const d = rec(outer.data)!;
  const pf = rec(d.profile)!;
  const ab = rec(d.abilities)!;
  const name = textOf(pf.name) ?? textOf(outer.name);
  if (!name) return null;
  const is7th = d.version === "7th";
  const systemId = is7th ? "coc7" : "coc6";

  const sum = Object.fromEntries(COC_ABILITIES.map((k) => [k, iaSum(ab, k.toLowerCase())])) as Record<
    (typeof COC_ABILITIES)[number],
    number
  >;

  /* 技能。初期値が能力値から決まるもの（回避・母国語）は版ごとの式で出す */
  const specialty = IACHARA_SPECIALTY_SKILLS[systemId];
  let mythos = 0;
  const skills: (SheetEntry | null)[] = [];
  for (const [key, group] of IACHARA_SKILL_GROUPS) {
    const g = rec(d[key]);
    const points = (s: Rec) =>
      iaNum(s.professionPoint) + iaNum(s.interestPoint) + iaNum(s.growthPoint) + iaNum(s.otherPoint);
    for (const x of arr(g?.static)) {
      const s = rec(x);
      const base = textOf(s?.name);
      if (!s || !base) continue;
      const spec = specialty.has(base) ? textOf(s.additionalName) : undefined;
      let initial = iaNum(s.defaultPoint);
      if (base === "回避") initial = is7th ? Math.floor(sum.DEX / 2) : sum.DEX * 2;
      else if (base === "母国語") initial = is7th ? sum.EDU : sum.EDU * 5;
      else if (is7th && spec && IACHARA_7TH_SPECIALTY_BASE[spec] !== undefined)
        initial = IACHARA_7TH_SPECIALTY_BASE[spec]!;
      const value = initial + points(s);
      if (base === "クトゥルフ神話") mythos = value;
      skills.push(entry(skillName(base, spec), value, { base: initial, group }));
    }
    for (const x of arr(g?.additional)) {
      const s = rec(x);
      const label = textOf(s?.name);
      if (!s || !label) continue;
      const initial = iaNum(s.defaultPoint);
      skills.push(entry(skillName(label), initial + points(s), { base: initial, group }));
    }
  }

  const strSiz = sum.STR + sum.SIZ;
  const userDb = textOf(ab.userDB);
  const sanCurrent = numOf(ab.sanCurrent);
  const sanMax = 99 - mythos;
  let resources: (SheetEntry | null)[];
  let luck: number;
  if (is7th) {
    luck = iaSum(ab, "luck");
    const [db, build] = iaDbBuild7(strSiz);
    const dex = sum.DEX;
    const mov =
      (dex < sum.SIZ && sum.STR < sum.SIZ ? 7 : dex > sum.SIZ && sum.STR > sum.SIZ ? 9 : 8) +
      iaNum(ab.userMOV);
    resources = [
      entry("HP", iaSum(ab, "hp", Math.floor((sum.CON + sum.SIZ) / 10))),
      entry("MP", iaSum(ab, "mp", Math.floor(sum.POW / 5))),
      entry("SAN", sanCurrent, { max: sanMax }),
      entry("幸運", luck),
      entry("DB", userDb ?? db),
      entry("ビルド", build),
      entry("MOV", mov),
    ];
  } else {
    luck = iaSum(ab, "luck", sum.POW * 5);
    resources = [
      entry("HP", iaSum(ab, "hp", Math.ceil((sum.CON + sum.SIZ) / 2))),
      entry("MP", iaSum(ab, "mp", sum.POW)),
      entry("SAN", sanCurrent, { max: sanMax }),
      entry("アイデア", iaSum(ab, "ide", sum.INT * 5)),
      entry("幸運", luck),
      entry("知識", iaSum(ab, "know", sum.EDU * 5)),
      entry("DB", userDb ?? iaDb6(strSiz)),
    ];
  }

  const weapons = arr(d.battle).map((w) => {
    const x = rec(w);
    const label = textOf(x?.name);
    if (!label) return null;
    const note = compact([
      iaText(x!.damage) && `ダメージ ${iaText(x!.damage)}`,
      iaText(x!.range) && `射程 ${iaText(x!.range)}`,
      textOf(x!.detail),
    ]).join("　");
    return listEntry(label, iaText(x!.probability) ?? "", { note: note || undefined });
  });
  /* 所持品は 7 版が belongings、6 版が money.belongings */
  const items = [...arr(d.belongings), ...arr(rec(d.money)?.belongings)].map((p) => {
    const x = rec(p);
    const label = textOf(x?.name);
    return label ? listEntry(label, iaText(x!.quantity) ?? "", { note: textOf(x!.detail) }) : null;
  });
  const scenarios = arr(d.passedScenarios).map((p) => {
    const x = rec(p);
    const label = textOf(x?.name);
    return label ? listEntry(label, "", { note: textOf(x!.memo) }) : null;
  });
  const backstory = arr(d.backstory)
    .map((b) => {
      const x = rec(b);
      const body = textOf(x?.value);
      return body ? `【${textOf(x?.name) ?? ""}】\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const sheet = buildSheet("iachara", {
    url,
    profile: [
      entry("職業", pf.profession),
      entry("年齢", pf.age),
      entry("性別", pf.sex),
      entry("出身", pf.from),
      entry("身長", pf.height),
      entry("体重", pf.weight),
      ...arr(pf.externalProfiles).map((p) => {
        const x = rec(p);
        return x && textOf(x.name) ? entry(textOf(x.name)!, x.value) : null;
      }),
    ],
    sections: [
      section(
        "abilities",
        "能力値",
        "abilities",
        COC_ABILITIES.map((k) => entry(k, sum[k])),
      ),
      section("resources", "副能力値", "resources", resources),
      section("skills", "技能", "skills", skills),
      section("weapons", "武器", "list", weapons),
      section("items", "所持品", "list", items),
      section("scenarios", "通過シナリオ", "list", scenarios),
      textSection("backstory", "バックストーリー", backstory),
      textSection("memo", "メモ", d.memo),
    ],
  });

  const occupation = textOf(pf.profession);
  const image = arr(pf.icons)
    .map((i) => httpsUrl(rec(i)?.url))
    .find(Boolean);
  return {
    name,
    memo: occupation ? `職業: ${occupation}` : undefined,
    systemId,
    stats: cocStats(sanCurrent, luck, systemId),
    ...(image ? { image } : {}),
    ...(sheet ? { sheet } : {}),
  };
}
