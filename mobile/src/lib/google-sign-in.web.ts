/* Web の Google ログインは Firebase のポップアップで完結する。iOS / Android は google-sign-in.ts */
import { isFirebaseConfigured, signInWithGoogleWebPopup } from "./firebase-mobile";

export const isGoogleSignInAvailable = isFirebaseConfigured;

export async function signInWithGoogle(): Promise<boolean> {
  await signInWithGoogleWebPopup();
  return true;
}

export async function signOutOfGoogle(): Promise<void> {}
