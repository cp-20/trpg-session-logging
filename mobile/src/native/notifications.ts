import * as Notifications from "expo-notifications";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { jstEpoch } from "@shared/lib/format";
import { addDays, myScheduleView } from "@shared/lib/schedule";
import { todayStr } from "@shared/lib/time";
import type { State } from "@shared/types";

const REMINDERS_ENABLED_KEY = "takufu-reminders-enabled-v1";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function areRemindersEnabled(): boolean {
  try {
    return Storage.getItemSync(REMINDERS_ENABLED_KEY) === "true";
  } catch {
    return false;
  }
}

export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (enabled) {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return false;
  } else {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }
  Storage.setItemSync(REMINDERS_ENABLED_KEY, enabled ? "true" : "false");
  return true;
}

/**
 * 確定した予定（開始1時間前）と、終了翌朝（未記録セッションのリマインド）を再登録する。
 */
export async function rescheduleSessionNotifications(state: State): Promise<void> {
  if (Platform.OS === "web" || !areRemindersEnabled()) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const nowMs = Date.now();
  const { upcoming } = myScheduleView(state, todayStr());

  for (const ev of upcoming.slice(0, 12)) {
    const startMs = jstEpoch(ev.date, ev.startTime) * 1000;
    const beforeMs = startMs - 60 * 60 * 1000;
    const tb = ev.tableId ? state.tables[ev.tableId] : undefined;

    if (beforeMs > nowMs + 10_000) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `まもなくセッション（${ev.startTime}〜）`,
          body: tb ? `${tb.name} · ${ev.title}` : ev.title,
          data: { url: "/calendar" },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(beforeMs),
        },
      });
    }

    const nextDay = addDays(ev.date, 1);
    const morningMs = jstEpoch(nextDay, "10:00") * 1000;
    if (morningMs > nowMs + 10_000) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "セッションの記録を残す",
          body: `昨日の「${ev.title}」のログを取り込みます。`,
          data: {
            url: `/upload?table=${ev.tableId ?? ""}&scenario=${ev.scenarioId ?? ""}`,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(morningMs),
        },
      });
    }
  }
}
