import { describe, expect, it } from "vitest";
import {
  describeSheetUrl,
  iacharaSheetError,
  parseExternalResponse,
  parseExternalUrl,
} from "./external-sync";
import { createTokenCache } from "./external-import-server";
import { parseIacharaSheet } from "./sheet-sources";
import { sheetSection, sheetSkillValue } from "./sheet";
import sheet6th from "./__fixtures__/iachara-6th.json";
import sheet7th from "./__fixtures__/iachara-7th.json";

const URL7 = "https://iachara.com/view/3000000";
const URL6 = "https://iachara.com/view/1200000";

function values(entries: { label: string; value: number | string }[] | undefined) {
  return Object.fromEntries((entries ?? []).map((e) => [e.label, e.value]));
}

describe("いあきゃらの URL", () => {
  it.each([
    "https://iachara.com/view/3000000",
    "https://www.iachara.com/view/3000000/",
    "https://iachara.com/edit/3000000",
    "https://iachara.com/char/view/3000000?tab=skills",
  ])("%s は閲覧 URL にそろえ、API を取得先にする", (raw) => {
    expect(parseExternalUrl(raw)).toEqual({
      ok: true,
      provider: "iachara",
      kind: "character",
      displayUrl: URL7,
      fetchUrls: ["https://apiv3.iachara.com/v3/charasheet/3000000"],
    });
  });

  it("閲覧 URL は「いあきゃら」として表示できる URL と判定する", () => {
    expect(describeSheetUrl("https://iachara.com/view/3000000")).toMatchObject({
      state: "ok",
      label: "いあきゃら",
    });
  });

  it.each([
    "https://iachara.com/",
    "https://iachara.com/mypage",
    "https://iachara.com/view/abc",
    "https://iachara.com/view/1/2",
    "https://apiv3.iachara.com/v3/charasheet/1",
  ])("キャラクターの個別ページ以外（%s）は断る", (raw) => {
    expect(parseExternalUrl(raw).ok).toBe(false);
  });

  it("断るときは例を添えたメッセージを返す", () => {
    expect(parseExternalUrl("https://iachara.com/mypage")).toEqual({
      ok: false,
      error: "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
    });
  });
});

describe("いあきゃらのシート（parseIacharaSheet）", () => {
  describe("7 版", () => {
    const parse7 = () => parseIacharaSheet(sheet7th, URL7)!;
    const sheet = () => parse7().sheet!;

    it("名前・職業メモ・システム・画像・続く値を読む", () => {
      expect(parse7()).toMatchObject({
        name: "白瀬 怜",
        memo: "職業: 高校教師",
        systemId: "coc7",
        image: "https://image.iaproject.app/example-7th",
        stats: { san: 85, luck: 85 },
      });
    });

    it("提供元と URL をシートに残し、プロフィールを読む", () => {
      const s = sheet();

      expect(s).toMatchObject({ provider: "iachara", url: URL7 });
      expect(values(s.profile)).toMatchObject({
        職業: "高校教師",
        年齢: 23,
        性別: "女",
        出身: "東京",
        誕生日: "8/21",
      });
    });

    it("能力値は補正を足して読む（STR 65+5-5、POW 70+5+5、APP 65+5、SIZ 65+5、EDU 90-5）", () => {
      expect(values(sheetSection(sheet(), "abilities")?.entries)).toEqual({
        STR: 65,
        CON: 60,
        POW: 80,
        DEX: 55,
        APP: 70,
        SIZ: 70,
        INT: 70,
        EDU: 85,
      });
    });

    it("能力値から決まる副能力値を読む", () => {
      expect(values(sheetSection(sheet(), "resources")?.entries)).toEqual({
        HP: 13,
        MP: 16,
        SAN: 85,
        幸運: 85,
        DB: "+1D4",
        ビルド: 1,
        MOV: 7,
      });
    });

    it("SAN の上限は 99 からクトゥルフ神話を引いた値にする", () => {
      expect(sheetSection(sheet(), "resources")?.entries.find((e) => e.label === "SAN")?.max).toBe(85);
    });

    it.each([
      ["回避", 27 + 44],
      ["近接戦闘（格闘）", 25 + 52],
      ["射撃（拳銃）", 20 + 23],
      ["母国語（日本語）", 85],
      ["言語（英語）", 65],
      ["芸術/製作（ファッション）", 20],
      ["芸術（猫じゃらし）", 29],
      ["クトゥルフ神話", 14],
    ])("技能「%s」の値は %i になる", (label, expected) => {
      expect(sheetSkillValue(sheet(), label)).toBe(expected);
    });

    it("技能には初期値と分類を持たせる", () => {
      const skills = sheetSection(sheet(), "skills")!.entries;

      expect(skills.find((e) => e.label === "目星")).toMatchObject({
        value: 93,
        base: 25,
        group: "探索技能",
      });
    });

    it("専門分野を持たない技能に残った additionalName は名前に付けない", () => {
      const skills = sheetSection(sheet(), "skills")!.entries;

      expect(skills.find((e) => e.label.startsWith("回避"))?.label).toBe("回避");
    });

    it("所持品を読み、武器が無ければ武器欄を作らない", () => {
      const s = sheet();

      expect(values(sheetSection(s, "items")?.entries)).toEqual({ 伊達メガネ: 3 });
      expect(sheetSection(s, "weapons")).toBeUndefined();
    });

    it("背景はイデオロギー/信念を見出しつきで読む", () => {
      expect(sheetSection(sheet(), "backstory")?.text).toBe(
        "【イデオロギー/信念】\n学びは座学だけでなく実技が大切",
      );
    });
  });

  describe("6 版", () => {
    const parse6 = () => parseIacharaSheet(JSON.stringify(sheet6th), URL6)!;
    const sheet = () => parse6().sheet!;

    it("名前・システム・SAN を読み、幸運は stats に入れない", () => {
      const c = parse6();

      expect(c).toMatchObject({ name: "遠沢 澄花", systemId: "coc6", stats: { san: 71 } });
      expect(c.stats.luck).toBeUndefined();
    });

    it("能力値を読む", () => {
      expect(values(sheetSection(sheet(), "abilities")?.entries)).toMatchObject({
        DEX: 12,
        EDU: 12,
        POW: 13,
      });
    });

    it("副能力値は ×5 で出す", () => {
      expect(values(sheetSection(sheet(), "resources")?.entries)).toEqual({
        HP: 10,
        MP: 13,
        SAN: 71,
        アイデア: 65,
        幸運: 65,
        知識: 60,
        DB: 0,
      });
    });

    it("SAN の上限を 99 からクトゥルフ神話を引いた値にする", () => {
      expect(sheetSection(sheet(), "resources")?.entries.find((e) => e.label === "SAN")?.max).toBe(88);
    });

    it.each([
      ["回避", 24 + 45],
      ["母国語（日本語）", 60],
      ["製作（造園）", 75],
      ["芸術（水彩画）", 60],
      ["運転（車）", 20],
      ["杖", 45],
    ])("技能「%s」の値は %i になる（回避は DEX×2、母国語は EDU×5 が初期値）", (label, expected) => {
      expect(sheetSkillValue(sheet(), label)).toBe(expected);
    });

    it("武器を読む", () => {
      expect(sheetSection(sheet(), "weapons")?.entries).toEqual([
        { label: "仕込み杖", value: 25, note: "ダメージ 1d6+db　射程 タッチ" },
      ]);
    });

    it("6 版の所持品を読む", () => {
      expect(sheetSection(sheet(), "items")?.entries).toEqual([
        { label: "庭道具一式", value: "" },
        { label: "くじらの水筒", value: 1, note: "緑茶が入っている" },
      ]);
    });

    it("通過シナリオとメモを読む", () => {
      const s = sheet();

      expect(sheetSection(s, "scenarios")?.entries).toEqual([
        { label: "中庭の夢", value: "", note: "ノーマルエンド" },
      ]);
      expect(sheetSection(s, "memo")?.text).toBe("体が弱い。\n庭いじりが好き。");
    });
  });

  it("parseExternalResponse から取り込み結果になる", () => {
    const p = parseExternalResponse("iachara", JSON.stringify(sheet7th), "application/json", URL7);
    expect(p).toMatchObject({
      kind: "character",
      provider: "iachara",
      providerLabel: "いあきゃら",
      url: URL7,
    });
    if (p?.kind === "character") expect(p.character.sheet?.url).toBe(URL7);
  });

  describe("読まない応答", () => {
    it("非公開（public: false）は読まない", () => {
      const priv = structuredClone(sheet7th) as { data: { public: boolean } };
      priv.data.public = false;

      expect(parseIacharaSheet(priv, URL7)).toBeNull();
    });

    it("メタデータが非公開なら読まない", () => {
      const privMeta = structuredClone(sheet7th) as {
        data: { data: { metadata: { isPublic: boolean } } };
      };
      privMeta.data.data.metadata.isPublic = false;

      expect(parseIacharaSheet(privMeta, URL7)).toBeNull();
    });

    it("JSON でない文字列は読まない", () => {
      expect(parseIacharaSheet("{not json", URL7)).toBeNull();
    });

    it("未対応の版（5th）は読まない", () => {
      expect(
        parseIacharaSheet({ success: true, data: { public: true, data: { version: "5th" } } }),
      ).toBeNull();
    });
  });
});

describe("いあきゃらの取得失敗の文言（iacharaSheetError）", () => {
  it("非公開の応答は公開設定を促す文言にする", () => {
    expect(iacharaSheetError(JSON.stringify({ success: false, data: { public: false } }))).toBe(
      "このキャラクターシートは非公開です。いあきゃらで公開に設定してから、もう一度お試しください。",
    );
  });

  it("取得できなかった応答は見つからない旨の文言にする", () => {
    expect(
      iacharaSheetError(
        JSON.stringify({
          success: false,
          data: {},
          message: "正常にキャラクターシートを取得できませんでした。",
        }),
      ),
    ).toBe("いあきゃらにこのキャラクターシートが見つかりませんでした。URL をお確かめください。");
  });

  it("読めるシートと JSON でない文字列には文言を返さない", () => {
    expect(iacharaSheetError(JSON.stringify(sheet7th))).toBeUndefined();
    expect(iacharaSheetError("not json")).toBeUndefined();
  });
});

describe("期限つきの鍵の使い回し（createTokenCache）", () => {
  const t0 = new Date("2026-11-22T00:00:00Z");
  const minutesAfter = (m: number) => new Date(t0.getTime() + m * 60_000);
  function setup() {
    const cache = createTokenCache();
    let issued = 0;
    const issue = async () => ({ token: `t${++issued}`, expiresInSec: 3600 });
    return { cache, issue, issuedCount: () => issued };
  }

  it("同時の取得は 1 本にまとめる", async () => {
    const { cache, issue, issuedCount } = setup();

    const [a, b] = await Promise.all([cache.get(t0, issue), cache.get(t0, issue)]);

    expect([a, b, issuedCount()]).toEqual(["t1", "t1", 1]);
  });

  it("期限の 5 分前までは使い回す", async () => {
    const { cache, issue } = setup();
    await cache.get(t0, issue);

    expect(await cache.get(minutesAfter(54), issue)).toBe("t1");
  });

  it("期限の 5 分前を過ぎたら取り直す", async () => {
    const { cache, issue } = setup();
    await cache.get(t0, issue);

    expect(await cache.get(minutesAfter(56), issue)).toBe("t2");
  });

  it("clear すると次は取り直す", async () => {
    const { cache, issue } = setup();
    await cache.get(t0, issue);

    cache.clear();

    expect(await cache.get(minutesAfter(57), issue)).toBe("t2");
  });

  it("取得に失敗したら覚えず、次の取り込みで取り直す", async () => {
    const cache = createTokenCache();
    const now = new Date("2026-11-22T00:00:00Z");
    expect(await cache.get(now, async () => null)).toBeNull();
    expect(await cache.get(now, async () => ({ token: "ok", expiresInSec: 3600 }))).toBe("ok");
  });
});
