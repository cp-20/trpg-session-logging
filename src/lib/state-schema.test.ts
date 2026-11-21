// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { parseSavedState, RestoredStateSchema, validateSavedState } from "./state-schema";

describe("state-schema", () => {
  it("保存したデモ利用者と既存サンプル・externalSync 付きデータを正しく復元する", () => {
    const state = seedState();
    state.entered = true;
    const chKey = Object.keys(state.characters)[0]!;
    state.characters[chKey]!.externalSync = {
      provider: "iachara",
      url: "https://iachara.com/view/123",
      lastSyncedAt: "2026-11-20T00:00:00Z",
      lastStatus: "ok",
      autoSync: true,
    };
    const scKey = Object.keys(state.scenarios)[0]!;
    state.scenarios[scKey]!.externalSync = {
      provider: "booth",
      url: "https://booth.pm/ja/items/123",
      autoSync: false,
    };

    expect(RestoredStateSchema.safeParse(state).success).toBe(true);
    const parsed = parseSavedState(JSON.stringify(state));
    expect(parsed?.entered).toBe(true);
    expect(parsed?.characters[chKey]?.externalSync?.provider).toBe("iachara");
    expect(parsed?.scenarios[scKey]?.externalSync?.provider).toBe("booth");
  });

  it("許可なしで Google カレンダーから混ぜていた予定日は捨て、許可済みの googleBusy は残す", () => {
    const old = seedState() as unknown as { prefs: Record<string, unknown> };
    old.prefs.busyDates = ["2026-11-21"];
    old.prefs.googleCalendarSyncedAt = "2026-11-01T00:00:00Z";
    const migrated = parseSavedState(JSON.stringify(old))!;
    expect(migrated.prefs.busyDates).toBeUndefined();
    expect("googleCalendarSyncedAt" in migrated.prefs).toBe(false);

    const now = seedState();
    now.prefs.busyDates = ["2026-11-21"];
    now.prefs.googleBusy = {
      consentedAt: "2026-11-20T00:00:00Z",
      calendars: [],
      countAllDay: false,
      ranges: [],
    };
    const kept = parseSavedState(JSON.stringify(now))!;
    expect(kept.prefs.busyDates).toEqual(["2026-11-21"]);
    expect(kept.prefs.googleBusy?.consentedAt).toBe("2026-11-20T00:00:00Z");
  });

  it("既知の旧形式（slug なし、dates/t0/t1 なし、tables/prefs/editRequests なし）を補完する", () => {
    const state = structuredClone(seedState()) as unknown as Record<string, any>;
    state.futureField = "keep";
    delete state.prefs;
    delete state.editRequests;
    delete state.tables;
    delete state.events;
    for (const log of Object.values(state.logs) as any[]) delete log.slug;
    // ログメッセージから dates / t0 / t1 を逆算するレガシーパス（一部のみ欠損でも発火する）
    const s01 = state.logs.s01;
    delete s01.dates;
    delete s01.t0;
    delete s01.t1;
    const s02 = state.logs.s02;
    delete s02.t0;
    const s03 = state.logs.s03;
    delete s03.t1;
    const okRestored = validateSavedState(state);
    expect(okRestored).not.toBeNull();
    expect((okRestored as any).futureField).toBe("keep");
    expect(okRestored?.prefs.hideSelfOnShare).toBe(false);
    expect(okRestored?.tables).toEqual({});
    expect(okRestored?.events).toEqual({});
    expect(okRestored?.logs.s03.slug).toBe("s03");
    expect(okRestored?.logs.s01.dates.length).toBeGreaterThan(0);
    expect(Number.isFinite(okRestored?.logs.s01.t0)).toBe(true);
    expect(Number.isFinite(okRestored?.logs.s02.t0)).toBe(true);
    expect(Number.isFinite(okRestored?.logs.s03.t1)).toBe(true);
  });

  it("不正な入力型・空チャンネルでの欠損復元・欠損参照ユーザー・壊れた roll メッセージ・不正 JSON をすべて拒否する", () => {
    expect(validateSavedState(null)).toBeNull();
    expect(validateSavedState([])).toBeNull();
    expect(validateSavedState("str")).toBeNull();
    expect(validateSavedState(123)).toBeNull();
    expect(
      validateSavedState({
        me: "u1",
        users: { u1: { id: "u1", name: "a" } },
        characters: {},
        scenarios: {},
        logs: "not-obj",
      }),
    ).toBeNull();
    expect(parseSavedState('{"logs":')).toBeNull();
    expect(parseSavedState("null")).toBeNull();

    // channels が空で dates 欠損のときは derived が null となり、不正として弾かれる
    const noMsgLegacy = structuredClone(seedState()) as unknown as Record<string, any>;
    noMsgLegacy.logs.s01.channels = [{ id: "m", name: "メイン", secret: false, msgs: [] }];
    delete noMsgLegacy.logs.s01.dates;
    delete noMsgLegacy.logs.s01.t0;
    delete noMsgLegacy.logs.s01.t1;
    expect(validateSavedState(noMsgLegacy)).toBeNull();

    // logs に null エントリが含まれていたら全体が不合格になる
    const withNullLog = structuredClone(seedState()) as unknown as Record<string, any>;
    withNullLog.logs.brokenNull = null;
    expect(validateSavedState(withNullLog)).toBeNull();

    // 不正 log ownerId は拒否、かつ localStorage 原本は不変
    const badOwner = structuredClone(seedState());
    badOwner.logs.s03.ownerId = "missing";
    const raw = JSON.stringify(badOwner);
    localStorage.setItem("takufu-state-v4", raw);
    expect(parseSavedState(raw)).toBeNull();
    expect(localStorage.getItem("takufu-state-v4")).toBe(raw);

    // 不正 me
    const badMe = structuredClone(seedState());
    badMe.me = "no_such_user";
    expect(validateSavedState(badMe)).toBeNull();

    // 不正 character.ownerId
    const badCharOwner = structuredClone(seedState());
    Object.values(badCharOwner.characters)[0]!.ownerId = "no_such_user";
    expect(validateSavedState(badCharOwner)).toBeNull();

    // 不正 table.memberIds
    const badTableMember = structuredClone(seedState());
    Object.values(badTableMember.tables)[0]!.memberIds.push("no_such_user");
    expect(validateSavedState(badTableMember)).toBeNull();

    // 不正 log.players
    const badLogPlayer = structuredClone(seedState());
    badLogPlayer.logs.s03.players.ghost = { linked: true, hidden: false, characterIds: [] };
    expect(validateSavedState(badLogPlayer)).toBeNull();

    // type === "roll" なのに roll オブジェクトが無い
    const badRoll = structuredClone(seedState());
    badRoll.logs.s01.channels[0]!.msgs[0] = {
      id: "m_bad",
      ts: 1700000000,
      sp: "x",
      kind: "PC",
      type: "roll",
      text: "1d100",
    };
    expect(validateSavedState(badRoll)).toBeNull();

    // externalSync.provider が不正
    const badExt = structuredClone(seedState()) as unknown as {
      characters: Record<string, Record<string, unknown>>;
    };
    Object.values(badExt.characters)[0]!.externalSync = { provider: "unknown", url: "https://x.test" };
    expect(validateSavedState(badExt)).toBeNull();
  });
});
