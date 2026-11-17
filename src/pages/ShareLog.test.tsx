import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { seedState } from "../data/seed";
import { StoreProvider } from "../store";
import ShareLog from "./ShareLog";

const GATE_PASSED = "このログは、このシナリオをプレイした人だけが読めます（自己申告）。";
const GATE_MEMBERS = "このログはメンバー限定です。卓のメンバーだけが読めます。";

function seedWith(overrides: {
  slug: string;
  scope: "members" | "passed" | "public";
  ownerId?: string;
  players?: Record<string, { linked: boolean; hidden: boolean; characterIds: string[] }>;
}) {
  const state = structuredClone(seedState());
  state.me = "u_sora"; // 外部ユーザーとして入る
  state.entered = true;
  const log = state.logs.s03;
  log.slug = overrides.slug;
  log.scope = overrides.scope;
  log.ownerId = overrides.ownerId ?? "u_mikan";
  log.players = overrides.players ?? { u_mikan: { linked: true, hidden: false, characterIds: [] } };
  localStorage.setItem("takufu-state-v4", JSON.stringify(state));
}

async function renderShare(slug: string) {
  const rootRoute = createRootRoute();
  const shareRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/share/l/$slug",
    component: ShareLog,
  });
  const routeTree = rootRoute.addChildren([shareRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/share/l/${slug}`] }),
  });
  await router.load();
  return render(
    <StoreProvider>
      <RouterProvider router={router} />
    </StoreProvider>,
  );
}

it("passed ログは外部ユーザーにはゲートが表示され、自己申告で解除できる", async () => {
  seedWith({ slug: "slg-test-passed", scope: "passed" });
  await renderShare("slg-test-passed");

  expect(screen.getByText(GATE_PASSED)).toBeInTheDocument();
  // ゲート中は本文の絞り込み欄すら出ない
  expect(screen.queryByPlaceholderText("本文・発言者で絞り込み…")).not.toBeInTheDocument();

  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "このシナリオをプレイした（記録を開く）" }));

  expect(screen.queryByText(GATE_PASSED)).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("本文・発言者で絞り込み…")).toBeInTheDocument();
});

it("members ログは自己申告では読めない", async () => {
  seedWith({ slug: "slg-test-members", scope: "members" });
  await renderShare("slg-test-members");

  expect(screen.getByText(GATE_MEMBERS)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "このシナリオをプレイした（記録を開く）" }),
  ).not.toBeInTheDocument();
});

it("participants に入っていれば members ログをそのまま読める", async () => {
  seedWith({
    slug: "slg-test-in",
    scope: "members",
    players: {
      u_mikan: { linked: true, hidden: false, characterIds: [] },
      u_sora: { linked: true, hidden: false, characterIds: [] },
    },
  });
  await renderShare("slg-test-in");

  expect(screen.queryByText(GATE_MEMBERS)).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText("本文・発言者で絞り込み…")).toBeInTheDocument();
});
