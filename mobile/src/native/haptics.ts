import { AccessibilityInfo, Platform } from "react-native";
import * as Haptics from "expo-haptics";

let reduceMotionCached = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotionCached = v;
  })
  .catch(() => {});

AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) => {
  reduceMotionCached = v;
});

export function isReduceMotionEnabled(): boolean {
  return reduceMotionCached;
}

export function hapticSelection(): void {
  if (Platform.OS === "web" || reduceMotionCached) return;
  void Haptics.selectionAsync().catch(() => {});
}

export function hapticImpact(style: "light" | "medium" = "light"): void {
  if (Platform.OS === "web" || reduceMotionCached) return;
  const feedback =
    style === "medium" ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light;
  void Haptics.impactAsync(feedback).catch(() => {});
}

export function hapticSuccess(): void {
  if (Platform.OS === "web" || reduceMotionCached) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning(): void {
  if (Platform.OS === "web" || reduceMotionCached) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
