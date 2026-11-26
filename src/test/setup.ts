import { afterEach } from "vitest";

// node 環境（純粋なロジック）では DOM の後始末は要らない
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup, configure } = await import("@testing-library/react");
  // 結合テストは同期・保存のあとの描き直しを待つ。並列で動かすと既定の 1 秒では足りず、たまに落ちていた
  configure({ asyncUtilTimeout: 5000 });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
}
