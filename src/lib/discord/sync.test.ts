import { describe, expect, it } from "vitest";
import { reminderKey, runReminders } from "./reminders";
import { DiscordApiError } from "./rest";
import { postSession, syncEventFromApp, syncPoll, syncPollFromApp } from "./sync";
import { linkTable, makeCtx, samplePoll } from "./testkit";

const ops = (t: ReturnType<typeof makeCtx>) => t.rest.calls.map((c) => c.op);

describe("日程調整を映す", () => {
  it("つないでいない卓では何もしない", async () => {
    const t = makeCtx();
    expect(await syncPoll(t.ctx, samplePoll())).toEqual({ ok: true, linked: false });
    expect(t.rest.calls).toHaveLength(0);
  });

  it("はじめは投稿し、次からは同じメッセージを書き換える。在りかを日程調整の文書にも書く", async () => {
    const t = makeCtx();
    linkTable(t.store);
    t.store.data.polls.set("ev1", samplePoll());
    await syncPoll(t.ctx, samplePoll());
    await syncPoll(t.ctx, samplePoll());
    expect(ops(t)).toEqual(["createMessage", "editMessage"]);
    expect(t.store.data.posts.get("ev1")?.pollMessageId).toBe("m1");
    expect(t.store.data.polls.get("ev1")?.discord).toEqual({
      guildId: "g1",
      channelId: "ch1",
      messageId: "m1",
    });
  });

  it("メッセージが消されていたら出し直す", async () => {
    const t = makeCtx();
    linkTable(t.store);
    t.store.data.posts.set("ev1", {
      eventId: "ev1",
      tableId: "t1",
      guildId: "g1",
      channelId: "ch1",
      pollMessageId: "gone",
    });
    t.rest.fail.editMessage = new DiscordApiError(404, 10008, "Unknown Message");
    await syncPoll(t.ctx, samplePoll());
    expect(t.store.data.posts.get("ev1")?.pollMessageId).toBe("m1");
  });

  it("卓のメンバーでない人が作った日程調整は出さない", async () => {
    const t = makeCtx();
    linkTable(t.store);
    expect(await syncPoll(t.ctx, samplePoll({ ownerId: "u_x" }))).toMatchObject({ ok: false, status: 403 });
  });

  it("卓譜から: 日程調整のメンバーだけが呼べる", async () => {
    const t = makeCtx();
    linkTable(t.store);
    t.store.data.polls.set("ev1", samplePoll());
    expect(await syncPollFromApp(t.ctx, "u_x", "ev1")).toMatchObject({ ok: false, status: 403 });
    expect(await syncPollFromApp(t.ctx, "u_pl", "nope")).toMatchObject({ ok: false, status: 404 });
    expect(await syncPollFromApp(t.ctx, "u_pl", "ev1")).toMatchObject({ ok: true, linked: true });
  });

  it("確定したら日程調整を締め、Discord のイベントと「予定が決まりました」を出す", async () => {
    const t = makeCtx();
    linkTable(t.store);
    await syncPoll(t.ctx, samplePoll());
    await syncPoll(t.ctx, samplePoll({ status: "confirmed", confirmedCandidateId: "c1" }));
    expect(ops(t)).toEqual(["createMessage", "editMessage", "createScheduledEvent", "createMessage"]);
    const body = t.rest.calls[2]!.args[1] as Record<string, unknown>;
    expect(body).toMatchObject({
      entity_type: 3,
      scheduled_start_time: "2026-11-28T12:00:00.000Z",
      scheduled_end_time: "2026-11-28T16:00:00.000Z",
      entity_metadata: { location: "https://takufu.test/tables/t1" },
    });
    const post = t.store.data.posts.get("ev1")!;
    expect(post).toMatchObject({
      scheduledEventId: "se2",
      confirmMessageId: "m3",
      startMs: Date.parse("2026-11-28T12:00:00Z"),
    });
  });

  it("ボイスチャンネルを選んでつないだ卓では、ボイスのイベントにする", async () => {
    const t = makeCtx();
    linkTable(t.store, { voiceChannelId: "vc1" });
    await syncPoll(t.ctx, samplePoll({ status: "confirmed", confirmedCandidateId: "c1" }));
    expect(t.rest.calls.find((c) => c.op === "createScheduledEvent")?.args[1]).toMatchObject({
      entity_type: 2,
      channel_id: "vc1",
    });
  });
});

describe("確定した予定を映す", () => {
  const ev = {
    eventId: "ev9",
    tableId: "t1",
    title: "単発",
    date: "2026-11-25",
    startTime: "20:00",
    endTime: "23:00",
  };

  it("同じ内容なら 2 回目は何もしない。時刻を変えたらイベントとメッセージを書き換える", async () => {
    const t = makeCtx();
    linkTable(t.store);
    expect(await syncEventFromApp(t.ctx, "u_owner", ev)).toMatchObject({ changed: true });
    expect(await syncEventFromApp(t.ctx, "u_pl", ev)).toMatchObject({ changed: false });
    await syncEventFromApp(t.ctx, "u_owner", { ...ev, startTime: "21:00", endTime: "24:30" });
    expect(ops(t)).toEqual(["createScheduledEvent", "createMessage", "editScheduledEvent", "editMessage"]);
    expect(t.store.data.posts.get("ev9")?.endMs).toBe(Date.parse("2026-11-25T15:30:00Z"));
  });

  it("確定の同期が日程調整と予定の両方から同時に届いても、イベントとメッセージは 1 つずつ", async () => {
    const t = makeCtx();
    linkTable(t.store);
    const poll = samplePoll({ status: "confirmed", confirmedCandidateId: "c1" });
    const c1 = poll.candidates.find((c) => c.id === "c1")!;
    const fromEvent = {
      ...ev,
      eventId: poll.id,
      date: c1.date,
      startTime: c1.startTime,
      endTime: c1.endTime,
    };
    await Promise.all([
      syncPoll(t.ctx, poll),
      syncEventFromApp(t.ctx, "u_owner", fromEvent),
      syncPollFromApp(t.ctx, "u_owner", poll.id),
    ]);
    expect(ops(t).filter((op) => op === "createScheduledEvent")).toHaveLength(1);
    expect(t.store.data.posts.get(poll.id)?.confirmMessageId).toEqual(expect.any(String));
    const confirmCreates = t.rest.calls.filter(
      (c) => c.op === "createMessage" && JSON.stringify(c.args[1]).includes("イベント"),
    );
    expect(confirmCreates.length).toBeLessThanOrEqual(1);
  });

  it("消したら Discord のイベントを消し、メッセージを「取り消されました」にする", async () => {
    const t = makeCtx();
    linkTable(t.store);
    await syncEventFromApp(t.ctx, "u_owner", ev);
    await syncEventFromApp(t.ctx, "u_owner", { eventId: "ev9", tableId: "t1", deleted: true });
    expect(ops(t).slice(2)).toEqual(["deleteScheduledEvent", "editMessage"]);
    expect(t.store.data.posts.has("ev9")).toBe(false);
  });

  it("始まったあとの予定には Discord のイベントを作らない。イベントの権限がなくても知らせは出す", async () => {
    const t = makeCtx();
    linkTable(t.store);
    await syncEventFromApp(t.ctx, "u_owner", { ...ev, eventId: "past", date: "2026-11-01" });
    expect(ops(t)).toEqual(["createMessage"]);
    t.rest.fail.createScheduledEvent = new DiscordApiError(403, 50013, "Missing Permissions");
    await syncEventFromApp(t.ctx, "u_owner", ev);
    expect(ops(t).slice(1)).toEqual(["createScheduledEvent", "createMessage"]);
  });

  it("卓のメンバーでない人・日時が読めない予定は断る", async () => {
    const t = makeCtx();
    linkTable(t.store);
    expect(await syncEventFromApp(t.ctx, "u_x", ev)).toMatchObject({ ok: false, status: 403 });
    expect(await syncEventFromApp(t.ctx, "u_owner", { ...ev, date: "x" })).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe("記録の投稿", () => {
  const shared = {
    ownerId: "u_pl",
    scope: "public" as const,
    revoked: false,
    tableId: "t1",
    title: "霧の港",
  };

  it("共有ページがまだなら待ってもらい、記録した人以外・卓のない記録・つないでいない卓は断る", async () => {
    const t = makeCtx();
    expect(await postSession(t.ctx, "u_pl", "s1")).toMatchObject({ status: 409, code: "not_ready" });
    t.store.data.sharedLogs.set("s1", shared);
    expect(await postSession(t.ctx, "u_x", "s1")).toMatchObject({ status: 403 });
    expect(await postSession(t.ctx, "u_pl", "s1")).toMatchObject({ status: 404, code: "unlinked" });
    t.store.data.sharedLogs.set("s2", { ...shared, tableId: undefined });
    expect(await postSession(t.ctx, "u_pl", "s2")).toMatchObject({ status: 400 });
  });

  it("共有ページの中身を読めない（メンバー限定）ときは、画面が送る卓を使う。メンバーでない卓には出さない", async () => {
    const t = makeCtx();
    linkTable(t.store);
    t.store.data.sharedLogs.set("s3", {
      ownerId: "u_pl",
      scope: "members",
      revoked: false,
    });
    expect(await postSession(t.ctx, "u_pl", "s3")).toMatchObject({ status: 400 });
    expect(await postSession(t.ctx, "u_pl", "s3", "t1")).toEqual({ ok: true });
    linkTable(t.store, { tableId: "t9", memberIds: ["u_owner"], channelId: "ch9" });
    expect(await postSession(t.ctx, "u_pl", "s3", "t9")).toMatchObject({ status: 403 });
    // 中身から卓が分かるなら、画面が送る卓より中身を使う
    t.store.data.sharedLogs.set("s1", shared);
    expect(await postSession(t.ctx, "u_pl", "s1", "t9")).toEqual({ ok: true });
    expect(t.rest.calls.map((c) => c.args[0])).toEqual(["ch1", "ch1"]);
  });

  it("つないだチャンネルに投稿する", async () => {
    const t = makeCtx();
    linkTable(t.store);
    t.store.data.sharedLogs.set("s1", shared);
    expect(await postSession(t.ctx, "u_pl", "s1")).toEqual({ ok: true });
    expect(t.rest.calls[0]?.args[0]).toBe("ch1");
  });
});

describe("前日のお知らせ", () => {
  function setup() {
    const t = makeCtx();
    linkTable(t.store);
    const startMs = t.clock.now + 20 * 3600_000;
    t.store.data.posts.set("ev1", {
      eventId: "ev1",
      tableId: "t1",
      guildId: "g1",
      channelId: "ch1",
      title: "第2話",
      startMs,
      endMs: startMs + 3 * 3600_000,
      confirmedAt: t.clock.now - 3 * 86400_000,
    });
    return { t, startMs };
  }

  it("24 時間以内に始まる予定に 1 回だけ送る（何度呼んでも）", async () => {
    const { t, startMs } = setup();
    expect(await runReminders(t.ctx)).toEqual({ sent: 1, skipped: 0, failed: 0, nextDueAt: null });
    expect(await runReminders(t.ctx)).toEqual({ sent: 0, skipped: 1, failed: 0, nextDueAt: null });
    expect(t.store.data.reminders.get(reminderKey("ev1", startMs))).toBe("sent");
    expect(ops(t)).toEqual(["createMessage"]);
  });

  it("送れなかったら印を外し、次の回で送り直す", async () => {
    const { t } = setup();
    t.rest.fail.createMessage = new Error("down");
    expect(await runReminders(t.ctx)).toMatchObject({ sent: 0, skipped: 0, failed: 1 });
    delete t.rest.fail.createMessage;
    expect(await runReminders(t.ctx)).toMatchObject({ sent: 1 });
  });

  it("決まったばかりの予定は 6 時間待つ。つながりを外した卓・まだ先の予定には送らない", async () => {
    const { t } = setup();
    t.store.data.posts.get("ev1")!.confirmedAt = t.clock.now - 3600_000;
    expect(await runReminders(t.ctx)).toEqual({
      sent: 0,
      skipped: 0,
      failed: 0,
      nextDueAt: t.clock.now + 5 * 3600_000,
    });
    t.store.data.posts.get("ev1")!.confirmedAt = 0;
    t.store.data.tables.clear();
    expect(await runReminders(t.ctx)).toMatchObject({ sent: 0, skipped: 1 });
    t.clock.now -= 2 * 86400_000;
    expect(await runReminders(t.ctx)).toEqual({ sent: 0, skipped: 0, failed: 0, nextDueAt: null });
  });
});
