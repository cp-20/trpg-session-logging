import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { AcceptShareError, mergeAcceptedShare, validateSharedPayload } from "./accept-share";
import type { State } from "../types";

/** 他人（u_host）が共有した、seed の最初のログ */
function fixture() {
  const state = seedState();
  const original = Object.values(state.logs)[0]!;
  const log = { ...structuredClone(original), id: "lg_shared", slug: "slug_shared", ownerId: "u_host" };
  const scenario = { ...structuredClone(state.scenarios[log.scenarioId!]!), id: "sc_shared" };
  log.scenarioId = scenario.id;
  const users = { u_host: { id: "u_host", name: "ホスト", color: "#336699", accounts: [] } };
  return { state, share: { log, users, scenario }, expected: { slug: "slug_shared", ownerId: "u_host" } };
}

describe("validateSharedPayload（受け取った中身の形を確かめる）", () => {
  it("保存の形に合う共有は通す", () => {
    const { state, share } = fixture();

    expect(validateSharedPayload(share, state.me)?.log.id).toBe("lg_shared");
  });

  it.each([
    ["中身がない", null],
    ["ログがない", { users: {} }],
    ["ログの id が文字でない", { log: { id: 1 }, users: {} }],
    ["ログの形が壊れている", { log: { id: "x", players: "壊れた" }, users: {} }],
  ])("%s ものは null", (_label, payload) => {
    expect(validateSharedPayload(payload, "u_me")).toBeNull();
  });
});

describe("mergeAcceptedShare（自分の記録に入れる）", () => {
  it("新しい記録として足し、自分を参加者に入れる", () => {
    const { state, share, expected } = fixture();

    mergeAcceptedShare(state, share, expected);

    expect(state.logs.lg_shared?.ownerId).toBe("u_host");
    expect(state.logs.lg_shared?.players[state.me]).toEqual({
      linked: true,
      hidden: state.prefs.hideSelfOnShare,
      characterIds: [],
    });
    expect(state.users.u_host?.name).toBe("ホスト");
    expect(state.scenarios.sc_shared).toBeDefined();
  });

  it("同じ番号の自分の記録があれば、上書きせずに断る", () => {
    const { state, share, expected } = fixture();
    const mine = Object.values(state.logs).find((l) => l.ownerId === state.me)!;
    const before = structuredClone(state);

    expect(() =>
      mergeAcceptedShare(state, { ...share, log: { ...share.log, id: mine.id } }, expected),
    ).toThrow(AcceptShareError);
    expect(state).toEqual(before);
  });

  it("同じ共有（slug と持ち主が同じ）をもう一度受け取ったときは、新しい中身に入れ替える", () => {
    const { state, share, expected } = fixture();
    mergeAcceptedShare(state, share, expected);

    mergeAcceptedShare(
      state,
      { ...share, log: { ...share.log, note: "更新後" } as typeof share.log },
      expected,
    );

    expect((state.logs.lg_shared as unknown as { note?: string }).note).toBe("更新後");
  });

  it("知っている人の名前や、自分のシナリオは書き換えない", () => {
    const { state, share, expected } = fixture();
    const known = Object.keys(state.users).find((id) => id !== state.me)!;
    const knownName = state.users[known]!.name;
    const myScenarioId = Object.keys(state.scenarios)[0]!;
    const myScenario = structuredClone(state.scenarios[myScenarioId]);

    mergeAcceptedShare(
      state,
      {
        ...share,
        users: { ...share.users, [known]: { id: known, name: "なりすまし", color: "#000000", accounts: [] } },
        scenario: { ...share.scenario, id: myScenarioId, title: "書き換え" },
      },
      expected,
    );

    expect(state.users[known]!.name).toBe(knownName);
    expect(state.scenarios[myScenarioId]).toEqual(myScenario);
  });

  it("自分自身の表示は、共有の中身で書き換えない", () => {
    const { state, share, expected } = fixture();
    const me = structuredClone(state.users[state.me]);

    mergeAcceptedShare(
      state,
      { ...share, users: { [state.me]: { id: state.me, name: "別人", color: "#000000", accounts: [] } } },
      expected,
    );

    expect(state.users[state.me]).toEqual(me);
  });

  it.each([
    ["slug が招待と違う", { slug: "other", ownerId: "u_host" }],
    ["持ち主が招待を出した人と違う", { slug: "slug_shared", ownerId: "u_other" }],
  ])("%s 中身は断る", (_label, expected) => {
    const { state, share } = fixture();

    expect(() => mergeAcceptedShare(state as State, share, expected)).toThrow(AcceptShareError);
  });
});
