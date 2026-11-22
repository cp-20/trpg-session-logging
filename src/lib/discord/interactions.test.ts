import { describe, expect, it } from "vitest";
import { handleInteraction, ResponseType, type Interaction } from "./interactions";
import { encodeAction, EPHEMERAL, type DiscordMessage } from "./messages";
import { linkTable, makeCtx, samplePoll } from "./testkit";

const MANAGE = String(1n << 4n);
const BOT_OK = String((1n << 10n) | (1n << 11n) | (1n << 14n) | (1n << 44n));

function command(sub: string, over: Partial<Interaction> = {}, options: unknown[] = []): Interaction {
  return {
    id: "i1",
    application_id: "app1",
    type: 2,
    token: "itok",
    guild_id: "g1",
    channel_id: "ch1",
    channel: { id: "ch1", name: "卓" },
    member: { user: { id: "d_owner" }, permissions: MANAGE },
    app_permissions: BOT_OK,
    data: { name: "卓譜", options: [{ name: sub, type: 1, options: options as never }] },
    ...over,
  };
}

function button(customId: string, ephemeral: boolean, discordUser = "d_pl"): Interaction {
  return {
    id: "i2",
    application_id: "app1",
    type: 3,
    token: "btok",
    guild_id: "g1",
    channel_id: "ch1",
    member: { user: { id: discordUser } },
    message: { id: "msg", flags: ephemeral ? EPHEMERAL : 0 },
    data: { custom_id: customId },
  };
}

/** 続きを行い、最初の返事を書き換えた内容を返す */
async function run(ctx: ReturnType<typeof makeCtx>, i: Interaction) {
  const out = handleInteraction(ctx.ctx, i);
  await out.work?.();
  const edit = ctx.rest.calls.filter((c) => c.op === "editOriginal").at(-1);
  return {
    body: out.body as { type: number; data?: DiscordMessage },
    edited: edit?.args[1] as DiscordMessage | undefined,
  };
}

describe("handleInteraction", () => {
  it("PING には PONG を返す", () => {
    const t = makeCtx();
    expect(handleInteraction(t.ctx, { id: "p", application_id: "a", type: 1, token: "" }).body).toEqual({
      type: 1,
    });
  });

  it("/卓譜 つなぐ: チャンネルの管理の権限がなければ断る", () => {
    const t = makeCtx();
    const out = handleInteraction(
      t.ctx,
      command("つなぐ", { member: { user: { id: "d" }, permissions: "0" } }),
    );
    expect(out.work).toBeUndefined();
    expect((out.body as { data: DiscordMessage }).data.flags).toBe(EPHEMERAL);
  });

  it("/卓譜 つなぐ: ボットが投稿できないチャンネルではボットの追加を案内する", () => {
    const t = makeCtx();
    const out = handleInteraction(t.ctx, command("つなぐ", { app_permissions: "0" }));
    const data = (out.body as { data: DiscordMessage }).data;
    expect(data.components?.[0]?.components[0]?.url).toContain("scope=bot+applications.commands");
  });

  it("/卓譜 つなぐ: 自分だけに見える返事を遅らせ、10 分のコードを作ってリンクを返す", async () => {
    const t = makeCtx();
    const { body, edited } = await run(
      t,
      command("つなぐ", {
        data: {
          name: "卓譜",
          options: [{ name: "つなぐ", type: 1, options: [{ name: "ボイス", type: 7, value: "vc1" }] }],
          resolved: { channels: { vc1: { id: "vc1", name: "雑談" } } },
        },
      }),
    );
    expect(body).toEqual({ type: ResponseType.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } });
    const [[code, saved]] = [...t.store.data.codes.entries()];
    expect(saved).toMatchObject({
      guildId: "g1",
      channelId: "ch1",
      channelName: "卓",
      voiceChannelId: "vc1",
      guildName: "テストサーバー",
    });
    expect(saved!.expiresAt - t.clock.now).toBe(10 * 60 * 1000);
    expect(edited?.components?.[0]?.components[0]?.url).toBe(
      `https://takufu.test/tables/discord?code=${code}`,
    );
  });

  it("サーバーの外（DM）では使えない", () => {
    const t = makeCtx();
    const out = handleInteraction(t.ctx, command("日程", { guild_id: undefined }));
    expect(out.work).toBeUndefined();
  });

  it("/卓譜 日程: つないだ卓の、回答を受け付けている日程調整だけを並べる", async () => {
    const t = makeCtx();
    linkTable(t.store);
    t.store.data.polls.set("ev1", samplePoll());
    t.store.data.polls.set("ev2", samplePoll({ id: "ev2", status: "confirmed", confirmedCandidateId: "c1" }));
    t.store.data.polls.set("ev3", samplePoll({ id: "ev3", tableId: "t9" }));
    const { edited } = await run(t, command("日程"));
    expect(edited?.components).toHaveLength(1);
    expect(edited?.components?.[0]?.components[0]?.custom_id).toBe("po:ev1:0");
  });

  it("/卓譜 日程: つないでいないチャンネルではそう伝える", async () => {
    const t = makeCtx();
    const { edited } = await run(t, command("日程"));
    expect(edited?.content).toContain("つながっていません");
  });

  it("/卓譜 はずす: チャンネルと卓のつながりを外す", async () => {
    const t = makeCtx();
    linkTable(t.store);
    await run(t, command("はずす"));
    expect(t.store.data.tables.size).toBe(0);
  });

  it("/卓譜 キャラ: 公開しているキャラクターだけを、既定では自分だけに見せる", async () => {
    const t = makeCtx();
    await t.store.linkAccount("u_owner", { discordUserId: "d_owner", username: "u_owner", linkedAt: "" });
    t.store.data.characters.set("u_owner", [{ id: "c_1", name: "ミカ", systemId: "coc7" }]);
    const { body, edited } = await run(t, command("キャラ"));
    expect(body.data?.flags).toBe(EPHEMERAL);
    expect(edited?.embeds?.[0]?.description).toContain("https://takufu.test/share/c/c_1");
    const shown = await run(t, command("キャラ", {}, [{ name: "みんなに見せる", type: 5, value: true }]));
    expect(shown.body).toEqual({ type: ResponseType.DEFERRED_MESSAGE });
  });

  it("つないでいない Discord の利用者が回答しようとしたら、卓譜の設定へ案内する", async () => {
    const t = makeCtx();
    t.store.data.polls.set("ev1", samplePoll());
    const { body, edited } = await run(t, button("po:ev1:0", false));
    expect(body).toEqual({ type: ResponseType.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } });
    expect(edited?.components?.[0]?.components[0]?.url).toBe("https://takufu.test/settings");
  });

  it("卓のメンバーでない人は回答できない", async () => {
    const t = makeCtx();
    await t.store.linkAccount("u_x", { discordUserId: "d_x", username: "u_x", linkedAt: "" });
    t.store.data.polls.set("ev1", samplePoll());
    const { edited } = await run(t, button("po:ev1:0", false, "d_x"));
    expect(edited?.content).toContain("卓のメンバーだけ");
  });

  it("回答すると共有の文書に書き、自分の回答欄とチャンネルの回答数を書き換える", async () => {
    const t = makeCtx();
    linkTable(t.store);
    await t.store.linkAccount("u_pl", { discordUserId: "d_pl", username: "u_pl", linkedAt: "" });
    t.store.data.polls.set("ev1", samplePoll());
    t.store.data.posts.set("ev1", {
      eventId: "ev1",
      tableId: "t1",
      guildId: "g1",
      channelId: "ch1",
      pollMessageId: "pm1",
    });

    const open = await run(t, button("po:ev1:0", false));
    expect(open.edited?.components).toHaveLength(2);

    const id = encodeAction({
      kind: "poll-answer",
      eventId: "ev1",
      candidateId: "c2",
      value: "maybe",
      page: 0,
    });
    const { body, edited } = await run(t, button(id, true));
    expect(body).toEqual({ type: ResponseType.DEFERRED_UPDATE });
    expect(t.store.data.polls.get("ev1")!.responses.u_pl).toEqual({ c2: "maybe" });
    // 選んだ △ に色が付く
    const row = edited!.components![1]!.components;
    expect(row[2]).toMatchObject({ label: "△", style: 1 });
    expect(row[1]).toMatchObject({ label: "○", style: 2 });
    const refresh = t.rest.calls.find((c) => c.op === "editMessage")!;
    expect(refresh.args.slice(0, 2)).toEqual(["ch1", "pm1"]);
    expect((refresh.args[2] as DiscordMessage).embeds?.[0]?.description).toContain("△ 1");
  });

  it("確定した日程調整には回答できない", async () => {
    const t = makeCtx();
    await t.store.linkAccount("u_pl", { discordUserId: "d_pl", username: "u_pl", linkedAt: "" });
    t.store.data.polls.set("ev1", samplePoll({ status: "confirmed", confirmedCandidateId: "c1" }));
    const id = encodeAction({ kind: "poll-answer", eventId: "ev1", candidateId: "c1", value: "ok", page: 0 });
    const { edited } = await run(t, button(id, true));
    expect(edited?.content).toContain("締め切られました");
    expect(t.store.data.polls.get("ev1")!.responses.u_pl).toBeUndefined();
  });

  it("処理に失敗しても、考え中のままにせず失敗を伝える", async () => {
    const t = makeCtx();
    t.store.getUidForDiscordUser = async () => {
      throw new Error("down");
    };
    const { edited } = await run(t, button("po:ev1:0", false));
    expect(edited?.content).toContain("うまく処理できませんでした");
  });

  it("知らないボタンは何もしない", () => {
    const t = makeCtx();
    expect(handleInteraction(t.ctx, button("pl:c1", true)).body).toEqual({
      type: ResponseType.DEFERRED_UPDATE,
    });
  });
});
