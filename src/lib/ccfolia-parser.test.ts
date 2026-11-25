// @vitest-environment jsdom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import fixtureRaw from "../../e2e/fixtures/ccfolia-sample.json";
import { inferSystem } from "../data/systems";
import type { Channel, Msg } from "../types";
import {
  parseCcfoliaLog,
  parseCcfoliaLogHtml,
  parseCcfoliaLogZip,
  sessionDatesOf,
  summarizeParsed,
} from "./ccfolia-parser";

const fixture = JSON.stringify(fixtureRaw);

describe("parseCcfoliaLog", () => {
  const parsed = parseCcfoliaLog(fixture)!;

  it("実形式のフィクスチャからメッセージを復元する", () => {
    expect(parsed.messageCount).toBe(12);
  });

  it("チャンネルを正規名に分類する(main/info/chat)", () => {
    const names = parsed.channels.map((c) => c.name);
    expect(names).toContain("メイン");
    expect(names).toContain("情報");
    expect(names).toContain("チャット");
  });

  it("発言者2人以下の非標準チャンネルをシークレットとして扱う", () => {
    const secret = parsed.channels.find((c) => c.id === "tab_3");
    expect(secret?.secret).toBe(true);
    const main = parsed.channels.find((c) => c.name === "メイン");
    expect(main?.secret).toBe(false);
  });

  it("ロール行を独立メッセージとして復元する", () => {
    const roll = parsed.channels.flatMap((c) => c.msgs).find((m) => m.roll);
    expect(roll?.roll).toMatchObject({ cmd: "CC<=70 目星", result: "成功" });
  });

  it("場面の見出しを note として分類する", () => {
    const note = parsed.channels.flatMap((c) => c.msgs).find((m) => m.text?.startsWith("◆"));
    expect(note?.type).toBe("note");
  });

  it("createdAt(ms)から epoch秒 に変換し、時系列にソートする", () => {
    const main = parsed.channels.find((c) => c.name === "メイン")!;
    const ts = main.msgs.map((m) => m.ts);
    expect([...ts]).toEqual([...ts].sort((a, b) => a - b));
    expect(sessionDatesOf(parsed)).toEqual(["2026-11-16"]);
  });

  it("スピーカーの kind 推定: KPプレフィックス付きはKP、それ以外はPC(Step2で修正可能)", () => {
    const withPrefix = parseCcfoliaLog(
      JSON.stringify({
        messages: [{ name: "KP:夜霜", text: "導入です", createdAt: 1794831600000, channel: "main" }],
      }),
    )!;
    expect(withPrefix.kinds["KP:夜霜"]).toBe("KP");
    expect(parsed.kinds["夜霜"]).toBe("PC");
  });

  it("要約ヘルパーが動く", () => {
    expect(summarizeParsed(parsed).length).toBe(4);
  });

  it("解析できない入力は null", () => {
    expect(parseCcfoliaLog("not json")).toBeNull();
    expect(parseCcfoliaLog('{"foo":1}')).toBeNull();
  });

  it("t/time/message/body/speakerId/cn/channelId/tab/type/role/roll(critical・fumble・value) を正しく復元する", () => {
    const raw = JSON.stringify({
      ignoredObj: { nested: "skip" },
      list: [
        {
          speakerId: "PC_A",
          message: "探索開始",
          t: "1794831600",
          channelId: "other",
          type: "note",
          role: "pl",
        },
        {
          cn: "案内役",
          body: "クリティカル判定",
          time: 1794831610000,
          tab: "雑談",
          type: "system",
          role: "system",
          extend: {
            roll: {
              cmd: "1d100<=50",
              skill: "目星",
              critical: true,
              value: 1,
            },
          },
        },
        {
          name: "GM",
          text: "ファンブル処理",
          createdAt: "1794831620000",
          channel: "秘匿A",
          extend: {
            roll: {
              fumble: true,
              dice: [{ value: "100" }],
            },
          },
        },
        {
          name: "探索者3",
          text: "通常成功",
          createdAt: 1794831630,
          channel: "秘匿A",
          extend: {
            roll: {
              dice: [{ value: "30" }, { value: "40" }],
            },
          },
        },
        {
          name: "逆順A",
          text: "後時刻",
          createdAt: 1000000000001, // 1e12 超は 1000000000 秒に変換
          channel: "info_sub",
          role: "PC",
        },
        {
          name: "KP：進行",
          text: "先時刻",
          createdAt: "1000000001", // > 1e9 && <= 1e12
          channel: "my_main_tab",
          role: "NPC",
        },
        {
          name: "GM 進行",
          text: "間",
          createdAt: 1000000000, // ちょうど 1e9 は 0 扱い
          channel: "chat_sub",
        },
        {
          name: "境界値1e12",
          text: "ちょうど1e12秒扱い",
          createdAt: 1e12,
          channel: "情報",
          kind: "gm",
        },
        {
          name: "不正時刻",
          text: "ts=0 の確認",
          t: "not-digits",
          createdAt: 500, // <= 1e9
        },
      ],
    });
    const out = parseCcfoliaLog(raw)!;
    expect(out.messageCount).toBe(9);
    expect(out.kinds).toMatchObject({
      PC_A: "PL",
      案内役: "SYSTEM",
      GM: "KP",
      探索者3: "PC",
      逆順A: "PC",
      "KP：進行": "NPC",
      "GM 進行": "KP",
      境界値1e12: "GM",
    });

    const secretA = out.channels.find((c) => c.id === "秘匿A")!;
    expect(secretA.secret).toBe(true);
    expect(secretA.msgs[0]?.roll).toEqual({ cmd: "ロール", skill: "", dice: "100", result: "ファンブル" });
    expect(secretA.msgs[1]?.roll).toEqual({ cmd: "ロール", skill: "", dice: "30,40", result: "成功" });

    // 正規チャンネル名判定とメイン先頭ソート
    expect(out.channels[0]?.name).toBe("メイン");
    // 表記の違う情報タブ（info / 情報）は 1 つにまとまり、中は時刻の順
    const infoCh = out.channels.filter((c) => c.name === "情報");
    expect(infoCh).toHaveLength(1);
    expect(infoCh[0]?.secret).toBe(false);
    expect(infoCh[0]?.msgs.map((m) => m.ts)).toEqual([1000000000, 1e12]);
    expect(out.channels.filter((c) => c.name === "チャット").every((c) => !c.secret)).toBe(true);

    const chat = out.channels.find((c) => c.name === "チャット")!;
    expect(chat.secret).toBe(false);
    // 雑談 と chat_sub は同じチャットタブにまとまる。ロールを持つ発言は type: "roll"
    expect(chat.msgs.map((m) => m.sp)).toEqual(["GM 進行", "案内役"]);
    expect(chat.msgs[1]).toMatchObject({
      sp: "案内役",
      kind: "SYSTEM",
      type: "roll",
      ts: 1794831610,
      roll: { cmd: "1d100<=50", skill: "目星", dice: "1", result: "クリティカル" },
    });

    const other = out.channels.find((c) => c.id === "other")!;
    expect(other.msgs[0]).toMatchObject({ sp: "PC_A", type: "note", ts: 1794831600 });

    const main = out.channels.find((c) => c.name === "メイン")!;
    expect(main.msgs[0]).toMatchObject({ sp: "不正時刻", ts: 0 });
    expect(summarizeParsed(out)).toContain("秘匿A(2) [シークレット]");
    expect(summarizeParsed(out)).toContain("チャット(2)");
    expect(sessionDatesOf(out).length).toBeGreaterThanOrEqual(2);
  });

  it("HTML ログ3形式(DOMParser)・BOM付きパース・ZIPログ読み込みを検証する", async () => {
    // BOM 付き HTML 自動ディスパッチ + 3形式 (生<p><span> / div.tab / section.tab)
    const rawHtml = `\uFEFF<html><body>
      <p><span>[情報]</span><span>KP:夜霜</span><span>資料1</span><span>資料2</span></p>
      <p><span>[]</span><span>無印</span><span>空タブテスト</span></p>
      <p><span></span><span></span><span>空要素スキップ</span></p>
      <p><span>[main]</span><span>system</span><span>◆ 開始</span></p>
    </body></html>`;
    const fromRaw = parseCcfoliaLog(rawHtml)!;
    // 発言者の無い行も本文があれば残す（名前を消したダイスなど）
    expect(fromRaw.messageCount).toBe(4);
    expect(fromRaw.channels[0]?.name).toBe("メイン");
    expect(fromRaw.channels[0]?.msgs[0]).toMatchObject({ kind: "SYSTEM", type: "note" });
    const emptyTabCh = fromRaw.channels.find((c) => c.id === "ch0")!;
    expect(emptyTabCh.msgs[0]).toMatchObject({ sp: "無印", text: "空タブテスト" });
    expect(fromRaw.channels.find((c) => c.name === "情報")?.msgs[0]?.text).toBe("資料1\n資料2");

    const divTabHtml = `<div class="tab"><p class="tabtitle"></p>
      <p class="player"><b>GM 花子</b>それでは進めます</p>
      <p class="player"><b>空テキスト</b></p>
    </div>`;
    const fromDiv = parseCcfoliaLogHtml(divTabHtml)!;
    expect(fromDiv.channels[0]).toMatchObject({ id: "ch1", name: "ch1", secret: true });
    expect(fromDiv.channels[0]?.msgs[0]).toMatchObject({
      sp: "GM 花子",
      kind: "KP",
      text: "それでは進めます",
    });

    const secTabHtml = `<section class="tab">
      <div class="player"><span class="speaker-text">system</span><div class="player-message">◆ シーン終了</div></div>
    </section>`;
    const fromSec = parseCcfoliaLogHtml(secTabHtml)!;
    expect(fromSec.channels[0]?.id).toBe("ch1");
    expect(fromSec.channels[0]?.msgs[0]).toMatchObject({ sp: "system", kind: "SYSTEM", type: "note" });
    expect(parseCcfoliaLogHtml("<p>no spans</p>")).toBeNull();

    // ZIP: サブフォルダ JSON よりルート JSON 優先 / JSON なしならルート HTML を採用 / 破損 ZIP は null
    expect(await parseCcfoliaLogZip(new Uint8Array([9, 8, 7]).buffer)).toBeNull();

    const emptyZip = new JSZip();
    emptyZip.file("readme.txt", "none");
    expect(await parseCcfoliaLogZip(await emptyZip.generateAsync({ type: "arraybuffer" }))).toBeNull();

    const jsonZip = new JSZip();
    jsonZip.file(
      "sub/sub.json",
      JSON.stringify({ messages: [{ name: "Sub", text: "nested", createdAt: 1794831600000 }] }),
    );
    jsonZip.file(
      "root.json",
      JSON.stringify({ messages: [{ name: "Root", text: "top", createdAt: 1794831600000 }] }),
    );
    const zJsonRes = await parseCcfoliaLogZip(await jsonZip.generateAsync({ type: "arraybuffer" }));
    expect(zJsonRes?.channels[0]?.msgs[0]?.text).toBe("top");

    const htmlZip = new JSZip();
    htmlZip.file("bad.json", "{invalid}");
    htmlZip.file("nested/log.htm", rawHtml);
    htmlZip.file("log.html", divTabHtml);
    const zHtmlRes = await parseCcfoliaLogZip(await htmlZip.generateAsync({ type: "arraybuffer" }));
    expect(zHtmlRes?.channels[0]?.msgs[0]?.sp).toBe("GM 花子");
  });
});

describe("inferSystem", () => {
  const msg = (partial: Partial<Msg>): Msg => ({
    id: "m",
    ts: 0,
    sp: "x",
    kind: "PC",
    type: "text",
    text: null,
    ...partial,
  });
  const chans = (msgs: Msg[]): Channel[] => [{ id: "main", name: "メイン", secret: false, msgs }];

  it("CC<= / SANチェック から CoC7 を推定する", () => {
    const r = inferSystem(
      chans([msg({ type: "roll", roll: { cmd: "CC<=70 目星", skill: "目星", dice: "61", result: "成功" } })]),
    );
    expect(r?.id).toBe("coc7");
  });
  it("結合判定・自分:不可能 からエモクロアを推定する", () => {
    const r = inferSystem(
      chans([
        msg({ type: "roll", roll: { cmd: "2D6+3 結合", skill: "交渉", dice: "7,5", result: "成功" } }),
        msg({ text: "（自分:不可能 2点減）" }),
      ]),
    );
    expect(r?.id).toBe("emoklore");
  });
  it("エモクロアの手がかりがなければ 2D6 から SW2.5 を推定する", () => {
    const r = inferSystem(
      chans([msg({ type: "roll", roll: { cmd: "2D6+5 射撃", skill: "射撃", dice: "9", result: "成功" } })]),
    );
    expect(r?.id).toBe("sw25");
  });
  it("手がかりがなければ null", () => {
    expect(inferSystem(chans([msg({ text: "「こんにちは」" })]))).toBeNull();
  });
});
