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

  it("以前の「予定のある日」（許可なしの取り込み・手入力）は捨て、許可済みの googleBusy は残す", () => {
    const old = seedState() as unknown as { prefs: Record<string, unknown> };
    old.prefs.busyDates = ["2026-11-21"];
    old.prefs.googleCalendarSyncedAt = "2026-11-01T00:00:00Z";
    old.prefs.googleBusy = {
      consentedAt: "2026-11-20T00:00:00Z",
      calendars: [],
      countAllDay: false,
      ranges: [],
    };
    const migrated = parseSavedState(JSON.stringify(old))!;
    expect("busyDates" in migrated.prefs).toBe(false);
    expect("googleCalendarSyncedAt" in migrated.prefs).toBe(false);
    expect(migrated.prefs.googleBusy?.consentedAt).toBe("2026-11-20T00:00:00Z");
  });

  it("既知の旧形式（slug なし、dates/t0/t1 の時間帯、tables/prefs/editRequests なし）を補完する", () => {
    const state = structuredClone(seedState()) as unknown as Record<string, any>;
    state.futureField = "keep";
    delete state.prefs;
    delete state.editRequests;
    delete state.tables;
    delete state.events;
    for (const log of Object.values(state.logs) as any[]) delete log.slug;
    // 以前の持ち方（dates + t0 + t1）。ログに発言時刻があればそれから、なければ t0〜t1 から集まりを作る
    const s01 = state.logs.s01;
    delete s01.sittings;
    Object.assign(s01, { dates: ["2026-01-01"], t0: 1, t1: 2 });
    const s02 = state.logs.s02;
    const t0 = 1_789_000_000;
    Object.assign(s02, { dates: ["2026-09-10"], t0, t1: t0 + 3600, channels: [] });
    delete s02.sittings;
    const okRestored = validateSavedState(state);
    expect(okRestored).not.toBeNull();
    expect((okRestored as any).futureField).toBe("keep");
    expect(okRestored?.prefs.hideSelfOnShare).toBe(false);
    expect(okRestored?.tables).toEqual({});
    expect(okRestored?.events).toEqual({});
    expect(okRestored?.logs.s03.slug).toBe("s03");
    expect(okRestored?.logs.s01.sittings.length).toBeGreaterThan(0);
    expect(okRestored?.logs.s01.sittings[0]!.start).toBeGreaterThan(1_000_000_000);
    expect(okRestored?.logs.s02.sittings).toEqual([{ start: t0, end: t0 + 3600 }]);
    expect(okRestored?.logs.s01).not.toHaveProperty("dates");
    expect(okRestored?.logs.s02).not.toHaveProperty("t0");
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

    // 時間帯が読めない（壊れた sittings）ものは不合格
    const badSittings = structuredClone(seedState()) as unknown as Record<string, any>;
    badSittings.logs.s01.sittings = [{ start: "x", end: 1 }];
    badSittings.logs.s01.channels = [];
    expect(validateSavedState(badSittings)?.logs.s01.sittings).toEqual([]);

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
