// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const idbDelete = vi.fn(async () => {});
vi.mock("./local-db", () => ({ idbDelete }));
const { backupLocalCopy, forgetLocalCopy } = await import("./local-copy");

describe("この端末の記録の控え", () => {
  beforeEach(() => {
    localStorage.clear();
    idbDelete.mockClear();
    localStorage.setItem("takufu-cloud-u1", "記録1");
    localStorage.setItem("takufu-cloud-u1-pending", "false");
    localStorage.setItem("takufu-cloud-u10", "別の人の記録");
    localStorage.setItem("takufu-cloud-u2", "記録2");
    localStorage.setItem("takufu-state-v4", "お試し");
  });

  it("エラー画面の書き出しは、今の人の控えだけを含める（似た番号の別の人も含めない）", () => {
    expect(backupLocalCopy(localStorage, "u1")).toEqual({
      "takufu-cloud-u1": "記録1",
      "takufu-cloud-u1-pending": "false",
    });
  });

  it("ログインしていなければ、お試しの記録だけを書き出す", () => {
    expect(backupLocalCopy(localStorage, null)).toEqual({ "takufu-state-v4": "お試し" });
  });

  it("ログアウトでは、送り終えた控えを localStorage と IndexedDB から消し、ほかの人の控えは残す", async () => {
    expect(await forgetLocalCopy(localStorage, "u1")).toBe(true);

    expect(localStorage.getItem("takufu-cloud-u1")).toBeNull();
    expect(localStorage.getItem("takufu-cloud-u1-pending")).toBeNull();
    expect(localStorage.getItem("takufu-cloud-u10")).toBe("別の人の記録");
    expect(localStorage.getItem("takufu-cloud-u2")).toBe("記録2");
    expect(idbDelete).toHaveBeenCalledWith("takufu-cloud-u1");
  });

  it("まだ送れていない変更があれば、消さずに残す", async () => {
    localStorage.setItem("takufu-cloud-u1-pending", "true");

    expect(await forgetLocalCopy(localStorage, "u1")).toBe(false);

    expect(localStorage.getItem("takufu-cloud-u1")).toBe("記録1");
    expect(idbDelete).not.toHaveBeenCalled();
  });
});
