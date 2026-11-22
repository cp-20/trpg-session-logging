import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import {
  applyJoinedTable,
  findLocalInvite,
  findUserByRef,
  handleTakenLocally,
  inviteExpiresAt,
  isInviteOpen,
  memberCandidates,
  mergeTableJoins,
  userHref,
} from "./people";

describe("people", () => {
  it("プロフィールの URL は ID、ID がない人は uid。どちらからも人を引ける", () => {
    const s = seedState();
    const sora = s.users.u_sora!;
    expect(sora.handle).toBe("sora");
    expect(userHref(sora)).toBe("/users/sora");
    expect(userHref({ id: "abc" })).toBe("/users/abc");
    expect(findUserByRef(s, "sora")?.id).toBe("u_sora");
    expect(findUserByRef(s, "u_sora")?.id).toBe("u_sora");
    expect(findUserByRef(s, "nobody")).toBeUndefined();
  });

  it("自分以外が使っている ID を使用中とみなす", () => {
    const s = seedState();
    expect(handleTakenLocally(s, "sora")).toBe(true);
    expect(handleTakenLocally(s, s.users[s.me]!.handle!)).toBe(false);
    expect(handleTakenLocally(s, "brand_new")).toBe(false);
  });

  it("招待の期限: 7日・30日・無期限", () => {
    const now = Date.parse("2026-11-22T00:00:00Z");
    expect(inviteExpiresAt("7d", now)).toBe("2026-11-29T00:00:00.000Z");
    expect(inviteExpiresAt("none", now)).toBeUndefined();
    expect(isInviteOpen({ expiresAt: "2026-11-21T00:00:00Z" }, now)).toBe(false);
    expect(isInviteOpen({}, now)).toBe(true);
    expect(isInviteOpen(undefined, now)).toBe(false);
  });

  it("加わった人を卓に足し、二重に足さない", () => {
    const s = seedState();
    const before = s.tables.t_shiosai!.memberIds.length;
    const joined = [{ id: "u_new", handle: "newbie", name: "新しい人", color: "#123456", accounts: [] }];
    expect(mergeTableJoins(s, "t_shiosai", joined)).toBe(true);
    expect(s.tables.t_shiosai!.memberIds).toHaveLength(before + 1);
    expect(s.users.u_new?.handle).toBe("newbie");
    expect(mergeTableJoins(s, "t_shiosai", joined)).toBe(false);
  });

  it("招待で加わった側に、卓と顔ぶれが入る", () => {
    const s = seedState();
    s.me = "u_aoi";
    const id = applyJoinedTable(s, {
      ownerId: "u_x",
      tableId: "t_far",
      tableName: "遠い卓",
      image: "",
      members: [{ uid: "u_x", name: "X", handle: "x_1", color: "#000000", image: "" }],
    });
    expect(s.tables[id]?.memberIds).toEqual(["u_x", "u_aoi"]);
    expect(s.users.u_x?.handle).toBe("x_1");
  });

  it("サンプルの招待リンクは、自分が入っていない卓を開く", () => {
    const s = seedState();
    const t = findLocalInvite(s, "demoinvite0000000000000000000000yomatsuri");
    expect(t?.id).toBe("t_yomatsuri");
    expect(t?.memberIds).not.toContain(s.me);
  });

  it("参加者の候補は自分の卓のメンバーだけで、指定した卓のメンバーが先", () => {
    const s = seedState();
    const ids = memberCandidates(s, "t_shiosai");
    expect(ids).not.toContain(s.me);
    expect(ids.slice(0, 3).sort()).toEqual(["u_natsu", "u_rin", "u_sora"].sort());
    // 自分が入っていない卓だけのメンバー（夜祭班のあおいなどは別の卓で一緒）は、候補に出ない人もいる
    const mine = Object.values(s.tables).filter((t) => t.memberIds.includes(s.me));
    const known = new Set(mine.flatMap((t) => t.memberIds));
    expect(ids.every((id) => known.has(id))).toBe(true);
  });
});
