import { describe, expect, it } from "vitest";
import catalogFile from "../../scripts/data/talto-catalog.json";
import { SYSTEMS } from "../data/systems";
import {
  isAdultListing,
  decodeTaltoCatalog,
  isNonScenarioListing,
  TALTO_SYSTEM_MAP,
  taltoRowToScenario,
  taltoSystemId,
  type TaltoScenarioRow,
} from "./talto-scenarios";

const base: TaltoScenarioRow = {
  id: "abc123",
  title: "灯台守の夜",
  author: "しおかぜ堂",
  systemSlug: "call_of_cthulhu_6th",
  systemName: "クトゥルフ神話TRPG",
  playersMin: 2,
  playersMax: 3,
  hours: 4,
  url: "https://talto.cc/projects/abc123",
  thumbnail: "https://example.com/cover.png",
};

describe("taltoSystemId", () => {
  it("maps TALTO category slugs to app system ids", () => {
    expect(taltoSystemId("call_of_cthulhu_6th")).toBe("coc6");
    expect(taltoSystemId("call_of_cthulhu_7th")).toBe("coc7");
    expect(taltoSystemId("emoklore")).toBe("emoklore");
    expect(taltoSystemId("sword_world_2.5")).toBe("sw25");
    expect(taltoSystemId("murder_mystery")).toBe("madamis");
  });
  it("maps other systems to BCDice ids, but only when the system list has them", () => {
    expect(taltoSystemId("shinobigami")).toBe("ShinobiGami");
    expect(taltoSystemId("shinobigami", new Set(["ShinobiGami"]))).toBe("ShinobiGami");
    expect(taltoSystemId("shinobigami", new Set(["coc7"]))).toBeNull();
    expect(taltoSystemId("storyteller")).toBeNull();
    expect(taltoSystemId("some_new_slug", new Set(["some_new_slug"]))).toBe("some_new_slug");
  });
  it("only maps to ids that exist in the app's system list", () => {
    const known = new Set(Object.keys(SYSTEMS));
    for (const slug of Object.keys(TALTO_SYSTEM_MAP)) expect(taltoSystemId(slug, known)).not.toBeNull();
  });
});

describe("taltoRowToScenario", () => {
  it("builds a TALTO-sourced catalog row with players and time as tags", () => {
    const sc = taltoRowToScenario(base, SYSTEMS);
    expect(sc).toMatchObject({
      id: "sc_talto_abc123",
      title: "灯台守の夜",
      author: "しおかぜ堂",
      systemId: "coc6",
      source: "talto",
      sourceUrl: "https://talto.cc/projects/abc123",
      emoji: SYSTEMS.coc6!.emoji,
      addedBy: "system",
      claimedBy: null,
      tags: ["2〜3人", "〜4時間"],
    });
  });
  it("keeps the TALTO system name as the first tag when the system is unmapped", () => {
    const sc = taltoRowToScenario(
      { ...base, systemSlug: "storyteller", systemName: "ストリテラ オモテとウラのRPG" },
      SYSTEMS,
    );
    expect(sc.systemId).toBe("general");
    expect(sc.tags[0]).toBe("ストリテラ オモテとウラのRPG");
  });
  it("does not tag the catch-all その他 category", () => {
    const sc = taltoRowToScenario({ ...base, systemSlug: "other", systemName: "その他" }, SYSTEMS);
    expect(sc.tags).not.toContain("その他");
  });
  it("describes solo, open-ended and unknown player counts", () => {
    const tags = (p: Partial<TaltoScenarioRow>) =>
      taltoRowToScenario({ ...base, hours: null, ...p }, SYSTEMS).tags;
    expect(tags({ playersMin: 1, playersMax: 1 })).toEqual(["ソロ"]);
    expect(tags({ playersMin: 4, playersMax: 4 })).toEqual(["4人"]);
    expect(tags({ playersMin: 1, playersMax: null })).toEqual(["人数不問"]);
    expect(tags({ playersMin: 3, playersMax: null })).toEqual(["3人〜"]);
    expect(tags({ playersMin: null, playersMax: null })).toEqual([]);
  });
});

describe("isAdultListing", () => {
  it("detects adult markers in title, tags or description", () => {
    expect(isAdultListing({ name: "【R18】夜の館" })).toBe(true);
    expect(isAdultListing({ name: "夜の館", tags: ["R-18"] })).toBe(true);
    expect(isAdultListing({ name: "夜の館", description: "成人向けの描写を含みます" })).toBe(true);
    expect(isAdultListing({ name: "夜の館", tags: ["クローズド"], description: "R15 程度の描写" })).toBe(
      false,
    );
  });
});

describe("isNonScenarioListing", () => {
  it("drops data packs and stream overlays but keeps scenarios and trial editions", () => {
    expect(isNonScenarioListing("『囁忌』追加エネミーデータ集｢未知引忌｣")).toBe(true);
    expect(isNonScenarioListing("［配信・録画画面素材］サンチゼロ")).toBe(true);
    expect(isNonScenarioListing("『午前零時のマスターピース』無料お試し版")).toBe(false);
    expect(isNonScenarioListing("おにロリを監視するソロジャーナル")).toBe(false);
  });
});

describe("同梱の TALTO の一覧", () => {
  it("成人向けやシナリオ以外の出品を持たない", () => {
    const rows = decodeTaltoCatalog(catalogFile);
    expect(rows.some((r) => isAdultListing({ name: r.title }))).toBe(false);
    expect(rows.some((r) => isNonScenarioListing(r.title))).toBe(false);
  });
});
