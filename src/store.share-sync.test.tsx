import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User as FirebaseUser } from "firebase/auth";
import { seedState } from "./data/seed";
import type { State } from "./types";

const calls: string[] = [];
const cloud = {
  saveCloudState: vi.fn(async () => {
    calls.push("saveCloudState");
    return "r2";
  }),
  publishSharedLog: vi.fn(async (log: { slug: string }) => void calls.push(`publish:${log.slug}`)),
  deleteSharedLog: vi.fn(async (slug: string) => void calls.push(`delete:${slug}`)),
  publishSharedCharacter: vi.fn(async () => {}),
  deleteSharedCharacter: vi.fn(async (id: string) => void calls.push(`deleteCharacter:${id}`)),
  updateSharedMembership: vi.fn(async () => {}),
  publishSharedScenario: vi.fn(async () => {}),
};
vi.mock("./lib/cloud-state", () => cloud);
vi.mock("./lib/table-polls", () => ({
  TablePollSync: class {
    start() {
      return () => {};
    }
    async push() {}
  },
}));

const { StoreProvider, useStore } = await import("./store");

function Edit({ run }: { run: (s: State) => void }) {
  const { update } = useStore();
  useEffect(() => {
    update(run);
  }, [update, run]);
  return null;
}

function renderSignedIn(state: State, storageKey: string, run: (s: State) => void) {
  const authUser = { uid: state.me } as FirebaseUser;
  return render(
    <StoreProvider initialState={state} storageKey={storageKey} authUser={authUser} cloudRevision="r1">
      <Edit run={run} />
    </StoreProvider>,
  );
}

describe("共有ページの同期（ストア）", () => {
  beforeEach(() => {
    calls.length = 0;
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("消した記録の共有は、記録をクラウドに保存する前に止める", async () => {
    const state = seedState();
    const mine = Object.values(state.logs).find((l) => l.ownerId === state.me)!;

    renderSignedIn(state, "takufu-test-share-order", (s) => {
      delete s.logs[mine.id];
    });

    await waitFor(() => expect(calls).toContain("saveCloudState"), { timeout: 5000 });
    expect(calls.indexOf(`delete:${mine.slug}`)).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf(`delete:${mine.slug}`)).toBeLessThan(calls.indexOf("saveCloudState"));
  });

  it("前に開いたとき止める前に閉じた共有（控えにあって記録にない）は、次の同期で止める", async () => {
    const key = "takufu-test-share-journal";
    localStorage.setItem(`${key}-published-logs`, JSON.stringify(["slug_left_open"]));
    localStorage.setItem(`${key}-published-characters`, JSON.stringify(["ch_left_open"]));
    const state = seedState();

    renderSignedIn(state, key, (s) => {
      s.users[s.me]!.name = "同期のきっかけ";
    });

    await waitFor(() => expect(calls).toContain("saveCloudState"), { timeout: 5000 });
    expect(calls).toContain("delete:slug_left_open");
    expect(calls).toContain("deleteCharacter:ch_left_open");
    expect(JSON.parse(localStorage.getItem(`${key}-published-logs`)!)).not.toContain("slug_left_open");
  });

  it("共有を止められなければ、記録も保存しない（次の保存でやり直す）", async () => {
    cloud.deleteSharedLog.mockRejectedValueOnce(new Error("offline"));
    const state = seedState();
    const mine = Object.values(state.logs).find((l) => l.ownerId === state.me)!;

    renderSignedIn(state, "takufu-test-share-fail", (s) => {
      delete s.logs[mine.id];
    });

    await waitFor(() => expect(cloud.deleteSharedLog).toHaveBeenCalled(), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(cloud.saveCloudState).not.toHaveBeenCalled();
  });
});
