import { describe, expect, it } from "vitest";
import {
  historyRowEpochs,
  normalizeHistoryDate,
  normalizeHistorySystemId,
  parseHistoryDuration,
  parsePlayHistory,
} from "./history-import";

describe("normalizeHistoryDate & normalizeHistorySystemId & parseHistoryDuration", () => {
  it("日付を YYYY-MM-DD に正規化し、無効な月日を拒否する", () => {
    expect(normalizeHistoryDate("2026/8/4")).toBe("2026-08-04");
    expect(normalizeHistoryDate("2026-11-20T21:00:00Z")).toBe("2026-11-20");
    expect(normalizeHistoryDate("2026/01/01")).toBe("2026-01-01");
    expect(normalizeHistoryDate("2026年1月9日")).toBe("2026-01-09");
    expect(normalizeHistoryDate("2026/12/31")).toBe("2026-12-31");
    expect(normalizeHistoryDate("2026/0/10")).toBeNull();
    expect(normalizeHistoryDate("2026/1/0")).toBeNull();
    expect(normalizeHistoryDate("2026/1/32")).toBeNull();
    expect(normalizeHistoryDate("2026/13/01")).toBeNull();
    expect(normalizeHistoryDate("x2026/1/1")).toBeNull();
    expect(normalizeHistoryDate("2026/1/1extra")).toBeNull();
    expect(normalizeHistoryDate("2026年0月10日")).toBeNull();
    expect(normalizeHistoryDate("2026年13月10日")).toBeNull();
    expect(normalizeHistoryDate("2026年1月0日")).toBeNull();
    expect(normalizeHistoryDate("2026年1月32日")).toBeNull();
    expect(normalizeHistoryDate("2026年12月31日")).toBe("2026-12-31");
    expect(normalizeHistoryDate("invalid-date")).toBeNull();
    expect(normalizeHistoryDate("   ")).toBeNull();
  });

  it("システム名を正規化する", () => {
    expect(normalizeHistorySystemId(undefined)).toBe("general");
    expect(normalizeHistorySystemId("   ")).toBe("general");
    expect(normalizeHistorySystemId("coc7")).toBe("coc7");
    expect(normalizeHistorySystemId("CoC7")).toBe("coc7");
    expect(normalizeHistorySystemId("クトゥルフ 6版")).toBe("coc6");
    expect(normalizeHistorySystemId("新クトゥルフ")).toBe("coc7");
    expect(normalizeHistorySystemId("エモクロアTRPG")).toBe("emoklore");
    expect(normalizeHistorySystemId("ソードワールド2.5")).toBe("sw25");
    expect(normalizeHistorySystemId("マダミス")).toBe("madamis");
    expect(normalizeHistorySystemId("不明システム")).toBe("general");
  });

  it("プレイ時間表記を分に変換する", () => {
    expect(parseHistoryDuration(undefined)).toBeUndefined();
    expect(parseHistoryDuration("  ")).toBeUndefined();
    expect(parseHistoryDuration(" 3時間30分 ")).toBe(210);
    expect(parseHistoryDuration("4時間")).toBe(240);
    expect(parseHistoryDuration("90分")).toBe(90);
    expect(parseHistoryDuration("2:45")).toBe(165);
    expect(parseHistoryDuration("2.5h")).toBe(150);
    expect(parseHistoryDuration("1.5時間")).toBe(90);
    expect(parseHistoryDuration("24")).toBe(24 * 60);
    expect(parseHistoryDuration("25")).toBe(25);
    expect(parseHistoryDuration("0h")).toBeUndefined();
    expect(parseHistoryDuration("-2")).toBeUndefined();
    expect(parseHistoryDuration("10分未満")).toBeUndefined();
    expect(parseHistoryDuration("x2:30")).toBeUndefined();
    expect(parseHistoryDuration("180")).toBe(180);
    expect(parseHistoryDuration("0")).toBeUndefined();
    expect(parseHistoryDuration("不正")).toBeUndefined();
  });
});

describe("parsePlayHistory (CSV / TSV / Markdown / JSON)", () => {
  it("RFC 4180 CSV の引用符・改行・エスケープ引用符・複数キャラを正しくパースする", () => {
    const csv = `日付,シナリオ名,使用システム,GM,PL,キャラクター,時間,感想
2026/05/01,"霧と""時計塔""",CoC7,佐々,"みかん、そら","遠沢 澄花 / 佐々",3時間30分,"とても
良い卓でした"
2026-06-12,,emoklore,しゅん,全員,,90分,空行扱いでスキップ対象`;

    const res = parsePlayHistory(csv);
    expect(res).not.toBeNull();
    expect(res?.format).toBe("csv");
    expect(res?.skippedLines).toBe(1);
    expect(res?.rows).toHaveLength(1);
    expect(res?.rows[0]).toEqual({
      date: "2026-05-01",
      title: '霧と"時計塔"',
      scenarioTitle: '霧と"時計塔"',
      systemId: "coc7",
      gmName: "佐々",
      playerNames: ["みかん", "そら"],
      characterNames: ["遠沢 澄花", "佐々"],
      durationMinutes: 210,
      memo: "とても\n良い卓でした",
    });

    const epochs = historyRowEpochs(res!.rows[0]!);
    expect(epochs.t1 - epochs.t0).toBe(210 * 60);
  });

  it("TSV 形式・タイトルのみ（シナリオ列なし）を正しくパースする", () => {
    const tsv = ["played_at\ttitle\tsystem\tduration\tmemo", "2026-09-01\t夜行列車\tsw25\t4:00\tクリア"].join(
      "\n",
    );
    const res = parsePlayHistory(tsv);
    expect(res?.format).toBe("tsv");
    expect(res?.rows[0]).toMatchObject({
      date: "2026-09-01",
      title: "夜行列車",
      scenarioTitle: "夜行列車",
      systemId: "sw25",
      durationMinutes: 240,
      memo: "クリア",
    });
  });

  it("Markdown 表（区切り行含む）をパースする", () => {
    const md = `
| 日付 | シナリオ | システム | キャラ | メモ |
| :--- | :--- | :--- | :--- | :--- |
| 2026/10/03 | 新約・きさらぎ駅 | エモクロア | 相葉 陽向 | ED-A |
`;
    const res = parsePlayHistory(md);
    expect(res?.format).toBe("markdown");
    expect(res?.rows).toHaveLength(1);
    expect(res?.rows[0]).toMatchObject({
      date: "2026-10-03",
      title: "新約・きさらぎ駅",
      systemId: "emoklore",
      characterNames: ["相葉 陽向"],
      memo: "ED-A",
    });
  });

  it("JSON 配列を取り込み、不正要素をスキップして集計する", () => {
    const json = JSON.stringify([
      null,
      { date: "2026-01-10", scenario: "星を掬う", system: "coc6", duration: 2, notes: "生還" },
      { date: "2026-01-11" },
    ]);
    const res = parsePlayHistory(json);
    expect(res?.format).toBe("json");
    expect(res?.rows).toHaveLength(1);
    expect(res?.skippedLines).toBe(2);
    expect(res?.rows[0]).toMatchObject({
      date: "2026-01-10",
      title: "星を掬う",
      systemId: "coc6",
      durationMinutes: 120,
      memo: "生還",
    });

    const defaultEpochs = historyRowEpochs({
      date: "2026-01-10",
      title: "星を掬う",
      systemId: "coc6",
      playerNames: [],
      characterNames: [],
    });
    expect(defaultEpochs.t1 - defaultEpochs.t0).toBe(180 * 60);
  });

  it("空文字・必須ヘッダ欠如・不正 JSON には null を返す", () => {
    expect(parsePlayHistory("   ")).toBeNull();
    expect(parsePlayHistory("[broken json")).toBeNull();
    expect(parsePlayHistory("[{}]")).toBeNull();
    expect(parsePlayHistory("日付,メモ\n2026-01-01,感想")).toBeNull();
    expect(parsePlayHistory("1行だけの文章")).toBeNull();
    expect(parsePlayHistory("日付,シナリオ")).toBeNull();
  });

  it("CRLF 改行・空行混在 CSV・外枠パイプなし Markdown・数値混在 JSON・日付欠落時の当日フォールバックを検証する", () => {
    const crlfCsv =
      " 日 付 , 卓 名 , シナリオ名 , 使 用 シ ス テ ム , PL , 時 間 \r\n   \r\n,今夜の卓,別シナリオ,CoC7,A/B・C,2時間\r   \r2026-01-01,単体\r";
    const csvRes = parsePlayHistory(crlfCsv)!;
    expect(csvRes.format).toBe("csv");
    expect(csvRes.rows).toHaveLength(2);
    expect(csvRes.rows[0]).toMatchObject({
      title: "今夜の卓",
      scenarioTitle: "別シナリオ",
      systemId: "coc7",
      playerNames: ["A", "B", "C"],
      durationMinutes: 120,
    });
    expect(csvRes.rows[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(csvRes.rows[1]).toMatchObject({ date: "2026-01-01", title: "単体" });

    // Markdown が1行しか | で始まらないときは CSV/TSV とみなされないなら null
    expect(parsePlayHistory("| 日付 | タイトル |\n通常行")).toBeNull();
    // 区切り行と紛らわしい row (1セルだけ --- で他が本文) は除外されずデータ行になる
    const mdMixed = ["| 卓名 | メモ |", "| :--- | ---: |", "| --- | 実際のタイトル |"].join("\n");
    const mdMixedRes = parsePlayHistory(mdMixed)!;
    expect(mdMixedRes.rows[0]).toMatchObject({ title: "---", memo: "実際のタイトル" });

    // CSV で末尾改行なし・空白行のみ後の row を正しく切る
    const noTrailCsv = "タイトル,PL\n行1,A、\n行2,  \n   ,   ";
    const noTrailRes = parsePlayHistory(noTrailCsv)!;
    expect(noTrailRes.rows).toHaveLength(2);
    expect(noTrailRes.rows[0]?.playerNames).toEqual(["A"]);
    expect(noTrailRes.rows[1]?.playerNames).toEqual([]);

    const mdNoOuterPipes = [
      "タイトル | システム | キャラ",
      "--- | :---: | ---:",
      "静寂の塔 | general | PC1, PC2",
    ].join("\n");
    expect(parsePlayHistory(mdNoOuterPipes)).toBeNull(); // pipe が先頭でない場合

    const mdWithOuter = [
      "| 卓名 | キャラ | メモ |",
      "| :--- | :---: | ---: |",
      "| 静寂の塔 | A・B, C / D／E |  |",
    ].join("\n");
    const mdRes = parsePlayHistory(mdWithOuter)!;
    expect(mdRes.format).toBe("markdown");
    expect(mdRes.rows[0]?.characterNames).toEqual(["A", "B", "C", "D", "E"]);
    expect(mdRes.rows[0]?.memo).toBeUndefined();

    const jsonMixed = JSON.stringify([
      42,
      ["nested"],
      { title: "有効レコード", duration: 90, date: "2026/7/4", gm: "  " },
    ]);
    const jRes = parsePlayHistory(jsonMixed)!;
    expect(jRes.format).toBe("json");
    expect(jRes.skippedLines).toBe(2);
    expect(jRes.rows[0]).toMatchObject({
      date: "2026-07-04",
      title: "有効レコード",
      scenarioTitle: "有効レコード",
      durationMinutes: 90,
      gmName: undefined,
    });
  });
});
