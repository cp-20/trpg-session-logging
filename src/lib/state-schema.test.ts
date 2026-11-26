import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import type { State } from "../types";
import { parseSavedState, RestoredStateSchema, validateSavedState } from "./state-schema";

/** 保存データは JSON を通ったもの。型を外して古い形・壊れた形を作れるようにする */
// oxlint-disable-next-line typescript/no-explicit-any
type Loose = Record<string, any>;
const saved = (): Loose => JSON.parse(JSON.stringify(seedState())) as Loose;
const firstKey = (rec: Record<string, unknown>): string => Object.keys(rec)[0]!;

describe("validateSavedState: 今の形の保存データ", () => {
  it("デモの状態をそのまま復元できる", () => {
    const state = seedState();

    const restored = validateSavedState(JSON.parse(JSON.stringify(state)));

    expect(RestoredStateSchema.safeParse(state).success).toBe(true);
    expect(restored?.me).toBe(state.me);
    expect(Object.keys(restored?.logs ?? {})).toEqual(Object.keys(state.logs));
  });

  it("キャラクターとシナリオの外部連携（externalSync）を残す", () => {
    const state = seedState();
    const chKey = firstKey(state.characters);
    const scKey = firstKey(state.scenarios);
    state.characters[chKey]!.externalSync = {
      provider: "iachara",
      url: "https://iachara.com/view/123",
      lastSyncedAt: "2026-11-20T00:00:00Z",
      lastStatus: "ok",
      autoSync: true,
    };
    state.scenarios[scKey]!.externalSync = {
      provider: "booth",
      url: "https://booth.pm/ja/items/123",
      autoSync: false,
    };

    const restored = parseSavedState(JSON.stringify(state));

    expect(restored?.characters[chKey]?.externalSync).toMatchObject({
      provider: "iachara",
      lastStatus: "ok",
    });
    expect(restored?.scenarios[scKey]?.externalSync).toMatchObject({ provider: "booth", autoSync: false });
  });

  it("知らない項目（新しい版で足されたもの）は捨てずに残す", () => {
    const state = saved();
    state.futureField = "keep";

    const restored = validateSavedState(state) as unknown as Loose;

    expect(restored.futureField).toBe("keep");
  });
});

describe("validateSavedState: 古い形からの移行", () => {
  it("prefs・tables・events・editRequests が無ければ既定値で補う", () => {
    const state = saved();
    delete state.prefs;
    delete state.tables;
    delete state.events;
    delete state.editRequests;

    const restored = validateSavedState(state);

    expect(restored?.prefs).toEqual({ hideSelfOnShare: false });
    expect(restored?.tables).toEqual({});
    expect(restored?.events).toEqual({});
    expect(restored?.editRequests).toEqual([]);
  });

  it("slug の無いセッションは id を slug にする", () => {
    const state = saved();
    delete state.logs.s04.slug;

    const restored = validateSavedState(state);

    expect(restored?.logs.s04!.slug).toBe("s04");
  });

  it("発言の無いセッションの dates/t0/t1 は、t0〜t1 の 1 回の集まりにする", () => {
    const state = saved();
    const t0 = 1_789_000_000;
    delete state.logs.s02.sittings;
    Object.assign(state.logs.s02, { dates: ["2026-09-10"], t0, t1: t0 + 3600, channels: [] });

    const restored = validateSavedState(state);

    expect(restored?.logs.s02!.sittings).toEqual([{ start: t0, end: t0 + 3600 }]);
    expect(restored?.logs.s02).not.toHaveProperty("dates");
    expect(restored?.logs.s02).not.toHaveProperty("t0");
    expect(restored?.logs.s02).not.toHaveProperty("t1");
  });

  it("発言のあるセッションの dates/t0/t1 は、発言の時刻から集まりを作る", () => {
    const state = saved();
    delete state.logs.s01.sittings;
    Object.assign(state.logs.s01, { dates: ["2026-01-01"], t0: 1, t1: 2 });
    const firstTs = Math.min(
      ...(state.logs.s01.channels as Loose[]).flatMap((c) => (c.msgs as Loose[]).map((m) => m.ts as number)),
    );

    const restored = validateSavedState(state);

    const sittings = restored?.logs.s01!.sittings ?? [];
    expect(sittings.length).toBeGreaterThan(0);
    expect(sittings[0]!.start).toBeLessThanOrEqual(firstTs);
    expect(sittings[0]!.start).toBeGreaterThan(1_000_000_000);
  });

  it("読めない集まり（数でない start）は落とし、セッション自体は残す", () => {
    const state = saved();
    state.logs.s01.sittings = [{ start: "x", end: 1 }];
    state.logs.s01.channels = [];

    const restored = validateSavedState(state);

    expect(restored?.logs.s01!.sittings).toEqual([]);
  });

  it("シナリオを持たず名前だけのセッションは、名前から非公開のシナリオを作って結ぶ", () => {
    const state = saved();
    delete state.logs.s04.scenarioId;
    state.logs.s04.title = "古い卓の名前";

    const restored = validateSavedState(state)!;

    const scenarioId = restored.logs.s04!.scenarioId;
    expect(restored.scenarios[scenarioId]).toMatchObject({ title: "古い卓の名前", private: true });
    expect(restored.logs.s04).not.toHaveProperty("title");
  });

  it("以前の「予定のある日」（busyDates・googleCalendarSyncedAt）は捨て、許可済みの googleBusy は残す", () => {
    const state = saved();
    state.prefs.busyDates = ["2026-11-21"];
    state.prefs.googleCalendarSyncedAt = "2026-11-01T00:00:00Z";
    state.prefs.googleBusy = {
      consentedAt: "2026-11-20T00:00:00Z",
      calendars: [],
      countAllDay: false,
      ranges: [],
    };

    const restored = validateSavedState(state)!;

    expect(restored.prefs).not.toHaveProperty("busyDates");
    expect(restored.prefs).not.toHaveProperty("googleCalendarSyncedAt");
    expect(restored.prefs.googleBusy?.consentedAt).toBe("2026-11-20T00:00:00Z");
  });

  it("壊れたキャラシは落とし、キャラクター本体は復元する", () => {
    const state = saved();
    const chKey = firstKey(state.characters);
    state.characters[chKey].sheet = { provider: 1, sections: "broken" };

    const restored = validateSavedState(state);

    expect(restored?.characters[chKey]?.name).toBe(state.characters[chKey].name);
    expect(restored?.characters[chKey]?.sheet).toBeUndefined();
  });
});

describe("validateSavedState: 読めないデータは State として扱わない", () => {
  it.each([
    ["null", null],
    ["配列", []],
    ["文字列", "str"],
    ["数", 123],
  ])("最上位が %s なら null", (_label, input) => {
    expect(validateSavedState(input)).toBeNull();
  });

  it("logs がオブジェクトでなければ null", () => {
    const input = {
      me: "u1",
      users: { u1: { id: "u1", name: "a" } },
      characters: {},
      scenarios: {},
      logs: "x",
    };

    expect(validateSavedState(input)).toBeNull();
  });

  it("logs に null のセッションが混ざっていれば null", () => {
    const state = saved();
    state.logs.brokenNull = null;

    expect(validateSavedState(state)).toBeNull();
  });

  it("type が roll なのに roll の中身が無い発言があれば null", () => {
    const state = saved();
    state.logs.s01.channels[0].msgs[0] = {
      id: "m_bad",
      ts: 1_700_000_000,
      sp: "x",
      kind: "PC",
      type: "roll",
    };

    expect(validateSavedState(state)).toBeNull();
  });

  it("外部連携の provider が知らないものなら null", () => {
    const state = saved();
    state.characters[firstKey(state.characters)].externalSync = {
      provider: "unknown",
      url: "https://x.test",
    };

    expect(validateSavedState(state)).toBeNull();
  });
});

describe("validateSavedState: いない人を指す参照は拒む", () => {
  const cases: [string, (s: Loose) => void][] = [
    ["自分（me）", (s) => (s.me = "no_such_user")],
    ["セッションの持ち主", (s) => (s.logs.s04.ownerId = "no_such_user")],
    [
      "セッションの参加者",
      (s) => (s.logs.s04.players.ghost = { linked: true, hidden: false, characterIds: [] }),
    ],
    ["キャラクターの持ち主", (s) => (s.characters[firstKey(s.characters)].ownerId = "no_such_user")],
    ["卓のメンバー", (s) => s.tables[firstKey(s.tables)].memberIds.push("no_such_user")],
    ["卓の持ち主", (s) => (s.tables[firstKey(s.tables)].ownerId = "no_such_user")],
  ];

  it.each(cases)("%s がいなければ null", (_label, breakIt) => {
    const state = saved();
    breakIt(state);

    expect(validateSavedState(state)).toBeNull();
  });
});

describe("parseSavedState", () => {
  it("途中で切れた JSON なら例外を投げずに null", () => {
    expect(parseSavedState('{"logs":')).toBeNull();
  });

  it("JSON の null なら null", () => {
    expect(parseSavedState("null")).toBeNull();
  });

  it("書き出した JSON を読み戻すと同じ状態になる", () => {
    const state: State = seedState();

    const restored = parseSavedState(JSON.stringify(state));

    expect(restored).toEqual(JSON.parse(JSON.stringify(state)));
  });
});
