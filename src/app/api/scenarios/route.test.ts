import { afterEach, describe, expect, it } from "vitest";
import { SYSTEMS } from "../../../data/systems";
import { memoryScenarioStore, taltoToDirectory, toDirectoryDoc } from "../../../lib/scenario-directory";
import { setScenarioStoreForTest } from "../../../server/scenario-directory";
import { GET } from "./route";

const entry = (i: number) =>
  toDirectoryDoc(
    taltoToDirectory(
      {
        id: `t${i}`,
        title: `灯台 ${i}`,
        author: "しおかぜ堂",
        systemSlug: "call_of_cthulhu_6th",
        systemName: "クトゥルフ神話TRPG",
        playersMin: null,
        playersMax: null,
        hours: null,
      },
      SYSTEMS,
    ),
    i,
    SYSTEMS,
  );
const get = async (qs: string) => (await GET(new Request(`http://test/api/scenarios${qs}`))).json();

afterEach(() => setScenarioStoreForTest(null));

describe("GET /api/scenarios", () => {
  it("件数を指定しなければ 1 ページ分（30 件）、指定すれば 50 件までを返す", async () => {
    setScenarioStoreForTest(memoryScenarioStore(Array.from({ length: 80 }, (_, i) => entry(i))));
    expect((await get("?q=灯台")).items).toHaveLength(30);
    expect((await get("")).items).toHaveLength(30);
    expect((await get("?limit=5&offset=10")).items[0].id).toBe("sc_talto_t10");
    expect((await get("?limit=500")).items).toHaveLength(50);
    expect((await get("?ids=sc_talto_t3,sc_none")).items.map((s: { id: string }) => s.id)).toEqual([
      "sc_talto_t3",
    ]);
  });
  it("共有シナリオ一覧につなげなければ 503 で答える", async () => {
    const env = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    expect((await GET(new Request("http://test/api/scenarios"))).status).toBe(503);
    if (env !== undefined) process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = env;
  });
});
