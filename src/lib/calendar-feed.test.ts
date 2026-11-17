import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { FEED_TOKEN_RE, buildFeedIcs, feedUrl, newFeedToken } from "./calendar-feed";

describe("calendar feed", () => {
  it("作るトークンは推測できない長さで、URL にそのまま使える", () => {
    const a = newFeedToken();
    const b = newFeedToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(FEED_TOKEN_RE);
    expect(feedUrl("https://takufu.example", a)).toBe(`https://takufu.example/api/calendar/${a}.ics`);
  });

  it("確定した予定だけを書き出し、日程調整中の候補は含めない", () => {
    const state = seedState();
    const ics = buildFeedIcs(state, "2026-11-18");
    const confirmed = Object.values(state.events).filter((e) => e.status !== "poll");
    const polls = Object.values(state.events).filter((e) => e.status === "poll");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    for (const ev of confirmed) expect(ics).toContain(`UID:${ev.id}@takufu`);
    for (const ev of polls) expect(ics).not.toContain(`UID:${ev.id}@takufu`);
  });
});
