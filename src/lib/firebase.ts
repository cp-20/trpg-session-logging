import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase 接続。
 * - 設定は .env.local(VITE_FIREBASE_*)から読む。未設定なら null を返し、
 *   アプリはモック(localStorage)運用で動き続ける。
 * - ログ本文は名前付きデータベース `takufu`(VITE_FIREBASE_DATABASE_ID)に分離する。
 *   (default) DB を作らない運用のため、Firestore 呼び出しは必ず DB ID を明示する。
 */

const env = import.meta.env as Record<string, string | undefined>;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? "",
};

export const FIRESTORE_DATABASE_ID = env.VITE_FIREBASE_DATABASE_ID || "takufu";

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
  if (!fs) fs = getFirestore(a, FIRESTORE_DATABASE_ID);
  return fs;
}

/** 状態表示用の要約 */
export function firebaseStatus(): { configured: boolean; projectId: string; databaseId: string } {
  return { configured: isFirebaseConfigured, projectId: firebaseConfig.projectId, databaseId: FIRESTORE_DATABASE_ID };
}
