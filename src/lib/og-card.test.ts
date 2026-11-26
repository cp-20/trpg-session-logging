import { describe, expect, it } from "vitest";
import type { Character, Log } from "../types";
import type { SharedCharacterData, SharedLogData } from "./cloud-state";
import { jstEpoch } from "./format";
import {
  cardDescription,
  characterCard,
  clip,
  phraseText,
  safeImage,
  sessionCard,
  titleSize,
} from "./og-card";

const at = (d: string, t: string) => jstEpoch(d, t);

function shared(over: Partial<Log> = {}, extra: Partial<SharedLogData> = {}): SharedLogData {
  const log = {
    id: "l1",
    scenarioId: "sc1",
    systemId: "coc6",
    ownerId: "gm",
    scope: "public",
    hasLog: true,
    channels: [],
    players: {
      pl1: { linked: true, hidden: false, characterIds: [] },
      gm: { linked: true, hidden: false, characterIds: [] },
    },
    createdAt: "2026-10-01",
    sittings: [{ start: at("2026-10-17", "19:30"), end: at("2026-10-17", "23:50") }],
    slug: "s1",
    ...over,
  } as Log;
  return {
    log,
    users: {
      gm: { id: "gm", name: "かいと", color: "#123456", accounts: [] },
      pl1: { id: "pl1", name: "みお", color: "#654321", accounts: [], image: "https://example.com/a.png" },
    },
    scenario: { title: "狂気山脈" } as SharedLogData["scenario"],
    ...extra,
  };
}

describe("sessionCard", () => {
  it("GM（CoC なら KP）を先頭に、遊んだ日だけを載せる（時刻・遊んだ時間・回数は載せない）", () => {
    const card = sessionCard(shared());
    expect(card).toEqual(
      expect.objectContaining({ kind: "session", title: "狂気山脈", when: "10月17日(土)" }),
    );
    expect(Object.keys(card).sort()).toEqual(["kind", "people", "system", "title", "when"]);
    const twice = sessionCard(
      shared({
        sittings: [
          { start: at("2026-11-08", "21:00"), end: at("2026-11-09", "01:30") },
          { start: at("2026-11-15", "20:00"), end: at("2026-11-15", "23:00") },
        ],
      }),
    );
    expect(twice.kind === "session" && twice.when).toBe("11月8日(日)・15日(日)");
    if (card.kind !== "session") throw new Error();
    expect(card.people.map((p) => [p.name, p.role])).toEqual([
      ["かいと", "KP"],
      ["みお", undefined],
    ]);
    // 外の URL の画像は取りに行かない
    expect(card.people[1]!.image).toBeUndefined();
  });

  it("題名はシナリオの題名", () => {
    const scenario = { title: "狂気山脈 邪神の山嶺" } as SharedLogData["scenario"];
    expect(sessionCard(shared({}, { scenario }))).toMatchObject({ title: "狂気山脈 邪神の山嶺" });
  });

  it("名前を伏せた人・つながっていない人は出さない", () => {
    const card = sessionCard(
      shared({
        players: {
          gm: { linked: true, hidden: true, characterIds: [] },
          pl1: { linked: false, hidden: false, characterIds: [] },
        },
      }),
    );
    expect(card.kind === "session" && card.people).toEqual([]);
  });
});

describe("characterCard", () => {
  it("共有ページに出る分だけを載せる", () => {
    const character = {
      id: "c1",
      ownerId: "u1",
      name: "久遠寺 灯",
      systemId: "coc7",
      color: "#000000",
      image: "data:image/png;base64,AAAA",
      archetype: "探偵",
      bio: "",
      tags: ["冷静", " ", "猫好き"],
      stats: {},
      sessions: [{}, {}] as Character["sessions"],
      growth: [],
      share: { enabled: true, scope: "link" },
    } as unknown as Character;
    const data: SharedCharacterData = {
      character,
      owner: { id: "u1", name: "みお", color: "#111111", accounts: [] },
      publicLogs: {},
    };
    const card = characterCard(data);
    expect(card).toMatchObject({
      kind: "character",
      name: "久遠寺 灯",
      archetype: "探偵",
      tags: ["冷静", "猫好き"],
      image: "data:image/png;base64,AAAA",
      owner: { name: "みお", seed: "u1" },
    });
    expect(cardDescription(card)).toBe("クトゥルフ神話TRPG 7版 ・ 探偵 ・ PL みお");
  });
});

describe("部品", () => {
  it("safeImage は埋め込みの画像だけを通す", () => {
    expect(safeImage("data:image/jpeg;base64,xx")).toBe("data:image/jpeg;base64,xx");
    expect(safeImage("data:image/svg+xml;utf8,<svg/>")).toBe("data:image/svg+xml;utf8,<svg/>");
    expect(safeImage("http://169.254.169.254/x.png")).toBeUndefined();
    expect(safeImage("data:text/html,<p>")).toBeUndefined();
  });

  it("clip は書記素で切る", () => {
    expect(clip("あいうえお", 5)).toBe("あいうえお");
    expect(clip("あいうえおか", 5)).toBe("あいうえ…");
    expect(clip("👨‍👩‍👧👨‍👩‍👧👨‍👩‍👧", 2)).toBe("👨‍👩‍👧…");
  });

  it("titleSize は長いほど小さい", () => {
    expect(titleSize("短い")).toBeGreaterThan(
      titleSize("とても長いセッションの題名がここに入ります、さらに続く"),
    );
  });
});

describe("phraseText", () => {
  it("文節のおおよその切れ目にだけ改行の印を入れる", () => {
    const marked = (s: string) => phraseText(s).split("​");
    expect(marked("キャンペーン『終わらない夏の終わりに』第三話")).toEqual([
      "キャンペーン",
      "『終わらない",
      "夏の",
      "終わりに』",
      "第三話",
    ]);
    expect(marked("ダブルクロス The 3rd")).toEqual(["ダブルクロス The 3rd"]);
    expect(phraseText("狂気山脈").replace(/​/g, "")).toBe("狂気山脈");
  });
});
