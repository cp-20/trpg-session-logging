/**
 * キャラシサイトごとのデータを、卓譜の汎用シート（src/lib/sheet.ts）と取り込み結果に読み替える。
 * どれも純粋関数。通信は src/lib/external-import-server.ts が行う。
 */
import type { ParsedCharacter } from "./ccfolia-character";
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

/* ================= ココフォリアのコマ（いあきゃら・各サイトの「駒出力」） ================= */

/** チャットパレットの `CCB<=70 【目星】` などから技能値を拾う */
export function skillsFromPalette(commands: string | undefined): SheetEntry[] {
  if (!commands) return [];
  const out: SheetEntry[] = [];
  const seen = new Set<string>();
  for (const line of commands.split(/\r?\n/)) {
    const m =
      line.match(/(?:CCB?|CC\(\d+\)|1d100|DM)\s*<=\s*(\d{1,3})\s*[【［[]([^】］\]]+)[】］\]]/i) ??
      line.match(/(?:CCB?|CC\(\d+\)|1d100)\s*<=\s*(\d{1,3})\s+([^\s{}<>=]+)/i);
    if (!m) continue;
    const label = skillName(m[2]!.trim());
    if (!label || seen.has(label) || /ロール$|^(?:STR|CON|POW|DEX|APP|SIZ|INT|EDU)/i.test(label)) continue;
    if (/^(?:SAN|正気度|アイデア|幸運|知識)/.test(label)) continue;
    seen.add(label);
    out.push({ label, value: Number(m[1]), group: cocSkillGroup(label) });
  }
  return out;
}

/** ココフォリアのコマ（data）からシートを作る */
export function sheetFromCcfolia(data: unknown, systemId: string | undefined): CharacterSheet | undefined {
  const c = rec(data);
  if (!c) return undefined;
  const resources = arr(c.status).map((s) => {
    const x = rec(s);
    const label = textOf(x?.label);
    return label ? entry(label, x!.value, { max: numOf(x!.max) }) : null;
  });
  const params = arr(c.params).map((p) => {
    const x = rec(p);
    const label = textOf(x?.label);
    return label ? entry(label, x!.value) : null;
  });
  const isCoc = systemId === "coc6" || systemId === "coc7";
  const abilities = params.filter((e) => e && (!isCoc || /^[A-Z]{3}$/.test(e.label)));
  const restParams = params.filter((e) => e && isCoc && !/^[A-Z]{3}$/.test(e.label));
  return buildSheet("ccfolia", {
    sections: [
      section("abilities", "能力値", "abilities", abilities),
      section("resources", "副能力値", "resources", [...resources, ...restParams]),
      section("skills", "技能", "skills", skillsFromPalette(textOf(c.commands))),
      textSection("memo", "メモ", c.memo),
    ],
  });
}

/* ================= 数値だけの取り込み（テキスト・ユドナリウム） ================= */

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
