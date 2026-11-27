/**
 * いあきゃら・キャラエノ・キャラッシュ・冒険窓口を本物で通す。
 * 入口は画面の取り込みと同じ handleExternalImport。キャラッシュだけは公開キャラクターの一覧が無いので、
 * 公式の見本（同じ形式）を取り込みの読み取り（parseExternalResponse）に通す。
 */
import { describe, expect, it } from "vitest";
import { parseExternalResponse } from "../../lib/external-sync";
import type { ImportedCharacter } from "./live-kit";
import {
  discoverIachara,
  expectSomeCharacter,
  fetchText,
  isNumeric,
  labelsOf,
  liveImport,
  sectionOf,
} from "./live-kit";
import { CHARAENO_DEVELOPER_DOC, CHARASH_SAMPLES, IACHARA_TAG, LHRPG_PC_IDS } from "./live-samples";

const COC_ABILITIES = ["STR", "CON", "POW", "DEX", "APP", "SIZ", "INT", "EDU"];

function expectCocSheet(r: Pick<ImportedCharacter, "character">, systemId: "coc6" | "coc7") {
  const c = { character: r.character } as ImportedCharacter;
  expect(r.character.systemId).toBe(systemId);
  expect(r.character.name.trim()).not.toBe("");
  expect(labelsOf(sectionOf(c, "abilities"))).toEqual(COC_ABILITIES);
  for (const e of sectionOf(c, "abilities").entries) expect(isNumeric(e.value)).toBe(true);
  expect(labelsOf(sectionOf(c, "resources"))).toEqual(expect.arrayContaining(["HP", "MP", "SAN"]));
  const skills = sectionOf(c, "skills").entries;
  expect(skills.map((e) => e.label)).toEqual(expect.arrayContaining(["回避"]));
  expect(new Set(skills.map((e) => e.group))).toContain("戦闘技能");
}

describe("いあきゃら（本物）", () => {
  it.each([
    ["6th", "coc6"],
    ["7th", "coc7"],
  ] as const)("公開のキャラシ（%s）を匿名の鍵で読み、%s の能力値・技能を出す", async (version, systemId) => {
    const rows = (await discoverIachara(IACHARA_TAG)).filter((x) => x.version === version).slice(0, 3);
    expect(rows.length).toBeGreaterThan(0);

    const r = await expectSomeCharacter(
      rows.map((x) => `https://iachara.com/view/${x.id}`),
      (x) => expectCocSheet(x, systemId),
    );

    expect(r.provider).toBe("iachara");
  });

  it("無い ID は、見つからないと言って断る（いあきゃらは取得できないときも 200 で success: false を返す）", async () => {
    const r = await liveImport("https://iachara.com/view/99999999");

    expect(r).toMatchObject({
      ok: false,
      status: 422,
      error: "いあきゃらにこのキャラクターシートが見つかりませんでした。URL をお確かめください。",
    });
  });
});

describe("キャラエノ（本物）", () => {
  it.each([
    ["6th", "coc6"],
    ["7th", "coc7"],
  ] as const)(
    "開発者向け文書の見本（%s）を公開 API で読み、%s の能力値・技能を出す",
    async (version, systemId) => {
      const doc = await fetchText(CHARAENO_DEVELOPER_DOC);
      const ids = [
        ...doc.body.matchAll(
          new RegExp(`charaeno\\.(?:com|sakasin\\.net)/(?:api/v1/)?${version}/([A-Za-z0-9_-]{21})`, "g"),
        ),
      ].map((m) => m[1]!);
      expect(ids.length).toBeGreaterThan(0);

      const r = await expectSomeCharacter(
        [...new Set(ids)].slice(0, 3).map((id) => `https://charaeno.com/${version}/${id}`),
        (x) => expectCocSheet(x, systemId),
      );

      expect(r.provider).toBe("charaeno");
    },
  );
});

describe("キャラッシュ（本物の見本）", () => {
  it.each(CHARASH_SAMPLES)("公式の見本（%s）を取り込みと同じ読み取りで読める", async (sample) => {
    const res = await fetchText(`https://charash.jp/api/v1/samples/${sample}.json`);
    expect(res.status).toBe(200);

    const payload = parseExternalResponse(
      "charash",
      res.body,
      res.headers.get("content-type") ?? "",
      "https://charash.jp/view/sample",
    );

    expect(payload?.kind).toBe("character");
    if (payload?.kind !== "character") return;
    const r = { character: payload.character } as ImportedCharacter;
    expect(payload.character.systemId).toBe(sample);
    expect(payload.character.name.trim()).not.toBe("");
    expect(sectionOf(r, "abilities").entries.length).toBe(8);
    expect(sectionOf(r, "skills").entries.length).toBeGreaterThan(10);
    if (sample !== "emoklore") expect(labelsOf(sectionOf(r, "abilities"))).toEqual(COC_ABILITIES);
  });

  it("閲覧 URL の取得先（公開 API）は、無い ID に 404 を返し、取り込みは非公開か見つからないと言う", async () => {
    const r = await liveImport("https://charash.jp/view/takufu-live-test-missing");

    expect(r).toMatchObject({ ok: false, status: 422 });
  });
});

describe("冒険窓口（本物）", () => {
  it("外部ツールからの参照を許したキャラクターを公開 API で読み、能力値・特技を出す", async () => {
    const r = await expectSomeCharacter(
      LHRPG_PC_IDS.map((id) => `https://lhrpg.com/lhz/pc?id=${id}`),
      (x) => {
        expect(x.character.systemId).toBe("LogHorizon");
        expect(x.character.name.trim()).not.toBe("");
        expect(labelsOf(sectionOf(x, "abilities"))).toEqual(["STR", "DEX", "POW", "INT"]);
        expect(sectionOf(x, "skills").entries.length).toBeGreaterThan(0);
        expect(typeof x.character.stats.lv).toBe("number");
      },
    );

    expect(r.provider).toBe("lhrpg");
  });
});
