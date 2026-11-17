import { expect, it } from "vitest";
import JSZip from "jszip";
import { parseCcfoliaCharacterJson, parseCcfoliaCharacterZip, toCharacterFields } from "./ccfolia-character";

const character = {
  kind: "character",
  data: {
    name: "風見 遥", memo: "天文学者", color: "#335577", commands: "CC<=70 目星",
    status: [{ label: "SAN", value: 0, max: 99 }, { label: "HP", value: 12, max: 14 }],
    params: [{ label: "STR", value: "60" }, { label: "目星", value: "70" }, { label: "DB", value: "+1d4" }],
  },
};

it("公式クリップボード形式から実際の名前・数値・メモを読み、未指定の値を生成しない", () => {
  const parsed = parseCcfoliaCharacterJson(JSON.stringify(character))!;
  expect(parsed.name).toBe("風見 遥");
  expect(parsed.stats).toEqual({ san: 0, hp: 12, str: 60, 目星: 70 });
  expect(toCharacterFields(parsed, "general")).toMatchObject({ systemId: "coc7", bio: "天文学者", color: "#335577" });
  expect(parseCcfoliaCharacterJson('{"name":"単体キャラクター"}')?.stats).toEqual({});
  expect(parseCcfoliaCharacterJson('{"messages":[{"name":"発言者"}]}')).toBeNull();
});

it("ZIP内の参照画像を取り込み、別のキャラクターの画像で補完しない", async () => {
  const zip = new JSZip();
  zip.file("character.json", JSON.stringify({ ...character, data: { ...character.data, imageId: "portrait" } }));
  zip.file("images/portrait.png", "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=", { base64: true });
  const parsed = await parseCcfoliaCharacterZip(await zip.generateAsync({ type: "arraybuffer" }));
  expect(parsed?.image).toMatch(/^data:image\/png;base64,/);
  zip.file("character.json", JSON.stringify({ ...character, data: { ...character.data, imageId: "someone-else" } }));
  const missing = await parseCcfoliaCharacterZip(await zip.generateAsync({ type: "arraybuffer" }));
  expect(missing?.image).toBeUndefined();
});
