import { deriveSessionFromMessages, uid } from "../lib/time";
import { SYSTEMS } from "../data/systems";
import type { Channel, Log, MsgKind, Policy, Scope, State } from "../types";

/** Upload フローの確定入力(Step3 を終えた時点の内容) */
export interface CommitLogInput {
  fileName: string | null;
  attachId: string | null;
  meta: { title: string; systemId: string };
  channels: Channel[];
  kinds: Record<string, MsgKind>;
  speakerIcons?: Record<string, string>;
  scope?: Scope;
  tableId: string;
  scenarioId: string;
  newScenario: { title: string; author: string; policy?: Policy } | null;
  players: { userId: string; characterIds: string[] }[];
  /** ログなしで作る場合の日時(Step1 の手入力)。channels が空のときのみ使われる */
  schedule?: { dates: string[]; t0: number; t1: number } | null;
}

function normalizeSpeakerIcons(icons?: Record<string, string>): Record<string, string> | undefined {
  if (!icons) return undefined;
  const entries = Object.entries(icons).filter(([, v]) => Boolean(v));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export interface CommitLogResult {
  ok: boolean;
  id: string;
  slug: string;
  reason?: string;
}

/**
 * ログ確定のユースケース(非同期)。
 * *結果の計算は同期・純粋*に行い(snapshot から)、その後 apply で一括書き込む。
 * React の updater の実行タイミングに依存せず、Promise の成功=結果確定とする。
 * 本実装ではここが Firestore + R2 への import ジョブ(requestId で冪等化)になる。
 */
export async function commitLogImport(
  input: CommitLogInput,
  snapshot: State,
  apply: (fn: (s: State) => void) => void,
): Promise<CommitLogResult> {
  if (input.attachId) {
    const target = snapshot.logs[input.attachId];
    if (!target)
      return { ok: false, id: input.attachId, slug: "", reason: "添付先のセッションが見つかりません" };
    if (target.ownerId !== snapshot.me)
      return {
        ok: false,
        id: target.id,
        slug: "",
        reason: "ログを添付できるのは、このセッションを記録した人だけです",
      };
    const newScenarioId = input.newScenario?.title.trim() ? "sc_" + uid() : undefined;
    const scenarioId = newScenarioId ?? (input.scenarioId || undefined);
    const derived = deriveSessionFromMessages(input.channels);
    const id = input.attachId;
    const slug = target.slug;
    apply((s) => {
      if (input.newScenario && input.newScenario.title.trim()) {
        const scid = newScenarioId!;
        s.scenarios[scid] = {
          id: scid,
          title: input.newScenario.title.trim(),
          author: input.newScenario.author.trim() || "自由記述（未登録）",
          systemId: input.meta.systemId,
          source: "manual",
          policy: input.newScenario.policy ?? "public",
          emoji: SYSTEMS[input.meta.systemId]?.emoji ?? "🎲",
          bg: "#e6e6f0",
          tags: [],
          claimedBy: null,
          addedBy: "user",
          addedByUid: s.me,
        };
      }
      let n = 0;
      const channels: Channel[] = JSON.parse(JSON.stringify(input.channels));
      channels.forEach((c) =>
        c.msgs.forEach((m) => {
          m.id = `${id}-${c.id}-${n++}`;
          m.kind = input.kinds[m.sp] ?? m.kind;
        }),
      );
      const l = s.logs[id];
      l.channels = channels;
      l.hasLog = true;
      l.systemId = input.meta.systemId;
      l.scenarioId = scenarioId;
      l.tableId = input.tableId || undefined;
      if (input.scope) l.scope = input.scope;
      const speakerIcons = normalizeSpeakerIcons(input.speakerIcons);
      if (speakerIcons) l.speakerIcons = speakerIcons;
      else if (input.speakerIcons) delete l.speakerIcons;
      if (derived) {
        l.dates = derived.dates;
        l.t0 = derived.t0;
        l.t1 = derived.t1;
      }
      l.importedFrom = input.fileName ?? undefined;
      input.players.forEach((p) => {
        /* 既存の非表示設定は維持する */
        l.players[p.userId] = {
          linked: true,
          hidden: l.players[p.userId]?.hidden ?? false,
          characterIds: p.characterIds.filter((x) => x !== "__import__"),
        };
      });
    });
    return { ok: true, id, slug };
  }

  /* 新規作成(ログあり / ログなしの両方) */
  const hasLog = input.channels.some((c) => c.msgs.length > 0);
  const id = "s_" + uid();
  const slug = uid("s") + uid("");
  apply((s) => {
    let scenarioId = input.scenarioId || undefined;
    if (input.newScenario && input.newScenario.title.trim()) {
      const scid = "sc_" + uid();
      s.scenarios[scid] = {
        id: scid,
        title: input.newScenario.title.trim(),
        author: input.newScenario.author.trim() || "自由記述（未登録）",
        systemId: input.meta.systemId,
        source: "manual",
        policy: input.newScenario.policy ?? "public",
        emoji: SYSTEMS[input.meta.systemId]?.emoji ?? "🎲",
        bg: "#e6e6f0",
        tags: [],
        claimedBy: null,
        addedBy: "user",
        addedByUid: s.me,
      };
      scenarioId = scid;
    }
    let n = 0;
    const channels: Channel[] = hasLog ? JSON.parse(JSON.stringify(input.channels)) : [];
    channels.forEach((c) =>
      c.msgs.forEach((m) => {
        m.id = `${id}-${c.id}-${n++}`;
        m.kind = input.kinds[m.sp] ?? m.kind;
      }),
    );
    const derived = deriveSessionFromMessages(channels);
    const dates = derived?.dates ?? input.schedule?.dates ?? [new Date().toISOString().slice(0, 10)];
    const t0 = derived?.t0 || input.schedule?.t0 || Math.floor(Date.now() / 1000);
    const t1 = derived?.t1 || input.schedule?.t1 || t0;
    const speakerIcons = normalizeSpeakerIcons(input.speakerIcons);
    s.logs[id] = {
      id,
      title: input.meta.title.trim() || "未タイトルの卓",
      tableId: input.tableId || undefined,
      scenarioId,
      systemId: input.meta.systemId,
      ownerId: s.me,
      scope: input.scope ?? ("members" as Scope),
      hasLog,
      ...(speakerIcons ? { speakerIcons } : {}),
      channels,
      players: Object.fromEntries(
        input.players.map((p) => [
          p.userId,
          { linked: true, hidden: false, characterIds: p.characterIds.filter((x) => x !== "__import__") },
        ]),
      ),
      createdAt: new Date().toISOString(),
      dates,
      t0,
      t1,
      slug,
      importedFrom: input.fileName ?? undefined,
    };
  });
  return { ok: true, id, slug };
}

/** 編集モーダルなどから使う Log の一部更新の共通ラッパ(将来 revision 競合をここで扱う) */
export type LogPatch = Partial<
  Pick<
    Log,
    "title" | "dates" | "t0" | "t1" | "scenarioId" | "tableId" | "systemId" | "scope" | "speakerIcons"
  >
>;
