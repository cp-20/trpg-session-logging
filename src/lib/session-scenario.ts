/**
 * セッションはシナリオを通しで遊んだ 1 回で、名前を持たない（シナリオの題名で呼ぶ）。
 * 呼び名・新しいシナリオの作り方・名前を持っていた頃のデータの読み替えを、ここにまとめる。
 */
import { SYSTEMS } from "../data/systems";
import type { Log, Scenario } from "../types";

/** シナリオが見つからないとき（共有ページで読めない・壊れたデータ）の呼び名 */
export const UNKNOWN_SCENARIO_TITLE = "シナリオ不明";

/** セッションの呼び名 = シナリオの題名 */
export function sessionTitle(
  log: Pick<Log, "scenarioId">,
  scenarios: Readonly<Record<string, Pick<Scenario, "title"> | undefined>>,
): string {
  return scenarios[log.scenarioId]?.title || UNKNOWN_SCENARIO_TITLE;
}

/** 利用者が足すシナリオ。private なら共有シナリオ一覧に出さない（自作・事前相談など） */
export function userScenario(input: {
  id: string;
  title: string;
  author?: string;
  systemId: string;
  uid: string;
  private?: boolean;
}): Scenario {
  return {
    id: input.id,
    title: input.title.trim(),
    author: input.author?.trim() ?? "",
    systemId: input.systemId,
    source: "manual",
    emoji: SYSTEMS[input.systemId]?.emoji ?? "🎲",
    bg: "#e6e6f0",
    tags: [],
    claimedBy: null,
    addedBy: "user",
    addedByUid: input.uid,
    ...(input.private ? { private: true } : {}),
  };
}

/**
 * 名前（title）を持っていた頃のセッションを今の形に読み替える。
 * シナリオがあれば名前を捨てる（同じシナリオの 2 陣・第二夜は、卓・日付・遊んだ回で見分けられる）。
 * シナリオがなければ、その名前で共有シナリオ一覧に出さないシナリオを作って結ぶ（事前相談・自作のシナリオだったもの）。
 * 読み替えたら true
 */
export function upgradeLogScenario(
  log: Record<string, unknown>,
  scenarios: Record<string, unknown>,
): boolean {
  const title = typeof log.title === "string" ? log.title.trim() : "";
  const known = typeof log.scenarioId === "string" && log.scenarioId && scenarios[log.scenarioId];
  if (known) {
    if (!("title" in log)) return false;
    delete log.title;
    return true;
  }
  if (!("title" in log) && typeof log.scenarioId === "string" && log.scenarioId) return false;
  const id = `sc_${String(log.id ?? "")}`;
  scenarios[id] ??= userScenario({
    id,
    title: title || UNKNOWN_SCENARIO_TITLE,
    systemId: typeof log.systemId === "string" ? log.systemId : "",
    uid: typeof log.ownerId === "string" ? log.ownerId : "",
    private: true,
  });
  log.scenarioId = id;
  delete log.title;
  return true;
}

/**
 * 共有ページの中身（以前に公開したものは名前を持ち、シナリオを載せていないことがある）を今の形に。
 * 共有ページはシナリオを 1 つだけ載せるので、無ければ名前から共有シナリオ一覧に出さないシナリオを作る
 */
export function upgradeSharedScenario(payload: { log: unknown; scenario?: Scenario }): void {
  const log = payload.log as Record<string, unknown>;
  const scenarios: Record<string, unknown> = {};
  if (payload.scenario && typeof log.scenarioId === "string") scenarios[log.scenarioId] = payload.scenario;
  upgradeLogScenario(log, scenarios);
  payload.scenario ??= scenarios[log.scenarioId as string] as Scenario | undefined;
}
