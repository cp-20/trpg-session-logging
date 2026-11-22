import { expect, it } from "vitest";
import { seedState } from "../data/seed";
import { commitLogImport, type CommitLogInput } from "./commands";

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
    newScenario: { title: "新規シナリオ", author: "作者" },
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
      newScenario: { title: "単発シナリオ", author: "" },
      players: [{ userId: state.me, characterIds: [] }],
      sittings: [{ start: 1764072000, end: 1764082800 }],
    },
    state,
    (apply) => apply(state),
  );
  expect(resNoLog.ok).toBe(true);
  const manualLog = state.logs[resNoLog.id]!;
  expect(manualLog.title).toBe("未タイトルの卓");
  expect(manualLog.hasLog).toBe(false);
  expect(manualLog.sittings).toEqual([{ start: 1764072000, end: 1764082800 }]);
  // ログからも導けたので、発言時刻の集まりになる
  expect(created.sittings).toEqual([{ start: 1763643600, end: 1763643600 }]);
});

it("commitLogImport の添付・アイコン削除・ID採番・スケジュール/デフォルト日時の細部を検証する", async () => {
  const state = structuredClone(seedState());
  const target = Object.values(state.logs).find((log) => log.ownerId === state.me)!;
  target.speakerIcons = { 既存: "https://cdn.example.com/old.png" };
  target.scope = "passed";
  const origSittings = structuredClone(target.sittings);

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
    emoji: "🎲",
    bg: "#e6e6f0",
    tags: [],
    source: "manual",
    addedBy: "user",
    addedByUid: state.me,
    claimedBy: null,
  });
  expect(state.logs[target.id]!.scope).toBe("passed");
  const baseSittings = structuredClone(state.logs[target.id]!.sittings);
  void origSittings;

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

  // speakerIcons に空のみ渡して既存アイコンを削除・空チャンネルのため 時間帯を維持・新規プレイヤーは hidden:false
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
      newScenario: { title: "   ", author: "" },
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
  expect(updated.sittings).toEqual(baseSittings);
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

  // 新規作成: 時間帯もログの発言時刻もなければ記録しない
  const refusedNoTime = await commitLogImport(
    {
      attachId: null,
      fileName: null,
      meta: { title: "日時なし", systemId: "coc7" },
      channels: [],
      kinds: {},
      tableId: "",
      scenarioId: "",
      newScenario: null,
      players: [],
    },
    state,
    (apply) => apply(state),
  );
  expect(refusedNoTime).toMatchObject({ ok: false, reason: "遊んだ日時を入れてください。" });

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
      sittings: [
        { start: 1796133600, end: 1796140000 },
        { start: 1796122800, end: 1796133600 },
      ],
    },
    state,
    (apply) => apply(state),
  );
  expect(resToday.ok).toBe(true);
  const todayLog = state.logs[resToday.id]!;
  expect(todayLog.id).toMatch(/^s_/);
  expect(todayLog.slug).toMatch(/^s/);
  expect(todayLog.scope).toBe("members");
  expect(todayLog.tableId).toBe("tbl_1");
  // 接した集まりは 1 つにまとめ、開始順に並べる
  expect(todayLog.sittings).toEqual([{ start: 1796122800, end: 1796140000 }]);
  expect(todayLog.importedFrom).toBe("manual.txt");
  expect("speakerIcons" in todayLog).toBe(false);
  const scB = state.scenarios[todayLog.scenarioId!]!;
  expect(scB).toMatchObject({
    title: "新シナリオB",
    author: "自由記述（未登録）",
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
      sittings: [{ start: 1796122800, end: 1796133600 }],
    },
    state,
    (apply) => apply(state),
  );
  const seqLog = state.logs[resSeq.id]!;
  expect(seqLog.hasLog).toBe(false);
  expect(seqLog.scenarioId).toBe("sc_preset");
  expect(seqLog.sittings).toEqual([{ start: 1796122800, end: 1796133600 }]);
});
