// @vitest-environment jsdom
/**
 * ファイル・ZIP からの取り込み (Udonarium XML / 画像の解決 / CCFOLIA / ログ ZIP) の境界値テスト。
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  importCharacterFromFile,
  importCharacterFromText,
  importCharactersFromFiles,
  importLogFromFile,
  importLogsFromFiles,
} from "./importers";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=";

async function zipFile(
  entries: Record<string, string | Uint8Array | null>,
  name = "pack.zip",
  type = "application/zip",
): Promise<File> {
  const zip = new JSZip();
  for (const [path, body] of Object.entries(entries)) {
    if (body === null) zip.folder(path);
    else if (typeof body === "string" && path.match(/\.(png|jpe?g|gif|webp|bmp)$|images\/[^.]+$/i))
      zip.file(path, body, { base64: true });
    else zip.file(path, body);
  }
  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buf], name, { type });
}

const udon = (body: string, palette = "") =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<character><data name="character">${body}</data>${palette}</character>`;
const udonImg = (imageId: string, name = "天城") =>
  udon(
    `<data name="image"><data type="image" name="imageIdentifier">${imageId}</data></data><data name="common"><data name="name">${name}</data></data>`,
  );
const ccf = (data: Record<string, unknown>) =>
  JSON.stringify({ kind: "character", data: { name: "波音", ...data } });

describe("Udonarium キャラクター XML", () => {
  it("結果の形を完全一致で返す (画像なし・メモなし)", () => {
    const res = importCharacterFromText(
      udon(`<data name="name">霧島</data><data name="HP" currentValue="11">12</data>`),
    );
    expect(res).toStrictEqual({
      sourceLabel: "Udonarium",
      character: {
        name: "霧島",
        memo: undefined,
        systemId: undefined,
        stats: { hp: 11 },
        sheet: {
          v: 1,
          provider: "udonarium",
          profile: [],
          sections: [
            { id: "resources", title: "副能力値", kind: "resources", entries: [{ label: "HP", value: 11 }] },
          ],
        },
      },
    });
  });

  it("名前は最初の空でない name を使い、前後の空白を除く", () => {
    const c = importCharacterFromText(
      udon(`<data name="name"></data><data name=" name ">  霧島  </data><data name="name">二人目</data>`),
    )?.character;
    expect(c?.name).toBe("霧島");
    expect(c?.stats).toStrictEqual({});
  });

  it("名前が無ければ null", () => {
    expect(importCharacterFromText(udon(`<data name="HP">3</data>`))).toBeNull();
  });

  it("imageIdentifier は none を除いて残す", () => {
    expect(
      importCharacterFromText(udon(`<data name="name">A</data><data name="imageIdentifier">none</data>`))
        ?.character,
    ).not.toHaveProperty("imageId");
    expect(
      importCharacterFromText(udon(`<data name="name">A</data><data name="imageIdentifier"></data>`))
        ?.character,
    ).not.toHaveProperty("imageId");
    expect(
      importCharacterFromText(udon(`<data name="name">A</data><data name="imageIdentifier">abc</data>`))
        ?.character.imageId,
    ).toBe("abc");
  });

  it("メモ・memo・説明・type=note をメモとしてつなぐ", () => {
    const c = importCharacterFromText(
      udon(
        `<data name="name">A</data><data name="メモ">一</data><data name="memo">二</data><data name="説明">三</data><data name="x" type=" note ">四</data><data name="メモ"></data>`,
      ),
    )?.character;
    expect(c?.memo).toBe("一\n二\n三\n四");
    expect(c?.stats).toStrictEqual({});
  });

  it("数値はcurrentValue を優先し、空なら本文を使う。size と名前なし・入れ子の親は除く", () => {
    const c = importCharacterFromText(
      udon(
        `<data name="name">A</data><data name="size">1</data><data name="HP" currentValue="11">12</data><data name="MP" currentValue="  ">13</data><data name="SAN" currentValue="">14</data><data>5</data><data name=" DEX ">6</data><data name="能力"><data name="STR">7</data></data><data name="NOTE">x</data>`,
      ),
    )?.character;
    expect(c?.stats).toStrictEqual({ hp: 11, mp: 13, san: 14, dex: 6, str: 7 });
  });

  it("入れ子の親の本文は数値として拾わない", () => {
    const c = importCharacterFromText(
      udon(`<data name="name">A</data><data name="HP"><data name="max">12</data></data>`),
    )?.character;
    expect(c?.stats).toStrictEqual({ max: 12 });
  });

  it.each([
    ["SAN値", "san"],
    ["正気度", "san"],
    ["HP", "hp"],
    ["Luck", "luck"],
    ["ABCDE", "abcde"],
    ["ABCDEF", "ABCDEF"],
    ["A", "A"],
    ["体力HP", "体力HP"],
    ["HP最大", "HP最大"],
    ["目星", "目星"],
  ])("能力値名 %s → %s", (name, key) => {
    const c = importCharacterFromText(
      udon(`<data name="name">A</data><data name="${name}">5</data>`),
    )?.character;
    expect(c?.stats).toStrictEqual({ [key]: 5 });
  });

  it.each([
    [`<chat-palette dicebot="Cthulhu7th"></chat-palette>`, "", "coc7"],
    [`<chat-palette dicebot="">CCB&lt;=50</chat-palette>`, "", "coc6"],
    [`<chat-palette>SW2.5</chat-palette>`, "", "sw25"],
    ["", `<data name="メモ">エモクロア</data>`, "emoklore"],
    ["", "", undefined],
  ])("システムはダイスボット・チャットパレット・メモから推定する %#", (palette, extra, want) => {
    const c = importCharacterFromText(udon(`<data name="name">A</data>${extra}`, palette))?.character;
    expect(c?.systemId).toBe(want);
  });

  it("XML でない・character 要素が無い・壊れた XML は null", () => {
    expect(importCharacterFromText(`メモ <character><data name="name">A</data></character>`)).toBeNull();
    expect(importCharacterFromText(`<root><data name="name">A</data></root>`)).toBeNull();
    expect(importCharacterFromText(`<character-list><data name="name">A</data></character-list>`)).toBeNull();
    expect(importCharacterFromText(`<character><data name="name">A</data>`)).toBeNull();
  });
});

describe("importCharactersFromFiles", () => {
  it("テキストファイルは中身から複数キャラを読む", async () => {
    const res = await importCharactersFromFiles([
      new File(["名前: A\nHP: 1\n---\n名前: B\nHP: 2"], "a.txt", { type: "text/plain" }),
      new File([JSON.stringify({ pc_name: "C" })], "c.json"),
    ]);
    expect(res.map((r) => r.character.name)).toEqual(["A", "B", "C"]);
  });

  it.each([
    ["chars.ZIP", ""],
    ["chars", "application/zip"],
    ["chars", "application/x-zip-compressed"],
  ])("ZIP の判定: name=%s type=%s", async (name, type) => {
    const file = await zipFile({ "a.json": JSON.stringify({ pc_name: "A" }) }, name, type);
    const res = await importCharactersFromFiles([file]);
    expect(res.map((r) => [r.sourceLabel, r.character.name])).toEqual([["キャラクター保管所", "A"]]);
  });

  it("zip という名前を含むだけのテキストは ZIP として扱わない", async () => {
    const res = await importCharactersFromFiles([new File(["名前: A\nHP: 1"], "zip.notes.txt")]);
    expect(res.map((r) => r.character.name)).toEqual(["A"]);
  });

  it("壊れた ZIP は飛ばして次のファイルを読む", async () => {
    const res = await importCharactersFromFiles([
      new File(["not a zip"], "broken.zip", { type: "application/zip" }),
      new File(["名前: B\nHP: 2"], "b.txt"),
    ]);
    expect(res.map((r) => r.character.name)).toEqual(["B"]);
  });

  it("ZIP 内の Udonarium XML と画像を解決する (画像は完全一致の data URL)", async () => {
    const file = await zipFile({
      "readme.xml": "<foo/>",
      "chara.xml.bak": udonImg("p", "偽物"),
      "dir/": null,
      "other.png": PNG,
      "chars/a.xml": `\n  ${udonImg("portrait").replace(/^<\?xml[^>]*>\n/, "")}`,
      "images/portrait.png": PNG,
    });
    const res = await importCharactersFromFiles([file]);
    expect(res).toHaveLength(1);
    expect(res[0]?.sourceLabel).toBe("Udonarium");
    expect(res[0]?.character.name).toBe("天城");
    expect(res[0]?.character.image).toBe(`data:image/png;base64,${PNG}`);
  });

  it.each([
    ["face.png", "face.png", "image/png"],
    ["face", "face.jpg", "image/jpeg"],
    ["face", "face.JPEG", "image/jpeg"],
    ["face", "face.gif", "image/gif"],
    ["face", "face.webp", "image/webp"],
    ["face.png", "face.png.gif", "image/gif"],
    ["face.jpg", "face.jpg.gif", "image/gif"],
    ["face.gif", "face.gif.webp", "image/webp"],
  ])("Udonarium 画像: imageId=%s / ファイル=%s → %s", async (imageId, fileName, mime) => {
    const file = await zipFile({ "c.xml": udonImg(imageId), [`img/${fileName}`]: PNG });
    for (const res of [await importCharactersFromFiles([file]), [await importCharacterFromFile(file)]]) {
      expect(res[0]?.character.image).toBe(`data:${mime};base64,${PNG}`);
    }
  });

  it.each([
    ["face.bmp", "face.bmp"],
    ["face.webp.bmp", "face.webp.bmp"],
    ["face.png.bmp", "face.png.bmp"],
    ["face", "other.png"],
    ["face", "face.png.bak"],
  ])("Udonarium 画像を付けない: imageId=%s / ファイル=%s", async (imageId, fileName) => {
    const file = await zipFile({ "c.xml": udonImg(imageId), [fileName]: PNG });
    for (const res of [await importCharactersFromFiles([file]), [await importCharacterFromFile(file)]]) {
      expect(res[0]?.character.name).toBe("天城");
      expect(res[0]?.character.image).toBeUndefined();
    }
  });

  it("画像が 0x8000 バイトを超えても欠けずに data URL にする", async () => {
    const bytes = new Uint8Array(0x8000 * 2 + 123).map((_, i) => (i * 7) % 256);
    const zip = new JSZip();
    zip.file("c.xml", udonImg("big"));
    zip.file("big.png", bytes);
    const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "big.zip");
    const res = await importCharactersFromFiles([file]);
    expect(res[0]?.character.image).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`);
  });

  it("ZIP 内のテキスト系は .json / .txt だけを読み、XML を .txt に入れても二重に数えない", async () => {
    const file = await zipFile({
      "a.txt": udonImg("p"),
      "images/p.png": PNG,
      "b.json.bak": JSON.stringify({ pc_name: "偽物" }),
      "c.JSON": JSON.stringify([{ pc_name: "C1" }, { pc_name: "C2" }]),
    });
    const res = await importCharactersFromFiles([file]);
    expect(res.map((r) => [r.sourceLabel, r.character.name])).toEqual([
      ["Udonarium", "天城"],
      ["キャラクター保管所", "C1"],
      ["キャラクター保管所", "C2"],
    ]);
    // テキスト経由の Udonarium には CCFOLIA の images/ 解決を使わない
    expect(res[0]?.character.image).toBeUndefined();
  });

  it.each([
    ["nami", "images/nami.png", "image/png"],
    ["nami", "images/nami.jpg", "image/jpeg"],
    ["nami.png", "images/nami.png", "image/png"],
    ["nami.png", "images/nami.png.webp", "image/webp"],
  ])("CCFOLIA の imageId=%s を %s から解決する", async (imageId, path, mime) => {
    const file = await zipFile({ "c.json": ccf({ imageId }), "images/other.png": PNG, [path]: PNG });
    const res = await importCharactersFromFiles([file]);
    expect(res.map((r) => r.sourceLabel)).toEqual(["CCFOLIA"]);
    expect(res[0]?.character.image).toBe(`data:${mime};base64,${PNG}`);
  });

  it.each([
    ["nami", { "images/nami": PNG }],
    ["nami", { "nami.png": PNG }],
    ["nami", { "images/nami.png.bak": PNG }],
    ["nami", {}],
  ])("CCFOLIA の imageId=%s に合う画像が無ければ付けない %#", async (imageId, extra) => {
    const file = await zipFile({ "c.json": ccf({ imageId }), ...extra });
    const res = await importCharactersFromFiles([file]);
    expect(res[0]?.character.name).toBe("波音");
    expect(res[0]?.character.image).toBeUndefined();
  });

  it("CCFOLIA で既に画像 URL があれば ZIP の画像で上書きしない", async () => {
    const file = await zipFile({
      "c.json": ccf({ imageId: "nami", iconUrl: "https://example.com/n.png" }),
      "images/nami.png": PNG,
    });
    const res = await importCharactersFromFiles([file]);
    expect(res[0]?.character.image).toBe("https://example.com/n.png");
  });

  it("CCFOLIA で imageId が無ければ画像を付けない", async () => {
    const file = await zipFile({ "c.json": ccf({}), "images/undefined.png": PNG });
    const res = await importCharactersFromFiles([file]);
    expect(res[0]?.character.image).toBeUndefined();
  });

  it("CCFOLIA 以外は images/ を解決しない", async () => {
    const file = await zipFile({
      "c.json": JSON.stringify({ name: "結城", von: 1, imageId: "nami" }),
      "images/nami.png": PNG,
    });
    const res = await importCharactersFromFiles([file]);
    expect(res[0]?.sourceLabel).toBe("エモクロア");
    expect(res[0]?.character.image).toBeUndefined();
  });

  it("読めるものが無い ZIP は空", async () => {
    const file = await zipFile({ "a.png": PNG, "b.json": "{}" });
    expect(await importCharactersFromFiles([file])).toEqual([]);
  });
});

describe("importCharacterFromFile", () => {
  it("CCFOLIA ZIP を最優先で読む", async () => {
    const file = await zipFile({ "c.xml": udonImg("p"), "c.json": ccf({}) });
    const res = await importCharacterFromFile(file);
    expect(res?.sourceLabel).toBe("CCFOLIA");
  });

  it("ZIP の判定は拡張子の大文字小文字と MIME を見る", async () => {
    for (const [name, type] of [
      ["c.ZIP", ""],
      ["c", "application/zip"],
      ["c", "application/x-zip-compressed"],
    ] as const) {
      const file = await zipFile({ "c.xml": udonImg("p") }, name, type);
      expect((await importCharacterFromFile(file))?.sourceLabel).toBe("Udonarium");
    }
  });

  it("zip という名前を含むだけのテキストは ZIP として扱わない", async () => {
    const res = await importCharacterFromFile(new File(["名前: A\nHP: 1"], "zip.txt"));
    expect(res?.character.name).toBe("A");
  });

  it("ZIP 内の XML は読めないものと拡張子違いを飛ばす", async () => {
    const file = await zipFile({
      "readme.xml": "<foo/>",
      "x.xml.bak": udonImg("p", "偽物"),
      "dir/": null,
      "b.xml": `\n ${udonImg("none-match", "本物").replace(/^<\?xml[^>]*>\n/, "")}`,
    });
    const res = await importCharacterFromFile(file);
    expect(res?.sourceLabel).toBe("Udonarium");
    expect(res?.character.name).toBe("本物");
    expect(res?.character.image).toBeUndefined();
  });

  it("ZIP 内の .json / .txt を順に試し、最初に読めたものを返す", async () => {
    const file = await zipFile({
      "a.json": "{}",
      "a.txt.bak": "名前: 偽物\nHP: 1",
      "b.TXT": "名前: A\nHP: 1",
      "c.json": JSON.stringify({ pc_name: "C" }),
    });
    const res = await importCharacterFromFile(file);
    expect(res).toStrictEqual({
      sourceLabel: "いあきゃら",
      character: {
        name: "A",
        memo: undefined,
        systemId: undefined,
        stats: { hp: 1 },
        sheet: {
          v: 1,
          provider: "iachara",
          profile: [],
          sections: [
            { id: "resources", title: "副能力値", kind: "resources", entries: [{ label: "HP", value: 1 }] },
          ],
        },
      },
    });
  });

  it("読めない ZIP・壊れた ZIP は null", async () => {
    expect(await importCharacterFromFile(await zipFile({ "a.json": "{}", "b.png": PNG }))).toBeNull();
    expect(await importCharacterFromFile(new File(["nope"], "x.zip"))).toBeNull();
  });

  it("テキストファイルを読む", async () => {
    const res = await importCharacterFromFile(new File([JSON.stringify({ pc_name: "C" })], "c.json"));
    expect(res?.sourceLabel).toBe("キャラクター保管所");
  });
});

describe("importLogFromFile / importLogsFromFiles", () => {
  const chat = (name: string, text: string) =>
    `<chat-log><chat name="${name}" tab="メイン">${text}</chat></chat-log>`;

  it("ZIP の判定は拡張子の大文字小文字と MIME を見る", async () => {
    for (const [name, type] of [
      ["log.ZIP", ""],
      ["log", "application/zip"],
      ["log", "application/x-zip-compressed"],
    ] as const) {
      const file = await zipFile({ "chat.xml": chat("A", "hi") }, name, type);
      expect((await importLogFromFile(file))?.sourceLabel).toBe("Udonarium");
    }
  });

  it("zip という名前を含むだけのテキストは ZIP として扱わない", async () => {
    const res = await importLogFromFile(new File(["太郎: こんにちは"], "zip.txt"));
    expect(res?.sourceLabel).toBe("テキストログ");
  });

  it("XML は chat を名前に含むもの、次に浅い階層のものを優先する", async () => {
    const file = await zipFile({
      "a/b/deep.xml": chat("深い", "x"),
      "a/room.xml": chat("部屋", "x"),
      "z/chat.xml": chat("チャット", "x"),
    });
    const res = await importLogFromFile(file);
    expect(res?.log.channels[0]?.msgs[0]?.sp).toBe("チャット");

    const file2 = await zipFile({ "a/b/deep.xml": chat("深い", "x"), "a/room.xml": chat("部屋", "x") });
    expect((await importLogFromFile(file2))?.log.channels[0]?.msgs[0]?.sp).toBe("部屋");

    const file3 = await zipFile({ "a/b/deep.xml": chat("深い", "x"), "x/chat.xml.bak": chat("偽", "x") });
    expect((await importLogFromFile(file3))?.log.channels[0]?.msgs[0]?.sp).toBe("深い");

    const file4 = await zipFile({
      "a/b/chat1.xml": chat("深いchat", "x"),
      "a/chat2.xml": chat("浅いchat", "x"),
    });
    expect((await importLogFromFile(file4))?.log.channels[0]?.msgs[0]?.sp).toBe("浅いchat");

    const file6 = await zipFile({
      "a/b/c.xml": chat("深い", "x"),
      "averylongroomname.xml": chat("浅い", "x"),
    });
    expect((await importLogFromFile(file6))?.log.channels[0]?.msgs[0]?.sp).toBe("浅い");

    const file5 = await zipFile({ "a/b/c.xml": chat("深い", "x"), "chat/a.xml": chat("chat階層", "x") });
    expect((await importLogFromFile(file5))?.log.channels[0]?.msgs[0]?.sp).toBe("chat階層");
  });

  it("読めない XML の次は .json / .txt / .html を試す", async () => {
    const file = await zipFile({
      "chat.xml": "<chat-log></chat-log>",
      "a.txt.bak": "偽物: x",
      "a.json": "{}",
      "dir/": null,
      "b.HTM": "<p>花子: やあ</p>",
    });
    const res = await importLogFromFile(file);
    expect(res?.sourceLabel).toBe("どどんとふ / HTML");
    expect(res?.log.channels[0]?.msgs[0]?.sp).toBe("花子");
  });

  it.each([["log.json"], ["log.txt"], ["log.html"]])("ZIP 内の %s を読む", async (name) => {
    const body = name.endsWith(".html") ? "<p>花子: やあ</p>" : "花子: やあ";
    const res = await importLogFromFile(await zipFile({ "x.bin": "a", [name]: body }));
    expect(res?.log.messageCount).toBe(1);
  });

  it("読めるログが無い ZIP・壊れた ZIP は null", async () => {
    expect(await importLogFromFile(await zipFile({ "a.txt": "読めない", "b.png": PNG }))).toBeNull();
    expect(await importLogFromFile(new File(["nope"], "x.zip"))).toBeNull();
  });

  it(".html / .htm は CCFOLIA HTML、次に汎用 HTML として読む", async () => {
    const res = await importLogFromFile(new File(["<p>[雑談] 花子: やあ</p>"], "log.HTM"));
    expect(res?.sourceLabel).toBe("どどんとふ / HTML");
    expect(res?.log.channels[0]?.name).toBe("チャット");
    expect(await importLogFromFile(new File(["<p>読めない</p>"], "log.html"))).toBeNull();
    // 拡張子が html でなければテキストとして判定する (Discord テキスト)
    const txt = await importLogFromFile(new File(["[2026/11/08 21:05] 花子\nやあ"], "log.html.txt"));
    expect(txt?.sourceLabel).toBe("Discord");
  });

  it("importLogsFromFiles は読めたファイルだけをファイル名付きで返す", async () => {
    const res = await importLogsFromFiles([
      new File(["花子: やあ"], "a.txt"),
      new File(["読めない"], "b.txt"),
      new File(["太郎: おう"], "c.txt"),
    ]);
    expect(res.map((r) => [r.fileName, r.sourceLabel, r.log.messageCount])).toEqual([
      ["a.txt", "テキストログ", 1],
      ["c.txt", "テキストログ", 1],
    ]);
  });
});
