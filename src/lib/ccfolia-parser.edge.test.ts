// @vitest-environment jsdom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { Msg } from "../types";
import { parseCcfoliaLog, parseCcfoliaLogHtml, parseCcfoliaLogZip, sessionDatesOf } from "./ccfolia-parser";

const T0 = 1794831600; // 2026-11-16 21:00 JST

/** JSON ログを解析し、全メッセージを返す(null なら失敗させる) */
function parseJson(root: unknown) {
  const out = parseCcfoliaLog(JSON.stringify(root));
  if (!out) throw new Error("expected a parsed log");
  return out;
}
function allMsgs(root: unknown): Msg[] {
  return parseJson(root).channels.flatMap((c) => c.msgs);
}
function one(m: Record<string, unknown>): Msg {
  const msgs = allMsgs({ messages: [m] });
  expect(msgs).toHaveLength(1);
  return msgs[0]!;
}

describe("parseCcfoliaLog: createdAt / t / time の秒変換", () => {
  it.each<[string, unknown, number]>([
    ["ms 数値", T0 * 1000, T0],
    ["秒 数値", T0, T0],
    ["1e9 ちょうど(数値)は範囲外", 1e9, 0],
    ["1e9+1(数値)は秒", 1e9 + 1, 1e9 + 1],
    ["1e12 ちょうど(数値)は秒のまま", 1e12, 1e12],
    ["1e12+1(数値)は ms", 1e12 + 1, 1e9],
    ["ms 文字列", String(T0 * 1000), T0],
    ["秒 文字列", String(T0), T0],
    ["1e9 ちょうど(文字列)は範囲外", "1000000000", 0],
    ["1e9+1(文字列)は秒", "1000000001", 1000000001],
    ["1e12 ちょうど(文字列)は秒のまま", "1000000000000", 1e12],
    ["1e12+1(文字列)は ms", "1000000000001", 1e9],
    ["小さい文字列は範囲外", "500", 0],
    ["前に空白のある文字列は数字列ではない", ` ${T0}`, 0],
    ["後ろに空白のある文字列は数字列ではない", `${T0} `, 0],
    ["指数表記の文字列は数字列ではない", "1e10", 0],
    ["配列は数値ではない", [T0], 0],
    ["非数(文字)は 0", "abc", 0],
    ["null は 0", null, 0],
  ])("%s", (_label, createdAt, ts) => {
    expect(one({ name: "A", text: "x", createdAt }).ts).toBe(ts);
  });

  it("JSON の 1e400(Infinity)は時刻として採らない", () => {
    const parsed = parseCcfoliaLog(`{"messages":[{"name":"A","text":"x","createdAt":1e400}]}`)!;
    expect(parsed.channels[0]!.msgs[0]!.ts).toBe(0);
  });

  it("createdAt が使えなければ t、次に time を使う", () => {
    expect(one({ name: "A", text: "x", createdAt: "bad", t: T0, time: T0 + 5 }).ts).toBe(T0);
    expect(one({ name: "A", text: "x", createdAt: "bad", t: "bad", time: T0 + 5 }).ts).toBe(T0 + 5);
  });
});

describe("parseCcfoliaLog: メッセージ候補の判定と走査", () => {
  it("本文・発言者・時刻のどれかが欠ける要素はメッセージにせず、その下を走査する", () => {
    const inner = { name: "内側", text: "本文", createdAt: T0 };
    for (const wrapper of [
      { name: "時刻なし", text: "本文", children: [inner] },
      { text: "発言者なし", createdAt: T0, children: [inner] },
      { name: "本文なし", createdAt: T0, children: [inner] },
      { name: "本文が数値", text: 5, createdAt: T0, children: [inner] },
    ]) {
      const msgs = allMsgs({ messages: [wrapper] });
      expect(msgs.map((m) => m.sp)).toEqual(["内側"]);
    }
  });

  it("メッセージ自体の下は走査しない", () => {
    const msgs = allMsgs({
      messages: [
        { name: "外", text: "本文", createdAt: T0, nested: { name: "内", text: "x", createdAt: T0 } },
      ],
    });
    expect(msgs.map((m) => m.sp)).toEqual(["外"]);
  });

  it("extend 配下は走査しない", () => {
    expect(parseCcfoliaLog(JSON.stringify({ extend: { name: "A", text: "x", createdAt: T0 } }))).toBeNull();
    expect(
      allMsgs({
        wrap: { extend: [{ name: "B", text: "x", createdAt: T0 }] },
        m: [{ name: "C", text: "y", createdAt: T0 }],
      }).map((m) => m.sp),
    ).toEqual(["C"]);
  });

  it("null や配列・プリミティブが混ざっていても落ちない", () => {
    const msgs = allMsgs({ messages: [null, 1, "s", [null], { name: "A", text: "x", createdAt: T0 }] });
    expect(msgs.map((m) => m.sp)).toEqual(["A"]);
    expect(parseCcfoliaLog("null")).toBeNull();
    expect(parseCcfoliaLog("[]")).toBeNull();
    expect(parseCcfoliaLog('"text"')).toBeNull();
  });

  it("文字列以外の name/text は使わず、次の候補へ落ちる", () => {
    const m = one({ name: 1, speakerId: "B", text: 2, message: "本文", createdAt: T0 });
    expect(m).toMatchObject({ sp: "B", text: "本文" });
    expect(
      one({ name: 1, speakerId: 2, cn: "C", text: 0, message: 0, body: "本体", createdAt: T0 }),
    ).toMatchObject({
      sp: "C",
      text: "本体",
    });
    expect(one({ name: 1, text: "x", createdAt: T0 }).sp).toBe("不明な発言者");
  });

  it("チャンネルは channel → channelId → tab → メイン の順で決まり、文字列以外は無視する", () => {
    const parsed = parseJson({
      messages: [
        { name: "A", text: "1", createdAt: T0, channel: 1, channelId: "xyz", tab: "zzz" },
        { name: "B", text: "2", createdAt: T0, channel: 1, channelId: 2, tab: "tabq" },
        { name: "C", text: "3", createdAt: T0, channel: 1 },
      ],
    });
    expect(parsed.channels.map((c) => c.id).sort()).toEqual(["tabq", "xyz", "メイン"].sort());
  });
});

describe("parseCcfoliaLog: kind の推定", () => {
  it.each<[string, Record<string, unknown>, string]>([
    ["明示 PC は発言者名に KP があっても PC", { name: "KP 太郎", kind: "PC" }, "PC"],
    ["明示 pc(小文字)", { name: "KP 太郎", role: "pc" }, "PC"],
    ["明示 NPC", { name: "店主", kind: "NPC" }, "NPC"],
    ["明示 KP", { name: "探索者", kind: "KP" }, "KP"],
    ["明示 PL", { name: "探索者", kind: "PL" }, "PL"],
    ["明示 GM", { name: "探索者", kind: "gm" }, "GM"],
    ["明示 SYSTEM", { name: "KP 太郎", kind: "system" }, "SYSTEM"],
    ["kind が無ければ role", { name: "探索者", role: "NPC" }, "NPC"],
    ["kind が優先", { name: "探索者", kind: "PL", role: "NPC" }, "PL"],
    ["未知の kind は名前から推定", { name: "探索者", kind: "boss" }, "PC"],
    ["文字列以外の kind は名前から推定", { name: "KP", kind: 1 }, "KP"],
    ["名前が KP ちょうど", { name: "KP" }, "KP"],
    ["名前が GM ちょうど", { name: "GM" }, "KP"],
    ["KP: 接頭辞", { name: "KP:夜霜" }, "KP"],
    ["KP： 全角コロン", { name: "KP：夜霜" }, "KP"],
    ["GM 空白", { name: "GM 花子" }, "KP"],
    ["途中の GM は接頭辞ではない", { name: "元GM 花子" }, "PC"],
    ["KPX は接頭辞ではない", { name: "KPX" }, "PC"],
    ["小文字 kp は KP ではない", { name: "kp:x" }, "PC"],
  ])("%s", (_label, m, kind) => {
    const parsed = parseJson({ messages: [{ text: "x", createdAt: T0, ...m }] });
    expect(Object.values(parsed.kinds)).toEqual([kind]);
  });
});

describe("parseCcfoliaLog: 本文の種別とロール", () => {
  it.each<[string, Record<string, unknown>, string]>([
    ["◆ で始まる行は note", { text: "◆ 導入" }, "note"],
    ["◆ で終わる行は text", { text: "導入◆" }, "text"],
    ["type: note は note", { text: "導入", type: "NOTE" }, "note"],
    ["type: system は text として残す", { text: "システム通知", type: "system" }, "text"],
    ["type 未指定は text", { text: "こんにちは" }, "text"],
  ])("%s", (_label, m, type) => {
    const msg = one({ name: "A", createdAt: T0, ...m });
    expect(msg.type).toBe(type);
    expect(msg.text).toBe(m.text);
  });

  it.each<[string, unknown, Msg["roll"] | undefined]>([
    ["roll なし", undefined, undefined],
    ["extend が配列", [], undefined],
    ["roll が配列", { roll: [] }, undefined],
    ["roll が null", { roll: null }, undefined],
    ["最小の roll は既定値で埋める", { roll: {} }, { cmd: "ロール", skill: "", dice: "", result: "成功" }],
    [
      "cmd/skill/result はそのまま",
      { roll: { cmd: "CC<=50", skill: "目星", result: "失敗", critical: true } },
      { cmd: "CC<=50", skill: "目星", dice: "", result: "失敗" },
    ],
    [
      "critical",
      { roll: { critical: true, fumble: true } },
      { cmd: "ロール", skill: "", dice: "", result: "クリティカル" },
    ],
    [
      "critical は true のみ",
      { roll: { critical: 1, fumble: true } },
      { cmd: "ロール", skill: "", dice: "", result: "ファンブル" },
    ],
    [
      "fumble は true のみ",
      { roll: { fumble: "yes" } },
      { cmd: "ロール", skill: "", dice: "", result: "成功" },
    ],
    [
      "value を dice にする",
      { roll: { value: 42 } },
      { cmd: "ロール", skill: "", dice: "42", result: "成功" },
    ],
    [
      "dice の文字列値だけを , で結ぶ",
      { roll: { dice: [null, { value: 5 }, { value: "3" }, "x", { value: "" }, { value: "4" }], value: 9 } },
      { cmd: "ロール", skill: "", dice: "3,4", result: "成功" },
    ],
    [
      "dice が全て使えなければ value",
      { roll: { dice: [{ value: 5 }, null], value: 9 } },
      { cmd: "ロール", skill: "", dice: "9", result: "成功" },
    ],
    [
      "dice が配列でなければ value",
      { roll: { dice: { value: "1" }, value: 7 } },
      { cmd: "ロール", skill: "", dice: "7", result: "成功" },
    ],
    [
      "文字列以外の cmd/skill は既定値",
      { roll: { cmd: 1, skill: 2 } },
      { cmd: "ロール", skill: "", dice: "", result: "成功" },
    ],
  ])("%s", (_label, extend, roll) => {
    const msg = one({ name: "A", text: "x", createdAt: T0, ...(extend === undefined ? {} : { extend }) });
    expect(msg.roll).toEqual(roll);
    expect("roll" in msg).toBe(roll !== undefined);
  });
});

describe("チャンネルの組み立て", () => {
  const chOf = (channel: string, speakers = ["A"]) =>
    parseJson({ messages: speakers.map((name) => ({ name, text: "x", createdAt: T0, channel })) })
      .channels[0]!;

  it.each<[string, string, boolean]>([
    ["main", "メイン", false],
    ["MAIN", "メイン", false],
    ["tab_main_2", "メイン", false],
    ["メイン", "メイン", false],
    ["info", "情報", false],
    ["INFO", "情報", false],
    ["my_info", "情報", false],
    ["情報", "情報", false],
    ["chat", "チャット", false],
    ["CHAT", "チャット", false],
    ["free_chat", "チャット", false],
    ["チャット", "チャット", false],
    ["雑談", "チャット", false],
    ["秘匿", "秘匿", true],
    ["My_Info", "My_Info", true],
    ["Free_Chat", "Free_Chat", true],
  ])("%s → %s", (raw, name, secret) => {
    expect(chOf(raw)).toMatchObject({ id: raw, name, secret });
  });

  it("非標準チャンネルは発言者 2 人までをシークレット、3 人以上を公開とする", () => {
    expect(chOf("秘匿", ["A", "A", "B"]).secret).toBe(true);
    expect(chOf("秘匿", ["A", "B", "C"]).secret).toBe(false);
  });

  it("各チャンネル内を時刻順に並べ、チャンネル間は混ぜない", () => {
    const parsed = parseJson({
      messages: [
        { name: "A", text: "3", createdAt: T0 + 3, channel: "main" },
        { name: "A", text: "1", createdAt: T0 + 1, channel: "main" },
        { name: "B", text: "x", createdAt: T0 + 2, channel: "info" },
        { name: "A", text: "2", createdAt: T0 + 2, channel: "main" },
        { name: "A", text: "0", createdAt: T0, channel: "main" },
      ],
    });
    const main = parsed.channels.find((c) => c.id === "main")!;
    expect(main.msgs.map((m) => m.text)).toEqual(["0", "1", "2", "3"]);
    expect(main.msgs.map((m) => m.id)).toEqual(["p4", "p1", "p3", "p0"]);
    expect(parsed.channels.find((c) => c.id === "info")!.msgs.map((m) => m.text)).toEqual(["x"]);
    expect(parsed.messageCount).toBe(5);
  });

  it("メインを先頭にし、他は登場順を保つ", () => {
    const parsed = parseJson({
      messages: ["info", "秘匿", "chat", "main", "other"].map((channel) => ({
        name: "A",
        text: "x",
        createdAt: T0,
        channel,
      })),
    });
    expect(parsed.channels.map((c) => c.id)).toEqual(["main", "info", "秘匿", "chat", "other"]);
  });

  it("kinds は発言者ごとの kind を返す", () => {
    const parsed = parseJson({
      messages: [
        { name: "KP", text: "x", createdAt: T0 },
        { name: "A", text: "x", createdAt: T0, kind: "PL" },
      ],
    });
    expect(parsed.kinds).toEqual({ KP: "KP", A: "PL" });
  });
});

describe("sessionDatesOf", () => {
  it("全チャンネルの時刻を昇順に並べて重複のない日付を返す", () => {
    const day = 86400;
    const parsed = parseJson({
      messages: [
        { name: "A", text: "x", createdAt: T0 + 2 * day, channel: "main" },
        { name: "A", text: "x", createdAt: T0, channel: "info" },
        { name: "A", text: "x", createdAt: T0 + 2 * day + 60, channel: "info" },
        { name: "A", text: "x", createdAt: T0 + day, channel: "chat" },
        { name: "A", text: "x", createdAt: T0 + 60, channel: "chat" },
      ],
    });
    expect(sessionDatesOf(parsed)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });
});

describe("parseCcfoliaLog: HTML の自動判別", () => {
  const p = `<p><span>[main]</span><span>A</span><span>本文</span></p>`;
  it.each([
    ["そのまま", p],
    ["BOM 付き", `﻿${p}`],
    ["先頭空白", `  \n${p}`],
    ["BOM と空白", `﻿ \n${p}`],
  ])("%s", (_label, html) => {
    expect(parseCcfoliaLog(html)?.channels[0]?.msgs[0]).toMatchObject({ sp: "A", text: "本文", ts: 0 });
  });
  it("先頭が < でなければ JSON として扱う", () => {
    expect(parseCcfoliaLog(`x${p}`)).toBeNull();
  });
});

describe("parseCcfoliaLogHtml (DOMParser)", () => {
  it("生ログ: タブ名の角括弧は前後だけ外し、発言者と本文の空白を落とす", () => {
    const html = `<body>
      <p><span> [a[b]c] </span><span>  太郎  </span><span>  一行目 </span><span> 二行目  </span></p>
      <p><span>[main]</span><span>B</span><span>導入◆</span></p>
      <p><span>[main]</span><span>  </span><span>発言者なし</span></p>
      <p><span>[main]</span><span>C</span><span>  </span></p>
      <p><span>[main]</span><span>D</span></p>
    </body>`;
    const parsed = parseCcfoliaLogHtml(html)!;
    expect(parsed.messageCount).toBe(3);
    expect(parsed.channels.find((c) => c.id === "main")!.msgs[1]).toMatchObject({
      sp: "不明な発言者",
      text: "発言者なし",
    });
    const tab = parsed.channels.find((c) => c.id === "a[b]c")!;
    expect(tab.msgs[0]).toMatchObject({ sp: "太郎", text: "一行目 \n 二行目", kind: "PC", type: "text" });
    expect(parsed.channels.find((c) => c.id === "main")!.msgs[0]).toMatchObject({
      sp: "B",
      text: "導入◆",
      type: "text",
    });
  });

  it("生ログ: DOMParser で実体参照を解決する", () => {
    const parsed = parseCcfoliaLogHtml(
      `<p><span>[main]</span><span>A</span><span>&hearts;&copy;</span></p>`,
    )!;
    expect(parsed.channels[0]!.msgs[0]!.text).toBe("♥©");
  });

  it("生ログが取れたら旧整形ログ・新整形ログは読まない", () => {
    const html = `<p><span>[main]</span><span>生</span><span>x</span></p>
      <div class="tab"><p class="tabtitle">旧</p><p class="player"><b>旧発言者</b>y</p></div>
      <section class="tab"><h2 class="tabtitle">新</h2><div class="player"><span class="speaker-text">新発言者</span><div class="player-message">z</div></div></section>`;
    expect(Object.keys(parseCcfoliaLogHtml(html)!.kinds)).toEqual(["生"]);
  });

  it("旧整形ログ: 題・発言者・本文の空白を落とし、空の行は飛ばす", () => {
    const html = `<div class="tab"><p class="tabtitle">  情報  </p>
        <p class="player"><b>system </b>  ◆ 開始  </p>
        <p class="player"><b>KP</b>本文◆</p>
        <p class="player"><b>空</b>   </p>
        <p class="player">発言者なし</p>
        <p class="other"><b>X</b>対象外</p>
      </div>
      <div class="tab"><p class="tabtitle"></p><p class="player"><b>A</b>無題</p></div>
      <section class="tab"><h2 class="tabtitle">新</h2><div class="player"><span class="speaker-text">新</span><div class="player-message">z</div></div></section>`;
    const parsed = parseCcfoliaLogHtml(html)!;
    expect(parsed.messageCount).toBe(3);
    const info = parsed.channels.find((c) => c.id === "情報")!;
    expect(info).toMatchObject({ name: "情報", secret: false });
    expect(info.msgs.map((m) => [m.sp, m.text, m.kind, m.type])).toEqual([
      ["system", "◆ 開始", "SYSTEM", "note"],
      ["KP", "本文◆", "KP", "text"],
    ]);
    expect(parsed.channels.find((c) => c.id === "ch2")!.msgs[0]).toMatchObject({ sp: "A", text: "無題" });
  });

  it("新整形ログ: 題・発言者・本文の空白を落とし、空の行は飛ばす", () => {
    const html = `<section class="tab"><h2 class="tabtitle">  情報 </h2><ol>
        <li class="player"><span class="speaker-text"> system </span><div class="player-message"> ◆ 終了 </div></li>
        <li class="player"><span class="speaker-text">GM 花子</span><div class="player-message">本文◆</div></li>
        <li class="player"><span class="speaker-text">空</span><div class="player-message">  </div></li>
        <li class="player"><span class="speaker-text">本文要素なし</span></li>
        <li class="player"><div class="player-message">発言者なし</div></li>
      </ol></section>
      <section class="tab"><ol><li class="player"><span class="speaker-text">A</span><div class="player-message">無題</div></li></ol></section>`;
    const parsed = parseCcfoliaLogHtml(html)!;
    expect(parsed.messageCount).toBe(3);
    const info = parsed.channels.find((c) => c.id === "情報")!;
    expect(info.msgs.map((m) => [m.sp, m.text, m.kind, m.type])).toEqual([
      ["system", "◆ 終了", "SYSTEM", "note"],
      ["GM 花子", "本文◆", "KP", "text"],
    ]);
    expect(parsed.channels.find((c) => c.id === "ch2")!.msgs[0]).toMatchObject({ sp: "A", text: "無題" });
  });

  it("旧整形ログ: 題の要素や発言者の <b> が無くても既定値で扱う", () => {
    const parsed = parseCcfoliaLogHtml(`<div class="tab">
        <p class="player">発言者の要素が無いとても長い本文の行はスキップされるべきです</p>
        <p class="player"><b>A</b>題なし</p>
      </div>`)!;
    expect(parsed.messageCount).toBe(1);
    expect(parsed.channels[0]).toMatchObject({ id: "ch1", name: "ch1" });
    expect(parsed.channels[0]!.msgs[0]).toMatchObject({ sp: "A", text: "題なし" });
  });

  it("どの形式でも取れなければ null", () => {
    expect(parseCcfoliaLogHtml(`<div class="tab"><p class="player"><b>A</b></p></div>`)).toBeNull();
    expect(parseCcfoliaLogHtml(`<section class="tab"></section>`)).toBeNull();
  });
});

describe("parseCcfoliaLogZip", () => {
  const log = (name: string) => JSON.stringify({ messages: [{ name, text: "x", createdAt: T0 * 1000 }] });
  const html = (name: string) => `<p><span>[main]</span><span>${name}</span><span>x</span></p>`;
  const zipOf = async (files: Record<string, string>, dirs: string[] = []) => {
    const z = new JSZip();
    for (const d of dirs) z.folder(d);
    for (const [name, body] of Object.entries(files)) z.file(name, body);
    return parseCcfoliaLogZip(await z.generateAsync({ type: "arraybuffer" }));
  };
  const speakers = (p: Awaited<ReturnType<typeof parseCcfoliaLogZip>>) => (p ? Object.keys(p.kinds) : null);

  it("浅い階層を優先するのは zip 内の並び順によらない", async () => {
    expect(speakers(await zipOf({ "root.json": log("浅い"), "a/b.json": log("深い") }))).toEqual(["浅い"]);
    expect(speakers(await zipOf({ "root.html": html("浅い"), "a/b.html": html("深い") }))).toEqual(["浅い"]);
  });

  it("JSON は階層の浅いものを優先する(名前の長さではない)", async () => {
    expect(
      speakers(await zipOf({ "a/b.json": log("深い"), "very_long_root_name.json": log("浅い") })),
    ).toEqual(["浅い"]);
  });

  it("JSON が解析できなければ HTML を、浅い階層から試す", async () => {
    expect(
      speakers(
        await zipOf({
          "bad.json": "{x",
          "a/log.html": html("深い"),
          "very_long_root_name.HTM": html("浅い"),
        }),
      ),
    ).toEqual(["浅い"]);
    expect(speakers(await zipOf({ "x/empty.html": "<p>none</p>", "x/y/log.html": html("後") }))).toEqual([
      "後",
    ]);
  });

  it("JSON・HTML 以外の拡張子は読まない", async () => {
    expect(
      await zipOf({ "log.txt": log("A"), "log.html.bak": html("B"), "log.json.txt": log("C") }),
    ).toBeNull();
    expect(speakers(await zipOf({ "log.htm": html("D") }))).toEqual(["D"]);
  });

  it("JSON ログが HTML より優先される", async () => {
    expect(speakers(await zipOf({ "a.html": html("H"), "z.json": log("J") }, ["dir.json"]))).toEqual(["J"]);
  });
});
