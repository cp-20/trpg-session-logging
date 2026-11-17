import { expect, it } from "vitest";
import type { User as FirebaseUser } from "firebase/auth";
import { authErrorMessage, firebaseUserProfile } from "./auth";

it("uses recognizable profile data without storing OAuth credentials", () => {
  const user = {
    uid: "uid",
    displayName: "プレイヤー",
    email: "player@example.com",
    photoURL: "https://example.com/avatar.png",
    accessToken: "must-not-store",
    providerData: [
      { providerId: "google.com", email: "player@example.com", uid: "internal-provider-id" },
      { providerId: "twitter.com", displayName: "Xの名前", uid: "internal-twitter-id" },
    ],
  } as unknown as FirebaseUser;
  const profile = firebaseUserProfile(user);
  expect(profile.accounts.map((account) => account.displayName)).toEqual(["player@example.com", "Xの名前"]);
  expect(JSON.stringify(profile)).not.toMatch(/must-not-store|internal-provider-id|internal-twitter-id/);
  expect(authErrorMessage({ code: "auth/credential-already-in-use" })).toContain("別の卓譜アカウント");
});
