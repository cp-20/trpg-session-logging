import { describe, expect, it } from "vitest";
import { LP_DETAILED_SYSTEMS, LP_SOURCES } from "./Landing";
import { DETAILED_SYSTEM_IDS, SYSTEMS } from "../data/systems";
import { SHEET_SITES } from "../lib/external-sync";
import { SERVICE_LABEL } from "../lib/session-media";

/** LP に書いた取り込み元が、実際に読めるもの・結べるものと食い違わない（LP の主張が実装から離れた指摘、2026-11-27） */
describe("LP の取り込み元", () => {
  const row = (what: string) => LP_SOURCES.find((s) => s.what === what)?.from ?? [];

  it("キャラシは、URL から読めるサイトをすべて・それだけ並べる", () => {
    expect(row("キャラシ")).toEqual(SHEET_SITES.map((s) => s.label));
  });

  it("録画・配信と感想・絵は、セッションに結べるサービスの名前だけを使う", () => {
    const known = new Set(Object.values(SERVICE_LABEL));
    for (const name of [...row("録画・配信"), ...row("感想・絵")]) expect(known, name).toContain(name);
  });
});

describe("LP の対応システム", () => {
  it("能力値・技能まで表示するシステムを、詳しい定義と同じだけ並べる（能力値を持たないものは除く）", () => {
    const detailed = DETAILED_SYSTEM_IDS.map((id) => SYSTEMS[id]!).filter(
      (sys) =>
        sys.stats.length > 0 || sys.skills.length > 0 || (sys.id !== "madamis" && sys.id !== "general"),
    );
    expect([...LP_DETAILED_SYSTEMS]).toEqual(detailed.map((sys) => sys.name));
  });
});
