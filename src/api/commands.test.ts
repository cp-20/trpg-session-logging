import { expect, it } from "vitest";
import { seedState } from "../data/seed";
import { commitLogImport, type CommitLogInput } from "./commands";

it("添付と同時に登録したシナリオを正しく紐付け、参加者の非表示を保つ", async () => {
  const state = structuredClone(seedState());
  const target = Object.values(state.logs).find((log) => log.ownerId === state.me)!;
  const participant = Object.keys(target.players)[0];
  target.players[participant].hidden = true;
  const input: CommitLogInput = {
    attachId: target.id, fileName: "log.json", meta: { title: target.title, systemId: target.systemId },
    channels: target.channels, kinds: {}, tableId: target.tableId ?? "", scenarioId: "",
    newScenario: { title: "新規シナリオ", author: "作者", policy: "members" },
    players: [{ userId: participant, characterIds: target.players[participant].characterIds }],
  };
  const result = await commitLogImport(input, state, (apply) => apply(state));
  expect(result.ok).toBe(true);
  expect(state.scenarios[state.logs[target.id].scenarioId!]?.title).toBe("新規シナリオ");
  expect(state.logs[target.id].players[participant].hidden).toBe(true);

  state.me = "another-user";
  const refused = await commitLogImport(input, state, () => { throw new Error("must not mutate"); });
  expect(refused.ok).toBe(false);
});
