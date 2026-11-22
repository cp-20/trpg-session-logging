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
  it("閲覧・編集の URL を閲覧 URL にそろえ、API を取得先にする", () => {
    for (const raw of [
      "https://iachara.com/view/3000000",
      "https://www.iachara.com/view/3000000/",
      "https://iachara.com/edit/3000000",
      "https://iachara.com/char/view/3000000?tab=skills",
    ]) {
      expect(parseExternalUrl(raw)).toEqual({
        ok: true,
        provider: "iachara",
        kind: "character",
        displayUrl: URL7,
        fetchUrls: ["https://apiv3.iachara.com/v3/charasheet/3000000"],
      });
    }
    expect(describeSheetUrl("https://iachara.com/view/3000000")).toMatchObject({
      state: "ok",
      label: "いあきゃら",
    });
  });

  it("キャラクターの個別ページ以外は例を添えて断る", () => {
    for (const raw of [
      "https://iachara.com/",
      "https://iachara.com/mypage",
      "https://iachara.com/view/abc",
      "https://iachara.com/view/1/2",
      "https://apiv3.iachara.com/v3/charasheet/1",
    ]) {
      const r = parseExternalUrl(raw);
      expect(r.ok).toBe(false);
    }
    expect(parseExternalUrl("https://iachara.com/mypage")).toEqual({
      ok: false,
      error: "いあきゃらのキャラクター URL（例: https://iachara.com/view/…）を指定してください。",
    });
  });
});

describe("いあきゃらのシート（parseIacharaSheet）", () => {
  it("7 版: 補正を足した能力値、能力値から決まる副能力値と技能の初期値", () => {
    const c = parseIacharaSheet(sheet7th, URL7)!;
    expect(c).toMatchObject({
      name: "白瀬 怜",
      memo: "職業: 高校教師",
      systemId: "coc7",
      image: "https://image.iaproject.app/example-7th",
      stats: { san: 85, luck: 85 },
    });
    const s = c.sheet!;
    expect(s).toMatchObject({ provider: "iachara", url: URL7 });
    expect(values(s.profile)).toMatchObject({
      職業: "高校教師",
      年齢: 23,
      性別: "女",
      出身: "東京",
      誕生日: "8/21",
    });
    /* STR 65+5-5、POW 70+5+5、APP 65+5、SIZ 65+5、EDU 90-5 */
    expect(values(sheetSection(s, "abilities")?.entries)).toEqual({
      STR: 65,
      CON: 60,
      POW: 80,
      DEX: 55,
      APP: 70,
      SIZ: 70,
      INT: 70,
      EDU: 85,
    });
    expect(values(sheetSection(s, "resources")?.entries)).toEqual({
      HP: 13,
      MP: 16,
      SAN: 85,
      幸運: 85,
      DB: "+1D4",
      ビルド: 1,
      MOV: 7,
    });
    /* SAN の上限は 99 − クトゥルフ神話 */
    expect(sheetSection(s, "resources")?.entries.find((e) => e.label === "SAN")?.max).toBe(85);
    expect(sheetSkillValue(s, "回避")).toBe(27 + 44);
    expect(sheetSkillValue(s, "近接戦闘（格闘）")).toBe(25 + 52);
    expect(sheetSkillValue(s, "射撃（拳銃）")).toBe(20 + 23);
    expect(sheetSkillValue(s, "母国語（日本語）")).toBe(85);
    expect(sheetSkillValue(s, "言語（英語）")).toBe(65);
    expect(sheetSkillValue(s, "芸術/製作（ファッション）")).toBe(20);
    expect(sheetSkillValue(s, "芸術（猫じゃらし）")).toBe(29);
    expect(sheetSkillValue(s, "クトゥルフ神話")).toBe(14);
    const skills = sheetSection(s, "skills")!.entries;
    expect(skills.find((e) => e.label === "目星")).toMatchObject({ value: 93, base: 25, group: "探索技能" });
    /* 専門分野を持たない技能に残った additionalName は名前に付けない */
    expect(skills.find((e) => e.label.startsWith("回避"))?.label).toBe("回避");
    expect(values(sheetSection(s, "items")?.entries)).toEqual({ 伊達メガネ: 3 });
    expect(sheetSection(s, "weapons")).toBeUndefined();
    expect(sheetSection(s, "backstory")?.text).toBe("【イデオロギー/信念】\n学びは座学だけでなく実技が大切");
  });

  it("6 版: ×5 の副能力値・回避（DEX×2）・母国語（EDU×5）・6 版の所持品と通過シナリオ", () => {
    const c = parseIacharaSheet(JSON.stringify(sheet6th), URL6)!;
    expect(c).toMatchObject({ name: "遠沢 澄花", systemId: "coc6", stats: { san: 71 } });
    expect(c.stats.luck).toBeUndefined();
    const s = c.sheet!;
    expect(values(sheetSection(s, "abilities")?.entries)).toMatchObject({ DEX: 12, EDU: 12, POW: 13 });
    expect(values(sheetSection(s, "resources")?.entries)).toEqual({
      HP: 10,
      MP: 13,
      SAN: 71,
      アイデア: 65,
      幸運: 65,
      知識: 60,
      DB: 0,
    });
    expect(sheetSection(s, "resources")?.entries.find((e) => e.label === "SAN")?.max).toBe(88);
    expect(sheetSkillValue(s, "回避")).toBe(24 + 45);
    expect(sheetSkillValue(s, "母国語（日本語）")).toBe(60);
    expect(sheetSkillValue(s, "製作（造園）")).toBe(75);
    expect(sheetSkillValue(s, "芸術（水彩画）")).toBe(60);
    expect(sheetSkillValue(s, "運転（車）")).toBe(20);
    expect(sheetSkillValue(s, "杖")).toBe(45);
    expect(sheetSection(s, "weapons")?.entries).toEqual([
      { label: "仕込み杖", value: 25, note: "ダメージ 1d6+db　射程 タッチ" },
    ]);
    expect(sheetSection(s, "items")?.entries).toEqual([
      { label: "庭道具一式", value: "" },
      { label: "くじらの水筒", value: 1, note: "緑茶が入っている" },
    ]);
    expect(sheetSection(s, "scenarios")?.entries).toEqual([
      { label: "中庭の夢", value: "", note: "ノーマルエンド" },
    ]);
    expect(sheetSection(s, "memo")?.text).toBe("体が弱い。\n庭いじりが好き。");
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

  it("非公開・削除済み・形の違う応答は読まない", () => {
    const priv = structuredClone(sheet7th) as { data: { public: boolean } };
    priv.data.public = false;
    expect(parseIacharaSheet(priv, URL7)).toBeNull();
    const privMeta = structuredClone(sheet7th) as { data: { data: { metadata: { isPublic: boolean } } } };
    privMeta.data.data.metadata.isPublic = false;
    expect(parseIacharaSheet(privMeta, URL7)).toBeNull();
    expect(parseIacharaSheet("{not json", URL7)).toBeNull();
    expect(parseIacharaSheet({ success: true, data: { public: true, data: { version: "5th" } } })).toBeNull();
  });
});

describe("いあきゃらの取得失敗の文言（iacharaSheetError）", () => {
  it("非公開・見つからない・読めるシートを見分ける", () => {
    expect(iacharaSheetError(JSON.stringify({ success: false, data: { public: false } }))).toBe(
      "このキャラクターシートは非公開です。いあきゃらで公開に設定してから、もう一度お試しください。",
    );
    expect(
      iacharaSheetError(
        JSON.stringify({
          success: false,
          data: {},
          message: "正常にキャラクターシートを取得できませんでした。",
        }),
      ),
    ).toBe("いあきゃらにこのキャラクターシートが見つかりませんでした。URL をお確かめください。");
    expect(iacharaSheetError(JSON.stringify(sheet7th))).toBeUndefined();
    expect(iacharaSheetError("not json")).toBeUndefined();
  });
});

describe("期限つきの鍵の使い回し（createTokenCache）", () => {
  it("期限の 5 分前までは使い回し、過ぎたら取り直す。同時の取得は 1 本にまとめる", async () => {
    const cache = createTokenCache();
    let issued = 0;
    const issue = async () => ({ token: `t${++issued}`, expiresInSec: 3600 });
    const t0 = new Date("2026-11-22T00:00:00Z");
    const [a, b] = await Promise.all([cache.get(t0, issue), cache.get(t0, issue)]);
    expect([a, b, issued]).toEqual(["t1", "t1", 1]);
    expect(await cache.get(new Date(t0.getTime() + 54 * 60_000), issue)).toBe("t1");
    expect(await cache.get(new Date(t0.getTime() + 56 * 60_000), issue)).toBe("t2");
    cache.clear();
    expect(await cache.get(new Date(t0.getTime() + 57 * 60_000), issue)).toBe("t3");
  });

  it("取得に失敗したら覚えず、次の取り込みで取り直す", async () => {
    const cache = createTokenCache();
    const now = new Date("2026-11-22T00:00:00Z");
    expect(await cache.get(now, async () => null)).toBeNull();
    expect(await cache.get(now, async () => ({ token: "ok", expiresInSec: 3600 }))).toBe("ok");
  });
});
