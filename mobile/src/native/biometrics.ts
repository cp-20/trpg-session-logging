import * as LocalAuthentication from "expo-local-authentication";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";

const BIOMETRIC_LOCK_KEY = "takufu-biometric-lock-v1";

export function isBiometricLockEnabled(): boolean {
  if (Platform.OS === "web") return false;
  try {
    return Storage.getItemSync(BIOMETRIC_LOCK_KEY) === "true";
  } catch {
    return false;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}

export async function authenticateWithBiometrics(): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: "卓譜を開く",
    cancelLabel: "キャンセル",
    fallbackLabel: "パスコードを使う",
  });
  return res.success;
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (enabled) {
    const available = await isBiometricAvailable();
    if (!available) return false;
    const ok = await authenticateWithBiometrics();
    if (!ok) return false;
  }
  Storage.setItemSync(BIOMETRIC_LOCK_KEY, enabled ? "true" : "false");
  return true;
}
