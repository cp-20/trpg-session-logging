import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MARK_BODY, MARK_PIPS, MARK_SHAPE, markSvg } from "./brand";

/** 8bit RGB(A) の PNG から、画素 (x, y) の値を読む関数を作る */
function readPng(png: Buffer): { width: number; at: (x: number, y: number) => number[] } {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bpp = png[25] === 6 ? 4 : 3;
  const idat: Buffer[] = [];
  for (let o = 8; o < png.length;) {
    const len = png.readUInt32BE(o);
    if (png.toString("latin1", o + 4, o + 8) === "IDAT") idat.push(png.subarray(o + 8, o + 8 + len));
    o += len + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp]! : 0;
      const b = y > 0 ? px[(y - 1) * stride + i]! : 0;
      const c = i >= bpp && y > 0 ? px[(y - 1) * stride + i - bpp]! : 0;
      const p = a + b - c;
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const add = [0, a, b, (a + b) >> 1, paeth][filter]!;
      px[y * stride + i] = raw[y * (stride + 1) + 1 + i]! + add;
    }
  }
  return { width, at: (x, y) => [...px.subarray(y * stride + x * bpp, y * stride + (x + 1) * bpp)] };
}

describe("ブランドマーク", () => {
  it("本体と三の目を 1 つの形にし、目は地が透ける", () => {
    expect(MARK_PIPS).toHaveLength(3);
    expect(MARK_SHAPE.startsWith(MARK_BODY)).toBe(true);
    expect(MARK_SHAPE.match(/Z/g)).toHaveLength(4);
    expect(markSvg()).toContain('fill-rule="evenodd"');
  });

  it("favicon はどの大きさも切れていない（四隅が抜け、左右の端に地が届く）", () => {
    const ico = readFileSync("src/app/favicon.ico");
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    for (let i = 0; i < count; i++) {
      const o = 6 + i * 16;
      const start = ico.readUInt32LE(o + 12);
      const { width, at } = readPng(ico.subarray(start, start + ico.readUInt32LE(o + 8)));
      const last = width - 1;
      for (const [x, y] of [
        [0, 0],
        [last, 0],
        [0, last],
        [last, last],
      ] as const)
        expect(at(x, y)[3], `${width}px (${x},${y})`).toBeLessThan(128);
      const mid = width >> 1;
      for (const [x, y] of [
        [0, mid],
        [last, mid],
        [mid, last],
      ] as const)
        expect(at(x, y)[3], `${width}px (${x},${y})`).toBeGreaterThan(200);
    }
  });
});
