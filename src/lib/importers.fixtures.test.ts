// @vitest-environment jsdom
/**
 * 書き出し形式ごとの実在に近いフィクスチャ(__fixtures__)を、画面が使う importLogFromFile で通すテスト。
 * DOMParser あり(Web)となし(React Native)の両方で同じ結果になることも確かめる。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { importLogFromFile, importLogFromText } from "./importers";

const fx = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
const file = (name: string, body: string | Uint8Array, type = "") =>
  new File([body as BlobPart], name, { type });
const zipOf = async (entries: Record<string, string>, name = "log.zip") => {
  const zip = new JSZip();
  for (const [k, v] of Object.entries(entries)) zip.file(k, v);
  return file(name, await zip.generateAsync({ type: "uint8array" }), "application/zip");
};
const ch = (res: Awaited<ReturnType<typeof importLogFromFile>>, id: string) =>
  res!.log.channels.find((c) => c.id === id)!;

for (const withDom of [true, false]) {
  describe(`取り込み(${withDom ? "DOMParser あり" : "DOMParser なし"})`, () => {
    afterEach(() => vi.unstubAllGlobals());
    const setup = () => {
      if (!withDom) vi.stubGlobal("DOMParser", undefined);
    };

    it("新形式 CCFOLIA HTML(実ファイル由来): 時刻・出目・判定を読む", async () => {
      setup();
      const res = await importLogFromFile(file("サンプル卓[メイン].html", fx("ccfolia-modern-main.html")));
      expect(res?.sourceLabel).toBe("CCFOLIA");
      expect(res!.log.messageCount).toBe(8);
      const main = res!.log.channels[0]!;
      expect(main.name).toBe("メイン");
      expect(main.secret).toBe(false);
      expect(main.msgs.map((m) => m.sp)).toEqual([...Array(7).fill("アリス"), "ボブ"]);
      expect(main.msgs[0]).toMatchObject({
        ts: (Date.parse("2026-05-17T11:07:21.483Z") / 1000) | 0,
        text: "F8+11+9-3-2",
        kind: "PC",
      });
      expect(main.msgs[0]!.roll).toMatchObject({
        cmd: "F8+11+9-3-2@-1",
        result: "57",
        dice: "4,2,4,3,4,2,3,1,1,2,1,1,4,3,2,1,4,2,2,2,4,4,1",
      });
      const failed = main.msgs.find((m) => m.text === "F8+11-5>=50")!;
      expect(failed.roll?.result).toBe("失敗");
      expect(main.msgs.every((m) => m.ts > 1e9)).toBe(true);
    });

    it("新形式: 複数タブ・システム・シークレット・改行・実体参照を落とさない", async () => {
      setup();
      const res = await importLogFromFile(file("全部.html", fx("ccfolia-modern-tabs.html")));
      expect(res!.log.messageCount).toBe(4);
      expect(res!.log.channels.map((c) => c.id).sort()).toEqual(["メイン", "密談", "情報"].sort());
      const main = ch(res, "メイン");
      expect(main.msgs[0]!.text).toBe('1行目\n2行目 <b> & "引用"');
      expect(main.msgs[1]).toMatchObject({ sp: "system", kind: "SYSTEM", text: "ボブが入室しました" });
      expect(ch(res, "密談")).toMatchObject({ secret: true });
      expect(ch(res, "密談").msgs[0]!.roll).toMatchObject({ dice: "", result: "成功" });
      expect(ch(res, "情報").msgs[0]!.ts).toBeLessThan(main.msgs[0]!.ts);
    });

    it("新形式: 空のメッセージだけなら取り込まない(null)", async () => {
      setup();
      const html = `<main><article class="message" data-channel="main"><div class="message-text"></div></article></main>`;
      expect(await importLogFromFile(file("a.html", html))).toBeNull();
    });

    it("旧 CCFOLIA HTML(生ログ・整形ログ)", async () => {
      setup();
      const raw = await importLogFromFile(file("raw.html", fx("ccfolia-old-raw.html")));
      expect(raw!.log.messageCount).toBe(3);
      expect(ch(raw, "main").msgs[1]).toMatchObject({
        sp: "KP:ボブ",
        kind: "KP",
        text: "どうぞ&進めます\n2行目",
      });
      expect(ch(raw, "secret").secret).toBe(true);
      const tabs = await importLogFromFile(file("tabs.html", fx("ccfolia-old-tabs.html")));
      expect(tabs!.log.messageCount).toBe(2);
      expect(tabs!.log.channels).toHaveLength(1); // 空のタブは発言が無いので作らない
    });

    it("CCFOLIA JSON(v1.37)", async () => {
      setup();
      const res = await importLogFromFile(file("log.json", fx("ccfolia-v137.json")));
      expect(res!.log.messageCount).toBe(2);
      expect(ch(res, "secret").msgs[0]!.roll).toMatchObject({ skill: "目星", result: "成功" });
      expect(ch(res, "main").msgs[0]!.ts).toBe(1747480041);
    });

    it("Udonarium chat.xml と ZIP", async () => {
      setup();
      const xml = await importLogFromFile(file("chat.xml", fx("udonarium-chat.xml")));
      expect(xml?.sourceLabel).toBe("Udonarium");
      expect(xml!.log.messageCount).toBe(3);
      expect(ch(xml, "メイン").msgs[1]).toMatchObject({ kind: "KP", text: "進めます & <開始>" });
      const zipped = await importLogFromFile(await zipOf({ "data/chat.xml": fx("udonarium-chat.xml") }));
      expect(zipped?.sourceLabel).toBe("Udonarium");
      expect(zipped!.log.messageCount).toBe(3);
    });

    it("CCFOLIA の HTML ZIP / JSON ZIP", async () => {
      setup();
      const h = await importLogFromFile(await zipOf({ "log/index.html": fx("ccfolia-modern-tabs.html") }));
      expect(h?.sourceLabel).toBe("CCFOLIA");
      expect(h!.log.messageCount).toBe(4);
      const j = await importLogFromFile(await zipOf({ "log.json": fx("ccfolia-v137.json") }));
      expect(j!.log.messageCount).toBe(2);
    });

    it("CRLF・BOM・巨大ファイル", async () => {
      setup();
      const crlf = fx("ccfolia-modern-tabs.html").replace(/\n/g, "\r\n");
      expect((await importLogFromFile(file("a.html", `﻿${crlf}`)))!.log.messageCount).toBe(4);
      const udon = fx("udonarium-chat.xml").replace(/\n/g, "\r\n");
      expect(importLogFromText(`﻿${udon}`)!.log.messageCount).toBe(3);
      const art = (i: number) =>
        `<article class="message" data-channel="main"><span class="speaker">A</span><time class="timestamp" datetime="2026-05-17T11:07:21.000Z"></time><div class="message-text">発言${i}</div></article>`;
      const big = `<main>${Array.from({ length: 20000 }, (_, i) => art(i)).join("")}</main>`;
      const res = await importLogFromFile(file("big.html", big));
      expect(res!.log.messageCount).toBe(20000);
    }, 30000);

    it("構造の無いファイルは読み取れない(null)", async () => {
      setup();
      expect(await importLogFromFile(file("a.html", "<html><body>ただのページ</body></html>"))).toBeNull();
      expect(await importLogFromFile(file("a.json", "{}"))).toBeNull();
      expect(await importLogFromFile(file("a.xml", "<root/>"))).toBeNull();
      expect(await importLogFromFile(file("a.txt", "アリス: こんにちは"))).toBeNull();
    });
  });
}
