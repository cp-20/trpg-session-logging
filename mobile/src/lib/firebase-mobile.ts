import "../polyfills";
import Constants from "expo-constants";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import * as FirebaseAuthModule from "firebase/auth";
import {
  getAuth,
  initializeAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type Auth,
  type Persistence,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { configureCloudRuntime } from "@shared/lib/cloud-state";
import type { User } from "@shared/types";
import { userFacingError } from "@shared/lib/user-error";

interface ExtraFirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  databaseId?: string;
}

interface ExtraGoogleAuthConfig {
  iosClientId?: string;
  webClientId?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as {
  firebase?: ExtraFirebaseConfig;
  googleAuth?: ExtraGoogleAuthConfig;
};

export const mobileFirebaseConfig = {
  apiKey: extra.firebase?.apiKey ?? "",
  authDomain: extra.firebase?.authDomain ?? "",
  projectId: extra.firebase?.projectId ?? "",
  storageBucket: extra.firebase?.storageBucket ?? "",
  messagingSenderId: extra.firebase?.messagingSenderId ?? "",
  appId: extra.firebase?.appId ?? "",
};

export const FIRESTORE_DATABASE_ID = extra.firebase?.databaseId || "takufu";

export const googleAuthClientIds = {
  iosClientId: extra.googleAuth?.iosClientId ?? "",
  webClientId: extra.googleAuth?.webClientId ?? "",
};

export const isFirebaseConfigured = Boolean(mobileFirebaseConfig.apiKey && mobileFirebaseConfig.projectId);

let appInstance: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getMobileFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (!appInstance) {
    appInstance = getApps().length ? getApp() : initializeApp(mobileFirebaseConfig);
  }
  return appInstance;
}

export function getMobileFirestore(): Firestore | null {
  const app = getMobileFirebaseApp();
  if (!app) return null;
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
  return firestoreInstance;
}

export function getMobileAuth(): Auth | null {
  const app = getMobileFirebaseApp();
  if (!app) return null;
  if (!authInstance) {
    if (Platform.OS === "web") {
      authInstance = getAuth(app);
    } else {
      const getRnPersistence = (
        FirebaseAuthModule as unknown as {
          getReactNativePersistence?: (s: typeof Storage) => Persistence;
        }
      ).getReactNativePersistence;
      try {
        authInstance = getRnPersistence
          ? initializeAuth(app, { persistence: getRnPersistence(Storage) })
          : getAuth(app);
      } catch {
        authInstance = getAuth(app);
      }
    }
    authInstance.languageCode = "ja";
  }
  return authInstance;
}

export function firebaseUserProfile(user: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  providerData?: readonly { providerId: string; email?: string | null; displayName?: string | null }[];
}): User {
  return {
    id: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "プレイヤー",
    email: user.email || undefined,
    image: user.photoURL || undefined,
    color: "#0e7490",
    accounts: (user.providerData ?? []).flatMap((p) => {
      const provider = p.providerId === "google.com" ? "google" : p.providerId === "twitter.com" ? "x" : null;
      return provider
        ? [{ provider, status: "linked" as const, displayName: p.email || p.displayName || undefined }]
        : [];
    }),
  };
}

let runtimeConfigured = false;
export function ensureMobileCloudRuntime(): void {
  if (runtimeConfigured) return;
  runtimeConfigured = true;
  configureCloudRuntime({
    getFirestore: getMobileFirestore,
    getCurrentUser: () => getMobileAuth()?.currentUser ?? null,
    toUserProfile: firebaseUserProfile,
  });
}

ensureMobileCloudRuntime();

export async function signInWithGoogleIdToken(idToken: string): Promise<FirebaseUser> {
  const auth = getMobileAuth();
  if (!auth) throw new Error("ログインの接続設定がありません。");
  const credential = GoogleAuthProvider.credential(idToken);
  return (await signInWithCredential(auth, credential)).user;
}

export async function signInWithGoogleWebPopup(): Promise<FirebaseUser> {
  const auth = getMobileAuth();
  if (!auth) throw new Error("ログインの接続設定がありません。");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(auth, provider)).user;
}

export function signOutAccount(): Promise<void> {
  const auth = getMobileAuth();
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

export function observeAuth(
  listener: (user: FirebaseUser | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const auth = getMobileAuth();
  if (!auth) {
    listener(null);
    return () => {};
  }
  return onAuthStateChanged(auth, listener, onError);
}

export function mobileAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user": "ログイン画面を閉じました。もう一度お試しください。",
    "auth/cancelled-popup-request": "別のログイン操作が進行中です。",
    "auth/network-request-failed": "接続できませんでした。通信状態を確認してください。",
    "auth/unauthorized-domain": "このURLではまだログインを利用できません。",
  };
  return (
    (code && messages[code]) || userFacingError(error, "ログインできませんでした。もう一度お試しください。")
  );
}
