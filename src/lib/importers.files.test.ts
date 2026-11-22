// @vitest-environment jsdom
/**
 * ログのファイル・ZIP からの取り込みの境界値テスト。
 */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { importLogFromFile, importLogsFromFiles } from "./importers";

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

  it("zip という名前を含むだけのファイルは ZIP として扱わない", async () => {
    expect(await importLogFromFile(new File([chat("A", "hi")], "zip.xml"))).toMatchObject({
      sourceLabel: "Udonarium",
    });
    expect(await importLogFromFile(new File(["太郎: こんにちは"], "zip.txt"))).toBeNull();
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

  it("ZIP 内の XML は Udonarium の chat だけを読み、.json / .txt / .html の自由形式には回らない", async () => {
    const file = await zipFile({
      "chat.xml": "<chat-log></chat-log>",
      "room.xml": "<p>[雑談] 花子：やあ</p>",
      "a.txt": "花子: やあ",
      "a.json": JSON.stringify({ messages: [{ author: { name: "hanako" }, content: "やあ" }] }),
      "dir/": null,
      "b.HTM": "<p>花子: やあ</p>",
    });
    expect(await importLogFromFile(file)).toBeNull();
  });

  it.each([
    ["log.json", JSON.stringify({ messages: [{ name: "花子", text: "やあ", createdAt: 1794831600000 }] })],
    [
      "log.html",
      `<section class="tab"><h2 class="tabtitle">メイン</h2><div class="player"><span class="speaker-text">花子</span><div class="player-message">やあ</div></div></section>`,
    ],
  ])("ZIP 内の CCFOLIA %s を読む", async (name, body) => {
    const res = await importLogFromFile(await zipFile({ "x.bin": "a", [name]: body }));
    expect(res?.sourceLabel).toBe("CCFOLIA");
    expect(res?.log.messageCount).toBe(1);
  });

  it("テキストしか入っていない ZIP・読めるログが無い ZIP・壊れた ZIP は null", async () => {
    expect(await importLogFromFile(await zipFile({ "log.txt": "花子: やあ" }))).toBeNull();
    expect(
      await importLogFromFile(await zipFile({ "log.txt": "[2026/11/08 21:05] 花子\nやあ", "b.png": PNG })),
    ).toBeNull();
    expect(await importLogFromFile(new File(["nope"], "x.zip"))).toBeNull();
  });

  it(".html / .htm は CCFOLIA HTML だけを読む", async () => {
    expect(await importLogFromFile(new File(["<p>[雑談] 花子: やあ</p>"], "log.HTM"))).toBeNull();
    expect(await importLogFromFile(new File(["<p>読めない</p>"], "log.html"))).toBeNull();
  });

  it(".txt などテキストのファイルは中身に関わらず読まない", async () => {
    expect(await importLogFromFile(new File(["[2026/11/08 21:05] 花子\nやあ"], "log.html.txt"))).toBeNull();
    expect(await importLogFromFile(new File(["花子: やあ"], "a.txt"))).toBeNull();
    expect(await importLogFromFile(new File([chat("A", "hi")], "chat.txt"))).toBeNull();
  });

  it("拡張子の無いファイルは中身が CCFOLIA / Udonarium なら読む", async () => {
    expect((await importLogFromFile(new File([chat("A", "hi")], "chat")))?.sourceLabel).toBe("Udonarium");
    expect(await importLogFromFile(new File(["花子: やあ"], "log"))).toBeNull();
  });

  it("importLogsFromFiles は読めたファイルだけをファイル名付きで返す", async () => {
    const res = await importLogsFromFiles([
      new File([chat("花子", "やあ")], "a.xml"),
      new File(["花子: やあ"], "b.txt"),
      new File(
        [JSON.stringify({ messages: [{ name: "太郎", text: "おう", createdAt: 1794831600000 }] })],
        "c.json",
      ),
    ]);
    expect(res.map((r) => [r.fileName, r.sourceLabel, r.log.messageCount])).toEqual([
      ["a.xml", "Udonarium", 1],
      ["c.json", "CCFOLIA", 1],
    ]);
  });
});
