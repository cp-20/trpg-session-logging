import { getFirestore, connectFirestoreEmulator, type Firestore } from "firebase/firestore";
import { FIRESTORE_DATABASE_ID, getFirebaseApp } from "./firebase";

let fs: Firestore | null = null;

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
