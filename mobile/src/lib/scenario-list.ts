/**
 * シナリオ一覧・候補の組み立て（画面に依らない部分）。
 * 手元の写し（遊んだもの・足したもの）を先に、共有シナリオ一覧（サーバー）の結果をその後ろに、同じ作品は重ねない
 */
import { scenarioToDirectory, withoutKnown, type DirectoryScenario } from "@shared/lib/scenario-directory";
import type { Scenario } from "@shared/types";

export const WEB_ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN || "https://takufu.app";

/** 手元の写しと同じ作品（同じ ID、同じ TALTO の作品）を除いた共有シナリオ一覧の結果（Web と同じ withoutKnown） */
export const remoteOnly = (
  local: readonly Pick<Scenario, "id" | "sourceUrl">[],
  remote: readonly DirectoryScenario[],
): DirectoryScenario[] => withoutKnown(local, remote);

/** 候補の全体（手元の写し + 共有シナリオ一覧の結果） */
export function mergeScenarioCandidates(
  local: readonly Scenario[],
  remote: readonly DirectoryScenario[],
): DirectoryScenario[] {
  return [...local.map(scenarioToDirectory), ...remoteOnly(local, remote)];
}
