// @vitest-environment jsdom
/**
 * DOMParser が無い環境 (React Native など) での Udonarium 取り込み。
 * 軽量フォールバックパーサー経由でも、DOM 経路と同じ結果になることを確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importCharacterFromText, importLogFromText } from "./importers";

describe("DOMParser なしの Udonarium キャラクター", () => {
  beforeEach(() => vi.stubGlobal("DOMParser", undefined));
  afterEach(() => vi.unstubAllGlobals());

  it("DOMParser が無い", () => {
    expect(typeof DOMParser).toBe("undefined");
  });

  it("キャラクターを完全一致で読む", () => {
    const res = importCharacterFromText(
      `<character><data name="character"><data name="imageIdentifier">face</data><data name="name">霧島</data><data name="HP" currentValue="11">12</data><data name="メモ">助手</data></data><chat-palette dicebot="Cthulhu7th"></chat-palette></character>`,
    );
    expect(res).toStrictEqual({
      sourceLabel: "Udonarium",
      character: {
        name: "霧島",
        memo: "助手",
        systemId: "coc7",
        stats: { hp: 11 },
        imageId: "face",
        sheet: {
          v: 1,
          provider: "udonarium",
          profile: [],
          sections: [
            { id: "resources", title: "副能力値", kind: "resources", entries: [{ label: "HP", value: 11 }] },
          ],
        },
      },
    });
  });

  it("XML で始まらない・character が無い・名前が無いときは null", () => {
    expect(importCharacterFromText(`メモ <character><data name="name">A</data></character>`)).toBeNull();
    expect(importCharacterFromText(`<root><data name="name">A</data></root>`)).toBeNull();
    expect(importCharacterFromText(`<character><data name="HP">1</data></character>`)).toBeNull();
    expect(importCharacterFromText(`<character-list><data name="name">A</data></character-list>`)).toBeNull();
  });
});

describe("DOMParser なしの Udonarium chat.xml", () => {
  beforeEach(() => vi.stubGlobal("DOMParser", undefined));
  afterEach(() => vi.unstubAllGlobals());

  it("発言を完全一致で読む", () => {
    const res = importLogFromText(
      `<chat-log><chat tab="雑談" time="1794831600000" name="KP:夜霜">始めます</chat><chat type="system" name="ログ">◆ 開始</chat><chat name="" tab="">名無し</chat><chat name="A" type="npc"> </chat></chat-log>`,
    );
    expect(res).toStrictEqual({
      sourceLabel: "Udonarium",
      log: {
        channels: [
          {
            id: "メイン",
            name: "メイン",
            secret: false,
            msgs: [
              { id: "p1", ts: 0, sp: "ログ", kind: "SYSTEM", type: "note", text: "◆ 開始" },
              { id: "p2", ts: 0, sp: "不明な発言者", kind: "PC", type: "text", text: "名無し" },
            ],
          },
          {
            id: "雑談",
            name: "チャット",
            secret: false,
            msgs: [{ id: "p0", ts: 1794831600, sp: "KP:夜霜", kind: "KP", type: "text", text: "始めます" }],
          },
        ],
        kinds: { ログ: "SYSTEM", 不明な発言者: "PC", "KP:夜霜": "KP" },
        messageCount: 3,
      },
    });
  });

  it("type 属性を種別として使う", () => {
    const res = importLogFromText(
      `<chat-log><chat name="KP:夜霜" type="PC">x</chat><chat name="A" type="npc">y</chat></chat-log>`,
    );
    expect(res?.log.channels[0]?.msgs.map((m) => m.kind)).toEqual(["PC", "NPC"]);
  });

  it("XML で始まらない・発言が無いときは Udonarium として扱わない", () => {
    expect(importLogFromText(`メモ <chat name="A">x</chat>`)?.sourceLabel).not.toBe("Udonarium");
    expect(importLogFromText(`<chat-log></chat-log>`)).toBeNull();
    expect(importLogFromText(`<chats><chatx name="A">x</chatx></chats>`)).toBeNull();
  });
});
