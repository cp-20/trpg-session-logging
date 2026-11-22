import { describe, expect, it } from "vitest";
import type { IdenticonKind } from "./identicon";
import { IDENTICON_INKS, PATTERN_IDS, identiconDataUri, identiconSpec, identiconSvg } from "./identicon";

const KINDS: IdenticonKind[] = ["user", "table", "character"];

describe("identicon", () => {
  it("同じ種からは同じ絵を作る", () => {
    for (const kind of KINDS) {
      expect(identiconSvg("u_mikan", kind)).toBe(identiconSvg("u_mikan", kind));
      expect(identiconDataUri("u_mikan", kind)).toBe(identiconDataUri("u_mikan", kind));
    }
  });

  it("違う種は違って見える（色・和柄・向き・目の組み合わせが散らばる）", () => {
    for (const kind of KINDS) {
      const seeds = Array.from({ length: 300 }, (_, i) => `id_${i}`);
      const looks = new Set(
        seeds.map((s) => {
          const spec = identiconSpec(s, kind);
          return `${spec.ink}/${spec.pattern}/${spec.rotate}/${spec.scale}/${spec.pips}`;
        }),
      );
      expect(looks.size).toBeGreaterThan(200);
      const inks = new Set(seeds.map((s) => identiconSpec(s, kind).ink));
      const patterns = new Set(seeds.map((s) => identiconSpec(s, kind).pattern));
      expect(inks.size).toBe(IDENTICON_INKS.length);
      expect(patterns.size).toBe(PATTERN_IDS.length);
    }
    // 1 文字違いの ID でも別の絵になる
    expect(identiconSvg("user_a", "user")).not.toBe(identiconSvg("user_b", "user"));
  });

  it("人・卓・キャラは同じ種でも別の形", () => {
    const [u, t, c] = KINDS.map((k) => identiconSvg("same", k));
    expect(new Set([u, t, c]).size).toBe(3);
    expect(t).toContain("<rect");
  });

  it("卓の印にはダイスの目が 1〜6 個ある", () => {
    for (let i = 0; i < 50; i++) {
      const spec = identiconSpec(`t_${i}`, "table");
      expect(spec.pips).toBeGreaterThanOrEqual(1);
      expect(spec.pips).toBeLessThanOrEqual(6);
    }
    expect(identiconSpec("x", "user").pips).toBe(0);
  });

  it("正しい SVG で、文字を含まない", () => {
    for (const kind of KINDS) {
      for (const seed of ["a", "卓のひとびと", "ch_towa", ""]) {
        const svg = identiconSvg(seed, kind);
        const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
        expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
        expect(doc.documentElement.tagName).toBe("svg");
        expect(doc.documentElement.getAttribute("viewBox")).toBe("0 0 64 64");
        expect(doc.getElementsByTagName("text")).toHaveLength(0);
        // 種（名前や ID）を絵に書き込まない
        if (seed.length > 3) expect(svg).not.toContain(seed);
      }
    }
  });

  it("data URI は img にそのまま渡せる形", () => {
    expect(identiconDataUri("u1", "user")).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg/);
  });
});
