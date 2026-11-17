import { describe, expect, it } from "vitest";
import type { Channel, Character, State, User } from "../types";
import {
  buildDraft,
  isGenericRoleName,
  matchSpeakerToState,
  remapChannelTimestamps,
  speakerHints,
  stripSpeakerDecorations,
} from "./speaker-match";
import { jstEpoch } from "./format";

const user = (id: string, name: string): User => ({ id, name, color: "#888", accounts: [] });
const char = (id: string, ownerId: string, name: string, extra: Partial<Character> = {}): Character => ({
  id,
  ownerId,
  name,
  systemId: "coc7",
  color: "#888",
  archetype: "",
  bio: "",
  tags: [],
  stats: {},
  sessions: [],
  growth: [],
  share: {
    enabled: false,
    scope: "private",
    includeProfile: true,
    includeStats: true,
    includeGrowth: true,
    includeSessions: true,
  },
  ...extra,
});

function world(): Pick<State, "me" | "users" | "characters" | "tables" | "scenarios"> {
  return {
    me: "u_kp",
    users: {
      u_kp: user("u_kp", "灯馬"),
      u_a: user("u_a", "みかん"),
      u_b: user("u_b", "そら"),
    },
    characters: {
      c1: char("c1", "u_a", "遠沢澄花"),
      c2: char("c2", "u_b", "遠沢澄花", { systemId: "emoklore" }),
      c3: char("c3", "u_b", "白瀬怜", { image: "data:image/png;base64,REI" }),
    },
    tables: {
      t1: { id: "t1", name: "卓", ownerId: "u_kp", memberIds: ["u_kp", "u_a"], createdAt: "2026-01-01" },
    },
    scenarios: {},
  };
}

describe("発言者名の正規化", () => {
  it("注記と役割の接頭辞を落とす", () => {
    expect(stripSpeakerDecorations("KP: 灯馬【進行】")).toBe("灯馬");
    expect(stripSpeakerDecorations("遠沢 澄花（みかん）")).toBe("遠沢澄花");
  });
  it("括弧内を PL 名の手がかりとして取り出す", () => {
    expect(speakerHints("遠沢澄花（みかん）")).toEqual(["みかん"]);
    expect(speakerHints("白瀬怜")).toEqual([]);
  });
  it("役割だけの名前は誰にも結び付けない", () => {
    expect(isGenericRoleName("KP")).toBe(true);
    expect(matchSpeakerToState("KP", world())).toEqual({ character: null, user: null });
  });
});

describe("matchSpeakerToState", () => {
  it("名前の完全一致・空白違いでキャラクターを見つけ、持ち主を返す", () => {
    expect(matchSpeakerToState("白瀬 怜", world()).character?.id).toBe("c3");
    expect(matchSpeakerToState("白瀬怜", world()).user?.id).toBe("u_b");
  });

  it("同名キャラは括弧内の PL 名で見分ける", () => {
    expect(matchSpeakerToState("遠沢澄花（そら）", world()).character?.id).toBe("c2");
    expect(matchSpeakerToState("遠沢澄花（みかん）", world()).character?.id).toBe("c1");
  });

  it("同名キャラは参加しそうな人（卓のメンバー）のキャラを優先する", () => {
    expect(matchSpeakerToState("遠沢澄花", world(), { participantIds: ["u_b"] }).character?.id).toBe("c2");
    expect(matchSpeakerToState("遠沢澄花", world(), { participantIds: ["u_a"] }).character?.id).toBe("c1");
  });

  it("同名キャラは推定システムで見分ける", () => {
    expect(matchSpeakerToState("遠沢澄花", world(), { preferredSystemId: "emoklore" }).character?.id).toBe(
      "c2",
    );
  });

  it("顔画像が一致すれば、名前が違っても同じキャラとみなす", () => {
    const r = matchSpeakerToState("れい", world(), { icon: "data:image/png;base64,REI" });
    expect(r.character?.id).toBe("c3");
  });

  it("名の一部（澄花）でも見つける。短すぎる一致は採らない", () => {
    expect(matchSpeakerToState("澄花", world(), { participantIds: ["u_a"] }).character?.id).toBe("c1");
    expect(matchSpeakerToState("怜", world()).character).toBeNull();
  });

  it("キャラが見つからなければ PL 名でユーザーを返す", () => {
    const r = matchSpeakerToState("そら", world());
    expect(r.character).toBeNull();
    expect(r.user?.id).toBe("u_b");
  });
});

describe("buildDraft", () => {
  const channels: Channel[] = [
    {
      id: "main",
      name: "メイン",
      secret: false,
      msgs: [
        { id: "1", ts: 1000, sp: "KP", kind: "KP", type: "text", text: "はじめます" },
        { id: "2", ts: 1060, sp: "遠沢澄花", kind: "PC", type: "text", text: "はい" },
        { id: "3", ts: 1120, sp: "そら", kind: "PC", type: "text", text: "よろしく" },
      ],
    },
  ];
  const avatars = { character: (c: Character) => `char:${c.id}`, user: (u: User) => `user:${u.id}` };

  it("卓のメンバーを手がかりに発言者を紐付け、参加者とアイコンを埋める", () => {
    const d = buildDraft({
      fileName: "log.json",
      channels,
      attachLog: null,
      presetTable: "t1",
      presetScenario: "",
      manual: null,
      state: world(),
      avatars,
    });
    expect(d.speakerLinks["遠沢澄花"]).toEqual({ userId: "u_a", characterId: "c1" });
    expect(d.speakerIcons["遠沢澄花"]).toBe("char:c1");
    // PL 名で話している人は PC ではなく PL として扱う
    expect(d.kinds["そら"]).toBe("PL");
    expect(d.players).toEqual(
      expect.arrayContaining([
        { userId: "u_a", characterIds: ["c1"] },
        { userId: "u_b", characterIds: [] },
      ]),
    );
    expect(d.kinds.KP).toBe("KP");
  });
});

describe("remapChannelTimestamps", () => {
  const channels: Channel[] = [
    {
      id: "a",
      name: "メイン",
      secret: false,
      msgs: [0, 10, 20, 30].map((t, i) => ({
        id: String(i),
        ts: t,
        sp: "x",
        kind: "PC" as const,
        type: "text" as const,
        text: "",
      })),
    },
  ];

  it("1 日なら新しい範囲に比率を保って写し、順序を崩さない", () => {
    const t0 = jstEpoch("2026-10-10", "20:00");
    const t1 = jstEpoch("2026-10-10", "23:00");
    const out = remapChannelTimestamps(channels, ["2026-10-10"], t0, t1).flatMap((c) =>
      c.msgs.map((m) => m.ts),
    );
    expect(out[0]).toBe(t0);
    expect(out.at(-1)).toBe(t1);
    expect([...out].sort((a, b) => a - b)).toEqual(out);
  });

  it("複数日なら最初の日と最後の日に発言を割り振る", () => {
    const t0 = jstEpoch("2026-10-10", "21:00");
    const t1 = jstEpoch("2026-10-11", "23:00");
    const out = remapChannelTimestamps(channels, ["2026-10-10", "2026-10-11"], t0, t1).flatMap((c) =>
      c.msgs.map((m) => m.ts),
    );
    expect(out[0]).toBe(t0);
    expect(out.at(-1)).toBe(t1);
    expect(out[1]! < jstEpoch("2026-10-11", "00:00") + 6 * 3600).toBe(true);
    expect(out[2]! >= jstEpoch("2026-10-11", "06:00")).toBe(true);
  });

  it("元のチャンネルを書き換えない", () => {
    remapChannelTimestamps(channels, ["2026-10-10"], 100, 200);
    expect(channels[0]!.msgs[0]!.ts).toBe(0);
  });
});
