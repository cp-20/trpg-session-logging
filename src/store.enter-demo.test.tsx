import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

/**
 * 体験版の見本は入るときに読む（非同期）。読む間に遅延保存が走っても、入った後の見本が端末に保存される
 * （以前は保存待ちの印が下りたままになり、読み込み直すと入る前に戻っていた）
 */
let release!: () => void;
const gate = new Promise<void>((r) => (release = r));
vi.mock("./data/seed", async (importOriginal) => {
  await gate;
  return importOriginal();
});

const { StoreProvider, guestState, useStore } = await import("./store");

function Enter() {
  const { enterDemo } = useStore();
  useEffect(() => {
    void enterDemo();
  }, [enterDemo]);
  return null;
}

it("見本を読む間に遅延保存が走っても、入ったあとの見本を保存する", async () => {
  const key = "takufu-state-v4";
  localStorage.removeItem(key);
  render(
    <StoreProvider initialState={guestState()} initialIssue="missing">
      <Enter />
    </StoreProvider>,
  );
  // 遅延保存（400ms）が、見本を読み終える前に走る
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key) ?? "null")?.me).toBe("u_guest"), {
    timeout: 3000,
  });
  release();
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key) ?? "null")?.entered).toBe(true));
  const saved = JSON.parse(localStorage.getItem(key)!);
  expect(Object.keys(saved.logs).length).toBeGreaterThan(0);
});
