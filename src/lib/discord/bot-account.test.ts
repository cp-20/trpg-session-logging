import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOT_UID,
  ensureEmulatorBotUser,
  patchRulesBotUid,
  patchSourceBotUid,
  rulesBotUid,
} from "./bot-account";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const RULES = readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
const SOURCE = readFileSync(path.join(ROOT, "src/lib/discord/bot-account.ts"), "utf8");

describe("ボットの利用者", () => {
  it("firestore.rules の botUid() と BOT_UID は同じ（setup-bot が 2 か所を書き換える）", () => {
    expect(rulesBotUid(RULES)).toBe(BOT_UID);
  });

  it("uid を書き換えられ、uid でない値は書かない", () => {
    const rules = patchRulesBotUid(RULES, "AbC123xyz");
    expect(rulesBotUid(rules)).toBe("AbC123xyz");
    expect(rules.replace("AbC123xyz", BOT_UID)).toBe(RULES);
    expect(patchSourceBotUid(SOURCE, "AbC123xyz")).toContain('export const BOT_UID = "AbC123xyz";');
    expect(() => patchRulesBotUid(RULES, "x'; } function evil() {")).toThrow();
    expect(() => patchSourceBotUid(SOURCE, 'x"; process.exit(); "')).toThrow();
  });

  it("エミュレーターでは、決まった uid のボットを一度だけ作る", async () => {
    const calls: { url: string; body: unknown }[] = [];
    let exists = false;
    const fetchFn = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url, body });
      if (url.endsWith(":lookup")) return Response.json(exists ? { users: [{ localId: BOT_UID }] } : {});
      exists = true;
      return Response.json({ localId: body.localId });
    }) as typeof fetch;
    const opts = { authUrl: "http://127.0.0.1:9099", projectId: "takufu-app", fetchFn };
    expect(await ensureEmulatorBotUser(opts)).toEqual({ uid: BOT_UID, created: true });
    expect(await ensureEmulatorBotUser(opts)).toEqual({ uid: BOT_UID, created: false });
    expect(calls.map((c) => c.url.split("/").at(-1))).toEqual([
      "accounts:lookup",
      "accounts",
      "accounts:lookup",
    ]);
    expect(calls[1]?.body).toMatchObject({ localId: BOT_UID });
  });
});
