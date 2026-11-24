import { describe, expect, it } from "vitest";
import type { Msg } from "../types";
import { inferSpeakerKinds } from "./speaker-kinds";

let id = 0;
const say = (sp: string, n: number, text = "…"): Msg[] =>
  Array.from({ length: n }, () => ({ id: `m${id++}`, ts: 0, sp, kind: "PC", type: "text", text }));
const PROSE =
  "優しい太陽の光を浴びて出発する。なだらかにどこまでも続くような地平線を見ているとうっかりと昼寝をしたくなる誘惑にかられる。";
const kindsOf = (msgs: Msg[]) => Object.fromEntries(inferSpeakerKinds(msgs));
const roll = (sp: string, n: number, skill = "目星", cmd = "CCB<=50"): Msg[] =>
  Array.from({ length: n }, () => ({
    id: `m${id++}`,
    ts: 0,
    sp,
    kind: "PC",
    type: "roll",
    text: "",
    roll: { cmd: `${cmd} 【${skill}】`, skill, dice: "30", result: "成功" },
  }));

describe("inferSpeakerKinds", () => {
  it("場面・場所の見出しは描写、量産の敵と伏せ字は NPC、探索者は PC のまま", () => {
    const msgs = [
      ...say("鼓星　織音 (つづみぼし　しきね)", 40),
      ...roll("鼓星　織音 (つづみぼし　しきね)", 30),
      ...say("梓釀　太陽", 30),
      ...roll("梓釀　太陽", 25),
      ...say("9号車/探索箇所", 1, "窓\n倉庫"),
      ...say("S1 悩める銀剣料理人", 1, PROSE),
      ...say("前回のあらすじ", 1, PROSE),
      ...say("ボダレル平原", 1, PROSE),
      ...say("？？？", 2),
      ...roll("蛇人間A", 4),
      ...roll("支配された人間(1)", 3),
      ...roll("蛇人間×2", 5),
      ...roll("砲撃魚B (アーティラリーフィッシュ)", 3),
      ...say("S２", 10),
      ...roll("S２", 12),
    ];
    expect(kindsOf(msgs)).toEqual({
      // 番号で終わる名前でもダイスを振るなら描写ではない（量産の形なので NPC）
      S２: "NPC",
      "9号車/探索箇所": "NARRATION",
      "S1 悩める銀剣料理人": "NARRATION",
      前回のあらすじ: "NARRATION",
      ボダレル平原: "NARRATION",
      "？？？": "NPC",
      蛇人間A: "NPC",
      "支配された人間(1)": "NPC",
      "蛇人間×2": "NPC",
      "砲撃魚B (アーティラリーフィッシュ)": "NPC",
    });
  });

  it("台詞（「」で始まる）を数回だけ話す人物は描写ではなく NPC", () => {
    const msgs = [...roll("探索者", 30), ...say("フランシス・ドレーク", 1, `「${PROSE}」`)];
    expect(kindsOf(msgs)).toEqual({ "フランシス・ドレーク": "NPC" });
  });

  it("振るのに技能を一度も振らない発言者（攻撃だけの敵）は、よく出てきても NPC", () => {
    const enemyRolls: Msg[] = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      ts: 0,
      sp: "くちなわ様",
      kind: "PC",
      type: "roll",
      text: "",
      roll: { cmd: "1D6", skill: "", dice: "4", result: "4" },
    }));
    const msgs = [...roll("探索者", 40), ...say("探索者", 30), ...enemyRolls, ...say("くちなわ様", 10)];
    expect(kindsOf(msgs)).toEqual({ くちなわ様: "NPC" });
  });

  it("正気度ロールを振る・よく喋る遊び手は PC。少ししか出てこない人物は NPC", () => {
    const msgs = [
      ...roll("A", 30),
      ...say("B", 300),
      ...roll("B", 2, "SAN値チェック", "CCB<=60"),
      ...say("店主", 10),
      ...say("明解85", 200),
    ];
    expect(kindsOf(msgs)).toEqual({ 店主: "NPC" });
  });

  it("発言者が 1 人なら推さない", () => {
    expect(inferSpeakerKinds(say("蛇人間A", 3)).size).toBe(0);
  });
});
