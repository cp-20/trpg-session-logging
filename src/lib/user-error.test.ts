import { describe, expect, it } from "vitest";
import { userFacingError } from "./user-error";

const FALLBACK = "記録を同期できませんでした。通信状態を確認して、もう一度保存してください。";

function firebaseError(code: string, message: string) {
  return Object.assign(new Error(message), { name: "FirebaseError", code });
}

describe("userFacingError", () => {
  it("never shows Firebase internals", () => {
    const denied = firebaseError(
      "permission-denied",
      "Missing or insufficient permissions. false for 'create' @ L73",
    );
    expect(userFacingError(denied, FALLBACK)).toBe(FALLBACK);
    expect(userFacingError(firebaseError("unknown-code", "internal"), FALLBACK)).toBe(FALLBACK);
    expect(userFacingError(new Error("Failed to fetch"), FALLBACK)).toBe(FALLBACK);
    expect(userFacingError("boom", FALLBACK)).toBe(FALLBACK);
    expect(userFacingError(null, FALLBACK)).toBe(FALLBACK);
  });

  it("maps known codes to polite Japanese and keeps our own messages", () => {
    expect(userFacingError(firebaseError("unavailable", "offline"), FALLBACK)).toMatch(
      /接続できませんでした。.*ください。$/,
    );
    expect(userFacingError(firebaseError("firestore/unauthenticated", "x"), FALLBACK)).toMatch(/ログイン/);
    const own = new Error("共有設定が別の端末で更新されています。再読み込みしてください。");
    expect(userFacingError(own, FALLBACK)).toBe(own.message);
  });
});
