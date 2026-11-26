import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEMS } from "../../../data/systems";
import {
  memoryScenarioStore,
  taltoToDirectory,
  toDirectoryDoc,
  type ScenarioStore,
} from "../../../lib/scenario-directory";
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

afterEach(() => {
  setScenarioStoreForTest(null);
  vi.restoreAllMocks();
});

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

describe("GET /api/scenarios の問い合わせの読み方", () => {
  const ids = (body: { items: { id: string }[] }) => body.items.map((s) => s.id);
  const useEntries = (n: number) =>
    setScenarioStoreForTest(memoryScenarioStore(Array.from({ length: n }, (_, i) => entry(i))));

  it("一覧を返すときは、短い間だけ使い回してよいと伝える", async () => {
    useEntries(3);

    const res = await GET(new Request("http://test/api/scenarios"));

    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=300");
  });

  it("全体の件数も返す", async () => {
    useEntries(80);

    expect((await get("?limit=5")).total).toBe(80);
  });

  it.each([
    ["負の数", "-5"],
    ["小数", "1.5"],
    ["数でない文字", "abc"],
    ["空", ""],
  ])("読み飛ばす件数が%sなら、先頭から返す", async (_label, offset) => {
    useEntries(10);

    const body = await get(`?limit=1&offset=${offset}`);

    expect(ids(body)).toEqual(["sc_talto_t0"]);
  });

  it("読み飛ばす件数は 1000 件までに抑える", async () => {
    useEntries(1005);

    const body = await get("?limit=1&offset=5000");

    expect(ids(body)).toEqual(["sc_talto_t1000"]);
  });

  it("件数に 0 を指定したら 1 件だけ返す", async () => {
    useEntries(10);

    expect((await get("?limit=0")).items).toHaveLength(1);
  });

  it("件数に数でない値を指定したら、1 ページ分（30 件）を返す", async () => {
    useEntries(80);

    expect((await get("?limit=abc")).items).toHaveLength(30);
  });

  it("ID を指定したら、言葉の条件より ID を優先して、その順に返す", async () => {
    useEntries(10);

    const body = await get("?ids=sc_talto_t5,sc_talto_t2&q=存在しない言葉");

    expect(ids(body)).toEqual(["sc_talto_t5", "sc_talto_t2"]);
  });

  it("ID の前後の空白と空の欄は無視する", async () => {
    useEntries(10);

    const body = await get(`?ids=${encodeURIComponent(" sc_talto_t1 ,, ")}`);

    expect(ids(body)).toEqual(["sc_talto_t1"]);
  });

  it("ID は先頭の 50 件までしか探さない", async () => {
    useEntries(60);
    const many = Array.from({ length: 60 }, (_, i) => `sc_talto_t${i}`).join(",");

    const body = await get(`?ids=${many}`);

    expect(body.items).toHaveLength(50);
    expect(ids(body).at(-1)).toBe("sc_talto_t49");
  });

  it("ID が空の欄だけなら、ふつうの一覧を返す", async () => {
    useEntries(3);

    const body = await get("?ids=,,");

    expect(body.total).toBe(3);
  });

  it("共有シナリオ一覧の問い合わせが失敗したら 502 を返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: ScenarioStore = {
      byIds: async () => {
        throw new Error("firestore down");
      },
      withGrams: async () => {
        throw new Error("firestore down");
      },
      page: async () => {
        throw new Error("firestore down");
      },
    };
    setScenarioStoreForTest(failing);

    const res = await GET(new Request("http://test/api/scenarios"));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });
});
