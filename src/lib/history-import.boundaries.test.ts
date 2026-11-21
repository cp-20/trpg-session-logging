import { describe, expect, it } from "vitest";
import {
  historyRowEpochs,
  normalizeHistoryDate,
  normalizeHistorySystemId,
  parseHistoryDuration,
  parsePlayHistory,
} from "./history-import";

describe("normalizeHistoryDate の境界", () => {
  it.each([
    [" 2026/1/1 ", "2026-01-01"],
    ["2026年1月1日", "2026-01-01"],
    ["2026年1月1日(土)", "2026-01-01"],
    ["2026-1-31", "2026-01-31"],
    ["x2026年1月9日", null],
    ["", null],
  ])("%j → %j", (raw, expected) => {
    expect(normalizeHistoryDate(raw)).toBe(expected);
  });
});

describe("normalizeHistorySystemId の表記ゆれ", () => {
  it.each([
    // SYSTEMS のキーは大小文字・前後空白を無視して一致させる（正規表現では拾えない madamis で確かめる）
    [" MadaMis ", "madamis"],
    ["general", "general"],
    ["", "general"],
    ["クトゥルフ6", "coc6"],
    ["クトゥルフ神話TRPG 第6版", "coc6"],
    ["CoC6th", "coc6"],
    ["CoC 6th", "coc6"],
    ["Call of Cthulhu", "coc7"],
    ["SW2.5", "sw25"],
    ["SW 2.5", "sw25"],
    ["ソード・ワールド2.0", "sw25"],
    ["マーダーミステリー", "madamis"],
    ["Emoklore", "emoklore"],
  ])("%j → %s", (raw, expected) => {
    expect(normalizeHistorySystemId(raw)).toBe(expected);
  });
});

describe("parseHistoryDuration の書式", () => {
  it.each([
    ["", undefined],
    ["0時間", 0],
    ["12時間", 720],
    ["12時間30分", 750],
    ["3時間30 分", 210],
    ["3 時間 30 分", 210],
    ["3時間30分以上", undefined],
    ["90 分", 90],
    ["x90分", undefined],
    ["12:30", 750],
    ["2:45:00", undefined],
    ["2:5", undefined],
    ["1.25h", 75],
    ["1.5 H", 90],
    ["300", 300],
    ["24.5", 25],
  ])("%j → %j", (raw, expected) => {
    expect(parseHistoryDuration(raw)).toBe(expected);
  });
});

describe("parsePlayHistory: CSV / TSV の細部", () => {
  it("途中の引用符は文字として扱い、引用符で始まる欄だけを囲みとみなす", () => {
    const res = parsePlayHistory('タイトル,メモ\n5"インチ,"a,b"\n"夜, 霧",x');
    expect(res?.rows.map((r) => [r.title, r.memo])).toEqual([
      ['5"インチ', "a,b"],
      ["夜, 霧", "x"],
    ]);
  });

  it("区切りのない最終行・末尾が区切りの最終行・列が足りない行も読む", () => {
    expect(parsePlayHistory("タイトル,メモ\n行1")?.rows).toEqual([
      expect.objectContaining({ title: "行1", memo: undefined }),
    ]);
    expect(parsePlayHistory("タイトル,メモ\n行1,")?.rows).toEqual([
      expect.objectContaining({ title: "行1", memo: undefined }),
    ]);
    expect(parsePlayHistory("タイトル\tメモ\n行1\t")?.rows).toEqual([
      expect.objectContaining({ title: "行1", memo: undefined }),
    ]);
  });

  it("CR・CRLF・LF の改行を同じように扱い、空白だけの行は数えない", () => {
    for (const nl of ["\n", "\r", "\r\n"]) {
      const res = parsePlayHistory(["タイトル,PL", "  ,  ", "夜,A", "   ", "朝,B"].join(nl))!;
      expect(res.rows.map((r) => r.title)).toEqual(["夜", "朝"]);
      // 空白だけの行（区切りだけの行も含む）は読み飛ばしにも数えない
      expect(res.skippedLines).toBe(0);
    }
  });

  it("欄の前後の空白を落とし、空白だけのタイトル・シナリオ・メモは無いものとする", () => {
    const res = parsePlayHistory("タイトル,シナリオ,メモ\n  夜  ,  霧  ,  感想  \n   ,   ,x\n朝,,   ")!;
    expect(res.skippedLines).toBe(1);
    expect(res.rows).toEqual([
      expect.objectContaining({ title: "夜", scenarioTitle: "霧", memo: "感想" }),
      expect.objectContaining({ title: "朝", scenarioTitle: "朝", memo: undefined }),
    ]);
  });

  it("名前の列が空・欠けているときは空配列、連続する区切りは 1 つとみなす", () => {
    const res = parsePlayHistory("日付\tタイトル\tPL\n2026/1/1\t夜\t\n")!;
    expect(res.format).toBe("tsv");
    expect(res.rows[0]).toEqual({
      date: "2026-01-01",
      title: "夜",
      scenarioTitle: "夜",
      systemId: "general",
      gmName: undefined,
      playerNames: [],
      characterNames: [],
      durationMinutes: undefined,
      memo: undefined,
    });
    expect(parsePlayHistory('タイトル,PL\n夜,"A,,B、、C"')?.rows[0]?.playerNames).toEqual(["A", "B", "C"]);
  });

  it("区切り文字のない複数行は表とみなさない", () => {
    expect(parsePlayHistory("タイトル\n夜")).toBeNull();
    expect(parsePlayHistory("タイトル\n夜,霧")).toBeNull();
  });

  it("タイトル・シナリオの列がなければ null", () => {
    expect(parsePlayHistory("日付,システム\n2026-01-01,coc7")).toBeNull();
    expect(parsePlayHistory("タイトル,メモ\n,x\n,y")).toBeNull();
  });
});

describe("parsePlayHistory: Markdown 表の細部", () => {
  it("区切り行しかない表・見出ししかない表は null", () => {
    expect(parsePlayHistory("| --- |\n| :---: |")).toBeNull();
    expect(parsePlayHistory("| タイトル |\n| --- |")).toBeNull();
  });

  it("区切り行なし・2 行だけの表も Markdown として読む", () => {
    const res = parsePlayHistory("| タイトル |\n| 夜 |");
    expect(res?.format).toBe("markdown");
    expect(res?.rows.map((r) => r.title)).toEqual(["夜"]);
  });

  it("行末のパイプがない行・字下げされた行も読む", () => {
    const res = parsePlayHistory("  | タイトル | メモ\n  | --- | --- |\n  | 夜 | 霧");
    expect(res?.format).toBe("markdown");
    expect(res?.rows).toEqual([expect.objectContaining({ title: "夜", memo: "霧" })]);
  });

  it("先頭のパイプがない行も同じ列に分ける", () => {
    const res = parsePlayHistory(["| タイトル | メモ |", "| --- | --- |", "夜 | 霧"].join("\n"));
    expect(res?.rows).toEqual([expect.objectContaining({ title: "夜", memo: "霧" })]);
  });

  it("パイプを含まない注記行は表の行にしない", () => {
    const res = parsePlayHistory(
      ["| タイトル | メモ |", "| --- | --- |", "| 夜 | 霧 |", "注記だけの行"].join("\n"),
    );
    expect(res?.rows.map((r) => r.title)).toEqual(["夜"]);
    expect(res?.skippedLines).toBe(0);
  });

  it("「-」が 2 つ以上だけの欄の行を区切り行とみなし、それ以外の文字を含めばデータ行にする", () => {
    const res = parsePlayHistory(
      ["| タイトル | メモ |", "| -- | :--: |", "| x-- | a-- |", "| --x | --a |", "| - | - |"].join("\n"),
    );
    expect(res?.rows.map((r) => [r.title, r.memo])).toEqual([
      ["x--", "a--"],
      ["--x", "--a"],
      ["-", "-"],
    ]);
  });
});

describe("parsePlayHistory: JSON", () => {
  it("前後に空白があっても JSON 配列として読む", () => {
    const res = parsePlayHistory(`  \n${JSON.stringify([{ title: "夜" }])}\n `);
    expect(res?.format).toBe("json");
    expect(res?.rows[0]?.title).toBe("夜");
  });

  it("文字列・数値以外の値は無視し、見出しに当たらないキーは読まない", () => {
    const res = parsePlayHistory(
      JSON.stringify([
        { title: true, scenario: "霧" },
        { title: { x: 1 }, memo: 5 },
        { unknown: "夜", title: "朝", duration: 1.5 },
      ]),
    );
    expect(res?.skippedLines).toBe(1);
    expect(res?.rows).toEqual([
      expect.objectContaining({ title: "霧", scenarioTitle: "霧" }),
      expect.objectContaining({ title: "朝", durationMinutes: 90 }),
    ]);
  });

  it("壊れた JSON は undefined ではなく null を返す", () => {
    expect(parsePlayHistory("[1,")).toBeNull();
    expect(parsePlayHistory("[]")).toBeNull();
    // [ で始まれば JSON としてだけ読み、CSV としては読み直さない
    expect(parsePlayHistory("[x,タイトル\n夜,霧")).toBeNull();
  });
});

describe("historyRowEpochs", () => {
  const base = { date: "2026-01-10", title: "夜", systemId: "general", playerNames: [], characterNames: [] };
  it.each([
    [undefined, 180],
    [0, 180],
    [-5, 180],
    [1, 1],
    [240, 240],
  ])("durationMinutes=%j → %i 分", (durationMinutes, mins) => {
    const { t0, t1 } = historyRowEpochs({ ...base, durationMinutes });
    expect(t1 - t0).toBe(mins * 60);
  });
});
