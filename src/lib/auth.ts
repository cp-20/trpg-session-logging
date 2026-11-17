import {
  getAuth,
  GoogleAuthProvider,
  TwitterAuthProvider,
  signInWithPopup,
  linkWithPopup,
  unlink,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseApp } from "./firebase";
import type { User } from "../types";

let emulatorConnected = false;

export function getTakufuAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  const auth = getAuth(app);
  if (import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true" && !emulatorConnected) {
    connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    emulatorConnected = true;
  }
  auth.languageCode = "ja";
  return auth;
}

function requireAuth() {
  const auth = getTakufuAuth();
  if (!auth) throw new Error("サインインの接続設定がありません。");
  return auth;
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return (await signInWithPopup(requireAuth(), provider)).user;
}

export async function linkXAccount(): Promise<FirebaseUser> {
  const user = requireAuth().currentUser;
  if (!user || !user.providerData.some((p) => p.providerId === "google.com")) {
    throw new Error("Googleでサインインしてから連携してください。");
  }
  return (await linkWithPopup(user, new TwitterAuthProvider())).user;
}

export async function unlinkXAccount(): Promise<FirebaseUser> {
  const user = requireAuth().currentUser;
  if (!user || !user.providerData.some((p) => p.providerId === "google.com")) {
    throw new Error("Googleのサインイン情報を確認できません。もう一度サインインしてください。");
  }
  return unlink(user, "twitter.com");
}

export function signOutAccount() {
  return signOut(requireAuth());
}

export function observeAuth(listener: (user: FirebaseUser | null) => void, onError?: (error: Error) => void) {
  const auth = getTakufuAuth();
  if (!auth) {
    listener(null);
    return () => {};
  }
  return onAuthStateChanged(auth, listener, onError);
}

/** No access tokens or provider credentials enter application state. */
export function firebaseUserProfile(user: FirebaseUser): User {
  return {
    id: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "プレイヤー",
    email: user.email || undefined,
    image: user.photoURL || undefined,
    color: "#0e7490",
    accounts: user.providerData.flatMap((p) => {
      const provider = p.providerId === "google.com" ? "google" : p.providerId === "twitter.com" ? "x" : null;
      return provider
        ? [{ provider, status: "linked" as const, displayName: p.email || p.displayName || undefined }]
        : [];
    }),
  };
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user": "サインイン画面を閉じました。もう一度お試しください。",
    "auth/cancelled-popup-request": "別のサインイン操作が進行中です。",
    "auth/popup-blocked": "ブラウザでポップアップを許可してから、もう一度お試しください。",
    "auth/unauthorized-domain": "このURLではまだサインインを利用できません。",
    "auth/operation-not-allowed": "この連携は準備中です。しばらくしてからお試しください。",
    "auth/credential-already-in-use": "このアカウントは別の卓譜アカウントに連携されています。",
    "auth/account-exists-with-different-credential":
      "Googleでサインインしてから、設定でアカウントを連携してください。",
    "auth/network-request-failed": "接続できませんでした。通信状態を確認してください。",
    "auth/requires-recent-login": "もう一度Googleでサインインしてからお試しください。",
  };
  return (
    (code && messages[code]) ||
    (error instanceof Error && !code ? error.message : "連携できませんでした。もう一度お試しください。")
  );
}
