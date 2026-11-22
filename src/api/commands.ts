import { uid } from "../lib/time";
import { deriveSittings, normalizeSittings, type Sitting } from "../lib/sittings";
import { SYSTEMS } from "../data/systems";
import type { Channel, Log, MsgKind, Scope, SelfRole, State } from "../types";

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
  newScenario: { title: string; author: string } | null;
  players: { userId: string; characterIds: string[]; role?: SelfRole }[];
  /**
   * 遊んだ時間帯。ログの発言時刻から導いたもの、または手で入れ直したもの。
   * 空ならログの発言時刻から導く（添付では、導けなければ元の時間帯を残す）
   */
  sittings?: Sitting[];
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
    const given = normalizeSittings(input.sittings ?? []);
    const sittings = given.length > 0 ? given : deriveSittings(input.channels);
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
      if (sittings.length > 0) l.sittings = sittings;
      l.importedFrom = input.fileName ?? undefined;
      input.players.forEach((p) => {
        /* 既存の非表示設定は維持する */
        l.players[p.userId] = {
          linked: true,
          hidden: l.players[p.userId]?.hidden ?? false,
          characterIds: p.characterIds.filter((x) => x !== "__import__"),
          ...(p.role ? { role: p.role } : {}),
        };
      });
    });
    return { ok: true, id, slug };
  }

  /* 新規作成(ログあり / ログなしの両方) */
  const hasLog = input.channels.some((c) => c.msgs.length > 0);
  const given = normalizeSittings(input.sittings ?? []);
  const sittings = given.length > 0 ? given : deriveSittings(hasLog ? input.channels : []);
  if (sittings.length === 0) return { ok: false, id: "", slug: "", reason: "遊んだ日時を入れてください。" };
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
          {
            linked: true,
            hidden: false,
            characterIds: p.characterIds.filter((x) => x !== "__import__"),
            ...(p.role ? { role: p.role } : {}),
          },
        ]),
      ),
      createdAt: new Date().toISOString(),
      sittings,
      slug,
      importedFrom: input.fileName ?? undefined,
    };
  });
  return { ok: true, id, slug };
}

/** 編集モーダルなどから使う Log の一部更新の共通ラッパ(将来 revision 競合をここで扱う) */
export type LogPatch = Partial<
  Pick<Log, "title" | "sittings" | "scenarioId" | "tableId" | "systemId" | "scope" | "speakerIcons">
>;
