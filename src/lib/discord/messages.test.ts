import { describe, expect, it } from "vitest";
import {
  decodeAction,
  encodeAction,
  plain,
  pollAnswerMessage,
  pollMessage,
  reminderMessage,
  sessionMessage,
  type DiscordMessage,
} from "./messages";
import { fmtCandidate } from "./polls";
import { samplePoll } from "./testkit";

const noMentions = (m: DiscordMessage) => expect(m.allowed_mentions).toEqual({ parse: [] });

describe("custom_id", () => {
  it("往復でき、100 文字に収まる", () => {
    const a = {
      kind: "poll-answer",
      eventId: "ev_abc123",
      candidateId: "c_9",
      value: "ng",
      page: 2,
    } as const;
    expect(decodeAction(encodeAction(a))).toEqual(a);
    expect(encodeAction(a).length).toBeLessThanOrEqual(100);
    expect(decodeAction(encodeAction({ kind: "poll-open", eventId: "e1", page: 0 }))).toEqual({
      kind: "poll-open",
      eventId: "e1",
      page: 0,
    });
  });

  it("壊れた・知らない値は読まない", () => {
    for (const id of ["", "pa:e:c:yes:0", "po:e", "po:e:-1", "pa:e:c:ok:x", "zz:e:0", "po:a b:0"])
      expect(decodeAction(id)).toBeNull();
  });
});

describe("日程調整のメッセージ", () => {
  it("候補ごとの ○△× の数と「回答する」を出し、メンションは効かせない", () => {
    const m = pollMessage(samplePoll(), { tableName: "港町卓" }, "https://takufu.test");
    expect(m.embeds?.[0]?.description).toContain("○ 1　△ 0　× 0");
    expect(m.embeds?.[0]?.description).toContain("21:00〜25:00");
    expect(m.components?.[0]?.components.map((b) => b.label)).toEqual(["回答する", "卓譜で開く"]);
    noMentions(m);
  });

  it("確定したら「回答する」を消し、確定した候補に印を付ける", () => {
    const m = pollMessage(
      samplePoll({ status: "confirmed", confirmedCandidateId: "c2" }),
      { tableName: "卓" },
      "https://t",
    );
    expect(m.components?.[0]?.components.map((b) => b.label)).toEqual(["卓譜で開く"]);
    expect(m.embeds?.[0]?.description?.split("\n")[1]).toMatch(/^\*\*確定\*\*/);
  });

  it("候補が 5 つまでなら 1 ページ、6 つ以上は 4 つずつページを送る", () => {
    const many = samplePoll({
      candidates: Array.from({ length: 9 }, (_, i) => ({
        id: `c${i}`,
        date: `2026-12-0${i + 1}`,
        startTime: "20:00",
        endTime: "23:00",
      })),
    });
    expect(pollAnswerMessage(samplePoll(), "u_pl", 0).components).toHaveLength(2);
    const p0 = pollAnswerMessage(many, "u_pl", 0);
    expect(p0.components).toHaveLength(5);
    expect(p0.components?.[4]?.components.map((b) => b.disabled)).toEqual([true, true, false]);
    const last = pollAnswerMessage(many, "u_pl", 99);
    expect(last.components).toHaveLength(2);
    expect(last.components?.[1]?.components[1]?.label).toBe("3 / 3");
    expect(last.flags).toBe(64);
  });

  it("候補の日時は日本時間で、日をまたぐと 24 を足した時刻", () => {
    expect(fmtCandidate({ id: "c", date: "2026-11-28", startTime: "21:00", endTime: "01:30" })).toBe(
      "11月28日(土) 21:00〜25:30",
    );
  });
});

describe("記録の投稿", () => {
  const base = {
    ownerId: "u",
    revoked: false,
    title: "霧の港",
    systemId: "coc7",
  } as const;

  it("匿名で読める共有ページ（公開）だけ題名を出す", () => {
    const m = sessionMessage("s1", { ...base, scope: "public" }, "https://t");
    expect(m.embeds?.[0]?.title).toBe("霧の港");
    expect(m.embeds?.[0]?.url).toBe("https://t/share/l/s1");
    noMentions(m);
  });

  it("メンバー限定・通過した人限定では、題名を出さずリンクだけにする", () => {
    for (const info of [
      { ...base, scope: "members" as const },
      { ...base, scope: "passed" as const },
    ]) {
      const m = sessionMessage("s1", info, "https://t");
      expect(JSON.stringify(m)).not.toContain("霧の港");
      expect(m.embeds).toBeUndefined();
      expect(m.components?.[0]?.components[0]?.url).toBe("https://t/share/l/s1");
    }
  });
});

describe("前日のお知らせ", () => {
  it("日本時間の日付で「あす」「今日」を決める", () => {
    const ev = {
      eventId: "e",
      tableId: "t",
      title: "第2話",
      start: Date.parse("2026-11-21T21:00:00+09:00") / 1000,
      end: Date.parse("2026-11-22T01:00:00+09:00") / 1000,
    };
    const link = { tableName: "卓", guildId: "g" };
    expect(
      reminderMessage(ev, link, "https://t", Date.parse("2026-11-20T22:00:00+09:00")).embeds?.[0]?.author
        ?.name,
    ).toBe("あすの予定です");
    expect(
      reminderMessage(ev, link, "https://t", Date.parse("2026-11-21T08:00:00+09:00"), "se1").embeds?.[0]
        ?.author?.name,
    ).toBe("今日の予定です");
    expect(reminderMessage(ev, link, "https://t", 0, "se1").components?.[0]?.components[0]?.url).toBe(
      "https://discord.com/events/g/se1",
    );
  });
});

it("利用者が書いた名前の Markdown とメンションを効かせない", () => {
  expect(plain("@everyone **太字**")).toBe("@​everyone \\*\\*太字\\*\\*");
});
