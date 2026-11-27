import {
  compact,
  entry,
  listEntry,
  numOf,
  section,
  textOf,
  type SheetEntry,
  type GameSheetParts,
} from "../sheet";

/**
 * キャラクターシート倉庫の銀剣のステラナイツ（/stellar/）。公開 JSON（/stellar/display?ajax=1&key=…）を読む。
 * 1 枚に あなた（ブリンガー）= base、あなた（シース）= sheath、パートナー（ブリンガー・シース）= partner.* が入る。
 */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : undefined;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 「華麗にして泣きやすい」の 性格 */
function characterOf(person: Rec): string | undefined {
  const c = rec(person.character);
  const parts = compact([textOf(c?.["1st"]), textOf(c?.["2nd"])]);
  return parts.length > 0 ? parts.join("にして") : undefined;
}

/** 「黒色のオダマキ」の 花章 */
function flowerOf(person: Rec): string | undefined {
  const f = rec(person.personalflower);
  const color = textOf(f?.color);
  const essence = textOf(f?.essence);
  if (color && essence) return `${color}の${essence}`;
  return color ?? essence;
}

/** 希望／絶望（選んだ側と、その中身） */
function hopeDespairOf(person: Rec): SheetEntry | null {
  const h = rec(person.hopedespair);
  return entry(textOf(h?.choice) ?? "希望／絶望", h?.detail);
}

/** ブリンガー・シースの 1 人ぶん。名前がなければ（未入力・未取込）読まない */
function personEntries(person: Rec | undefined): (SheetEntry | null)[] {
  if (!person || !textOf(person.name)) return [];
  return [
    entry("名前", person.name),
    entry("性別", person.sex),
    entry("年齢", person.age),
    entry("所属組織", person.organization),
    entry("あなたの物語", person.yourstory),
    hopeDespairOf(person),
    entry("願い", person.wish),
    entry("性格", characterOf(person)),
    entry("花章", flowerOf(person)),
    entry("変身キーワード", person.keyword),
  ];
}

export function readSoukoStellar(root: Rec): GameSheetParts {
  const base = rec(root.base) ?? {};
  const status = rec(root.status) ?? {};
  const partner = rec(root.partner) ?? {};
  const hp = numOf(status.hp);
  const defense = numOf(status.defense);
  const charge = numOf(status.charge);
  const medal = numOf(status.medal);
  const resonance = numOf(status.resonance);

  const skills = compact(
    arr(root.skills).map((x) => {
      const r = rec(x);
      const name = textOf(r?.name);
      if (!r || !name) return null;
      const note = compact([textOf(r.timing) && `タイミング：${textOf(r.timing)}`, textOf(r.effect)]).join(
        "　",
      );
      return listEntry(name, r.type, { note: note || undefined });
    }),
  );

  return {
    systemLabel: "銀剣のステラナイツ",
    profile: [
      entry("種別", rec(base.knight)?.type),
      entry("性別", base.sex),
      entry("年齢", base.age),
      entry("所属組織", base.organization),
      entry("あなたの物語", base.yourstory),
      hopeDespairOf(base),
      entry("願い", base.wish),
      entry("性格", characterOf(base)),
      entry("花章", flowerOf(base)),
      entry("変身キーワード", base.keyword),
    ],
    sections: [
      section("resources", "ステータス", "resources", [
        entry("耐久力", hp),
        entry("防御力", defense),
        entry("チャージ", charge),
        entry("歪みの共鳴", resonance),
        entry("勲章", medal),
      ]),
      section("skills", "スキル", "list", skills),
      section("sheath", "あなた（シース）", "list", personEntries(rec(root.sheath))),
      section("partner-sheath", "パートナー（シース）", "list", personEntries(rec(partner.sheath))),
      section("partner-bringer", "パートナー（ブリンガー）", "list", personEntries(rec(partner.bringer))),
    ],
    stats: {
      ...(hp !== undefined ? { hp } : {}),
      ...(defense !== undefined ? { defense } : {}),
      ...(charge !== undefined ? { charge } : {}),
      ...(resonance !== undefined ? { resonance } : {}),
      ...(medal !== undefined ? { medal } : {}),
    },
  };
}
