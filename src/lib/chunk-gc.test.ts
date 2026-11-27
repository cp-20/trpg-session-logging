import { describe, expect, it } from "vitest";
import { GC_GRACE_MS, orphanRevisions, workspaceRevisions } from "./chunk-gc";

const NOW = Date.parse("2026-11-27T00:00:00Z");
const rev = (parent: string, revision: string, ageMs: number) => ({
  parent,
  revision,
  newestWriteMs: NOW - ageMs,
  chunkNames: [`${parent}/revisions/${revision}/chunks/0000`],
});

describe("orphanRevisions（消し残りの世代）", () => {
  const referenced = new Map([["sharedLogs/s1", new Set(["r_now"])]]);

  it("見出しが指していない、猶予より古い世代を返す", () => {
    const old = rev("sharedLogs/s1", "r_old", GC_GRACE_MS + 1);

    expect(orphanRevisions([old], referenced, NOW)).toEqual([old]);
  });

  it("見出しが指している世代は、古くても残す", () => {
    expect(orphanRevisions([rev("sharedLogs/s1", "r_now", GC_GRACE_MS * 10)], referenced, NOW)).toEqual([]);
  });

  it("書きかけかもしれない新しい世代（猶予の内）は残す", () => {
    expect(orphanRevisions([rev("sharedLogs/s1", "r_new", GC_GRACE_MS - 1)], referenced, NOW)).toEqual([]);
  });

  it("見出しのない親（共有をやめた・記録がない）の世代は、猶予を過ぎれば消してよい", () => {
    const gone = rev("sharedLogs/s_gone", "r1", GC_GRACE_MS);

    expect(orphanRevisions([gone], referenced, NOW)).toEqual([gone]);
  });
});

describe("workspaceRevisions（記録の見出しが指す世代）", () => {
  it("部品ごとの revision を集める", () => {
    expect(workspaceRevisions({ parts: { base: { revision: "a" }, "log:l1": { revision: "b" } } })).toEqual(
      new Set(["a", "b"]),
    );
  });

  it.each([
    ["見出しがない", null],
    ["parts がない", {}],
    ["revision が文字でない", { parts: { base: { revision: 1 } } }],
  ])("%s ときは空", (_label, manifest) => {
    expect(workspaceRevisions(manifest)).toEqual(new Set());
  });
});
