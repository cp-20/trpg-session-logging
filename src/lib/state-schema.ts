import { z } from "zod";
import type { State } from "../types";
import { deriveSessionFromMessages } from "./time";

const account = z.looseObject({
  provider: z.enum(["google", "discord", "x", "booth", "talto"]),
  status: z.enum(["linked", "pending", "none"]),
});
const user = z.looseObject({
  id: z.string(),
  name: z.string(),
  color: z.string().default("#0e7490"),
  accounts: z.array(account).default([]),
  profilePublic: z.boolean().optional(),
});
const message = z
  .looseObject({
    id: z.string(),
    ts: z.number().finite(),
    sp: z.string(),
    kind: z.enum(["PC", "NPC", "KP", "PL", "GM", "SYSTEM"]),
    type: z.enum(["text", "note", "roll"]),
    roll: z
      .looseObject({ cmd: z.string(), skill: z.string(), dice: z.string(), result: z.string() })
      .nullish(),
  })
  .refine((m) => m.type !== "roll" || Boolean(m.roll));
const link = z.looseObject({
  linked: z.boolean(),
  hidden: z.boolean().default(false),
  characterIds: z.array(z.string()).default([]),
});

export const RestoredStateSchema = z
  .looseObject({
    me: z.string().min(1),
    entered: z.boolean().default(false),
    prefs: z
      .looseObject({
        hideSelfOnShare: z.boolean().default(false),
        onboardingDone: z.boolean().optional(),
      })
      .default({ hideSelfOnShare: false }),
    users: z.record(z.string(), user),
    tables: z
      .record(
        z.string(),
        z.looseObject({
          id: z.string(),
          name: z.string(),
          ownerId: z.string(),
          memberIds: z.array(z.string()),
        }),
      )
      .default({}),
    characters: z.record(
      z.string(),
      z.looseObject({
        id: z.string(),
        ownerId: z.string(),
        name: z.string(),
        systemId: z.string(),
        color: z.string(),
        archetype: z.string(),
        bio: z.string(),
        tags: z.array(z.string()),
        stats: z.record(z.string(), z.number()),
        sessions: z.array(
          z.looseObject({
            logId: z.string(),
            date: z.string(),
            title: z.string(),
            delta: z.record(z.string(), z.looseObject({ before: z.number(), after: z.number() })),
            rolls: z.array(z.unknown()),
            memo: z.string(),
          }),
        ),
        growth: z.array(
          z.looseObject({
            id: z.string(),
            date: z.string(),
            skill: z.string(),
            from: z.number(),
            to: z.number(),
          }),
        ),
        share: z.looseObject({
          enabled: z.boolean(),
          scope: z.enum(["link", "private"]),
          includeProfile: z.boolean(),
          includeStats: z.boolean(),
          includeGrowth: z.boolean(),
          includeSessions: z.boolean(),
        }),
      }),
    ),
    scenarios: z.record(
      z.string(),
      z.looseObject({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        systemId: z.string(),
        policy: z.enum(["public", "passed", "members", "unknown"]),
        tags: z.array(z.string()).default([]),
      }),
    ),
    logs: z.record(
      z.string(),
      z.looseObject({
        id: z.string(),
        title: z.string(),
        systemId: z.string(),
        ownerId: z.string(),
        scope: z.enum(["members", "passed", "public"]),
        hasLog: z.boolean(),
        dates: z.array(z.string()),
        t0: z.number().finite(),
        t1: z.number().finite(),
        slug: z.string().min(1),
        channels: z.array(
          z.looseObject({ id: z.string(), name: z.string(), secret: z.boolean(), msgs: z.array(message) }),
        ),
        players: z.record(z.string(), link),
      }),
    ),
    events: z.record(z.string(), z.any()).default({}),
    editRequests: z
      .array(
        z.looseObject({
          id: z.string(),
          scenarioId: z.string(),
          uid: z.string(),
          at: z.string(),
          status: z.enum(["pending", "accepted", "rejected"]),
        }),
      )
      .default([]),
  })
  .refine(
    (s) =>
      Boolean(s.users[s.me]) &&
      Object.values(s.logs).every(
        (l) => Boolean(s.users[l.ownerId]) && Object.keys(l.players).every((id) => Boolean(s.users[id])),
      ) &&
      Object.values(s.characters).every((c) => Boolean(s.users[c.ownerId])) &&
      Object.values(s.tables).every(
        (t) => Boolean(s.users[t.ownerId]) && t.memberIds.every((id) => Boolean(s.users[id])),
      ),
    "参照しているユーザーが見つかりません",
  );

/** Only migrate fields whose meaning is known; never cast unreadable data to State. */
export function parseSavedState(raw: string): State | null {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    if (data.logs && typeof data.logs === "object") {
      for (const [id, log] of Object.entries(data.logs) as [string, Record<string, unknown>][]) {
        if (!log || typeof log !== "object") continue;
        log.slug ??= id;
        if (
          (!Array.isArray(log.dates) || !Number.isFinite(log.t0) || !Number.isFinite(log.t1)) &&
          Array.isArray(log.channels)
        ) {
          const derived = deriveSessionFromMessages(log.channels as State["logs"][string]["channels"]);
          if (derived) {
            log.dates ??= derived.dates;
            log.t0 ??= derived.t0;
            log.t1 ??= derived.t1;
          }
        }
      }
    }
    const result = RestoredStateSchema.safeParse(data);
    return result.success ? (result.data as unknown as State) : null;
  } catch {
    return null;
  }
}
