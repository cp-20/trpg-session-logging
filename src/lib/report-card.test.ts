import { describe, expect, it } from "vitest";
import { seedState } from "../data/seed";
import { parseReportCard, REPORT_CAST_MAX, reportCardFromSession } from "./report-card";

describe("卓報告カードの中身", () => {
  it("記録から、題名・システム・日・GM と PC・PL の顔ぶれを作り、続く値（SAN など）は載せない", () => {
    const state = seedState();
    const log = Object.values(state.logs).find(
      (l) => l.hasLog && Object.values(l.players).some((p) => p.characterIds.length > 0),
    )!;
    const card = reportCardFromSession(log, state);
    expect(card.title.length).toBeGreaterThan(0);
    expect(card.when).not.toBe("");
    expect(card.gm?.person.name).toBe(state.users[log.ownerId]!.name);
    expect(card.cast.some((c) => c.pc)).toBe(true);
    // 記録として残る 1 枚なので、遊んだ日は年から書く
    expect(card.when).toMatch(/^\d{4}年/);
    // PC には職業などの紹介を 1 行添える（キャラクターの archetype）
    const withNote = card.cast.find((c) => c.pc?.note);
    if (withNote)
      expect(state.characters[withNote.pc!.seed]?.archetype).toContain(withNote.pc!.note!.replace(/…$/, ""));
    // GM は顔ぶれに重ねない
    expect(card.cast.some((c) => c.pl.seed === (state.users[log.ownerId]!.handle ?? log.ownerId))).toBe(
      false,
    );
    expect(JSON.stringify(card)).not.toMatch(/SAN|san/);
  });

  it("送られてきた中身は確かめ直し、外の URL の画像・多すぎる顔ぶれ・おかしな色は捨てる", () => {
    const person = (n: string) => ({ name: n, seed: n, image: "https://evil.example/a.png" });
    const card = parseReportCard({
      title: "深淵の呼び声",
      when: "9月26日(土)",
      system: { name: "クトゥルフ神話TRPG 7版", color: "red;background:url(x)" },
      gm: { label: "KP", person: { name: "みかん", seed: "mikan", image: "data:image/png;base64,AAAA" } },
      cast: Array.from({ length: 10 }, (_, i) => ({ pc: person(`PC${i}`), pl: person(`PL${i}`) })),
    })!;
    expect(card.cast).toHaveLength(REPORT_CAST_MAX);
    expect(card.cast[0]!.pc!.image).toBeUndefined();
    expect(card.gm?.person.image).toBe("data:image/png;base64,AAAA");
    expect(card.system).toBeUndefined();
  });

  it("題名か日付が無いものは描かない", () => {
    expect(parseReportCard({ when: "9月26日(土)", cast: [] })).toBeNull();
    expect(parseReportCard({ title: "x", cast: [] })).toBeNull();
    expect(parseReportCard("nope")).toBeNull();
  });
});
