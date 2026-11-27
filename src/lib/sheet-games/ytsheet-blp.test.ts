import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetBlp } from "./ytsheet-blp";

/** ゆとシートⅡ blp の JSON と同じキー構造の作り物（名前・値は架空） */
const HUMAN = {
  characterName: "架空の監督官",
  factor: "人間",
  factorCore: "義士",
  factorStyle: "監者",
  gender: "女",
  age: "27",
  ageApp: "27",
  belong: "教会",
  missing: "記憶",
  missingNote: "幼少期のもの",
  level: 3,
  statusMain1: 8,
  statusMain2: 10,
  endurance: 26,
  initiative: 20,
  bloodartsNum: 2,
  bloodarts1Name: "闇明視",
  bloodarts1Timing: "いつでも",
  bloodarts1Target: "解説参照",
  bloodarts1Note: "裏向きのカードを表にする。（P.151）",
  bloodarts2Name: "",
  arts1Name: "武器攻撃",
  arts1Timing: "攻撃",
  arts1Target: "単体",
  arts1Cost: "手札1枚",
  arts1Limited: "なし",
  arts1Note: "カードを1枚破壊する。",
  arts2Name: "真摯なる言葉",
  arts2Cost: "なし",
  arts2Limited: "シナリオ１回",
  scarName: "喪われた名",
  scarNote: "傷の設定",
  artsSTiming: "準備",
  artsSNote: "傷号の効果",
  partner1Name: "華麗なる決闘者",
  partner1Factor: "貴種／舞人",
  partner1Age: "／",
  partner1Missing: "視力",
  freeNote: "メモ&lt;br&gt;二行目",
};
const VAMPIRE = {
  factor: "吸血鬼",
  factorCore: "貴種",
  factorStyle: "舞人",
  statusMain1: 7,
  statusMain2: 11,
  age: "300",
  ageApp: "20",
};

const find = (id: string, src: object = HUMAN) => readYtsheetBlp(src).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのブラッドパスを読む", () => {
  it("ファクターと所属・喪失などを経歴の項目にし、備考を補足にする", () => {
    const { profile, systemLabel } = readYtsheetBlp(HUMAN);
    expect(systemLabel).toBe("ブラッドパス");
    const p = compact(profile);
    expect(p[0]).toEqual({ label: "ファクター", value: "人間／義士／監者" });
    expect(p.find((e) => e.label === "年齢")?.value).toBe(27);
    expect(p.find((e) => e.label === "所属")?.value).toBe("教会");
    expect(p.find((e) => e.label === "喪失")).toMatchObject({ value: "記憶", note: "幼少期のもの" });
    expect(p.find((e) => e.label === "傷号")).toMatchObject({ value: "喪われた名", note: "傷の設定" });
  });

  it("人間の能力値は【技】【情】、吸血鬼は【血】【想】と読む", () => {
    expect(find("abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["技", 8],
      ["情", 10],
    ]);
    expect(find("abilities", VAMPIRE)?.entries.map((e) => [e.label, e.value])).toEqual([
      ["血", 7],
      ["想", 11],
    ]);
  });

  it("吸血鬼の年齢は外見年齢が違うときだけ添える", () => {
    const age = compact(readYtsheetBlp(VAMPIRE).profile).find((e) => e.label === "年齢");
    expect(age?.value).toBe("300（外見20）");
  });

  it("練度・耐久値・先制値を副能力値にし、stats に入れる", () => {
    expect(find("resources")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["練度", 3],
      ["耐久値", 26],
      ["先制値", 20],
    ]);
    expect(readYtsheetBlp(HUMAN).stats).toEqual({ level: 3, endurance: 26, initiative: 20 });
  });

  it("血威はタイミング・対象・解説を読み、名前のない行は落とす", () => {
    expect(find("bloodarts")?.entries).toEqual([
      {
        label: "闇明視",
        value: "",
        note: "いつでも　解説参照　裏向きのカードを表にする。（P.151）",
      },
    ]);
  });

  it("特技は代償・条件の「なし」を出さず、傷号特技を末尾に足す", () => {
    const arts = find("arts")!.entries;
    expect(arts[0]).toEqual({
      label: "武器攻撃",
      value: "",
      note: "攻撃　単体　代償：手札1枚　カードを1枚破壊する。",
    });
    expect(arts[1]).toEqual({ label: "真摯なる言葉", value: "", note: "条件：シナリオ１回" });
    expect(arts[2]).toEqual({
      label: "傷号特技（喪われた名）",
      value: "",
      note: "準備　傷号の効果",
    });
  });

  it("血契の相手は起源・流儀と欠落を補足にし、空の年齢「／」は出さない", () => {
    expect(find("partners")?.entries).toEqual([
      { label: "華麗なる決闘者", value: "", note: "貴種／舞人　欠落：視力" },
    ]);
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetBlp(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
