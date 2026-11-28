import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { seedState } from "../data/seed";
import type { SharedLogData } from "../lib/cloud-state";

/** 誰にでも見せてよい記録は、サーバーが読んだもの（initial）をそのまま出し、ブラウザで Firestore を読まない */

vi.mock("../lib/router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children?: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => () => {},
  useParams: () => ({ slug: "slg-public-initial" }),
  useSearchParam: () => null,
  useSearchString: () => "",
  usePathname: () => "/share/l/slg-public-initial",
}));
vi.mock("../lib/firebase", () => ({ isFirebaseConfigured: true }));
const cloud = vi.hoisted(() => ({
  getSharedLogAccess: vi.fn(async () => {
    throw new Error("Firestore を読んではいけない");
  }),
  fetchSharedLog: vi.fn(async () => {
    throw new Error("Firestore を読んではいけない");
  }),
}));
vi.mock("../lib/cloud-state", () => cloud);

const { StoreProvider, guestState } = await import("../store");
const { default: ShareLog } = await import("./ShareLog");

it("サーバーから受け取った記録はすぐ出し、Firestore を読まない", async () => {
  const seed = seedState();
  const log = structuredClone(seed.logs.s02!);
  log.slug = "slg-public-initial";
  log.scope = "public";
  const initial: SharedLogData = {
    log,
    users: { [log.ownerId]: seed.users[log.ownerId]! },
    scenario: seed.scenarios[log.scenarioId]!,
  };
  const data = Promise.resolve(initial);
  await act(async () => {
    render(
      <StoreProvider initialState={guestState()}>
        <ShareLog initial={data} />
      </StoreProvider>,
    );
  });
  expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(initial.scenario.title);
  await new Promise((r) => setTimeout(r, 50));
  expect(cloud.getSharedLogAccess).not.toHaveBeenCalled();
  expect(cloud.fetchSharedLog).not.toHaveBeenCalled();
});

it("サーバーで読めなかった（null）ときは、ブラウザで読む", async () => {
  cloud.getSharedLogAccess.mockResolvedValueOnce(null as never);
  const data = Promise.resolve(null);
  await act(async () => {
    render(
      <StoreProvider initialState={guestState()}>
        <ShareLog initial={data} />
      </StoreProvider>,
    );
  });
  expect((await screen.findByText("共有ページが見つかりません")).textContent).toBe(
    "共有ページが見つかりません",
  );
  expect(cloud.getSharedLogAccess).toHaveBeenCalledWith("slg-public-initial");
});
