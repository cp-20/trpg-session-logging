import { useEffect } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { seedState } from "./data/seed";
import { StoreProvider, useStore } from "./store";

function Rename({ to }: { to: string }) {
  const { update } = useStore();
  useEffect(() => {
    update((s) => {
      s.users[s.me]!.name = to;
    });
  }, [update, to]);
  return null;
}

describe("ストアが外れるとき", () => {
  it("遅延保存を待たずに外れても、変更を端末に書き出す（公開ページへ移ったとき）", () => {
    const key = "takufu-test-unmount";
    localStorage.removeItem(key);
    const state = seedState();
    state.entered = true;
    const { unmount } = render(
      <StoreProvider initialState={state} storageKey={key}>
        <Rename to="書き出し確認" />
      </StoreProvider>,
    );
    // 遅延保存（400ms 後）より前に外す
    unmount();
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    expect(saved?.users?.[state.me]?.name).toBe("書き出し確認");
  });
});
