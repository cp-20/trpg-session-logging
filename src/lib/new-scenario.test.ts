import { describe, expect, it } from "vitest";
import { newScenarioExtras, newScenarioIsPrivate, sourceFromUrl } from "./new-scenario";
import { userScenario } from "./session-scenario";

describe("シナリオを足すときの入力", () => {
  it("共有範囲は配布ページの有無で決まり、選んだらそれに従う", () => {
    expect(newScenarioIsPrivate({})).toBe(true);
    expect(newScenarioIsPrivate({ sourceUrl: "  " })).toBe(true);
    expect(newScenarioIsPrivate({ sourceUrl: "https://booth.pm/ja/items/1" })).toBe(false);
    expect(newScenarioIsPrivate({ sourceUrl: "https://booth.pm/ja/items/1", private: true })).toBe(true);
    expect(newScenarioIsPrivate({ private: false })).toBe(false);
  });

  it("配布元を URL から決める", () => {
    expect(sourceFromUrl("")).toBe("manual");
    expect(sourceFromUrl("https://x.booth.pm/items/1")).toBe("booth");
    expect(sourceFromUrl("https://talto.cc/projects/a")).toBe("talto");
    expect(sourceFromUrl("https://example.com")).toBe("url");
  });

  it("URL・キーワード・概要を整えて残し、空の欄は持たない", () => {
    expect(
      newScenarioExtras({
        title: "x",
        author: "",
        sourceUrl: " https://example.com ",
        tags: ["ホラー", " ホラー ", ""],
        description: "  ",
      }),
    ).toEqual({ source: "url", sourceUrl: "https://example.com", tags: ["ホラー"] });
  });

  it("更新の手がかりは URL があるときだけ残す", () => {
    const externalSync = { provider: "booth", url: "u", autoSync: false } as never;
    expect(newScenarioExtras({ title: "x", author: "", externalSync })).not.toHaveProperty("externalSync");
  });

  it("利用者が足すシナリオに反映される", () => {
    expect(
      userScenario({ id: "s", title: " 題 ", systemId: "coc7", uid: "u", tags: ["館"], private: false }),
    ).toMatchObject({ title: "題", tags: ["館"], source: "manual", addedByUid: "u" });
  });
});
