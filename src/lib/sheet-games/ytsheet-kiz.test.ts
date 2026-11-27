import { describe, expect, it } from "vitest";
import { buildSheet, compact } from "../sheet";
import { readYtsheetKiz } from "./ytsheet-kiz";

/** ゆとシートⅡ kiz の JSON と同じキー構造の作り物（名前・値は架空） */
const HOUND = {
  class: "ハウンド",
  negaiOutside: "正裁",
  negaiInside: "破壊",
  gender: "女",
  age: "17",
  background: "出会いの経緯",
  missing: "痛覚",
  endurance: 31,
  operation: 6,
  kizunaNum: 3,
  kizuna1Name: "古い懐中時計",
  kizuna1Note: "祖父の形見",
  kizuna1Hibi: 1,
  kizuna2Name: "旧友",
  kizuna2Hibi: 1,
  kizuna2Ware: 1,
  kizuna3Name: "",
  shougou1: "冷たき猟犬",
  kizuato1Name: "｜無痛の人形《むつうのにんぎょう》",
  kizuato1DramaHitogara: "喪失：痛覚",
  kizuato1DramaTiming: "調査",
  kizuato1DramaTarget: "自身",
  kizuato1DramaLimited: "シナリオ1回",
  kizuato1DramaNote: "調査判定+1D。",
  kizuato1BattleTiming: "威力の強化",
  kizuato1BattleCost: "【耐久値】8",
  kizuato1BattleNote: "威力+2。",
  partner1Name: "架空の相棒",
  partner1Gender: "男",
  partner1NegaiOutside: "守護",
  partner1NegaiInside: "復讐",
  freeNote: "メモ&lt;br&gt;二行目",
};

const find = (id: string, src: object = HOUND) => readYtsheetKiz(src).sections.find((s) => s?.id === id);

describe("ゆとシートⅡのキズナバレットを読む", () => {
  it("種別とネガイ（表／裏）・過去などを経歴の項目にする", () => {
    const { profile, systemLabel } = readYtsheetKiz(HOUND);
    expect(systemLabel).toBe("キズナバレット");
    const p = Object.fromEntries(compact(profile).map((e) => [e.label, e.value]));
    expect(p).toMatchObject({ 種別: "ハウンド", ネガイ: "正裁（表）／破壊（裏）", 年齢: 17, 喪失: "痛覚" });
  });

  it("経緯の欄はハウンドなら「遭遇」、オーナーなら「経緯」と呼ぶ", () => {
    const label = (src: object) =>
      compact(readYtsheetKiz(src).profile).find((e) => e.value === "出会いの経緯")?.label;
    expect(label(HOUND)).toBe("遭遇");
    expect(label({ ...HOUND, class: "オーナー" })).toBe("経緯");
  });

  it("耐久値と作戦力を副能力値にし、stats に入れる", () => {
    expect(find("resources")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["耐久値", 31],
      ["作戦力", 6],
    ]);
    expect(readYtsheetKiz(HOUND).stats).toEqual({ endurance: 31, operation: 6 });
  });

  it("キズナはヒビ・ワレの状態を値にし、名前のない行を落とす", () => {
    expect(find("kizuna")?.entries).toEqual([
      { label: "古い懐中時計", value: "ヒビ", note: "祖父の形見" },
      { label: "旧友", value: "ヒビ／ワレ" },
    ]);
  });

  it("キズアトはふりがな記法を外し、ドラマと決戦の効果に分けて補足にする", () => {
    expect(find("kizuato")?.entries).toEqual([
      {
        label: "無痛の人形",
        value: "",
        note: "ドラマ：喪失：痛覚 調査 自身 シナリオ1回 調査判定+1D。　決戦：威力の強化 【耐久値】8 威力+2。",
      },
    ]);
  });

  it("傷号・パートナー・メモを読む（空の傷号は出さない）", () => {
    expect(find("shougou")?.entries).toEqual([{ label: "冷たき猟犬", value: "" }]);
    expect(find("partners")?.entries).toEqual([{ label: "架空の相棒", value: "", note: "男　守護／復讐" }]);
    expect(find("memo")?.text).toBe("メモ\n二行目");
  });

  it("空の JSON は空のシートになり、落ちない", () => {
    for (const bad of [{}, [], null]) {
      const read = readYtsheetKiz(bad);
      expect(read.stats).toEqual({});
      expect(buildSheet("ytsheet", read)).toBeUndefined();
    }
  });
});
