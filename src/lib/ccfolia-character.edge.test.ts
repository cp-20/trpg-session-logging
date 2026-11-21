// @vitest-environment jsdom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseCcfoliaCharacterJson, parseCcfoliaCharacterZip } from "./ccfolia-character";

const parse = (v: unknown) => parseCcfoliaCharacterJson(JSON.stringify(v));
const statsOf = (c: Record<string, unknown>) => parse({ name: "A", ...c })!.stats;

describe("parseCcfoliaCharacterJson: 入力の形", () => {
  it.each<[string, unknown]>([
    ["null", null],
    ["配列", [{ name: "A" }]],
    ["文字列", "A"],
    ["数値", 1],
    ["名前が文字列でない", { name: 1 }],
    ["characters が配列", { characters: [{ name: "A" }] }],
    ["characters の中身が使えない", { characters: { a: null, b: "B", c: { name: 2 }, d: { name: " " } } }],
    ["kind が character でない data", { kind: "item", data: { name: "A" } }],
    ["kind が無い data", { data: { name: "A" } }],
    ["data が配列", { kind: "character", data: [{ name: "A" }] }],
  ])("%s は null", (_label, v) => {
    expect(parse(v)).toBeNull();
  });

  it("使えない候補を飛ばして最初の名前付きキャラを採る", () => {
    expect(
      parse({ characters: { a: null, b: { name: 2 }, c: { name: "  " }, d: { name: "D" } } })?.name,
    ).toBe("D");
  });

  it("clipboard → characters → 単体 の順に優先する", () => {
    expect(
      parse({ name: "単体", characters: { x: { name: "一覧" } }, kind: "character", data: { name: "コマ" } })
        ?.name,
    ).toBe("コマ");
    expect(parse({ name: "単体", characters: { x: { name: "一覧" } } })?.name).toBe("一覧");
  });

  it("文字列以外の memo/commands/imageId/color/iconUrl は使わない", () => {
    expect(
      parse({
        name: "A",
        memo: 123,
        commands: ["CCB"],
        imageId: 5,
        color: 0x123456,
        iconUrl: ["https://a.example/x.png"],
      }),
    ).toEqual({
      name: "A",
      color: undefined,
      memo: undefined,
      systemId: undefined,
      stats: {},
      image: undefined,
      imageId: undefined,
    });
  });

  it("名前は前後の空白を残す", () => {
    expect(parse({ name: " A " })?.name).toBe(" A ");
  });
});

describe("parseCcfoliaCharacterJson: 色と画像 URL", () => {
  it.each<[string, string | undefined]>([
    ["#a1B2c3", "#a1B2c3"],
    ["#12345", undefined],
    ["#1234567", undefined],
    ["x#123456", undefined],
    ["#12345g", undefined],
    ["123456", undefined],
  ])("color %s", (color, expected) => {
    expect(parse({ name: "A", color })?.color).toBe(expected);
  });

  it("文字列以外の color は形が合っても使わない", () => {
    expect(parse({ name: "A", color: ["#123456"] })?.color).toBeUndefined();
  });

  it.each<[string, boolean]>([
    ["https://a.example/x.png", true],
    ["HTTPS://a.example/x.png", true],
    ["http://a.example/x.png", false],
    ["xhttps://a.example/x.png", false],
    ["data:image/png;base64,AQI=", true],
    ["data:image/jpeg;base64,AQI=", true],
    ["data:image/gif;base64,AQI=", true],
    ["data:image/webp;base64,AQI=", true],
    ["data:image/jpg;base64,AQI=", false],
    ["data:image/svg+xml;base64,AQI=", false],
    ["data:image/png,AQI=", false],
    ["xdata:image/png;base64,AQI=", false],
  ])("iconUrl %s", (iconUrl, ok) => {
    expect(parse({ name: "A", iconUrl })?.image).toBe(ok ? iconUrl : undefined);
  });
});

describe("parseCcfoliaCharacterJson: システム推定", () => {
  it.each<[string, string, string | undefined]>([
    ["", "CCB<=50", "coc6"],
    ["", "ccb<=50", "coc6"],
    ["クトゥルフ6版", "", "coc6"],
    ["クトゥルフ神話TRPG 第 6 版", "", "coc6"],
    ["CoC6", "", "coc6"],
    ["CoC 6", "", "coc6"],
    ["coc  6", "", "coc6"],
    ["", "CC<=50", "coc7"],
    ["", "CC 50", "coc7"],
    ["CoC7", "", "coc7"],
    ["CoC 7", "", "coc7"],
    ["クトゥルフ7版", "", "coc7"],
    ["クトゥルフ神話TRPG 第 7 版", "", "coc7"],
    ["ACC<=50", "", undefined],
    ["CC", "B<=50", "coc7"],
    ["SW2.5", "", "sw25"],
    ["ソードワールド", "", "sw25"],
    ["ソード・ワールド", "", "sw25"],
    ["ソード・・ワールド", "", undefined],
    ["クトゥルフ", "", undefined],
    ["", "", undefined],
  ])("memo=%j commands=%j → %s", (memo, commands, sys) => {
    expect(parse({ name: "A", memo, commands })?.systemId).toBe(sys);
  });

  it("memo だけ・commands だけでも推定する", () => {
    expect(parse({ name: "A", memo: "CoC6" })?.systemId).toBe("coc6");
    expect(parse({ name: "A", commands: "CoC7" })?.systemId).toBe("coc7");
    expect(parse({ name: "A", memo: "メモ" })?.memo).toBe("メモ");
    expect(parse({ name: "A", memo: "" })?.memo).toBeUndefined();
  });
});

describe("parseCcfoliaCharacterJson: 数値パラメータ", () => {
  it("キー名と値の範囲(-100〜999)で拾う", () => {
    expect(
      statsOf({
        params: {
          HP: 999,
          MP: -100,
          AAA: 1000,
          BBB: -101,
          AB: 1,
          ABCD: 2,
          ABCDE: 3,
          A: 4,
          A1: 5,
          san: 6,
          DB: "1",
          STR: true,
        },
      }),
    ).toEqual({ hp: 999, mp: -100, ab: 1, abcd: 2, san: 6 });
  });

  it("1e400(Infinity)は拾わない", () => {
    expect(parseCcfoliaCharacterJson('{"name":"A","params":{"HP":1e400,"MP":-1e400}}')!.stats).toEqual({});
  });

  it.each<[string, unknown, number | undefined]>([
    ["数値", 12, 12],
    ["数値文字列", "60", 60],
    ["空白付き数値文字列", " 60 ", 60],
    ["空文字", "", undefined],
    ["空白のみ", "   ", undefined],
    ["式", "+1d4", undefined],
    ["null", null, undefined],
    ["true", true, undefined],
    ["配列", [1], undefined],
    ["範囲外でも label 形式は拾う", 5000, 5000],
  ])("label 形式の value: %s", (_label, value, expected) => {
    expect(statsOf({ status: [{ label: "SAN", value }] }).san).toBe(expected);
  });

  it("label 形式の下はそれ以上走査しない", () => {
    expect(statsOf({ status: [{ label: "X", value: "x", nested: { HP: 10 } }] })).toEqual({});
  });

  it("params / status / parameters を全て集める", () => {
    expect(
      statsOf({ params: { HP: 1 }, status: { MP: 2 }, parameters: [{ label: "Luck", value: 3 }] }),
    ).toEqual({
      hp: 1,
      mp: 2,
      luck: 3,
    });
  });

  it("配列とオブジェクトの入れ子は深さ 4 まで", () => {
    const nest = (depth: number, leaf: unknown): unknown => (depth === 0 ? leaf : [nest(depth - 1, leaf)]);
    expect(statsOf({ params: nest(4, { label: "OK", value: 1 }) })).toEqual({ ok: 1 });
    expect(statsOf({ params: nest(5, { label: "NG", value: 1 }) })).toEqual({});
    expect(statsOf({ params: { a: { b: { c: { HP: 1, d: { MP: 2, e: { SAN: 3 } } } } } } })).toEqual({
      hp: 1,
      mp: 2,
    });
  });

  it("null やプリミティブが混ざっていても落ちない", () => {
    expect(statsOf({ params: [null, 1, "x", { HP: 3 }], status: null, parameters: "HP" })).toEqual({ hp: 3 });
  });
});

describe("parseCcfoliaCharacterZip", () => {
  const pngB64 = "AQID";
  const zipOf = async (files: Record<string, string | { b64: string }>) => {
    const z = new JSZip();
    for (const [name, body] of Object.entries(files)) {
      if (typeof body === "string") z.file(name, body);
      else z.file(name, body.b64, { base64: true });
    }
    return parseCcfoliaCharacterZip(await z.generateAsync({ type: "arraybuffer" }));
  };
  const img = { b64: pngB64 };

  it.each<[string, string, string | undefined]>([
    ["拡張子なし id と png", "images/p.png", "image/png"],
    ["拡張子なし id と jpg", "images/p.jpg", "image/jpeg"],
    ["拡張子なし id と JPEG", "images/p.JPEG", "image/jpeg"],
    ["拡張子なし id と gif", "images/p.gif", "image/gif"],
    ["拡張子なし id と webp", "images/p.webp", "image/webp"],
    ["拡張子なし id と svg", "images/p.svg", undefined],
    ["images/ 以外", "other/p.png", undefined],
    ["入れ子の images/", "x/images/p.png", undefined],
    ["別名", "images/q.png", undefined],
  ])("imageId=p: %s", async (_label, file, mime) => {
    const parsed = await zipOf({ "c.json": JSON.stringify({ name: "A", imageId: "p" }), [file]: img });
    expect(parsed?.image).toBe(mime ? `data:${mime};base64,${pngB64}` : undefined);
  });

  it.each<[string, string, string | undefined]>([
    ["p.jpg", "images/p.jpg", "image/jpeg"],
    ["p.jpg.png は png", "images/p.jpg.png", "image/png"],
    ["p.gif.png は png", "images/p.gif.png", "image/png"],
    ["p.webp.png は png", "images/p.webp.png", "image/png"],
    ["p.png.gif は gif", "images/p.png.gif", "image/gif"],
    ["p.png.txt は画像ではない", "images/p.png.txt", undefined],
  ])("拡張子付き id: %s", async (_label, file, mime) => {
    const imageId = file.slice("images/".length);
    const parsed = await zipOf({ "c.json": JSON.stringify({ name: "A", imageId }), [file]: img });
    expect(parsed?.image).toBe(mime ? `data:${mime};base64,${pngB64}` : undefined);
  });

  it("拡張子付き id は拡張子を落とした名前でも探す", async () => {
    const parsed = await zipOf({
      "c.json": JSON.stringify({ name: "A", imageId: "p.png" }),
      "images/p.png.gif": img,
    });
    expect(parsed?.image).toBe(`data:image/gif;base64,${pngB64}`);
  });

  it("imageId が無ければ iconUrl の末尾(クエリ抜き)で探す", async () => {
    const parsed = await zipOf({
      "c.json": JSON.stringify({ name: "A", iconUrl: "https://a.example/files/p?v=1" }),
      "images/p.png": img,
    });
    expect(parsed?.image).toBe(`data:image/png;base64,${pngB64}`);
  });

  it("参照が無ければ images/undefined などを拾わない", async () => {
    const parsed = await zipOf({ "c.json": JSON.stringify({ name: "A" }), "images/undefined.png": img });
    expect(parsed?.image).toBeUndefined();
    const empty = await zipOf({ "c.json": JSON.stringify({ name: "A", imageId: "" }), "images/.png": img });
    expect(empty?.image).toBeUndefined();
  });

  it("images/ が無ければ iconUrl をそのまま残す", async () => {
    const parsed = await zipOf({
      "c.json": JSON.stringify({ name: "A", iconUrl: "https://a.example/p.png" }),
    });
    expect(parsed?.image).toBe("https://a.example/p.png");
  });

  it(".json 以外は読まない", async () => {
    expect(
      await zipOf({ "c.txt": JSON.stringify({ name: "A" }), "c.json.bak": JSON.stringify({ name: "B" }) }),
    ).toBeNull();
    expect(
      (await zipOf({ "c.txt": JSON.stringify({ name: "A" }), "d.json": JSON.stringify({ name: "B" }) }))
        ?.name,
    ).toBe("B");
  });
});
