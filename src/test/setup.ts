import { afterEach } from "vitest";

// node 環境（純粋なロジック）では DOM の後始末は要らない
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
}
