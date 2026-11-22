import { describe, expect, it } from "vitest";
import type { Character, SessionStat } from "../types";
import {
  carriedDeltas,
  carriedValues,
  currentCarriedValue,
  currentSkillValue,
  defaultGrowthSession,
  growthFromSync,
  growthRecords,
  reassignGrowth,
} from "./character-growth";
import { applyLinkedEdit, applyManualEdit, type LinkedCharacterEdit } from "./character-edit";
import { mergeExternalCharacterUpdate } from "./external-sync";
import { migrateLooseGrowth } from "./state-schema";

const session = (logId: string, date: string, delta: SessionStat["delta"] = {}): SessionStat => ({
  logId,
  date,
  title: logId,
  delta,
  rolls: [],
  memo: "",
});

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: "ch",
    ownerId: "u",
    name: "遠沢",
    systemId: "coc7",
    color: "#000",
    archetype: "",
    bio: "",
    tags: [],
    stats: { san: 60 },
    sessions: [session("s1", "2026-10-01"), session("s2", "2026-11-01"), session("s3", "2026-11-14")],
    growth: [],
    share: {
      enabled: false,
      scope: "private",
      includeProfile: true,
      includeStats: true,
      includeGrowth: true,
      includeSessions: true,
    },
    ...overrides,
  };
}

describe("どのセッションのあとの成長か（既定）", () => {
  it("前の同期のあとに遊んだうち、いちばん新しいセッション", () => {
    expect(defaultGrowthSession(character(), "2026-10-15T09:00:00Z")?.logId).toBe("s3");
  });
  it("前の同期のあとに遊んでいなければ、いちばん新しいセッション", () => {
    expect(defaultGrowthSession(character(), "2026-12-01T00:00:00Z")?.logId).toBe("s3");
    expect(defaultGrowthSession(character(), undefined)?.logId).toBe("s3");
  });
  it("前の同期と同じ日に遊んだセッションも含める", () => {
    const c = character({ sessions: [session("a", "2026-11-14"), session("b", "2026-10-01")] });
    expect(defaultGrowthSession(c, "2026-11-14T23:00:00Z")?.logId).toBe("a");
  });
  it("セッションがなければ成長として残さない", () => {
    expect(defaultGrowthSession(character({ sessions: [] }), undefined)).toBeUndefined();
  });
});

describe("同期の差分から成長を導く", () => {
  it("上がった技能だけ。状態の値（SAN・HP・幸運）とシステムの値（共鳴）は成長にしない", () => {
    expect(
      growthFromSync(
        "coc7",
        [
          { label: "図書館", from: 70, to: 75 },
          { label: "目星", from: 60, to: 55 },
        ],
        [
          { key: "san", label: "SAN", from: 55, to: 60 },
          { key: "luck", label: "幸運", from: 50, to: 60 },
          { key: "HP", label: "HP", from: 10, to: 12 },
          { key: "図書館", label: "図書館", from: 70, to: 75 },
        ],
      ),
    ).toEqual([{ skill: "図書館", from: 70, to: 75 }]);
    expect(growthFromSync("emoklore", [], [{ key: "von", label: "共鳴", from: 1, to: 3 }])).toEqual([]);
  });

  it("成長はセッションに結び、日付はそのセッションの日付", () => {
    let n = 0;
    expect(
      growthRecords([{ skill: "目星", from: 60, to: 65 }], session("s3", "2026-11-14"), () => `g${n++}`),
    ).toEqual([{ id: "g0", logId: "s3", date: "2026-11-14", skill: "目星", from: 60, to: 65 }]);
  });

  it("同期で上がった技能を、前の同期のあとに遊んだ最新のセッションの成長として残し、付け替えられる", () => {
    const existing = character({
      stats: { san: 60, 目星: 60 },
      externalSync: {
        provider: "charasheet",
        url: "https://charasheet.vampire-blood.net/1",
        lastSyncedAt: "2026-10-20T00:00:00Z",
        autoSync: true,
      },
    });
    const res = mergeExternalCharacterUpdate(
      existing,
      { name: "遠沢", systemId: "coc7", stats: { san: 55, 目星: 65 } },
      {
        url: "https://charasheet.vampire-blood.net/1",
        provider: "charasheet",
        syncedAt: "2026-11-20T00:00:00Z",
      },
    );
    expect(res.growth.map((g) => [g.skill, g.from, g.to, g.logId, g.date])).toEqual([
      ["目星", 60, 65, "s3", "2026-11-14"],
    ]);
    reassignGrowth(res.next, [res.growth[0]!.id], session("s2", "2026-11-01"));
    expect(res.next.growth[0]).toMatchObject({ logId: "s2", date: "2026-11-01" });
  });
});

describe("今の値", () => {
  it("技能の今の値はキャラシ、なければ最後に記録した成長", () => {
    const c = character({
      growth: [
        { id: "a", logId: "s1", date: "2026-10-01", skill: "目星", from: 50, to: 55 },
        { id: "b", logId: "s3", date: "2026-11-14", skill: "目星", from: 55, to: 61 },
      ],
    });
    expect(currentSkillValue(c, "目星")).toBe(61);
    expect(currentSkillValue(c, "聞き耳")).toBeUndefined();
  });

  it("続く値はセッションの記録とキャラシのうち新しいほう", () => {
    const c = character({
      stats: { san: 50 },
      sessions: [session("s1", "2026-11-01", { san: { before: 60, after: 55 } })],
    });
    expect(currentCarriedValue(c, "san")).toBe(55);
    const synced = { ...c, externalSync: { ...SYNC, lastSyncedAt: "2026-11-10T00:00:00Z" } };
    expect(currentCarriedValue(synced, "san")).toBe(50);
  });

  it("見せる今の値は続く値（carry）だけ。幸運・共鳴は出さない", () => {
    expect(carriedValues(character({ stats: { san: 60, luck: 70 } })).map((v) => v.key)).toEqual(["san"]);
    expect(carriedValues(character({ systemId: "emoklore", stats: { von: 3 } }))).toEqual([]);
    expect(
      carriedDeltas("coc7", { san: { before: 60, after: 58 }, luck: { before: 50, after: 40 } }),
    ).toEqual([{ key: "san", label: "SAN", before: 60, after: 58 }]);
  });
});

const SYNC = { provider: "charaeno" as const, url: "https://charaeno.com/7th/abcdef", autoSync: true };

describe("キャラシと結び付いたキャラクターの編集", () => {
  it("キャラシが持つ項目は型に入れられず、渡しても書かない", () => {
    const c = character({ externalSync: SYNC, name: "キャラシの名前" });
    const values: LinkedCharacterEdit = { bio: " 紹介 ", tags: ["a", "a"], sheetUrl: SYNC.url };
    // @ts-expect-error キャラシと結び付いたキャラクターの編集には名前を入れられない（P3）
    const withName: LinkedCharacterEdit = { ...values, name: "手で直した名前" };
    applyLinkedEdit(c, withName);
    expect(c.name).toBe("キャラシの名前");
    expect(c.bio).toBe("紹介");
    expect(c.tags).toEqual(["a"]);
    expect(c.externalSync?.url).toBe(SYNC.url);
  });

  it("キャラシのないキャラクターは名前と続く値だけを手で直せる", () => {
    const c = character({ stats: { san: 60, luck: 50 } });
    applyManualEdit(
      c,
      { name: " 新 ", archetype: "", bio: "", tags: [], sheetUrl: "", stats: { san: 40, luck: 1 } },
      ["san"],
    );
    expect(c.name).toBe("新");
    expect(c.stats).toEqual({ san: 40, luck: 50 });
  });
});

describe("以前の「セッションに紐付けない」成長の移行", () => {
  it("その日までに遊んだ最新のセッションに結び、日付と補足を合わせる。結ぶ先がなければ捨てる", () => {
    const c = {
      sessions: [session("s1", "2026-10-01"), session("s2", "2026-11-01")],
      growth: [
        { id: "a", date: "2026-10-20", skill: "目星", from: 1, to: 2, note: "補足" },
        { id: "b", date: "2026-09-01", skill: "目星", from: 2, to: 3 },
        { id: "c", date: "2026-11-02", logId: "s9", skill: "目星", from: 3, to: 4 },
      ],
    };
    migrateLooseGrowth(c);
    expect(c.growth).toEqual([
      { id: "a", date: "2026-10-01", logId: "s1", skill: "目星", from: 1, to: 2 },
      { id: "b", date: "2026-10-01", logId: "s1", skill: "目星", from: 2, to: 3 },
      { id: "c", date: "2026-11-02", logId: "s9", skill: "目星", from: 3, to: 4 },
    ]);
    const none = { sessions: [], growth: [{ id: "x", date: "2026-10-01", skill: "a", from: 1, to: 2 }] };
    migrateLooseGrowth(none);
    expect(none.growth).toEqual([]);
  });
});
