import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";

/**
 * Firebase 接続。
 * - 設定は .env.local(NEXT_PUBLIC_FIREBASE_*)から読む。未設定なら null を返し、
 *   アプリはモック(localStorage)運用で動き続ける。
 * - ログ本文は名前付きデータベース `takufu`(NEXT_PUBLIC_FIREBASE_DATABASE_ID)に分離する。
 *   (default) DB を作らない運用のため、Firestore 呼び出しは必ず DB ID を明示する。
 */

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

export const FIRESTORE_DATABASE_ID = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "takufu";

/** Firebase が設定されているか(Settings の状態表示にも使う) */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp | null = null;
let fs: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

/** takufu 用の Firestore(名前付き DB)。未設定なら null */
export function getTakufuFirestore(): Firestore | null {
  const a = getFirebaseApp();
  if (!a) return null;
  if (!fs) {
    fs = getFirestore(a, FIRESTORE_DATABASE_ID);
    if (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === "true")
      connectFirestoreEmulator(
        fs,
        process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1",
        Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080),
      );
  }
  return fs;
}

/** 状態表示用の要約 */
export function firebaseStatus(): { configured: boolean; projectId: string; databaseId: string } {
  return {
    configured: isFirebaseConfigured,
    projectId: firebaseConfig.projectId,
    databaseId: FIRESTORE_DATABASE_ID,
  };
}
