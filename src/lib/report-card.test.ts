import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import type { Character, Log, State, User } from "../types";
import {
  parseReportCard,
  parseReportOptions,
  REPORT_BODY_MAX,
  REPORT_CAST_MAX,
  REPORT_DEFAULTS,
  reportCardChoices,
  reportCardFromSession,
  type ReportCardOptions,
} from "./report-card";

/** 大きな立ち絵（本番の前段が断る大きさの data URL） */
const BIG_IMAGE = `data:image/png;base64,${"A".repeat(300_000)}`;
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength;

const user = (id: string, name: string, image?: string): User => ({
  id,
  handle: id,
  name,
  color: "#3366cc",
  accounts: [],
  ...(image ? { image } : {}),
});

const character = (id: string, ownerId: string, name: string, image?: string): Character => ({
  ...Object.values(seedState().characters)[0]!,
  id,
  ownerId,
  name,
  color: "#aa5522",
  archetype: "探偵",
  systemId: "coc7",
  ...(image ? { image } : { image: undefined }),
});

/** KP（記録した人）と PL 3 人、うち 1 人（自分）は PC を 2 人持つ卓 */
function fixture(): { state: State; log: Log } {
  const state = seedState();
  state.me = "me";
  state.prefs = { ...state.prefs, hideSelfOnShare: false };
  for (const u of [
    user("kp", "みかん", BIG_IMAGE),
    user("me", "ゆう", BIG_IMAGE),
    user("p2", "たろう"),
    user("p3", "はな"),
  ])
    state.users[u.id] = u;
  for (const c of [
    character("c1", "me", "九条 灯", BIG_IMAGE),
    character("c2", "me", "九条 澪"),
    character("c3", "p2", "真壁 透", BIG_IMAGE),
  ])
    state.characters[c.id] = c;
  const scenario = Object.values(state.scenarios)[0]!;
  state.scenarios[scenario.id] = { ...scenario, author: "作者さん" };
  state.tables.t1 = {
    ...(Object.values(state.tables)[0] ?? ({} as State["tables"][string])),
    id: "t1",
    name: "金曜の卓",
  };
  const start = Date.UTC(2026, 8, 26, 10) / 1000;
  const log: Log = {
    ...Object.values(state.logs)[0]!,
    id: "l1",
    ownerId: "kp",
    tableId: "t1",
    scenarioId: scenario.id,
    systemId: "coc7",
    sittings: [{ start, end: start + 3 * 3600 + 120 }],
    players: {
      kp: { linked: true, hidden: false, characterIds: [], role: "GM" },
      me: { linked: true, hidden: false, characterIds: ["c1", "c2"] },
      p2: { linked: true, hidden: false, characterIds: ["c3"] },
      p3: { linked: true, hidden: false, characterIds: [] },
    },
  };
  state.logs[log.id] = log;
  return { state, log };
}

const opts = (o: Partial<ReportCardOptions>): ReportCardOptions => ({ ...REPORT_DEFAULTS, ...o });

describe("卓報告カードの中身", () => {
  it("既定では、卓報告の並び（システム・題名・作者・日付・KP・PL と PC）を載せ、卓の名前は載せない", () => {
    const { state, log } = fixture();
    const card = reportCardFromSession(log, state);
    expect(card.system?.name).toBe("クトゥルフ神話TRPG 7版");
    expect(card.author).toBe("作者さん");
    expect(card.when).toMatch(/^2026年9月26日/);
    expect(card.duration).toBe("3時間2分");
    expect(card.table).toBeUndefined();
    expect(card.gm).toEqual({ label: "KP", name: "みかん" });
    expect(card.players).toBe(3);
    expect(card.members).toEqual([
      { pc: "九条 灯", color: "#aa5522", pl: "ゆう" },
      { pc: "九条 澪", color: "#aa5522", pl: "ゆう" },
      { pc: "真壁 透", color: "#aa5522", pl: "たろう" },
      { pl: "はな", color: "#3366cc" },
    ]);
    // ネタバレになるもの・人の画像は載せない
    expect(JSON.stringify(card)).not.toMatch(/SAN|HP|data:|image/);
  });

  it("人の画像は本文に入れず、本文は上限（本番の前段が通す大きさ）に収まる", () => {
    const { state, log } = fixture();
    expect(bytes(reportCardFromSession(log, state))).toBeLessThan(2_000);
  });

  it("名前がどれだけ長く・結合文字だらけでも、人が多くても、本文は上限に収まる", () => {
    const { state, log } = fixture();
    const zalgo = `あ${"́".repeat(500)}`.repeat(30);
    const scenario = state.scenarios[log.scenarioId]!;
    state.scenarios[scenario.id] = { ...scenario, title: zalgo, author: zalgo };
    state.tables.t1!.name = zalgo;
    for (let i = 0; i < 20; i++) {
      state.users[`u${i}`] = user(`u${i}`, zalgo);
      state.characters[`x${i}`] = character(`x${i}`, `u${i}`, zalgo);
      log.players[`u${i}`] = { linked: true, hidden: false, characterIds: [`x${i}`] };
    }
    state.users.kp!.name = zalgo;
    const card = reportCardFromSession(log, state, opts({ table: true }));
    expect(card.members).toHaveLength(REPORT_CAST_MAX);
    expect(card.more).toBeGreaterThan(0);
    expect(bytes(card)).toBeLessThan(REPORT_BODY_MAX);
    // 送られてきた側でも同じ上限に収める
    const forged = { ...card, members: Array.from({ length: 50 }, () => ({ pc: zalgo, pl: zalgo })) };
    expect(bytes(parseReportCard(forged))).toBeLessThan(REPORT_BODY_MAX);
  });

  it("PC の名前・KP と PL の名前は、それぞれ外せる（外しても人数は残る）", () => {
    const { state, log } = fixture();
    const noPc = reportCardFromSession(log, state, opts({ pc: false }));
    expect(noPc.members.map((m) => m.pl)).toEqual(["ゆう", "たろう", "はな"]);
    expect(noPc.members.some((m) => m.pc)).toBe(false);

    const noNames = reportCardFromSession(log, state, opts({ names: false }));
    expect(noNames.gm).toBeUndefined();
    expect(noNames.members.map((m) => m.pc)).toEqual(["九条 灯", "九条 澪", "真壁 透"]);
    expect(JSON.stringify(noNames)).not.toMatch(/みかん|ゆう|たろう|はな/);

    const nobody = reportCardFromSession(log, state, opts({ pc: false, names: false }));
    expect(nobody.members).toEqual([]);
    expect(nobody.players).toBe(3);
  });

  it("作者・日付・時間・卓の名前も選べる", () => {
    const { state, log } = fixture();
    const card = reportCardFromSession(
      log,
      state,
      opts({ author: false, when: false, duration: false, table: true }),
    );
    expect(card.author).toBeUndefined();
    expect(card.when).toBeUndefined();
    expect(card.duration).toBeUndefined();
    expect(card.table).toBe("金曜の卓");
  });

  it("共有ページで非表示の参加者は、名前を載せる設定でも載せず、数えもしない", () => {
    const { state, log } = fixture();
    log.players.p2!.hidden = true;
    log.players.kp!.hidden = true;
    const card = reportCardFromSession(log, state);
    expect(card.gm).toBeUndefined();
    expect(JSON.stringify(card)).not.toMatch(/みかん|たろう|真壁/);
    expect(card.players).toBe(2);
  });

  it("「共有ページで名前を隠す」にした自分は、名前も PC も載せない（人数には数える）", () => {
    const { state, log } = fixture();
    state.prefs.hideSelfOnShare = true;
    const card = reportCardFromSession(log, state);
    expect(JSON.stringify(card)).not.toMatch(/ゆう|九条/);
    expect(card.players).toBe(3);
    // 自分が KP のときも
    log.ownerId = "me";
    expect(reportCardFromSession(log, state).gm).toBeUndefined();
  });
});

describe("選べる項目", () => {
  it("記録にあるものだけを、システムの言葉で出す", () => {
    const { state, log } = fixture();
    expect(reportCardChoices(log, state).map((c) => c.label)).toEqual([
      "PC の名前",
      "KP・PL の名前",
      "作者",
      "日付",
      "遊んだ時間",
      "卓の名前",
    ]);
    // 作者・卓が無く、全員が非表示なら、名前と作者・卓は選ばせない
    state.scenarios[log.scenarioId]!.author = "";
    delete log.tableId;
    for (const p of Object.values(log.players)) p.hidden = true;
    expect(reportCardChoices(log, state).map((c) => c.key)).toEqual(["when", "duration"]);
  });
});

describe("送られてきた卓報告カードの確かめ", () => {
  it("知らない項目（画像など）・おかしな色・多すぎる顔ぶれは捨てる", () => {
    const card = parseReportCard({
      title: "深淵の呼び声",
      when: "2026年9月26日(土)",
      system: { name: "クトゥルフ神話TRPG 7版", color: "red;background:url(x)" },
      gm: { label: "KP", name: "みかん", image: BIG_IMAGE },
      plLabel: "PL",
      players: 10,
      members: Array.from({ length: 10 }, (_, i) => ({
        pc: `PC${i}`,
        pl: `PL${i}`,
        color: "#zzz",
        image: "x",
      })),
    })!;
    expect(card.members).toHaveLength(REPORT_CAST_MAX);
    expect(card.members[0]).toEqual({ pc: "PC0", pl: "PL0" });
    expect(card.gm).toEqual({ label: "KP", name: "みかん" });
    expect(card.system).toBeUndefined();
    expect(JSON.stringify(card)).not.toContain("data:");
  });

  it("題名が無いものは描かない。日付は無くてもよい", () => {
    expect(parseReportCard({ when: "9月26日(土)", members: [] })).toBeNull();
    expect(parseReportCard("nope")).toBeNull();
    expect(parseReportCard({ title: "x", members: [] })).toMatchObject({
      title: "x",
      plLabel: "PL",
      players: 0,
    });
  });
});

describe("選んだ項目の覚え", () => {
  it("壊れたもの・足りない項目は既定に戻す", () => {
    expect(parseReportOptions(null)).toEqual(REPORT_DEFAULTS);
    expect(parseReportOptions("{")).toEqual(REPORT_DEFAULTS);
    expect(parseReportOptions(JSON.stringify({ pc: false, names: "no" }))).toEqual({
      ...REPORT_DEFAULTS,
      pc: false,
    });
  });
});
