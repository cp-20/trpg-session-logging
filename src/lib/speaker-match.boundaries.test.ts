import { describe, expect, it } from "vitest";
import type { Channel, Character, Log, Msg, MsgKind, State, User } from "../types";
import { buildDraft, matchSpeakerToState, speakerHints, stripSpeakerDecorations } from "./speaker-match";

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

type World = Pick<State, "me" | "users" | "characters" | "tables" | "scenarios">;
/** 人とキャラクターだけを並べた状態。並び順がそのまま候補の走査順になる */
function people(users: User[], characters: Character[] = []): World {
  return {
    me: "u_me",
    users: Object.fromEntries(users.map((u) => [u.id, u])),
    characters: Object.fromEntries(characters.map((c) => [c.id, c])),
    tables: {},
    scenarios: {},
  };
}
const ids = (r: ReturnType<typeof matchSpeakerToState>) => ({
  character: r.character?.id ?? null,
  user: r.user?.id ?? null,
});

describe("発言者名の正規化の境界", () => {
  it.each([
    ["PC12: 凛", "凛"],
    ["PC:凛", "凛"],
    ["KP  : 灯馬", "灯馬"],
    ["gm ／ 夜霜", "夜霜"],
    ["遠沢 澄花", "遠沢澄花"],
  ])("%j → %j", (raw, expected) => {
    expect(stripSpeakerDecorations(raw)).toBe(expected);
  });

  it("空白だけの括弧は手がかりにしない", () => {
    expect(speakerHints("A（ ）(　)【x】")).toEqual(["x"]);
  });
});

describe("matchSpeakerToState: 名前の一致の強さ", () => {
  it("役割だけの名前は、同じ名前の人やキャラがいても結び付けない", () => {
    const w = people([user("u_kp", "KP")], [char("c_gm", "u_kp", "GM")]);
    expect(ids(matchSpeakerToState("KP", w))).toEqual({ character: null, user: null });
    expect(ids(matchSpeakerToState("gm", w))).toEqual({ character: null, user: null });
  });

  it("完全一致 > 空白・大小文字違い > 注記違い の順に強い", () => {
    const w = people(
      [user("u", "持ち主")],
      [
        char("loose", "u", "REI "),
        char("exact", "u", "Rei"),
        char("spaced", "u", "R ei"),
        char("noted", "u", "Rei【HO1】"),
      ],
    );
    // 長い名前ほど僅かに有利だが、一致の段階の差はそれより大きい
    expect(matchSpeakerToState("Rei", w).character?.id).toBe("exact");
    delete w.characters.exact;
    expect(matchSpeakerToState("Rei", w).character?.id).toBe("loose");
    delete w.characters.loose;
    expect(matchSpeakerToState("Rei", w).character?.id).toBe("spaced");
  });

  it("2 文字の名前でも注記を落とした完全一致は部分一致より強い", () => {
    const w = people(
      [user("u_a", "甲"), user("u_c", "丙")],
      [char("short", "u_a", "澄花"), char("longer", "u_c", "澄花子")],
    );
    // longer は部分一致 60 + 参加者 10 = 70、short は注記違いの一致 80
    expect(matchSpeakerToState("澄花（x）", w, { participantIds: ["u_c"] }).character?.id).toBe("short");
  });

  it("2 文字の名前を含む長い発言者名は部分一致として拾い、55 点以上ならユーザーより優先する", () => {
    const w = people([user("u_a", "みかん"), user("u_b", "そら")], [char("c", "u_a", "澄花")]);
    expect(ids(matchSpeakerToState("澄花です", w))).toEqual({ character: "c", user: "u_a" });
    // 部分一致 40 + 半分の長さ 15 = 55 は、PL 名の手がかり（60）があってもキャラを採る
    expect(ids(matchSpeakerToState("澄花です（そら）", w))).toEqual({ character: "c", user: "u_a" });
  });

  it("55 点未満の弱いキャラは、50 点未満の弱いユーザーより優先してフォールバックする", () => {
    const w = people(
      [user("u_a", "みかん"), user("u_x", "アリス1234567")],
      [char("c4", "u_a", "アリスインワンダ")],
    );
    // キャラ: 40 + round(3/8*30) = 51、ユーザー: 40 + round(3/10*30) = 49
    expect(ids(matchSpeakerToState("アリス", w))).toEqual({ character: "c4", user: "u_a" });
  });
});

describe("matchSpeakerToState: 顔画像", () => {
  const w = () =>
    people(
      [user("u_a", "みかん"), user("u_b", "そら")],
      [char("c3", "u_b", "白瀬怜", { image: "img:REI" }), char("c9", "u_a", "別人", { image: "img:OTHER" })],
    );

  it("画像が違えば、両方に画像があっても一致とみなさない", () => {
    expect(ids(matchSpeakerToState("れい", w(), { icon: "img:NONE" }))).toEqual({
      character: null,
      user: null,
    });
  });

  it("画像の一致は PL 名の手がかりより強い（画像 50 + 持ち主の手がかり 20）", () => {
    expect(ids(matchSpeakerToState("れい（そら）", w(), { icon: "img:REI" }))).toEqual({
      character: "c3",
      user: "u_b",
    });
  });

  it("画像だけが同じ候補が並べば、名前の長い方を採る", () => {
    const v = people(
      [user("u", "x")],
      [char("p", "u", "あ", { image: "I" }), char("q", "u", "あいう", { image: "I" })],
    );
    expect(matchSpeakerToState("zzz", v, { icon: "I" }).character?.id).toBe("q");
  });
});

describe("matchSpeakerToState: 同点の崩し方", () => {
  it("手がかりが同じなら先に登録されたキャラを採る", () => {
    const w = people(
      [user("u_a", "甲"), user("u_b", "乙")],
      [char("c1", "u_a", "遠沢澄花"), char("c2", "u_b", "遠沢澄花")],
    );
    expect(matchSpeakerToState("遠沢澄花", w).character?.id).toBe("c1");
  });

  it("ユーザーは PL 名の長さ、参加者かどうか、登録順の順で選ぶ", () => {
    const w = people([user("u_short", "あ"), user("u_long", "そら"), user("u_dup", "そら")]);
    expect(matchSpeakerToState("未知（あ）（そら）", w).user?.id).toBe("u_long");
    expect(matchSpeakerToState("未知（あ）（そら）", w, { participantIds: ["u_short"] }).user?.id).toBe(
      "u_short",
    );
    expect(matchSpeakerToState("そら", w).user?.id).toBe("u_long");
  });
});

const msg = (id: string, sp: string, kind: MsgKind, ts = 0): Msg => ({
  id,
  ts,
  sp,
  kind,
  type: "text",
  text: "",
});
const chan = (msgs: Msg[], id = "main"): Channel => ({ id, name: id, secret: false, msgs });
const avatars = { character: (c: Character) => `char:${c.id}`, user: (u: User) => `user:${u.id}` };

function world(): World {
  return {
    me: "u_kp",
    users: { u_kp: user("u_kp", "灯馬"), u_a: user("u_a", "みかん"), u_b: user("u_b", "そら") },
    characters: {
      c1: char("c1", "u_a", "遠沢澄花"),
      c2: char("c2", "u_b", "遠沢澄花"),
      c3: char("c3", "u_b", "白瀬怜"),
      cme: char("cme", "u_kp", "霧島霞"),
    },
    tables: {
      t1: { id: "t1", name: "卓", ownerId: "u_kp", memberIds: ["u_kp", "u_a"], createdAt: "2026-01-01" },
      t2: { id: "t2", name: "卓2", ownerId: "u_kp", memberIds: ["u_kp", "u_b"], createdAt: "2026-01-01" },
    },
    scenarios: {},
  };
}
const draft = (opts: Partial<Parameters<typeof buildDraft>[0]>) =>
  buildDraft({
    fileNames: [],
    channels: [],
    attachLog: null,
    presetTable: "",
    presetScenario: "",
    state: world(),
    avatars,
    ...opts,
  });
const attach = (extra: Partial<Pick<Log, "tableId" | "players" | "speakerIcons">>): Log => ({
  id: "log1",
  systemId: "general",
  title: "添付先",
  tableId: "",
  scenarioId: "",
  ownerId: "u_kp",
  scope: "public",
  hasLog: false,
  speakerIcons: {},
  channels: [],
  players: {},
  createdAt: "2026-01-01",
  sittings: [],
  slug: "s",
  ...extra,
});

describe("buildDraft: 既定値と推定", () => {
  it("何もなければ general・空タイトル・members・推定なし", () => {
    const d = draft({});
    expect(d.meta).toEqual({ title: "", systemId: "general" });
    expect(d.scope).toBe("members");
    expect(d.guess).toBeNull();
    expect(d.players).toEqual([]);
    expect(d.sittings).toEqual([]);
  });

  it("ログからシステムを推定し、時刻のある発言から遊んだ時間帯を出す", () => {
    const d = draft({
      channels: [
        chan([{ ...msg("1", "謎の声", "PC", 0), text: "CC<=50 目星" }, msg("2", "謎の声", "PC", 1000)]),
      ],
    });
    expect(d.guess).toEqual({ id: "coc7" });
    expect(d.meta.systemId).toBe("coc7");
    // 時刻 0 の発言（時刻なし）は使わず、時刻のある発言から導く
    expect(d.sittings).toEqual([{ start: 1000, end: 1000 }]);
  });
});

describe("buildDraft: 発言の種類", () => {
  it.each(["KP", "GM", "SYSTEM"] as const)(
    "%s の発言が 1 つでもあれば、前後の PC 発言より優先する",
    (kind) => {
      const before = draft({ channels: [chan([msg("1", "謎の声", "PC"), msg("2", "謎の声", kind)])] });
      const after = draft({ channels: [chan([msg("1", "謎の声", kind), msg("2", "謎の声", "PC")])] });
      expect(before.kinds["謎の声"]).toBe(kind);
      expect(after.kinds["謎の声"]).toBe(kind);
    },
  );

  it.each([
    ["GM そら", "GM"],
    ["KP そら", "KP"],
    ["GMそら", "PL"],
    ["KPそら", "PL"],
    ["そら GM", "PL"],
    ["そら KP", "PL"],
    ["そらGM:", "PL"],
    ["そらKP:", "PL"],
  ])("ユーザーに結び付いた PC 発言 %j は %s になる", (sp, kind) => {
    const d = draft({ channels: [chan([msg("1", sp, "PC")])] });
    expect(d.speakerLinks[sp]).toEqual({ userId: "u_b" });
    expect(d.kinds[sp]).toBe(kind);
  });

  it("ユーザーに結び付いても PC 以外の種類はそのまま", () => {
    const d = draft({ channels: [chan([msg("1", "灯馬", "KP")])] });
    expect(d.speakerLinks["灯馬"]).toEqual({ userId: "u_kp" });
    expect(d.kinds["灯馬"]).toBe("KP");
    expect(d.players).toEqual([]);
  });
});

describe("buildDraft: 参加者", () => {
  it("卓のメンバー（自分以外）を、発言がなくても参加者にする", () => {
    expect(draft({ presetTable: "t1" }).players).toEqual([{ userId: "u_a", characterIds: [] }]);
  });

  it("添付先の参加者が空なら卓のメンバーを使う", () => {
    expect(draft({ attachLog: attach({ tableId: "t2", players: {} }) }).players).toEqual([
      { userId: "u_b", characterIds: [] },
    ]);
  });

  it("添付先の参加者から自分を除く", () => {
    const d = draft({
      attachLog: attach({
        tableId: "t1",
        players: {
          u_kp: { linked: true, hidden: false, characterIds: ["cme"] },
          u_b: { linked: true, hidden: false, characterIds: ["c2"] },
        },
      }),
    });
    expect(d.players).toEqual([{ userId: "u_b", characterIds: ["c2"] }]);
  });

  it("卓のメンバーのキャラを同名キャラより優先する", () => {
    const d = draft({ presetTable: "t2", channels: [chan([msg("1", "遠沢澄花", "PC")])] });
    expect(d.speakerLinks["遠沢澄花"]).toEqual({ userId: "u_b", characterId: "c2" });
  });

  it("メンバー外のキャラの持ち主を参加者に足し、自分のキャラでは自分を足さない", () => {
    const d = draft({
      presetTable: "t1",
      channels: [chan([msg("1", "白瀬怜", "PC"), msg("2", "霧島霞", "PC")])],
    });
    expect(d.speakerLinks["霧島霞"]).toEqual({ userId: "u_kp", characterId: "cme" });
    expect(d.players).toEqual([
      { userId: "u_a", characterIds: [] },
      { userId: "u_b", characterIds: ["c3"] },
    ]);
  });

  it("キャラで足した参加者の一覧を、同じ人の PL 発言で消さない", () => {
    const d = draft({
      channels: [chan([msg("1", "白瀬怜", "PC"), msg("2", "そら", "PC"), msg("3", "灯馬", "PC")])],
    });
    expect(d.players).toEqual([{ userId: "u_b", characterIds: ["c3"] }]);
  });

  it("添付先にある顔アイコンはキャラの画像で上書きしない", () => {
    const d = draft({
      attachLog: attach({ speakerIcons: { 白瀬怜: "https://example.com/rei.png" } }),
      channels: [chan([msg("1", "白瀬怜", "PC"), msg("2", "遠沢澄花（みかん）", "PC")])],
    });
    expect(d.speakerIcons).toEqual({
      白瀬怜: "https://example.com/rei.png",
      "遠沢澄花（みかん）": "char:c1",
    });
  });
});
