import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SessionTimeline, resolveSpeakerMeta } from "./timeline";
import type { Channel, Log, State } from "../types";

const state = {
  users: {
    u1: { id: "u1", name: "みかん", color: "#b85d27", accounts: [], image: "data:image/svg+xml;utf8,u1" },
    u2: { id: "u2", name: "夜霜", color: "#5c4d42", accounts: [], image: "data:image/svg+xml;utf8,u2" },
  },
  characters: {
    c1: {
      id: "c1",
      ownerId: "u1",
      name: "遠沢澄花",
      systemId: "coc7",
      color: "#b85d27",
      image: "data:image/svg+xml;utf8,c1",
      archetype: "",
      bio: "",
      tags: [],
      stats: {},
      sessions: [],
      growth: [],
      share: {
        enabled: true,
        scope: "link",
        includeProfile: true,
        includeStats: true,
        includeGrowth: true,
        includeSessions: true,
      },
    },
  },
} as unknown as State;

function makeLog(extra?: Partial<Log>): Log {
  return {
    id: "l1",
    title: "test",
    systemId: "coc7",
    ownerId: "u2",
    scope: "public",
    hasLog: true,
    players: {},
    createdAt: "2026-11-17T00:00:00",
    dates: ["2026-11-17"],
    t0: 1,
    t1: 4,
    slug: "l1",
    channels: [
      {
        id: "main",
        name: "メイン",
        secret: false,
        msgs: [
          { id: "m1", ts: 1, sp: "KP", kind: "KP", type: "text", text: "通常の発言" },
          { id: "m2", ts: 2, sp: "KP", kind: "KP", type: "note", text: "シナリオ本文の行" },
          {
            id: "m3",
            ts: 3,
            sp: "遠沢澄花",
            kind: "PC",
            type: "roll",
            roll: { cmd: "CC<=70 目星", skill: "目星", dice: "61", result: "成功", secret: true },
          },
          { id: "m5", ts: 5, sp: "遠沢澄花", kind: "PC", type: "text", text: "PCの発言" },
        ],
      },
      {
        id: "secret",
        name: "タブ3",
        secret: true,
        msgs: [{ id: "m4", ts: 4, sp: "用務員・佐伯", kind: "NPC", type: "text", text: "シークレットの行" }],
      },
    ] as Channel[],
    ...extra,
  };
}

it("share モードでもシークレットチャンネル・シナリオ本文・秘匿ロールを表示する", () => {
  render(
    <SessionTimeline log={makeLog()} state={state} mode="share" filter={{ query: "", channel: "all" }} />,
  );
  expect(screen.getByText("通常の発言")).toBeInTheDocument();
  expect(screen.getByText(/CC<=70 目星/)).toBeInTheDocument();
  expect(screen.getByText("シナリオ本文の行")).toBeInTheDocument();
  expect(screen.getByText("シークレットの行")).toBeInTheDocument();
});

it("own モードではすべての行とPC・PL・アイコンを表示する", () => {
  render(
    <SessionTimeline
      log={makeLog({ speakerIcons: { "用務員・佐伯": "data:image/svg+xml;utf8,npc" } })}
      state={state}
      mode="own"
      filter={{ query: "", channel: "all" }}
    />,
  );
  expect(screen.getByText("通常の発言")).toBeInTheDocument();
  expect(screen.getByText("シナリオ本文の行")).toBeInTheDocument();
  expect(screen.getByText("シークレットの行")).toBeInTheDocument();
  expect(screen.getAllByText("PC · みかん")).toHaveLength(2);

  const npcImg = screen.getByAltText("用務員・佐伯");
  expect(npcImg).toHaveAttribute("src", "data:image/svg+xml;utf8,npc");
  expect(npcImg).not.toHaveAttribute("title");

  const pcImgs = screen.getAllByAltText("遠沢澄花");
  expect(pcImgs.length).toBe(2);
  pcImgs.forEach((img) => {
    expect(img).toHaveAttribute("src", "data:image/svg+xml;utf8,c1");
    expect(img).not.toHaveAttribute("title");
  });
});

it("resolveSpeakerMeta が優先順位に従ってアイコン・色・PL名を解決する", () => {
  const log = makeLog({
    speakerIcons: {
      直接URL: "https://example.com/a.png",
      キャラ参照: "c1",
      ユーザー参照: "u1",
    },
  });
  expect(resolveSpeakerMeta("直接URL", "NPC", log, state).iconUrl).toBe("https://example.com/a.png");
  expect(resolveSpeakerMeta("キャラ参照", "PC", log, state).iconUrl).toBe("data:image/svg+xml;utf8,c1");
  expect(resolveSpeakerMeta("ユーザー参照", "PL", log, state).iconUrl).toBe("data:image/svg+xml;utf8,u1");
  const pcMeta = resolveSpeakerMeta("遠沢澄花", "PC", log, state);
  expect(pcMeta.iconUrl).toBe("data:image/svg+xml;utf8,c1");
  expect(pcMeta.plName).toBe("みかん");
  expect(resolveSpeakerMeta("KP", "KP", log, state).iconUrl).toBe("data:image/svg+xml;utf8,u2");
  expect(resolveSpeakerMeta("みかん", "PL", log, state).iconUrl).toBe("data:image/svg+xml;utf8,u1");
  expect(resolveSpeakerMeta("通行人", "NPC", log, state).iconUrl).toMatch(/^data:image\/svg\+xml/);
});

it("query フィルタで絞り込める", () => {
  render(
    <SessionTimeline log={makeLog()} state={state} mode="own" filter={{ query: "目星", channel: "all" }} />,
  );
  expect(screen.getByText(/CC<=70 目星/)).toBeInTheDocument();
  expect(screen.queryByText("通常の発言")).not.toBeInTheDocument();
});
