import { z } from "zod";
import type { State } from "../types";
import { upgradeLogScenario } from "./session-scenario";
import { upgradeLogSchedule } from "./sittings";
import { coerceSheet } from "./sheet";

const account = z.looseObject({
  provider: z.enum(["google", "discord", "x", "booth", "talto"]),
  status: z.enum(["linked", "pending", "none"]),
});
const user = z.looseObject({
  id: z.string(),
  handle: z.string().optional(),
  name: z.string(),
  color: z.string().default("#0e7490"),
  accounts: z.array(account).default([]),
  profilePublic: z.boolean().optional(),
});
const MESSAGE_KINDS = new Set(["PC", "NPC", "ENEMY", "KP", "PL", "GM", "NARRATION", "SYSTEM"]);
const MESSAGE_TYPES = new Set(["text", "note", "roll"]);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
/**
 * 発言 1 件の形。ログは数万件になり、起動のたびにすべてを確かめるので、zod の looseObject ではなく手で確かめる
 * （zod は 1 件ずつ写しを作るため、6 万件で JSON.parse と同じくらいの時間がかかっていた）。
 * 確かめる中身は looseObject と同じ: id・ts（有限の数）・sp・kind・type、roll は null か 4 つの文字列、type が roll なら roll が要る
 */
function isMessage(m: unknown): boolean {
  if (!isRecord(m)) return false;
  if (typeof m.id !== "string" || typeof m.sp !== "string") return false;
  if (typeof m.ts !== "number" || !Number.isFinite(m.ts)) return false;
  if (!MESSAGE_KINDS.has(m.kind as string) || !MESSAGE_TYPES.has(m.type as string)) return false;
  const roll = m.roll;
  if (roll !== undefined && roll !== null) {
    if (!isRecord(roll)) return false;
    if (
      typeof roll.cmd !== "string" ||
      typeof roll.skill !== "string" ||
      typeof roll.dice !== "string" ||
      typeof roll.result !== "string"
    )
      return false;
  }
  return m.type !== "roll" || Boolean(roll);
}
const messages = z.custom<unknown[]>((v) => Array.isArray(v) && v.every(isMessage));
const link = z.looseObject({
  linked: z.boolean(),
  hidden: z.boolean().default(false),
  characterIds: z.array(z.string()).default([]),
  role: z.enum(["GM", "PL"]).optional(),
});
const externalSyncSchema = z.looseObject({
  provider: z.enum([
    "iachara",
    "charasheet",
    "ytsheet",
    "emoklore",
    "charaeno",
    "charash",
    "souko",
    "lhrpg",
    "booth",
    "talto",
  ]),
  url: z.string(),
  lastSyncedAt: z.string().optional(),
  lastStatus: z.enum(["ok", "error"]).optional(),
  lastError: z.string().optional(),
  contentHash: z.string().optional(),
  autoSync: z.boolean().default(true),
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
            logId: z.string(),
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
        externalSync: externalSyncSchema.optional(),
        /* キャラシは汎用形式の JSON。壊れていてもキャラクター本体の復元は止めず、読めない部分だけ落とす */
        sheet: z.unknown().transform(coerceSheet).optional(),
      }),
    ),
    scenarios: z.record(
      z.string(),
      z.looseObject({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        systemId: z.string(),
        tags: z.array(z.string()).default([]),
        private: z.boolean().optional(),
        externalSync: externalSyncSchema.optional(),
      }),
    ),
    logs: z.record(
      z.string(),
      z.looseObject({
        id: z.string(),
        scenarioId: z.string().min(1),
        systemId: z.string(),
        ownerId: z.string(),
        scope: z.enum(["members", "passed", "public"]),
        secretTabs: z.enum(["shared", "private"]).optional(),
        hasLog: z.boolean(),
        sittings: z.array(z.object({ start: z.number().finite(), end: z.number().finite() })),
        slug: z.string().min(1),
        channels: z.array(
          z.looseObject({ id: z.string(), name: z.string(), secret: z.boolean(), msgs: messages }),
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

/**
 * 成長は必ずどれかのセッションのあとのもの（P1）。以前の「セッションに紐付けない」成長は、
 * その日までに遊んだいちばん新しいセッション（なければ最初のセッション）に結び、日付もそれに合わせる。
 * セッションが 1 つもないキャラクターの成長は結ぶ先がないので捨てる（値はキャラシ・能力値に残っている）。
 */
export function migrateLooseGrowth(c: Record<string, unknown>): void {
  if (!Array.isArray(c.growth)) return;
  const sessions = (Array.isArray(c.sessions) ? c.sessions : [])
    .filter(
      (s): s is { logId: string; date: string } =>
        Boolean(s) && typeof s.logId === "string" && typeof s.date === "string",
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  c.growth = c.growth.flatMap((g: Record<string, unknown>) => {
    if (!g || typeof g !== "object") return [];
    if (typeof g.logId === "string" && g.logId) return [g];
    const date = typeof g.date === "string" ? g.date : "";
    const hit = sessions.filter((s) => s.date <= date).at(-1) ?? sessions[0];
    if (!hit) return [];
    const { note: _note, ...rest } = g;
    return [{ ...rest, logId: hit.logId, date: hit.date }];
  });
}

/** Only migrate fields whose meaning is known; never cast unreadable data to State. */
export function validateSavedState(data: unknown): State | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const obj = data as Record<string, unknown>;
  if (obj.logs && typeof obj.logs === "object") {
    for (const [id, log] of Object.entries(obj.logs) as [string, Record<string, unknown>][]) {
      if (!log || typeof log !== "object") continue;
      log.slug ??= id;
      // 遊んだ時間帯は dates + t0 + t1 から sittings（開始・終了の日時の並び）に改めた
      upgradeLogSchedule(log);
      // セッションは名前を持たず、シナリオの題名で呼ぶ（シナリオのないものは名前から共有シナリオ一覧に出さないシナリオを作る）
      obj.scenarios ??= {};
      if (obj.scenarios && typeof obj.scenarios === "object")
        upgradeLogScenario(log, obj.scenarios as Record<string, unknown>);
    }
  }
  // 以前の「予定のある日」（Google から許可なしに混ぜた日・手で入れた日）は扱わなくなった。
  // 照らし合わせは本人が許可した Google カレンダーの時間帯（googleBusy）だけ
  const prefs = obj.prefs as Record<string, unknown> | undefined;
  if (prefs && typeof prefs === "object") {
    delete prefs.googleCalendarSyncedAt;
    delete prefs.busyDates;
  }
  if (obj.characters && typeof obj.characters === "object") {
    for (const c of Object.values(obj.characters) as Record<string, unknown>[]) {
      if (c && typeof c === "object") migrateLooseGrowth(c);
    }
  }
  const result = RestoredStateSchema.safeParse(obj);
  return result.success ? (result.data as unknown as State) : null;
}

export function parseSavedState(raw: string): State | null {
  try {
    return validateSavedState(JSON.parse(raw));
  } catch {
    return null;
  }
}
