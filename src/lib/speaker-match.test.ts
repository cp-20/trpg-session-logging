import { describe, expect, it } from "vitest";
import type { Channel, Character, Log, State, User } from "../types";
import {
  buildDraft,
  carryDraftEdits,
  compactName,
  isGenericRoleName,
  matchSpeakerToState,
  speakerHints,
  stripSpeakerDecorations,
} from "./speaker-match";

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
    expect(compactName(" 遠沢　澄花 ")).toBe("遠沢澄花");
    expect(stripSpeakerDecorations("KP: 灯馬【進行】")).toBe("灯馬");
    expect(stripSpeakerDecorations("GM／[HO1]白瀬 怜(テスト)")).toBe("白瀬怜");
    expect(stripSpeakerDecorations("PC2：凛（PL：みかん）")).toBe("凛");
    expect(stripSpeakerDecorations("NPC/案内人")).toBe("案内人");
    expect(stripSpeakerDecorations("サブ KP: テスト")).toBe("サブkp:テスト");
  });
  it("括弧内を PL 名の手がかりとして取り出す", () => {
    expect(speakerHints("遠沢澄花（みかん）[PL1]【HO2】(sub)")).toEqual(["みかん", "pl1", "ho2", "sub"]);
    expect(speakerHints("遠沢()澄花(x)")).toEqual(["x"]);
    expect(speakerHints("白瀬怜")).toEqual([]);
  });
  it("役割だけの名前は誰にも結び付けない", () => {
    for (const r of ["KP", " gm ", "PL", "PC1", "PC12", "NPC", "system", "キーパー", "進行役"]) {
      expect(isGenericRoleName(r)).toBe(true);
      expect(matchSpeakerToState(r, world())).toEqual({ character: null, user: null });
    }
    expect(isGenericRoleName("PC1A")).toBe(false);
    expect(isGenericRoleName("MyKP")).toBe(false);
    expect(isGenericRoleName("KP:夜霜")).toBe(false);
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

  it("キャラが見つからなければ PL 名でユーザーを返し、文字列コンテキスト・境界スコア・弱一致フォールバックを扱う", () => {
    const r = matchSpeakerToState("そら", world());
    expect(r.character).toBeNull();
    expect(r.user?.id).toBe("u_b");

    // 文字列第3引数は preferredSystemId として扱われる
    expect(matchSpeakerToState("遠沢澄花", world(), "emoklore").character?.id).toBe("c2");

    // 部分一致 51点 (<55) かつ所有者ヒント一致なしなら、user ヒント (>= 50) が勝ち、無ければ弱いキャラへフォールバック
    const w = world();
    w.characters.c4 = char("c4", "u_a", "アリスインワンダ"); // sp=アリス(3)/len=8 で score=51 (<55)
    expect(matchSpeakerToState("アリス（そら）", w)).toMatchObject({
      character: null,
      user: { id: "u_b" },
    });
    expect(matchSpeakerToState("アリス", w).character?.id).toBe("c4");
    w.characters.c5 = char("c5", "u_b", "一二三四五六"); // sp=一二三(3)/len=6 で score=55
    expect(matchSpeakerToState("一二三", w).character?.id).toBe("c5");

    // spClean 長さ1文字・nClean 長さ1文字・文字長タイブレーク (20 文字上限)・user 参加者スコア(+10)・未知キャラ
    w.characters.c6 = char("c6", "u_a", "あ");
    expect(matchSpeakerToState("あ(補足)", w).character).toBeNull();
    expect(matchSpeakerToState("か(補足)", w).character).toBeNull();
    expect(matchSpeakerToState("あいうえお（白瀬怜）", w).character).toBeNull();
    expect(matchSpeakerToState("遠沢澄花さん", w, { participantIds: ["u_a"] }).character?.id).toBe("c1");

    // user 同点時に participantIds と文字長タイブレークが効く
    w.users.u_c = user("u_c", "あ"); // len=1 なので nameScore 0, hint 60
    expect(matchSpeakerToState("未知（あ）（そら）", w, { participantIds: ["u_b"] }).user?.id).toBe("u_b");
    expect(matchSpeakerToState("完全に未知の発言者", w)).toEqual({ character: null, user: null });
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
      fileNames: ["log.json"],
      channels,
      attachLog: null,
      presetTable: "t1",
      presetScenario: "",
      state: world(),
      avatars,
    });
    expect(d.speakerLinks["遠沢澄花"]).toEqual({ userId: "u_a", characterId: "c1" });
    expect(d.speakerIcons["遠沢澄花"]).toBe("char:c1");
    expect(d.kinds["そら"]).toBe("PL");
    expect(d.players).toEqual(
      expect.arrayContaining([
        { userId: "u_a", characterIds: ["c1"] },
        { userId: "u_b", characterIds: [] },
      ]),
    );
    expect(d.kinds.KP).toBe("KP");
  });

  it("attachLog・presetScenario・GM/KP 昇格・ts=0 の derived null・卓なしフォールバックを検証する", () => {
    const w = world();
    w.scenarios.sc1 = {
      id: "sc1",
      title: "潮騒",
      author: "A",
      systemId: "emoklore",
      source: "manual",
      emoji: "🎲",
      bg: "#fff",
      tags: [],
      claimedBy: null,
      addedBy: "user",
    };
    const attachLog: Log = {
      id: "log1",
      title: "添付先卓",
      tableId: "t1",
      scenarioId: "sc1",
      systemId: "sw25",
      ownerId: "u_kp",
      scope: "public",
      hasLog: false,
      speakerIcons: { "GM:みかん": "https://cdn.example.com/gm.png" },
      channels: [],
      players: {
        u_kp: { linked: true, hidden: false, characterIds: [] },
        u_b: { linked: true, hidden: false, characterIds: ["c2"] },
      },
      createdAt: "2026-01-01",
      sittings: [{ start: 100, end: 200 }],
      slug: "s1",
    };
    const zeroTsChannels: Channel[] = [
      {
        id: "main",
        name: "メイン",
        secret: false,
        msgs: [
          { id: "m1", ts: 0, sp: "GM:みかん", kind: "PC", type: "text", text: "開会" },
          { id: "m2", ts: 0, sp: "KP:そら", kind: "PC", type: "text", text: "進行" },
          { id: "m3", ts: 0, sp: "遠沢澄花（みかん）", kind: "PC", type: "text", text: "参加" },
          { id: "m4", ts: 0, sp: "白瀬怜", kind: "PC", type: "text", text: "重複しない" },
          { id: "m5", ts: 0, sp: "遠沢澄花（そら）", kind: "PC", type: "text", text: "既存重複防止" },
          { id: "m6", ts: 0, sp: "GM:みかん", kind: "GM", type: "text", text: "補足" },
        ],
      },
    ];
    const attached = buildDraft({
      fileNames: ["a.html"],
      channels: zeroTsChannels,
      attachLog,
      presetTable: "",
      presetScenario: "",
      state: w,
      avatars,
    });
    expect(attached.meta).toEqual({ title: "添付先卓", systemId: "sw25" });
    expect(attached.scope).toBe("public");
    expect(attached.scenarioId).toBe("sc1");
    expect(attached.tableId).toBe("t1");
    // ログに時刻がなければ添付先の時間帯を使う
    expect(attached.sittings).toEqual([{ start: 100, end: 200 }]);
    expect(attached.kinds["GM:みかん"]).toBe("GM");
    expect(attached.kinds["KP:そら"]).toBe("KP");
    // 既存の attachLog.speakerIcons を上書きしない
    expect(attached.speakerIcons["GM:みかん"]).toBe("https://cdn.example.com/gm.png");
    expect(attached.speakerIcons["KP:そら"]).toBe("user:u_b");
    expect(attached.players).toEqual(
      expect.arrayContaining([
        { userId: "u_b", characterIds: ["c2", "c3"] },
        { userId: "u_a", characterIds: ["c1"] },
      ]),
    );

    // presetScenario からの title/systemId 補完 + 卓なしは general / 空 players な attachLog / table.systemId / SYSTEM 優先順位 / 逆順タイムスタンプ再マップ
    w.tables.t2 = {
      id: "t2",
      name: "CoC6卓",
      ownerId: "u_kp",
      systemId: "coc6",
      memberIds: ["u_kp", "u_a"],
      createdAt: "2026-01-01",
    };
    const presetOnly = buildDraft({
      fileNames: [],
      channels: [],
      attachLog: null,
      presetTable: "",
      presetScenario: "sc1",
      state: w,
      avatars,
    });
    expect(presetOnly.meta).toEqual({ title: "潮騒", systemId: "emoklore" });
    expect(presetOnly.sittings).toEqual([]);
    expect(presetOnly.guess).toBeNull();

    const emptyPlayersAttach: Log = { ...attachLog, systemId: "general", players: {} };
    delete (emptyPlayersAttach as Partial<Log>).systemId;
    const tableFallback = buildDraft({
      fileNames: ["b.json"],
      channels: [
        {
          id: "c",
          name: "メイン",
          secret: false,
          msgs: [
            { id: "1", ts: 10, sp: "進行", kind: "SYSTEM", type: "text", text: "システム" },
            { id: "2", ts: 20, sp: "進行", kind: "PC", type: "text", text: "上書きされない" },
            { id: "3", ts: 30, sp: "みかん", kind: "PC", type: "text", text: "自参加" },
          ],
        },
      ],
      attachLog: null,
      presetTable: "t2",
      presetScenario: "",
      state: w,
      avatars,
    });
    expect(tableFallback.meta.systemId).toBe("coc6");
    expect(tableFallback.kinds["進行"]).toBe("SYSTEM");
    expect(tableFallback.players).toEqual([{ userId: "u_a", characterIds: [] }]);
    expect(tableFallback.sittings).toEqual([{ start: 10, end: 30 }]);
  });
});

describe("carryDraftEdits: ログを足しても決めたことを残す", () => {
  it("タイトル・卓・参加者・共有範囲・残っている発言者の設定を引き継ぎ、時間帯は導き直す", () => {
    const base = {
      fileNames: ["1.json"],
      channels: [],
      kinds: { A: "PC" as const, B: "NPC" as const },
      speakerIcons: { A: "a.png", B: "b.png" },
      speakerLinks: { A: { userId: "u1", characterId: "c1" } },
      meta: { title: "決めた題", systemId: "coc7" },
      guess: null,
      scope: "public" as const,
      tableId: "t1",
      scenarioId: "sc1",
      newScenario: null,
      players: [{ userId: "u1", characterIds: ["c1"] }],
      self: { played: true, role: "GM" as const, characterIds: [] },
      sittings: [{ start: 1, end: 2 }],
    };
    const fresh = {
      ...base,
      fileNames: ["1.json", "2.json"],
      kinds: { A: "NPC" as const, C: "PC" as const },
      speakerIcons: { C: "c.png" },
      speakerLinks: {},
      meta: { title: "", systemId: "general" },
      scope: "members" as const,
      tableId: "",
      scenarioId: "",
      players: [{ userId: "u2", characterIds: [] }],
      sittings: [
        { start: 1, end: 2 },
        { start: 9, end: 10 },
      ],
    };
    const out = carryDraftEdits(base, fresh);
    expect(out.fileNames).toEqual(["1.json", "2.json"]);
    expect(out.kinds).toEqual({ A: "PC", C: "PC" });
    expect(out.speakerIcons).toEqual({ A: "a.png", C: "c.png" });
    expect(out.speakerLinks).toEqual({ A: { userId: "u1", characterId: "c1" } });
    expect(out.meta).toEqual({ title: "決めた題", systemId: "coc7" });
    expect([out.scope, out.tableId, out.scenarioId]).toEqual(["public", "t1", "sc1"]);
    expect(out.players.map((p) => p.userId)).toEqual(["u1", "u2"]);
    expect(out.sittings).toHaveLength(2);
    expect(out.self).toEqual(base.self);
    expect(carryDraftEdits(base, { ...fresh, sittings: [] }).sittings).toEqual(base.sittings);
  });
});

describe("buildDraft: 記録する本人", () => {
  const w = {
    me: "u_me",
    users: { u_me: user("u_me", "みかん"), u_b: user("u_b", "そら") },
    characters: {
      c_me: { ...({} as Character), id: "c_me", ownerId: "u_me", name: "遠沢澄花", systemId: "coc7" },
    },
    tables: {},
    scenarios: {},
  } as unknown as State;
  const avatars = { character: () => "c.png", user: () => "u.png" };
  const chan = (msgs: { sp: string; kind: Channel["msgs"][number]["kind"] }[]): Channel[] => [
    {
      id: "main",
      name: "メイン",
      secret: false,
      msgs: msgs.map((m, i) => ({ id: String(i), ts: 100 + i, type: "text" as const, text: "x", ...m })),
    },
  ];
  const build = (channels: Channel[]) =>
    buildDraft({
      fileNames: [],
      channels,
      attachLog: null,
      presetTable: "",
      presetScenario: "",
      state: w,
      avatars,
    });

  it("本人は既定で参加者。ログに手がかりがなければ PL", () => {
    expect(build([]).self).toEqual({ played: true, role: "PL", characterIds: [] });
  });
  it("本人のキャラの発言があれば PL で、そのキャラを付ける", () => {
    expect(build(chan([{ sp: "遠沢澄花", kind: "PC" }])).self).toEqual({
      played: true,
      role: "PL",
      characterIds: ["c_me"],
    });
  });
  it("本人に結び付いた GM の発言者がいれば GM", () => {
    expect(build(chan([{ sp: "KP:みかん", kind: "KP" }])).self.role).toBe("GM");
  });
});
