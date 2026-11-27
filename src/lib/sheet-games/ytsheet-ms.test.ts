import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetMs } from "./ytsheet-ms";

/** ゆとシートⅡ ms の JSON と同じキー構造の作り物（名前・値は架空） */
const SAMPLE = {
  taxa: "電子｜生物《なまもの》",
  home: "日本",
  origin: "究明",
  background: "取引",
  clanEmotion: "ビジネス",
  address: "都下西ブロック",
  clan: "架空工房",
  level: 1,
  endurance: 20,
  statusPhysical: 2,
  statusSocial: 4,
  statusSpecial: 6,
  attributeRows: 3,
  attributePhysical1: "機械仕掛け",
  attributeSocial1: "ヒマモノ",
  attributeSocial2: "マスコット",
  attributeSpecial1: "雷電の主",
  attributeSpecial2: "",
  magi1: "いたずら",
  magi1NC: 1,
  magi1Name: "クラッキング",
  magi1Timing: "効果参照",
  magi1Cond: "なし",
  magi1Note: "［マリョク］をリセットする。",
  magi2: "ひらめき",
  magi2Timing: "メジャー",
  magi2Note: "判定に+1D",
  freeNote: "メモ&lt;br&gt;二行目",
};

const find = (id: string) => readYtsheetMs(SAMPLE).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのマモノスクランブルを読む", () => {
  it("分類名（ふりがな記法は外す）・根源・経緯・クランを経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetMs(SAMPLE);
    expect(systemLabel).toBe("マモノスクランブル");
    expect(Object.fromEntries(compact(profile).map((e) => [e.label, e.value]))).toEqual({
      分類名: "電子生物",
      出身地: "日本",
      根源: "究明",
      経緯: "取引",
      クランへの感情: "ビジネス",
      住所: "都下西ブロック",
      所属クラン: "架空工房",
    });
  });

  it("身体・異質・社会の能力値と、強度・耐久値を読む", () => {
    expect(find("abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["身体", 2],
      ["異質", 6],
      ["社会", 4],
    ]);
    expect(find("resources")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["強度", 1],
      ["耐久値", 20],
    ]);
    expect(readYtsheetMs(SAMPLE).stats).toEqual({ level: 1, endurance: 20 });
  });

  it("特性は《》つきで身体・異質・社会の順に並べ、空の欄を落とす", () => {
    expect(find("attributes")?.entries.map((e) => e.label)).toEqual([
      "《機械仕掛け》",
      "《雷電の主》",
      "《ヒマモノ》",
      "《マスコット》",
    ]);
  });

  it("マギは名前変更があれば新しい名前を使い、元のマギ名を補足に残す", () => {
    expect(find("magi")?.entries).toEqual([
      {
        label: "クラッキング",
        value: "",
        note: "（いたずら）　効果参照　［マリョク］をリセットする。",
      },
      { label: "ひらめき", value: "", note: "メジャー　判定に+1D" },
    ]);
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetMs(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
