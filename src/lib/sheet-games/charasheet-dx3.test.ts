import { describe, expect, it } from "vitest";
import { sheetSection } from "../sheet";
import { dx3FromCharasheet } from "./charasheet-dx3";

/** 保管所のダブルクロス 3rd（game: "dx3"）の形を真似た架空のシート */
const fixture = {
  game: "dx3",
  pc_name: "試験 太郎",
  pc_codename: "テストコード",
  class1_name: "モルフェウス",
  class2_name: "ノイマン",
  class3_name: "",
  works_name: "UGNエージェントB",
  cover_name: "会社員",
  age: "24",
  sex: "男",
  NP1: "3",
  NP2: "6",
  NP3: "1",
  NP4: "2",
  NP5: "27",
  NP6: "33",
  NP7: "13",
  NP8: "18",
  money_point: "5",
  exp_his_sum: "120",
  sum_seichoten_default: "130",
  seichoten_left: "85",
  shutuji_name: "資産家",
  shutuji_sonota: "裕福な家",
  kaikou_name: "忘却",
  birth_name: "素体",
  think_name: "恐怖",
  keiken_name: "",
  skill_tokugi: ["1", "", "2", "4", "", "", "1", "", "3", "", "", "", "2", ""],
  skill_extra: ["", "", "", "", "", "", "1", "", "1", "", "", "", "1", ""],
  skill_sonota: ["", "2", "", "", "", "", "", "", "", "", "", "", "", ""],
  skill_total: ["3r+1", "3r+2", "3r+2", "6r+4", "6r", "6r", "2r+1", "2r", "2r+3", "", "", "", "", ""],
  skill_memo: ["", "", "", "", "", "", "", "", "", "", "", "", "噂話", ""],
  skill_id: ["4", "4"],
  effect_name: ["コンセントレイト", "", "レインフォース"],
  effect_lv: ["2", "", "3"],
  effect_timing: ["メジャー", "", "メジャー"],
  effect_hantei: ["", "", "対決"],
  effect_taisho: ["", "", "-"],
  effect_range: ["", "", "武器"],
  effect_cost: ["2", "", "2"],
  easyeffect_name: ["タッピング"],
  easyeffect_lv: ["1"],
  easyeffect_timing: [""],
  roice_type: ["1", "2", "0", "0"],
  roice_name: ["両親", "宿敵", "友人", ""],
  roice_pos: ["庇護", "", "友情", ""],
  roice_neg: ["不安", "", "", ""],
  pc_making_memo: "メモの本文",
};

describe("保管所のダブルクロス 3rd", () => {
  const parts = dx3FromCharasheet(fixture);
  const sec = (id: string) =>
    sheetSection(
      { v: 1, provider: "charasheet", profile: [], sections: parts.sections.filter((s) => s !== null) },
      id,
    );

  it("シンドローム・ワークス・カヴァー・Dロイスを読む", () => {
    const p = Object.fromEntries(parts.profile.flatMap((e) => (e ? [[e.label, e.value]] : [])));
    expect(p["シンドローム"]).toBe("モルフェウス／ノイマン");
    expect(p["ワークス"]).toBe("UGNエージェントB");
    expect(p["カヴァー"]).toBe("会社員");
    expect(p["コードネーム"]).toBe("テストコード");
    expect(p["Dロイス"]).toBe("両親");
    expect(parts.systemLabel).toBe("ダブルクロス The 3rd Edition");
  });

  it("能力値と、侵蝕率基本値・HP・行動値・経験点を読む", () => {
    expect(sec("abilities")?.entries.map((e) => [e.label, e.value])).toEqual([
      ["肉体", 3],
      ["感覚", 6],
      ["精神", 1],
      ["社会", 2],
    ]);
    const res = Object.fromEntries(sec("resources")!.entries.map((e) => [e.label, e.value]));
    expect(res).toMatchObject({
      HP: 27,
      侵蝕率基本値: 33,
      行動値: 13,
      戦闘移動: 18,
      全力移動: 36,
      獲得経験点: 120,
      残り経験点: 85,
    });
    // 続く経験点は合計（初期 130 + 獲得 120）。ゆとシートの expTotal と同じ意味にそろえる
    expect(parts.stats).toEqual({ hp: 27, exp: 250 });
  });

  it("技能は能力値ごとの group を付け、SL とその他の修正を足したレベルにする", () => {
    const skills = sec("skills")!.entries;
    const by = (label: string) => skills.find((e) => e.label === label);
    expect(by("白兵")).toMatchObject({ value: 1, group: "肉体" });
    expect(by("回避")?.value).toBe(2); // その他の修正 +2
    expect(by("RC")).toMatchObject({ value: 1, group: "精神" }); // 修正 +1 はダイス数なので足さない
    expect(by("運転")).toMatchObject({ value: 2, group: "肉体" });
    expect(by("芸術")).toBeUndefined(); // 習得していない名前なしの行は載せない
    expect(by("情報：噂話")).toMatchObject({ value: 2, group: "社会" });
  });

  it("エフェクトはタイミングなどを補足にし、空行と「-」を落とす", () => {
    const arts = sec("arts")!.entries;
    expect(arts.map((e) => e.label)).toEqual(["コンセントレイト", "レインフォース"]);
    expect(arts[1]).toMatchObject({ value: 3, note: "メジャー　対決　武器　2" });
    expect(sec("easy-effects")!.entries[0]).toMatchObject({ label: "タッピング", value: 1 });
  });

  it("ロイスは D / S の種別と感情を読み、名前のない行を落とす", () => {
    const lois = sec("lois")!.entries;
    expect(lois.map((e) => [e.label, e.value, e.note])).toEqual([
      ["両親", "D", "庇護　不安"],
      ["宿敵", "S", undefined],
      ["友人", "", "友情"],
    ]);
  });

  it("ライフパスは名前のある項目だけ読む", () => {
    const lp = sec("lifepath")!.entries;
    expect(lp.map((e) => [e.label, e.value])).toEqual([
      ["出自", "資産家"],
      ["邂逅", "忘却"],
      ["覚醒", "素体"],
      ["衝動", "恐怖"],
    ]);
    expect(sec("memo")?.text).toBe("メモの本文");
  });

  it("空のデータからは何も作らない", () => {
    const empty = dx3FromCharasheet({});
    expect(empty.profile.every((e) => e === null)).toBe(true);
    expect(empty.sections.every((s) => s === null || s.entries.length === 0 || s.kind === "text")).toBe(true);
    expect(empty.stats).toEqual({});
  });
});
