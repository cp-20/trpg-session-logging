import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Scope } from "../types";
import { sharedManifestAccess } from "./cloud-state";
import { SHARE_MANIFEST_SCOPES, sharedPageScope, validShareAccess } from "./share-scope";

const SCOPES: Scope[] = ["members", "passed", "public"];

describe("shared page scope is exactly what the user picked", () => {
  it.each(SCOPES)("scope %s is kept regardless of scenario", (scope) => {
    expect(sharedPageScope({ scope })).toBe(scope);
    expect(sharedManifestAccess({ scope })).toEqual({ scope });
    expect(validShareAccess(sharedManifestAccess({ scope }))).toBe(true);
  });
});

describe("firestore.rules validShare", () => {
  const rules = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");

  it("mirrors the scope list and never consults the scenario policy", () => {
    const body = rules.match(/function validShare\(\) \{([\s\S]*?)\n {4}\}/)?.[1];
    expect(body, "validShare() not found in firestore.rules").toBeTruthy();
    const scopes = body!
      .match(/data\.scope in \[([^\]]*)\]/)?.[1]
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, ""));
    expect(scopes).toEqual([...SHARE_MANIFEST_SCOPES]);
    expect(validShareAccess({ scope: "secret" })).toBe(false);
    // 旧クライアントが送る scenarioPolicy は許すだけで、条件にはしない
    expect(body).not.toMatch(/data\.scenarioPolicy\s*==|scenarioPolicy\s*==/);
  });

  it("read rules do not depend on scenarioPolicy", () => {
    const readRules = rules.replace(/function validShare\(\)[\s\S]*?\n {4}\}/, "");
    expect(readRules).not.toMatch(/scenarioPolicy/);
  });
});
