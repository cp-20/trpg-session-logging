import { describe, expect, it } from "vitest";
// @vitest-environment jsdom
import JSZip from "jszip";
import { parseCcfoliaCharacterJson, parseCcfoliaCharacterZip, toCharacterFields } from "./ccfolia-character";

const character = {
  kind: "character",
  data: {
    name: "風見 遥",
    memo: "天文学者",
    color: "#335577",
    commands: "CC<=70 目星",
    status: [
      { label: "SAN", value: 0, max: 99 },
      { label: "HP", value: 12, max: 14 },
    ],
    params: [
      { label: "STR", value: "60" },
      { label: "目星", value: "70" },
      { label: "DB", value: "+1d4" },
    ],
  },
};

describe("ccfolia-character", () => {
  it("公式クリップボード形式から実際の名前・数値・メモを読み、未指定の値を生成しない", () => {
    const parsed = parseCcfoliaCharacterJson(JSON.stringify(character))!;
    expect(parsed.name).toBe("風見 遥");
    expect(parsed.stats).toEqual({ san: 0, hp: 12, str: 60, 目星: 70 });
    expect(toCharacterFields(parsed, "general")).toMatchObject({
      systemId: "coc7",
      bio: "天文学者",
      color: "#335577",
    });
    expect(parseCcfoliaCharacterJson('{"name":"単体キャラクター"}')?.stats).toEqual({});
    expect(parseCcfoliaCharacterJson('{"messages":[{"name":"発言者"}]}')).toBeNull();
  });

  it("{characters:{...}}・parameters・範囲境界・システム推定・色/画像URL検証・toCharacterFields フォールバックを扱う", () => {
    expect(parseCcfoliaCharacterJson("{broken")).toBeNull();
    expect(parseCcfoliaCharacterJson("[1,2,3]")).toBeNull();
    expect(parseCcfoliaCharacterJson('{"name":"   "}')).toBeNull();

    // 形式A ({characters: {id: {...}}}) と深さ制限・数値境界 (-100..999)・parameters
    const objChars = parseCcfoliaCharacterJson(
      JSON.stringify({
        characters: {
          empty: { name: "   " },
          valid: {
            name: "月島 陽",
            color: "not-hex",
            iconUrl: "https://cdn.example.com/icon.png",
            commands: "CCB<=65 図書館",
            parameters: {
              HP: 999,
              MP: -100,
              TOO_HIGH: 1000,
              TOO_LOW: -101,
              BADKEYNAME: 50,
              l1: {
                l2: {
                  l3: {
                    CON: 45,
                    l4: {
                      POW: 75,
                      l5: { DEX: 80 }, // depth 5 になるため打ち切り
                    },
                  },
                },
              },
            },
          },
        },
      }),
    )!;
    expect(objChars.name).toBe("月島 陽");
    expect(objChars.systemId).toBe("coc6");
    expect(objChars.color).toBeUndefined();
    expect(objChars.memo).toBeUndefined();
    expect(objChars.image).toBe("https://cdn.example.com/icon.png");
    expect(objChars.stats).toEqual({ hp: 999, mp: -100, con: 45, pow: 75 });
    expect(objChars.stats.dex).toBeUndefined();

    // 配列パラメータ・クトゥルフ6版/7版/SW2.5文字列判定・カラー桁数・data:image/jpeg と data:image/gif
    const regexCases = [
      {
        commands: "クトゥルフ 6版",
        expectedSys: "coc6",
        color: "#12345",
        icon: "data:image/jpeg;base64,AQI=",
      },
      { commands: "CC 目星", expectedSys: "coc7", color: "#1234567", icon: "data:image/gif;base64,AQI=" },
      {
        commands: "クトゥルフ 7版",
        expectedSys: "coc7",
        color: "#aAbBcC",
        icon: "HTTPS://cdn.example.com/p.png",
      },
      {
        commands: "ソード・ワールド",
        expectedSys: "sw25",
        color: "335577",
        icon: "data:image/svg+xml;base64,AQI=",
      },
    ];
    for (const rc of regexCases) {
      const r = parseCcfoliaCharacterJson(
        JSON.stringify({
          name: "判定PC",
          commands: rc.commands,
          color: rc.color,
          iconUrl: rc.icon,
          parameters: [[{ label: "APP", value: 14 }], { AB: 10, ABCDE: 20, HP2: 5, pow: "not-num" }],
        }),
      )!;
      expect(r.systemId).toBe(rc.expectedSys);
      expect(r.stats).toEqual({ app: 14, ab: 10 });
      expect(Boolean(r.color)).toBe(rc.color === "#aAbBcC");
      expect(Boolean(r.image)).toBe(!rc.icon.includes("svg"));
    }

    // SW2.5 推定・data:image/webp 許可・javascript: 拒否・toCharacterFields デフォルトフォールバック
    const swChar = parseCcfoliaCharacterJson(
      JSON.stringify({
        name: "アリシア",
        memo: "SW2.5 冒険者",
        iconUrl: "data:image/webp;base64,UklGRg==",
      }),
    )!;
    expect(swChar.systemId).toBe("sw25");
    expect(swChar.image).toBe("data:image/webp;base64,UklGRg==");

    const xssChar = parseCcfoliaCharacterJson(
      JSON.stringify({
        name: "  ",
        commands: "",
      }),
    );
    expect(xssChar).toBeNull();

    const unsafeIcon = parseCcfoliaCharacterJson(
      JSON.stringify({
        name: "テスト",
        iconUrl: "javascript:alert(1)",
        params: [{ label: "BLANK", value: "   " }],
      }),
    )!;
    expect(unsafeIcon.image).toBeUndefined();
    expect(unsafeIcon.stats).toEqual({});
    expect(toCharacterFields({ ...unsafeIcon, name: "   " }, "coc6")).toEqual({
      name: "名前未設定",
      systemId: "coc6",
      color: "#5348c8",
      bio: "",
      stats: {},
      image: undefined,
    });
  });

  it("ZIP内の参照画像(png/jpeg/gif/webp・URLパス末尾)を取り込み、不正ZIP・JSON無しZIPを拒否する", async () => {
    expect(await parseCcfoliaCharacterZip(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();

    const imgOnlyZip = new JSZip();
    imgOnlyZip.file("images/only.png", "abc");
    expect(
      await parseCcfoliaCharacterZip(await imgOnlyZip.generateAsync({ type: "arraybuffer" })),
    ).toBeNull();

    // invalid.json を先に入れ valid な2番目の JSON を選択 + iconUrl 末尾から jpeg 解決 + 拡張子あり imageId
    const multiZip = new JSZip();
    multiZip.file("a_invalid.json", '{"messages":[]}');
    multiZip.file(
      "b_char.json",
      JSON.stringify({ name: "紅玉", iconUrl: "https://cdn.example.com/files/ruby_pic?v=2" }),
    );
    multiZip.file("images/ruby_pic.jpeg", "AQID", { base64: true });
    const jpegParsed = await parseCcfoliaCharacterZip(await multiZip.generateAsync({ type: "arraybuffer" }));
    expect(jpegParsed?.name).toBe("紅玉");
    expect(jpegParsed?.image).toMatch(/^data:image\/jpeg;base64,/);

    // gif / webp の MIME 判定と非画像拡張子スキップ
    for (const [ext, mime] of [
      ["gif", "image/gif"],
      ["webp", "image/webp"],
    ] as const) {
      const z = new JSZip();
      z.file("c.json", JSON.stringify({ name: "画像", imageId: `pic.${ext}` }));
      z.file(`images/pic.${ext}`, "AQID", { base64: true });
      const res = await parseCcfoliaCharacterZip(await z.generateAsync({ type: "arraybuffer" }));
      expect(res?.image).toMatch(new RegExp(`^data:${mime};base64,`));
    }

    const txtImgZip = new JSZip();
    txtImgZip.file("c.json", JSON.stringify({ name: "画像なし", imageId: "readme.txt" }));
    txtImgZip.file("images/readme.txt", "hello");
    const txtRes = await parseCcfoliaCharacterZip(await txtImgZip.generateAsync({ type: "arraybuffer" }));
    expect(txtRes?.image).toBeUndefined();

    // imageId も iconUrl もない場合
    const noRefZip = new JSZip();
    noRefZip.file("c.json", JSON.stringify({ name: "参照なし" }));
    noRefZip.file("images/pic.png", "AQID", { base64: true });
    expect(
      (await parseCcfoliaCharacterZip(await noRefZip.generateAsync({ type: "arraybuffer" })))?.image,
    ).toBeUndefined();

    // original existing PNG + missing imageId check
    const zip = new JSZip();
    zip.file(
      "character.json",
      JSON.stringify({ ...character, data: { ...character.data, imageId: "portrait" } }),
    );
    zip.file(
      "images/portrait.png",
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cC20AAAAASUVORK5CYII=",
      { base64: true },
    );
    const parsed = await parseCcfoliaCharacterZip(await zip.generateAsync({ type: "arraybuffer" }));
    expect(parsed?.image).toMatch(/^data:image\/png;base64,/);
    zip.file(
      "character.json",
      JSON.stringify({ ...character, data: { ...character.data, imageId: "someone-else" } }),
    );
    const missing = await parseCcfoliaCharacterZip(await zip.generateAsync({ type: "arraybuffer" }));
    expect(missing?.image).toBeUndefined();
  });
});
