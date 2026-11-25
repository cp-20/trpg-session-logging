import type { Character, Log, Scenario, State } from "../types";
import { sharedScenarioDoc } from "./scenario-directory";
import { contentTag } from "./workspace-parts";

/** 共有ページの中身を決めるものの署名。前に公開したときと同じなら、公開し直さない */
export function logPublishSignature(log: Log, state: State): string {
  const own = state.users[log.ownerId];
  return JSON.stringify([
    contentTag(log),
    own?.name,
    own?.color,
    own?.image,
    state.prefs.hideSelfOnShare,
    state.scenarios[log.scenarioId] ?? null,
  ]);
}

export function scenarioPublishSignature(scenario: Scenario, uid: string): string {
  return JSON.stringify(sharedScenarioDoc(scenario, uid));
}

export function characterPublishSignature(character: Character, state: State, uid: string): string {
  const own = state.users[uid];
  return JSON.stringify([
    contentTag(character),
    own?.name,
    own?.color,
    state.prefs.hideSelfOnShare,
    character.sessions.map((s) => {
      const log = state.logs[s.logId];
      return log ? [log.id, log.slug, log.scope] : [s.logId];
    }),
  ]);
}
