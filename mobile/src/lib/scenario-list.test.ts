import { describe, expect, it } from "vitest";
import type { DirectoryScenario } from "@shared/lib/scenario-directory";
import type { Scenario } from "@shared/types";
import { mergeScenarioCandidates, remoteOnly } from "./scenario-list";

const local = (id: string, extra: Partial<Scenario> = {}): Scenario => ({
  id,
  title: id,
  author: "a",
  systemId: "coc7",
  source: "manual",
  emoji: "x",
  bg: "#fff",
  tags: [],
  claimedBy: null,
  addedBy: "user",
  ...extra,
});
const dir = (id: string, extra: Partial<DirectoryScenario> = {}): DirectoryScenario => ({
  id,
  title: id,
  author: "a",
  systemId: "coc7",
  source: "talto",
  tags: [],
  ...extra,
});

describe("remoteOnly", () => {
  it("ローカルと同じ ID・同じ TALTO 作品のリモート行は一覧から落とす", () => {
    const l = [local("a"), local("mine", { sourceUrl: "https://talto.cc/projects/xyz" })];
    const r = [dir("a"), dir("sc_talto_xyz"), dir("b")];
    expect(remoteOnly(l, r).map((d) => d.id)).toEqual(["b"]);
  });
});

describe("mergeScenarioCandidates", () => {
  it("ローカルの行を先に、リモートの行を後に並べる", () => {
    expect(mergeScenarioCandidates([local("a")], [dir("a"), dir("b")]).map((d) => d.id)).toEqual(["a", "b"]);
  });
});
