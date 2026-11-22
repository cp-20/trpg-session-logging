/** Auth エミュレータに偽の Google 利用者を作り、ブラウザの Firebase SDK が「ログイン済み」と見る保存を用意する */
import type { Page } from "@playwright/test";

const AUTH = "http://127.0.0.1:9099";
const API_KEY = "fake-api-key";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export interface EmulatorUser {
  uid: string;
  idToken: string;
  email: string;
}

export async function signInWithFakeGoogle(
  page: Page,
  profile: { sub: string; email: string; name: string },
): Promise<EmulatorUser> {
  const fakeIdToken = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
    sub: profile.sub,
    email: profile.email,
    email_verified: true,
    name: profile.name,
  })}.`;
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${fakeIdToken}&providerId=google.com`,
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  if (!res.ok)
    throw new Error(`auth emulator sign-in failed: ${res.status} (エミュレータが起動していますか)`);
  const data = (await res.json()) as {
    localId: string;
    idToken: string;
    refreshToken: string;
    expiresIn: string;
    email: string;
    displayName: string;
  };
  const now = Date.now();
  const stored = {
    uid: data.localId,
    email: data.email,
    emailVerified: true,
    displayName: data.displayName,
    isAnonymous: false,
    photoURL: null,
    providerData: [
      {
        providerId: "google.com",
        uid: profile.sub,
        displayName: data.displayName,
        email: data.email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    stsTokenManager: {
      refreshToken: data.refreshToken,
      accessToken: data.idToken,
      expirationTime: now + Number(data.expiresIn) * 1000,
    },
    createdAt: String(now),
    lastLoginAt: String(now),
    apiKey: API_KEY,
    appName: "[DEFAULT]",
  };
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 保存できない環境では、ログインしていない状態のまま
      }
    },
    [`firebase:authUser:${API_KEY}:[DEFAULT]`, JSON.stringify(stored)] as const,
  );
  return { uid: data.localId, idToken: data.idToken, email: data.email };
}
