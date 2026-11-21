import { expect, it } from "vitest";
import { seedState } from "../data/seed";
import { commitLogImport, commitPlayHistoryImport, type CommitLogInput } from "./commands";

it("添付と同時に登録したシナリオを正しく紐付け、参加者の非表示を保つ", async () => {
  const state = structuredClone(seedState());
  const target = Object.values(state.logs).find((log) => log.ownerId === state.me)!;
  const participant = Object.keys(target.players)[0];
  target.players[participant].hidden = true;
  const input: CommitLogInput = {
    attachId: target.id,
    fileName: "log.json",
    meta: { title: target.title, systemId: target.systemId },
    channels: target.channels,
    kinds: {},
    tableId: target.tableId ?? "",
    scenarioId: "",
    newScenario: { title: "新規シナリオ", author: "作者", policy: "members" },
    players: [{ userId: participant, characterIds: target.players[participant].characterIds }],
  };
  const result = await commitLogImport(input, state, (apply) => apply(state));
  expect(result.ok).toBe(true);
  expect(state.scenarios[state.logs[target.id].scenarioId!]?.title).toBe("新規シナリオ");
  expect(state.logs[target.id].players[participant].hidden).toBe(true);

  state.me = "another-user";
  const refused = await commitLogImport(input, state, () => {
    throw new Error("must not mutate");
  });
  expect(refused.ok).toBe(false);

  const missing = await commitLogImport({ ...input, attachId: "no_such_log" }, state, () => {});
  expect(missing.ok).toBe(false);
});

it("新規ログあり・新規ログなしの両方を commitLogImport で作成できる", async () => {
  const state = structuredClone(seedState());
  const beforeCount = Object.keys(state.logs).length;
  const resWithLog = await commitLogImport(
    {
      attachId: null,
      fileName: "room.json",
      meta: { title: "  新規夜卓  ", systemId: "coc7" },
      channels: [
        {
          id: "c1",
          name: "メイン",
          secret: false,
          msgs: [{ id: "tmp", ts: 1763643600, kind: "PL", sp: "凛", text: "調べます", type: "text" }],
        },
      ],
      kinds: { 凛: "KP" },
      speakerIcons: { 凛: "https://cdn.example.com/a.png", 空: "" },
      scope: "public",
      tableId: "",
      scenarioId: "",
      newScenario: null,
      players: [{ userId: state.me, characterIds: ["__import__", "ch_real"] }],
    },
    state,
    (apply) => apply(state),
  );
  expect(resWithLog.ok).toBe(true);
  expect(Object.keys(state.logs)).toHaveLength(beforeCount + 1);
  const created = state.logs[resWithLog.id]!;
  expect(created.title).toBe("新規夜卓");
  expect(created.hasLog).toBe(true);
  expect(created.channels[0]?.msgs[0]?.kind).toBe("KP");
  expect(created.speakerIcons).toEqual({ 凛: "https://cdn.example.com/a.png" });
  expect(created.players[state.me]?.characterIds).toEqual(["ch_real"]);

  const resNoLog = await commitLogImport(
    {
      attachId: null,
      fileName: null,
      meta: { title: "   ", systemId: "general" },
      channels: [],
      kinds: {},
      tableId: "",
      scenarioId: "",
      newScenario: { title: "単発シナリオ", author: "", policy: "passed" },
      players: [{ userId: state.me, characterIds: [] }],
      schedule: { dates: ["2026-11-25"], t0: 1764072000, t1: 1764082800 },
    },
    state,
    (apply) => apply(state),
  );
  expect(resNoLog.ok).toBe(true);
  const manualLog = state.logs[resNoLog.id]!;
  expect(manualLog.title).toBe("未タイトルの卓");
  expect(manualLog.hasLog).toBe(false);
  expect(manualLog.dates).toEqual(["2026-11-25"]);
});

it("commitPlayHistoryImport は既存シナリオ・自キャラを重複せず紐付け、空行をスキップする", async () => {
  const state = structuredClone(seedState());
  const existingSc = Object.values(state.scenarios)[0]!;
  const existingChar = Object.values(state.characters).find((c) => c.ownerId === state.me)!;
  const otherUser = Object.values(state.users).find((u) => u.id !== state.me)!;

  const emptyRes = await commitPlayHistoryImport(
    [{ date: "2026-01-01", title: "   ", systemId: "coc7", playerNames: [], characterNames: [] }],
    state,
    () => {
      throw new Error("should not mutate");
    },
  );
  expect(emptyRes).toEqual({
    ok: false,
    createdLogs: 0,
    createdScenarios: 0,
    createdCharacters: 0,
    skippedRows: 1,
  });

  const res = await commitPlayHistoryImport(
    [
      {
        date: "2026-01-01",
        title: "   ",
        systemId: "coc7",
        playerNames: [],
        characterNames: [],
      },
      {
        date: "2026-05-10",
        title: existingSc.title,
        scenarioTitle: existingSc.title.toUpperCase(),
        systemId: "unknown_sys",
        playerNames: [otherUser.name],
        characterNames: [existingChar.name, "新規探索者A", "新規探索者A"],
        durationMinutes: 150,
        memo: "生還エンド",
      },
      {
        date: "2026-06-15",
        title: "全く新しい物語",
        systemId: "emoklore",
        playerNames: [],
        characterNames: ["新規探索者A"],
      },
    ],
    state,
    (apply) => apply(state),
    { scope: "public" },
  );

  expect(res).toEqual({
    ok: true,
    createdLogs: 2,
    createdScenarios: 1,
    createdCharacters: 1,
    skippedRows: 1,
  });

  const createdLog1 = Object.values(state.logs).find(
    (l) => l.importedFrom === "通過履歴" && l.title === existingSc.title,
  )!;
  expect(createdLog1.scenarioId).toBe(existingSc.id);
  expect(createdLog1.systemId).toBe("general");
  expect(createdLog1.scope).toBe("public");
  expect(createdLog1.hasLog).toBe(false);
  expect(createdLog1.channels).toEqual([]);
  expect(createdLog1.slug).toMatch(/^s/);
  expect(createdLog1.players[state.me]).toMatchObject({ linked: true, hidden: false });
  expect(createdLog1.players[otherUser.id]).toEqual({ linked: true, hidden: false, characterIds: [] });
  expect(createdLog1.impressions?.[0]).toMatchObject({
    userId: state.me,
    text: "生還エンド",
    createdAt: "2026-05-10",
    spoiler: false,
  });
  expect(createdLog1.impressions?.[0]?.id).toMatch(/^imp_/);

  const newChar = Object.values(state.characters).find((c) => c.name === "新規探索者A")!;
  expect(newChar).toMatchObject({
    archetype: "",
    bio: "",
    tags: [],
    growth: [],
    share: {
      enabled: false,
      scope: "private",
      includeProfile: true,
      includeStats: true,
      includeGrowth: true,
      includeSessions: true,
    },
  });
  expect(newChar.sessions).toHaveLength(2);
  expect(newChar.sessions[0]).toMatchObject({
    logId: createdLog1.id,
    date: "2026-05-10",
    title: existingSc.title,
    scenarioId: existingSc.id,
    delta: {},
    rolls: [],
    memo: "生還エンド",
  });
  expect(newChar.import).toEqual({ source: "通過履歴インポート", importedAt: "2026-05-10" });

  // 2行目（scenarioTitle なし・新規シナリオ・memo なし・playerNames 空）の詳細検証
  const createdSc2 = Object.values(state.scenarios).find((sc) => sc.title === "全く新しい物語")!;
  expect(createdSc2).toMatchObject({
    author: "自由記述（未登録）",
    systemId: "emoklore",
    emoji: "エモクロアTRPG",
    source: "manual",
    policy: "public",
    addedBy: "user",
    addedByUid: state.me,
    claimedBy: null,
    tags: [],
  });
  const createdLog2 = Object.values(state.logs).find(
    (l) => l.importedFrom === "通過履歴" && l.title === "全く新しい物語",
  )!;
  expect(createdLog2.scenarioId).toBe(createdSc2.id);
  expect(createdLog2.systemId).toBe("emoklore");
  expect(createdLog2.impressions).toBeUndefined();
  expect(createdLog2.dates).toEqual(["2026-06-15"]);
  expect(newChar.sessions[1]?.memo).toBe("");
});

it("commitLogImport の添付・アイコン削除・ID採番・スケジュール/デフォルト日時の細部を検証する", async () => {
  const state = structuredClone(seedState());
  const target = Object.values(state.logs).find((log) => log.ownerId === state.me)!;
  target.speakerIcons = { 既存: "https://cdn.example.com/old.png" };
  target.scope = "passed";
  const origDates = [...target.dates];
  const origT0 = target.t0;
  const origT1 = target.t1;

  // attach + newScenario 省略値 (author 空白はデフォルト、policy 省略は public、unknown systemId は 🎲、scope 省略は既存維持)
  const resAttachBlankMeta = await commitLogImport(
    {
      attachId: target.id,
      fileName: null,
      meta: { title: target.title, systemId: "unknown_sys" },
      channels: [
        {
          id: "c1",
          name: "メイン",
          secret: false,
          msgs: [{ id: "old", ts: 1794831600, kind: "PC", sp: "凛", text: "hi", type: "text" }],
        },
      ],
      kinds: {},
      tableId: "",
      scenarioId: "",
      newScenario: { title: "  未登録著者シナリオ  ", author: "   " },
      players: [],
    },
    state,
    (apply) => apply(state),
  );
  expect(resAttachBlankMeta.ok).toBe(true);
  const attachSc = state.scenarios[state.logs[target.id]!.scenarioId!]!;
  expect(attachSc).toMatchObject({
    title: "未登録著者シナリオ",
    author: "自由記述（未登録）",
    policy: "public",
    emoji: "🎲",
    bg: "#e6e6f0",
    tags: [],
    source: "manual",
    addedBy: "user",
    addedByUid: state.me,
    claimedBy: null,
  });
  expect(state.logs[target.id]!.scope).toBe("passed");
  const baseDates = [...state.logs[target.id]!.dates];
  const baseT0 = state.logs[target.id]!.t0;
  const baseT1 = state.logs[target.id]!.t1;
  void origDates;
  void origT0;
  void origT1;

  const refusedMissing = await commitLogImport(
    {
      attachId: "missing_id",
      fileName: null,
      meta: { title: "x", systemId: "coc7" },
      channels: [],
      kinds: {},
      tableId: "",
      scenarioId: "",
      newScenario: null,
      players: [],
    },
    state,
    () => {},
  );
  expect(refusedMissing).toMatchObject({ ok: false, id: "missing_id", slug: "" });
  expect(refusedMissing.reason).toContain("見つかりません");

  const otherLog = Object.values(state.logs).find((log) => log.ownerId !== state.me)!;
  const refusedOwner = await commitLogImport(
    {
      attachId: otherLog.id,
      fileName: null,
      meta: { title: "x", systemId: "coc7" },
      channels: [],
      kinds: {},
      tableId: "",
      scenarioId: "",
      newScenario: null,
      players: [],
    },
    state,
    () => {},
  );
  expect(refusedOwner).toMatchObject({ ok: false, id: otherLog.id, slug: "" });
  expect(refusedOwner.reason).toContain("記録した人");

  // speakerIcons に空のみ渡して既存アイコンを削除・空チャンネルのため dates/t0/t1 を維持・新規プレイヤーは hidden:false
  const resAttach = await commitLogImport(
    {
      attachId: target.id,
      fileName: null,
      meta: { title: target.title, systemId: "unknown_sys" },
      channels: [],
      kinds: {},
      speakerIcons: { 空: "" },
      tableId: "tbl_custom",
      scenarioId: "sc_existing",
      newScenario: { title: "   ", author: "", policy: "public" },
      players: [{ userId: "u_new_player", characterIds: ["__import__", "ch_x"] }],
    },
    state,
    (apply) => apply(state),
  );
  expect(resAttach).toEqual({ ok: true, id: target.id, slug: target.slug });
  const updated = state.logs[target.id]!;
  expect(updated.hasLog).toBe(true);
  expect("speakerIcons" in updated).toBe(false);
  expect(updated.tableId).toBe("tbl_custom");
  expect(updated.scenarioId).toBe("sc_existing");
  expect(updated.importedFrom).toBeUndefined();
  expect(updated.dates).toEqual(baseDates);
  expect(updated.t0).toBe(baseT0);
  expect(updated.t1).toBe(baseT1);
  expect(updated.players.u_new_player).toEqual({ linked: true, hidden: false, characterIds: ["ch_x"] });

  // speakerIcons 自体を省略した場合は既存を維持し、メッセージID採番と kind 上書き・フォールバックを確認
  updated.speakerIcons = { 保持: "https://cdn.example.com/keep.png" };
  await commitLogImport(
    {
      attachId: target.id,
      fileName: "keep.txt",
      meta: { title: target.title, systemId: "coc7" },
      channels: [
        {
          id: "m",
          name: "メイン",
          secret: false,
          msgs: [
            { id: "x", ts: 1794831600, kind: "PC", sp: "A", text: "t", type: "text" },
            { id: "y", ts: 1794831610, kind: "NPC", sp: "案内人", text: "u", type: "text" },
          ],
        },
      ],
      kinds: { A: "PL" },
      scope: "public",
      tableId: "",
      scenarioId: "",
      newScenario: null,
      players: [],
    },
    state,
    (apply) => apply(state),
  );
  expect(updated.speakerIcons).toEqual({ 保持: "https://cdn.example.com/keep.png" });
  expect(updated.scope).toBe("public");
  expect(updated.tableId).toBeUndefined();
  expect(updated.scenarioId).toBeUndefined();
  expect(updated.importedFrom).toBe("keep.txt");
  expect(updated.channels[0]?.msgs.map((m) => m.id)).toEqual([`${target.id}-m-0`, `${target.id}-m-1`]);
  expect(updated.channels[0]?.msgs.map((m) => m.kind)).toEqual(["PL", "NPC"]);

  // 新規作成: schedule も messages の日時も無い場合は今日の日付にフォールバックし、t0 <= t1 になる
  const resToday = await commitLogImport(
    {
      attachId: null,
      fileName: "manual.txt",
      meta: { title: "手入力卓", systemId: "unknown_sys" },
      channels: [],
      kinds: {},
      tableId: "tbl_1",
      scenarioId: "sc_preset",
      newScenario: { title: "新シナリオB", author: "  " },
      players: [],
      schedule: null,
    },
    state,
    (apply) => apply(state),
  );
  expect(resToday.ok).toBe(true);
  const nowSec = Math.floor(Date.now() / 1000);
  const todayLog = state.logs[resToday.id]!;
  expect(todayLog.id).toMatch(/^s_/);
  expect(todayLog.slug).toMatch(/^s/);
  expect(todayLog.scope).toBe("members");
  expect(todayLog.tableId).toBe("tbl_1");
  expect(todayLog.dates).toEqual([new Date().toISOString().slice(0, 10)]);
  expect(todayLog.t0).toBeGreaterThan(nowSec - 60);
  expect(todayLog.t0).toBeLessThanOrEqual(nowSec + 5);
  expect(todayLog.t1).toBe(todayLog.t0);
  expect(todayLog.importedFrom).toBe("manual.txt");
  expect("speakerIcons" in todayLog).toBe(false);
  const scB = state.scenarios[todayLog.scenarioId!]!;
  expect(scB).toMatchObject({
    title: "新シナリオB",
    author: "自由記述（未登録）",
    policy: "public",
    emoji: "🎲",
    bg: "#e6e6f0",
    tags: [],
    source: "manual",
    addedBy: "user",
    addedByUid: state.me,
    claimedBy: null,
  });

  // 既存シナリオ・複数メッセージ ID 連番・schedule 時刻検証
  const resSeq = await commitLogImport(
    {
      attachId: null,
      fileName: null,
      meta: { title: "連番確認", systemId: "coc7" },
      channels: [{ id: "ch1", name: "メイン", secret: false, msgs: [] }],
      kinds: {},
      tableId: "",
      scenarioId: "sc_preset",
      newScenario: { title: "  ", author: "" },
      players: [],
      schedule: { dates: ["2026-12-01"], t0: 1796122800, t1: 1796133600 },
    },
    state,
    (apply) => apply(state),
  );
  const seqLog = state.logs[resSeq.id]!;
  expect(seqLog.hasLog).toBe(false);
  expect(seqLog.scenarioId).toBe("sc_preset");
  expect(seqLog.t0).toBe(1796122800);
  expect(seqLog.t1).toBe(1796133600);
});

it("commitPlayHistoryImport で大文字小文字無視の既存重複抑止・背景ローテ・空文字処理を確認する", async () => {
  const state = structuredClone(seedState());
  const existingUser = Object.values(state.users).find((u) => u.id !== state.me)!;
  const existingSc = Object.values(state.scenarios)[0]!;
  const res = await commitPlayHistoryImport(
    [
      {
        date: "2026-08-01",
        title: "別卓",
        scenarioTitle: `  ${existingSc.title.toUpperCase()}  `,
        systemId: "unknown",
        playerNames: [` ${existingUser.name.toUpperCase()} `, existingUser.name, "存在しないユーザー"],
        characterNames: ["", "   ", "未知PC"],
      },
      {
        date: "2026-08-02",
        title: "新規背景1",
        scenarioTitle: "新規背景1",
        systemId: "coc7",
        playerNames: [],
        characterNames: ["  未知pc  "],
      },
      {
        date: "2026-08-03",
        title: "  新規背景2  ",
        scenarioTitle: "新規背景2",
        systemId: "sw25",
        playerNames: [],
        characterNames: [],
      },
    ],
    state,
    (apply) => apply(state),
  );
  expect(res).toEqual({
    ok: true,
    createdLogs: 3,
    createdScenarios: 2,
    createdCharacters: 1,
    skippedRows: 0,
  });
  const createdLog = Object.values(state.logs).find((l) => l.title === "別卓")!;
  expect(createdLog.scenarioId).toBe(existingSc.id);
  expect(createdLog.scope).toBe("members");
  expect(createdLog.slug).toMatch(/^s/);
  expect(Object.keys(createdLog.players)).toHaveLength(2);
  expect(createdLog.players[state.me]?.characterIds).toHaveLength(1);
  const createdChar = state.characters[createdLog.players[state.me]!.characterIds[0]!]!;
  expect(createdChar.color).toBe("#6b5d50");
  expect(createdChar.sessions).toHaveLength(2);
  const sc1 = Object.values(state.scenarios).find((s) => s.title === "新規背景1")!;
  const sc2 = Object.values(state.scenarios).find((s) => s.title === "新規背景2")!;
  expect(sc1.bg).not.toBe(sc2.bg);
});
