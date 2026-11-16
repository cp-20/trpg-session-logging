import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SessionTimeline } from "./timeline";
import type { Channel, State } from "../types";

const state = { users: {}, characters: {} } as unknown as State;

function makeLog(): { channels: Channel[] } {
  return {
    channels: [
      {
        id: "main",
        name: "メイン",
        secret: false,
        msgs: [
          { id: "m1", ts: 1, sp: "KP", kind: "KP", type: "text", text: "通常の発言" },
          { id: "m2", ts: 2, sp: "KP", kind: "KP", type: "note", text: "シナリオ本文の行" },
          { id: "m3", ts: 3, sp: "KP", kind: "KP", type: "roll", roll: { cmd: "CC<=70 目星", skill: "目星", dice: "61", result: "成功" } },
        ],
      },
      {
        id: "secret",
        name: "タブ3",
        secret: true,
        msgs: [{ id: "m4", ts: 4, sp: "KP", kind: "KP", type: "text", text: "シークレットの行" }],
      },
    ],
  };
}

it("share モードではシークレットチャンネルとシナリオ本文を出さない", () => {
  render(
    <SessionTimeline log={makeLog() as never} state={state} mode="share" filter={{ query: "", channel: "all" }} />
  );
  expect(screen.getByText("通常の発言")).toBeInTheDocument();
  expect(screen.getByText(/CC<=70 目星/)).toBeInTheDocument();
  expect(screen.queryByText("シナリオ本文の行")).not.toBeInTheDocument();
  expect(screen.queryByText("シークレットの行")).not.toBeInTheDocument();
});

it("own モードではすべての行を表示する", () => {
  render(
    <SessionTimeline log={makeLog() as never} state={state} mode="own" filter={{ query: "", channel: "all" }} />
  );
  expect(screen.getByText("通常の発言")).toBeInTheDocument();
  expect(screen.getByText("シナリオ本文の行")).toBeInTheDocument();
  expect(screen.getByText("シークレットの行")).toBeInTheDocument();
});

it("query フィルタで絞り込める", () => {
  render(
    <SessionTimeline log={makeLog() as never} state={state} mode="own" filter={{ query: "目星", channel: "all" }} />
  );
  expect(screen.getByText(/CC<=70 目星/)).toBeInTheDocument();
  expect(screen.queryByText("通常の発言")).not.toBeInTheDocument();
});
