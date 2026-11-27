import {
  compact,
  entry,
  listEntry,
  numOf,
  section,
  textOf,
  textSection,
  type SheetEntry,
  type GameSheetParts,
} from "../sheet";

/** キャラクターシート倉庫のフタリソウサ（/2s/）。公開 JSON（/2s/display?ajax=1&key=…）を読む */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * 技能表（行 = 分野、列 = 技能 6 つ）。倉庫の編集画面（/2s/js/2s.js の SKILLS）を写した。
 * 習得は skills.row{分野}.cell{技能} = "1"。
 */
export const FUTARISOUSA_SKILLS: [group: string, names: string[]][] = [
  ["洞察", ["嘘", "変化", "外見", "物理", "現場", "天気"]],
  ["鑑識", ["交通", "情報", "指紋", "科学", "法医学", "生物"]],
  ["人間", ["社交", "家事", "噂話", "説得", "流行", "ビジネス"]],
  ["肉体", ["捕縛", "防御", "根性", "体力", "突破", "追跡"]],
];

/** チェックされた技能（"1" が付いたマスだけ） */
function checkedSkills(raw: unknown): SheetEntry[] {
  const skills = rec(raw) ?? {};
  const out: SheetEntry[] = [];
  FUTARISOUSA_SKILLS.forEach(([group, names], i) => {
    const row = rec(skills[`row${i}`]) ?? {};
    names.forEach((label, j) => {
      if (textOf(row[`cell${j}`]) === "1") out.push({ label, value: "習得", group });
    });
  });
  return out;
}

/** 探偵・助手 1 人ぶん（パートナー欄）。名前がなければ読まない */
function partnerEntries(partner: Rec | undefined, thought: Rec | undefined): (SheetEntry | null)[] {
  if (!partner || !textOf(partner.name)) return [];
  return [
    entry("名前", partner.name),
    entry("呼び名", thought?.nickname),
    entry("役割", partner.role),
    entry("クラス", partner.roleclass),
    entry("背景", partner.background),
    entry("職業", partner.job),
    entry("性別", partner.sex),
    entry("年齢", partner.age),
    entry("身長", partner.height),
    entry("体重", partner.weight),
    entry("ファッション特徴", partner.atmosphere),
    entry("好きなもの", partner.like),
    entry("嫌いなもの", partner.dislike),
    entry("気に入ったところ", thought?.like),
    entry("気に入らないところ", thought?.dislike),
  ];
}

export function readSoukoFutariSousa(root: Rec): GameSheetParts {
  const base = rec(root.base) ?? {};
  const margin = numOf(rec(root.mental)?.margin);
  const anxiety = numOf(rec(root.anxiety)?.level);

  const abnormal = rec(root.abnormal) ?? {};
  const quirks = compact(
    [1, 2, 3, 4, 5, 6].map((n) => {
      const t = textOf(abnormal[`text${n}`]);
      return t ? listEntry(t, "") : null;
    }),
  );

  const guests = compact(
    arr(root.guests).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const note = compact([textOf(r.skill) && `技能：${textOf(r.skill)}`, textOf(r.memo)]).join("　");
      return listEntry(name, r.relationship, { note: note || undefined });
    }),
  );

  const actions = compact(
    arr(root.actions).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const note = compact([textOf(r.cost) && `コスト：${textOf(r.cost)}`, textOf(r.effect)]).join("　");
      return listEntry(name, r.type, { note: note || undefined });
    }),
  );

  return {
    systemLabel: "フタリソウサ",
    profile: [
      entry("役割", base.role),
      entry("クラス", base.roleclass),
      entry("背景", base.background),
      entry("職業", base.job),
      entry("性別", base.sex),
      entry("年齢", base.age),
      entry("身長", base.height),
      entry("体重", base.weight),
      entry("ファッション特徴", base.atmosphere),
      entry("好きなもの", base.like),
      entry("嫌いなもの", base.dislike),
    ],
    sections: [
      section("resources", "メンタル", "resources", [
        entry("余裕", margin),
        entry("心労", anxiety, { max: 3 }),
      ]),
      section("skills", "技能", "skills", checkedSkills(root.skills)),
      section("quirks", "異常な癖", "list", quirks),
      section("actions", "アクション", "list", actions),
      section("guests", "ゲスト", "list", guests),
      section("partner", "パートナー", "list", partnerEntries(rec(root.partner), rec(root.partnerthought))),
      textSection("memo", "設定", base.memo),
      textSection("investigation", "捜査メモ", rec(root.investigation)?.memo),
    ],
    stats: {
      ...(margin !== undefined ? { margin } : {}),
      ...(anxiety !== undefined ? { anxiety } : {}),
    },
  };
}
