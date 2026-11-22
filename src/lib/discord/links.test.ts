import { describe, expect, it, vi } from "vitest";
import {
  completeAccountLink,
  completeChannelLink,
  previewChannelLink,
  startAccountLink,
  tableStatus,
  unlinkTable,
} from "./links";
import { linkTable, makeCtx } from "./testkit";

function discordFetch(user = { id: "123456789012345678", username: "mikan", global_name: "みかん" }) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/oauth2/token")) return Response.json({ access_token: "at", scope: "identify" });
    if (url.endsWith("/users/@me")) return Response.json(user);
    return new Response(null, { status: 200 });
  });
}

describe("Discord の利用者とつなぐ（OAuth2）", () => {
  it("認可の URL は identify だけを求め、合言葉を 10 分だけ覚える", async () => {
    const t = makeCtx();
    const { state, url } = await startAccountLink(t.ctx, "u_owner");
    const u = new URL(url);
    expect(u.searchParams.get("scope")).toBe("identify");
    expect(u.searchParams.get("redirect_uri")).toBe("https://takufu.test/api/discord/oauth/callback");
    expect(u.searchParams.get("state")).toBe(state);
    expect(t.store.data.states.get(state)).toEqual({ uid: "u_owner", expiresAt: t.clock.now + 600_000 });
  });

  it("合言葉が Cookie と一致し、期限内で、一回目のときだけつなぎ、トークンはすぐ取り消す", async () => {
    const fetchFn = discordFetch();
    const t = makeCtx({ fetchFn });
    const { state } = await startAccountLink(t.ctx, "u_owner");
    const input = { code: "c", state, cookieState: state, error: null };
    expect(await completeAccountLink(t.ctx, input)).toBe("linked");
    expect(t.store.data.links.get("123456789012345678")).toBe("u_owner");
    expect(t.store.data.accounts.get("u_owner")).toMatchObject({ username: "mikan", globalName: "みかん" });
    expect(fetchFn.mock.calls.map((c) => c[0]).at(-1)).toContain("/oauth2/token/revoke");
    // 同じ合言葉は二度使えない
    expect(await completeAccountLink(t.ctx, input)).toBe("expired");
  });

  it("別のブラウザ（Cookie が違う・ない）、期限切れ、知らない合言葉ではつながない", async () => {
    const t = makeCtx({ fetchFn: discordFetch() });
    const { state } = await startAccountLink(t.ctx, "u_owner");
    expect(await completeAccountLink(t.ctx, { code: "c", state, cookieState: null, error: null })).toBe(
      "expired",
    );
    expect(
      await completeAccountLink(t.ctx, { code: "c", state, cookieState: "x".repeat(43), error: null }),
    ).toBe("expired");
    const again = await startAccountLink(t.ctx, "u_owner");
    t.clock.now += 11 * 60_000;
    expect(
      await completeAccountLink(t.ctx, {
        code: "c",
        state: again.state,
        cookieState: again.state,
        error: null,
      }),
    ).toBe("expired");
    expect(t.store.data.links.size).toBe(0);
  });

  it("Discord で取りやめたら denied、Discord が失敗したら failed", async () => {
    const t = makeCtx({ fetchFn: vi.fn(async () => new Response("{}", { status: 400 })) });
    const a = await startAccountLink(t.ctx, "u");
    expect(
      await completeAccountLink(t.ctx, {
        code: null,
        state: a.state,
        cookieState: a.state,
        error: "access_denied",
      }),
    ).toBe("denied");
    const b = await startAccountLink(t.ctx, "u");
    expect(
      await completeAccountLink(t.ctx, { code: "c", state: b.state, cookieState: b.state, error: null }),
    ).toBe("failed");
  });

  it("つなぎ直すと、前のつながりは外れる（1 対 1）", async () => {
    const t = makeCtx();
    await t.store.linkAccount("u_a", { discordUserId: "d1", username: "a", linkedAt: "" });
    await t.store.linkAccount("u_b", { discordUserId: "d1", username: "a", linkedAt: "" });
    expect(t.store.data.accounts.has("u_a")).toBe(false);
    await t.store.linkAccount("u_b", { discordUserId: "d2", username: "b", linkedAt: "" });
    expect(t.store.data.links.has("d1")).toBe(false);
  });
});

describe("卓とチャンネルをつなぐ", () => {
  const T1 = { tableId: "t1", tableName: "港町卓", memberIds: ["u_owner", "u_pl"] };

  async function withCode() {
    const t = makeCtx();
    const code = t.ctx.randomToken();
    await t.store.createLinkCode(code, {
      guildId: "g1",
      channelId: "ch1",
      channelName: "卓",
      requestedBy: "d",
      expiresAt: t.clock.now + 600_000,
    });
    return { t, code };
  }

  it("卓の名前とメンバーは画面から受け取り、つないだ人はいつもメンバー。コードは一回きり", async () => {
    const { t, code } = await withCode();
    expect(await previewChannelLink(t.ctx, code)).toMatchObject({ channelName: "卓" });
    const r = await completeChannelLink(t.ctx, "u_owner", code, T1);
    expect(r).toMatchObject({
      ok: true,
      link: { ownerId: "u_owner", tableName: "港町卓", memberIds: ["u_owner", "u_pl"], channelId: "ch1" },
    });
    expect(await completeChannelLink(t.ctx, "u_owner", code, { ...T1, memberIds: ["u_pl"] })).toMatchObject({
      ok: false,
      status: 410,
    });
    expect(await previewChannelLink(t.ctx, code)).toBeNull();
    const again = await withCode();
    const r2 = await completeChannelLink(again.t.ctx, "u_owner", again.code, { ...T1, memberIds: ["u_pl"] });
    expect(r2.ok && r2.link.memberIds).toEqual(["u_owner", "u_pl"]);
  });

  it("別の人がつないだ卓は奪えず、コードも使われない", async () => {
    const { t, code } = await withCode();
    linkTable(t.store, { channelId: "ch_other" });
    expect(await completeChannelLink(t.ctx, "u_pl", code, T1)).toMatchObject({ ok: false, status: 403 });
    expect(t.store.data.tables.get("t1")?.ownerId).toBe("u_owner");
    expect(await previewChannelLink(t.ctx, code)).not.toBeNull();
  });

  it("期限切れのコードは使えない", async () => {
    const { t, code } = await withCode();
    t.clock.now += 11 * 60_000;
    expect(await previewChannelLink(t.ctx, code)).toBeNull();
    expect(await completeChannelLink(t.ctx, "u_owner", code, T1)).toMatchObject({ ok: false, status: 410 });
  });

  it("1 つのチャンネルには 1 つの卓。別の卓をつなぐと前の卓は外れる", async () => {
    const { t, code } = await withCode();
    linkTable(t.store, { tableId: "t0" });
    await completeChannelLink(t.ctx, "u_owner", code, T1);
    expect([...t.store.data.tables.keys()]).toEqual(["t1"]);
  });

  it("つながりはメンバーだけが読め、持ち主が開くとメンバーと卓名を今に合わせる。外せるのは持ち主だけ", async () => {
    const t = makeCtx();
    linkTable(t.store);
    expect(await tableStatus(t.ctx, "u_x", "t1")).toBeNull();
    expect(
      await tableStatus(t.ctx, "u_pl", "t1", { memberIds: ["u_pl"], tableName: "乗っ取り" }),
    ).toMatchObject({ linked: true, isOwner: false });
    expect(t.store.data.tables.get("t1")?.tableName).toBe("港町卓");
    await tableStatus(t.ctx, "u_owner", "t1", {
      memberIds: ["u_owner", "u_pl", "u_new"],
      tableName: "港町卓 2",
    });
    expect(t.store.data.tables.get("t1")).toMatchObject({
      tableName: "港町卓 2",
      memberIds: ["u_owner", "u_pl", "u_new"],
    });
    expect(await unlinkTable(t.ctx, "u_pl", "t1")).toBe(false);
    expect(await unlinkTable(t.ctx, "u_owner", "t1")).toBe(true);
    expect(await tableStatus(t.ctx, "u_x", "t1")).toMatchObject({ linked: false });
  });
});
