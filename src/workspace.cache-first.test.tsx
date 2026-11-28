import { useEffect } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User as FirebaseUser } from "firebase/auth";
import type { State } from "./types";

/**
 * ログインした人の記録の開き方: 端末の控えがあれば、クラウドの見出しを待たずに出す。
 * 版が同じならそのまま、違えば読み直す。照合が済むまではクラウドへ書かない
 */

const uid = "u_cache";
const user = {
  uid,
  displayName: "控え",
  email: null,
  photoURL: null,
  providerData: [],
} as unknown as FirebaseUser;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

let manifest = deferred<{ revision: string; parts: Map<string, unknown> } | null>();
const cloud = {
  fetchCloudWorkspaceManifest: vi.fn(() => manifest.promise),
  loadCloudState: vi.fn(),
  saveCloudState: vi.fn(async () => "r-saved"),
  publishSharedLog: vi.fn(async () => {}),
  deleteSharedLog: vi.fn(async () => {}),
  publishSharedCharacter: vi.fn(async () => {}),
  deleteSharedCharacter: vi.fn(async () => {}),
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
vi.mock("./lib/auth", () => ({
  observeAuth: (listener: (u: FirebaseUser | null) => void) => {
    void listener(user);
    return () => {};
  },
  firebaseUserProfile: (u: FirebaseUser) => ({ id: u.uid, name: "控え", color: "#0e7490", accounts: [] }),
  signOutAccount: vi.fn(),
}));

const { WorkspaceProvider } = await import("./workspace");
const { emptyState, useStore } = await import("./store");

function stateNamed(name: string): State {
  const s = emptyState({ id: uid, name, color: "#0e7490", accounts: [] });
  s.prefs.onboardingDone = true;
  return s;
}

function Name() {
  const { state } = useStore();
  return <p data-testid="name">{state.users[uid]!.name}</p>;
}

function Rename({ to }: { to: string }) {
  const { update } = useStore();
  useEffect(() => {
    update((s) => {
      s.users[uid]!.name = to;
    });
  }, [update, to]);
  return null;
}

const key = `takufu-cloud-${uid}`;

beforeEach(() => {
  localStorage.clear();
  manifest = deferred();
  vi.clearAllMocks();
});

describe("ログインした人の記録を開く", () => {
  it("控えがあれば、見出しを待たずに出し、版が同じならそのまま使う", async () => {
    localStorage.setItem(key, JSON.stringify(stateNamed("端末の控え")));
    localStorage.setItem(`${key}-cloud-revision`, "r1");
    render(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );
    expect((await screen.findByTestId("name")).textContent).toBe("端末の控え");
    expect(cloud.fetchCloudWorkspaceManifest).toHaveBeenCalled();
    await act(async () => manifest.resolve({ revision: "r1", parts: new Map() }));
    expect(screen.getByTestId("name").textContent).toBe("端末の控え");
    expect(cloud.loadCloudState).not.toHaveBeenCalled();
  });

  it("照合の間の変更はクラウドへ書かず、版が違えば読み直して、未同期の変更を退避する", async () => {
    localStorage.setItem(key, JSON.stringify(stateNamed("端末の控え")));
    localStorage.setItem(`${key}-cloud-revision`, "r1");
    cloud.loadCloudState.mockResolvedValue({ state: stateNamed("別の端末の更新"), revision: "r2" });
    const { rerender } = render(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );
    await screen.findByTestId("name");
    rerender(
      <WorkspaceProvider>
        <Name />
        <Rename to="照合中の変更" />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId("name").textContent).toBe("照合中の変更");
    // 読み直したあとの画面で、もう一度名前を変えないよう外す
    rerender(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );
    // クラウドへの保存の遅延（900ms）を過ぎても、照合が済むまでは書かない
    await new Promise((r) => setTimeout(r, 1000));
    expect(cloud.saveCloudState).not.toHaveBeenCalled();

    await act(async () => manifest.resolve({ revision: "r2", parts: new Map() }));
    await waitFor(() => expect(cloud.loadCloudState).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId("name").textContent).toBe("別の端末の更新"));
    // 照合中の変更は、外れるときに端末へ書き出され、読み直しの前に退避されている
    const [, cached, firstManifest] = cloud.loadCloudState.mock.calls[0]!;
    expect((cached as State).users[uid]!.name).toBe("照合中の変更");
    expect((firstManifest as { revision: string }).revision).toBe("r2");
    expect(screen.getByRole("button", { name: "未同期の記録をダウンロード" }).textContent).toBe(
      "未同期の記録をダウンロード",
    );
  });

  it("見出しを読めなくても、控えのまま使え、保存も止めたままにしない", async () => {
    localStorage.setItem(key, JSON.stringify(stateNamed("端末の控え")));
    localStorage.setItem(`${key}-cloud-revision`, "r1");
    cloud.fetchCloudWorkspaceManifest.mockRejectedValueOnce(new Error("offline"));
    const { rerender } = render(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );
    expect((await screen.findByTestId("name")).textContent).toBe("端末の控え");
    rerender(
      <WorkspaceProvider>
        <Name />
        <Rename to="圏外での変更" />
      </WorkspaceProvider>,
    );
    // 保存は版を照合するので、控えのまま書いてよい（食い違えば保存の側で断られる）
    await waitFor(() => expect(cloud.saveCloudState).toHaveBeenCalled(), { timeout: 3000 });
    expect(screen.getByTestId("name").textContent).toBe("圏外での変更");
  });

  it("控えがなければ、見出しを待ってから読む", async () => {
    cloud.loadCloudState.mockResolvedValue({ state: stateNamed("クラウド"), revision: "r1" });
    render(
      <WorkspaceProvider>
        <Name />
      </WorkspaceProvider>,
    );
    expect(screen.queryByTestId("name")).toBeNull();
    await act(async () => manifest.resolve({ revision: "r1", parts: new Map() }));
    expect((await screen.findByTestId("name")).textContent).toBe("クラウド");
  });
});
