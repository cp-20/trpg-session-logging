import { describe, expect, it } from "vitest";
import catalogFile from "../../scripts/data/talto-catalog.json";
import { SYSTEMS } from "../data/systems";
import {
  directoryToScenario,
  docFields,
  gramsOf,
  isSharedByUser,
  memoryScenarioStore,
  parseDirectoryDoc,
  queryGrams,
  scenarioFacts,
  searchScenarios,
  sharedScenarioDoc,
  taltoIdOf,
  taltoToDirectory,
  toDirectoryDoc,
  USER_RANK,
  withoutKnown,
  type DirectoryQuery,
  type DirectoryScenario,
} from "./scenario-directory";
import { decodeTaltoCatalog, encodeTaltoCatalog, type TaltoCatalogEntry } from "./talto-scenarios";
import type { Scenario } from "../types";

const entry = (over: Partial<TaltoCatalogEntry>): TaltoCatalogEntry => ({
  id: "x",
  title: "題名",
  author: "作者",
  systemSlug: "call_of_cthulhu_6th",
  systemName: "クトゥルフ神話TRPG",
  playersMin: 2,
  playersMax: 3,
  hours: 4,
  ...over,
});

// 共有シナリオ一覧の順はよく遊ばれている順
const entries = [
  entry({ id: "a", title: "灯台守の夜", author: "しおかぜ堂" }),
  entry({
    id: "b",
    title: "夜の灯台",
    author: "べつの人",
    systemSlug: "emoklore",
    systemName: "エモクロアTRPG",
  }),
  entry({ id: "c", title: "灯台", author: "みなと", systemSlug: "brand_new", systemName: "新しいTRPG" }),
  entry({ id: "d", title: "霧の駅", author: "灯台研究会" }),
];
const talto = entries.map((e) => taltoToDirectory(e, SYSTEMS));
const userAdded: DirectoryScenario = {
  id: "sc_u1",
  title: "港の灯台",
  author: "ゆう",
  systemId: "coc6",
  source: "manual",
  tags: ["クローズド"],
  addedByUid: "u_yu",
};
const docs = [
  ...talto.map((s, i) => toDirectoryDoc(s, i, SYSTEMS)),
  toDirectoryDoc(userAdded, USER_RANK, SYSTEMS),
];
const store = memoryScenarioStore(docs);
const search = (q: DirectoryQuery) => searchScenarios(store, q, SYSTEMS);
const ids = (r: { items: DirectoryScenario[] }) => r.items.map((s) => s.id);

describe("TALTO の一覧ファイルの形", () => {
  it("書き出して読み戻すと同じ行に戻り、システムは 1 回だけ持つ", () => {
    const text = encodeTaltoCatalog(entries, "2026-11-23");
    const file = JSON.parse(text);
    expect(file.systems).toHaveLength(3);
    expect(decodeTaltoCatalog(file)).toEqual(entries);
    expect(text.split("\n").filter((l) => l.startsWith('["'))).toHaveLength(4);
  });
  it("同梱の TALTO の一覧は読めて、ID の重複がなく、表紙画像や本文を持たない", () => {
    const rows = decodeTaltoCatalog(catalogFile);
    expect(rows.length).toBeGreaterThan(1000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(JSON.stringify(catalogFile)).not.toMatch(/firebasestorage|description/);
  });
});

describe("taltoToDirectory", () => {
  it("卓譜のシステムに結び、結べないものは汎用にして配布元のカテゴリ名を残す", () => {
    expect(talto.map((s) => s.systemId)).toEqual(["coc6", "emoklore", "general", "coc6"]);
    expect(talto[0]).toMatchObject({
      id: "sc_talto_a",
      sourceUrl: "https://talto.cc/projects/a",
      source: "talto",
    });
    expect(talto[2]!.systemLabel).toBe("新しいTRPG");
    expect(talto[0]!.addedByUid).toBeUndefined();
  });
});

describe("切れ端", () => {
  it("文書は正規化した各欄の 1 文字と 2 文字の切れ端を持ち、欄をまたがない", () => {
    expect(gramsOf(["とうだい", "ab"]).sort()).toEqual(
      ["a", "ab", "b", "い", "うだ", "だ", "だい", "と", "とう", "う"].sort(),
    );
    const d = docs.find((x) => x.id === "sc_u1")!;
    expect(d.t["灯台"]).toBe(true);
    expect(d.t["くろ"]).toBe(true); // キーワードはひらがなに直る
    expect(d.sysRank).toBe("coc6:1000000000");
  });
  it("問い合わせはひらがなだけの切れ端を後回しにし、1 文字の言葉はその字を使う", () => {
    expect(queryGrams("灯台の夜")).toEqual(["灯台", "台の", "の夜"]);
    expect(queryGrams("夜")).toEqual(["夜"]);
    expect(queryGrams("あいう 灯")).toEqual(["灯", "あい", "いう"]);
    expect(queryGrams("  ")).toEqual([]);
  });
});

describe("searchScenarios", () => {
  it("タイトルの完全一致・先頭・途中、ほかの欄の順。同じ強さなら共有シナリオ一覧の順で、利用者が足したものも並ぶ", async () => {
    expect(ids(await search({ q: "灯台" }))).toEqual([
      "sc_talto_c",
      "sc_talto_a",
      "sc_talto_b",
      "sc_u1",
      "sc_talto_d",
    ]);
  });
  it("カタカナ・ひらがな、全角・半角の違いを無視し、キーワードやシステム名でも見つかる", async () => {
    expect(ids(await search({ q: "シオカゼ" }))).toEqual(["sc_talto_a"]);
    expect(ids(await search({ q: "くろーずど" }))).toEqual(["sc_u1"]);
    expect(ids(await search({ q: "エモクロア" }))).toEqual(["sc_talto_b"]);
  });
  it("空白で区切った言葉は、みなどこかにあるものだけ", async () => {
    expect(ids(await search({ q: "灯台 ゆう" }))).toEqual(["sc_u1"]);
  });
  it("言葉で探すときは遊んでいるシステムのものを先に。入力が空ならよく遊ばれている順のページ", async () => {
    expect(ids(await search({ q: "の", prefer: ["emoklore"] }))[0]).toBe("sc_talto_b");
    const first = await search({ limit: 2 });
    expect(ids(first)).toEqual(["sc_talto_a", "sc_talto_b"]);
    expect(first.total).toBe(5);
  });
  it("システムで絞り、続きを読める", async () => {
    const first = await search({ q: "灯台", systemId: "coc6", limit: 2 });
    expect(ids(first)).toEqual(["sc_talto_a", "sc_u1"]);
    expect(first.total).toBe(3);
    expect(ids(await search({ q: "灯台", systemId: "coc6", offset: 2 }))).toEqual(["sc_talto_d"]);
    expect(ids(await search({ systemId: "emoklore" }))).toEqual(["sc_talto_b"]);
  });
  it("利用者が TALTO の作品を足していたら、TALTO の方だけを出す", async () => {
    const dup = toDirectoryDoc(
      { ...userAdded, id: "sc_u2", title: "灯台守の夜", sourceUrl: "https://talto.cc/projects/a" },
      USER_RANK,
      SYSTEMS,
    );
    const r = await searchScenarios(memoryScenarioStore([...docs, dup]), { q: "灯台守" }, SYSTEMS);
    expect(ids(r)).toEqual(["sc_talto_a"]);
  });
});

describe("写しと共有の文書", () => {
  it("人数と時間を短く出す", () => {
    expect(scenarioFacts({ playersMin: 2, playersMax: 3, hours: 4 })).toEqual(["2〜3人", "〜4時間"]);
    expect(scenarioFacts({ playersMin: 1, playersMax: 1, hours: null })).toEqual(["ソロ"]);
    expect(scenarioFacts({ playersMin: 3, playersMax: null, hours: 0 })).toEqual(["3人〜"]);
    expect(scenarioFacts({})).toEqual([]);
  });
  it("TALTO の作品の写しは TALTO が出所で、利用者の書き換える欄を持たない", () => {
    const sc = directoryToScenario(talto[2]!, SYSTEMS);
    expect(sc).toMatchObject({ id: "sc_talto_c", source: "talto", addedBy: "system", systemId: "general" });
    expect(sc.addedByUid).toBeUndefined();
    expect(sc.tags).toEqual(["新しいTRPG", "2〜3人", "〜4時間"]);
  });
  it("TALTO の ID は シナリオ ID か配布ページの URL から分かる", () => {
    expect(taltoIdOf({ id: "sc_talto_a" })).toBe("a");
    expect(taltoIdOf({ id: "sc_1", sourceUrl: "https://talto.cc/projects/b-_X?x=1" })).toBe("b-_X");
    expect(taltoIdOf({ id: "sc_talto_" })).toBeNull();
  });
  it("自分が足したものだけを共有シナリオ一覧に出し、文書は決まった欄だけを持つ", () => {
    const mine = directoryToScenario(userAdded, SYSTEMS) as Scenario;
    expect(isSharedByUser(mine, "u_yu")).toBe(true);
    expect(isSharedByUser(mine, "u_other")).toBe(false);
    expect(isSharedByUser({ ...mine, id: "sc_talto_a" }, "u_yu")).toBe(false);
    const doc = sharedScenarioDoc(mine, "u_yu");
    expect(Object.keys(docFields(doc)).sort()).toEqual(
      ["addedByUid", "author", "rank", "source", "sysRank", "systemId", "t", "tags", "title"].sort(),
    );
    expect(doc.rank).toBe(USER_RANK);
    expect(parseDirectoryDoc("sc_u1", docFields(doc) as Record<string, unknown>)).toEqual(doc);
    expect(parseDirectoryDoc("sc_bad", { title: "x" })).toBeNull();
  });
});

describe("withoutKnown", () => {
  it("同じ ID・同じ TALTO の作品だけを除き、TALTO でないもの同士は ID で比べる", () => {
    const known = [{ id: "sc_local" }, { id: "sc_x", sourceUrl: "https://talto.cc/projects/a" }];
    const items = [talto[0]!, talto[1]!, userAdded, { ...userAdded, id: "sc_local" }];
    expect(withoutKnown(known, items).map((s) => s.id)).toEqual(["sc_talto_b", "sc_u1"]);
  });
});
