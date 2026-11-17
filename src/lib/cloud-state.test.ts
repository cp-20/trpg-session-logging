import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { cloudStateProjection, publicLogProjection, sharedLogProjection, sharedCharacterProjection, splitCloudData } from "./cloud-state";

describe("cloud boundaries", () => {
  it("round-trips multiple chunks including surrogate boundaries and rejects oversized data", () => {
    const value = { text: "あ😀".repeat(100_000) };
    const chunks = splitCloudData(value);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).length < 1_048_576)).toBe(true);
    expect(chunks.every((chunk) => new TextDecoder().decode(new TextEncoder().encode(chunk)) === chunk)).toBe(true);
    expect(JSON.parse(chunks.join(""))).toEqual(value);
    expect(() => splitCloudData("x".repeat(24_000_000))).toThrow("大きさ");
  });

  it("strips secret channels, notes, secret rolls and personal account data from shared payloads", () => {
    const state = seedState();
    const source = Object.values(state.logs).find((log) => log.hasLog)!;
    const log = structuredClone(source);
    log.scope = "public";
    log.scenarioId = undefined;
    log.players[state.me] = { linked: true, hidden: true, characterIds: [] };
    const projected = sharedLogProjection(log, state);
    expect(projected.log.channels.every((channel) => !channel.secret)).toBe(true);
    expect(projected.log.channels.flatMap((channel) => channel.msgs).every((message) => message.type !== "note" && !message.roll?.secret)).toBe(true);
    expect(projected.log.players[state.me]).toBeUndefined();
    expect(projected.log.importedFrom).toBeUndefined();
    expect(Object.values(projected.users).every((user) => user.accounts.length === 0 && !user.email && !user.bio)).toBe(true);
    expect(state.logs[source.id]).toEqual(source);
  });

  it("never publishes unknown policies as public and sanitizes private cloud copies without changing local logs", () => {
    const state = seedState();
    const log = Object.values(state.logs)[0];
    log.scope = "public";
    log.scenarioId = "missing-policy";
    expect(publicLogProjection(log, state)).toBeNull();
    Object.values(state.characters)[0].sessions[0].rolls.push({ cmd: "secret", skill: "secret", dice: "1D100", result: "hidden", secret: true });
    const original = JSON.stringify(state);
    const projected = cloudStateProjection(state);
    expect(Object.values(projected.logs).flatMap((entry) => entry.channels).every((channel) => !channel.secret)).toBe(true);
    expect(Object.values(projected.logs).flatMap((entry) => entry.channels).flatMap((channel) => channel.msgs).every((message) => message.type !== "note" && !message.roll?.secret)).toBe(true);
    expect(Object.values(projected.characters).flatMap((character) => character.sessions).flatMap((session) => session.rolls).every((roll) => !roll.secret)).toBe(true);
    expect(JSON.stringify(state)).toBe(original);
  });

  it("physically removes character fields excluded from sharing", () => {
    const state = seedState();
    const character = Object.values(state.characters)[0];
    character.share = { ...character.share, includeProfile: false, includeStats: false, includeGrowth: false, includeSessions: true };
    const projection = sharedCharacterProjection(character, state);
    expect(projection.character.bio).toBe("");
    expect(projection.character.tags).toEqual([]);
    expect(projection.character.stats).toEqual({});
    expect(projection.character.growth).toEqual([]);
    expect(projection.character.sessions.every((session) => Object.keys(session.delta).length === 0 && !session.memo && session.rolls.every((roll) => !roll.secret))).toBe(true);
    expect(projection.owner.accounts).toEqual([]);
    expect(projection.owner.email).toBeUndefined();
    expect(projection.character.import).toBeUndefined();
  });
});
