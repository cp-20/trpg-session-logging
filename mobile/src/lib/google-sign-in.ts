/*
 * Google ログイン（iOS / Android）。
 * 端末のアカウント選択から ID トークンを受け取り、Firebase Auth に渡す。
 * ブラウザを経由しないので、OAuth のリダイレクト先（カスタム URI スキーム）を使わない。
 * Web は google-sign-in.web.ts（Firebase のポップアップ）を使う。
 */
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { googleAuthClientIds, signInWithGoogleIdToken } from "./firebase-mobile";

export const isGoogleSignInAvailable = Boolean(googleAuthClientIds.webClientId);

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
    /* ID トークンの宛先。Firebase Auth はウェブ クライアント宛てのトークンを受け付ける */
    webClientId: googleAuthClientIds.webClientId,
    iosClientId: googleAuthClientIds.iosClientId || undefined,
  });
  configured = true;
}

/** ログインできたら true、利用者が閉じたら false を返す */
export async function signInWithGoogle(): Promise<boolean> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return false;
    const idToken = response.data.idToken;
    if (!idToken) throw new Error("Google から ID トークンを受け取れませんでした。");
    await signInWithGoogleIdToken(idToken);
    return true;
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) return false;
    throw error;
  }
}

/** 次回のログインで別のアカウントを選べるように、端末側の Google のログイン状態も消す */
export async function signOutOfGoogle(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut().catch(() => undefined);
}
