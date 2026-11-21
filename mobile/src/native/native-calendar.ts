import * as Calendar from "expo-calendar";
import Storage from "expo-sqlite/kv-store";
import { Platform } from "react-native";
import { jstEpoch } from "@shared/lib/format";
import type { State, TableEvent } from "@shared/types";

const CALENDAR_ID_KEY = "takufu-device-calendar-id";
const SYNCED_EVENT_MAP_KEY = "takufu-device-calendar-events-v1";

export interface DeviceBusySummary {
  /** YYYY-MM-DD ごとに重複のある時間帯または終日予定タイトル */
  busyDates: Set<string>;
  /** YYYY-MM-DD ごとの時間帯（epoch 秒） */
  rangesByDate: Map<string, { startSec: number; endSec: number; title: string }[]>;
}

function toYmdJst(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

/**
 * 端末カレンダーに読み書きの権限があるか確認し、なければ要求する。
 */
export async function ensureCalendarPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Calendar.getCalendarPermissions(false);
  if (current.granted) return true;
  const next = await Calendar.requestCalendarPermissions(false);
  return next.granted;
}

/**
 * 指定日（YYYY-MM-DD）一覧の端末カレンダー予定を取得し、候補日の重複判定に使う。
 */
export async function fetchDeviceBusyDates(dates: readonly string[]): Promise<DeviceBusySummary | null> {
  if (Platform.OS === "web" || dates.length === 0) return null;
  const perm = await Calendar.getCalendarPermissions(false);
  if (!perm.granted) return null;

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const readable = calendars.filter((c) => c.title !== "卓譜");
  if (readable.length === 0) {
    return { busyDates: new Set(), rangesByDate: new Map() };
  }

  const sorted = [...dates].sort();
  const start = new Date(`${sorted[0]!}T00:00:00+09:00`);
  const end = new Date(`${sorted[sorted.length - 1]!}T23:59:59+09:00`);
  const events = await Calendar.listEvents(readable, start, end);

  const busyDates = new Set<string>();
  const rangesByDate = new Map<string, { startSec: number; endSec: number; title: string }[]>();

  for (const ev of events) {
    const sDate = new Date(ev.startDate);
    const eDate = new Date(ev.endDate);
    if (Number.isNaN(sDate.getTime()) || Number.isNaN(eDate.getTime())) continue;
    const dayKey = toYmdJst(sDate);
    busyDates.add(dayKey);
    const arr = rangesByDate.get(dayKey) ?? [];
    arr.push({
      startSec: Math.floor(sDate.getTime() / 1000),
      endSec: Math.floor(eDate.getTime() / 1000),
      title: ev.title || "予定あり",
    });
    rangesByDate.set(dayKey, arr);
  }
  return { busyDates, rangesByDate };
}

/** 候補日の時間帯（date, startTime, endTime）が端末カレンダー予定と重なるか判定する */
export function hasTimeConflictWithDevice(
  summary: DeviceBusySummary | null,
  date: string,
  startTime: string,
  endTime: string,
): boolean {
  if (!summary) return false;
  const ranges = summary.rangesByDate.get(date);
  if (!ranges || ranges.length === 0) return summary.busyDates.has(date);
  const startSec = jstEpoch(date, startTime);
  let endSec = jstEpoch(date, endTime);
  if (endSec <= startSec) endSec += 24 * 3600;
  return ranges.some((r) => r.startSec < endSec && r.endSec > startSec);
}

async function resolveTakufuDeviceCalendar(): Promise<Calendar.ExpoCalendar> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const savedId = Storage.getItemSync(CALENDAR_ID_KEY);
  const existing =
    calendars.find((c) => c.id === savedId && c.allowsModifications) ??
    calendars.find((c) => c.title === "卓譜" && c.allowsModifications);
  if (existing) {
    Storage.setItemSync(CALENDAR_ID_KEY, existing.id);
    return existing;
  }

  let source: Calendar.Source | undefined;
  if (Platform.OS === "ios") {
    try {
      const def = Calendar.getDefaultCalendarSync();
      source = def.source;
    } catch {
      const sources = Calendar.getSourcesSync();
      source =
        sources.find((s) => s.type === Calendar.SourceType.CALDAV) ??
        sources.find((s) => s.type === Calendar.SourceType.LOCAL) ??
        sources[0];
    }
  } else {
    const primary = calendars.find((c) => c.isPrimary && c.allowsModifications) ?? calendars[0];
    source = primary?.source ?? {
      isLocalAccount: true,
      name: "卓譜",
      type: Calendar.SourceType.LOCAL,
    };
  }

  const created = await Calendar.createCalendar({
    title: "卓譜",
    name: "卓譜",
    color: "#b84724",
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source?.id,
    source,
    ownerAccount: source?.name ?? "takufu",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    isVisible: true,
    isSynced: true,
    timeZone: "Asia/Tokyo",
  });
  Storage.setItemSync(CALENDAR_ID_KEY, created.id);
  return created;
}

/**
 * 確定した卓譜の予定を端末のOSカレンダーへ直接書き込む。
 * すでに書き込んだ予定は二重登録しない。
 */
export async function syncConfirmedEventsToDeviceCalendar(
  events: readonly TableEvent[],
  state: Pick<State, "tables" | "scenarios">,
): Promise<{ added: number; total: number }> {
  const granted = await ensureCalendarPermission();
  if (!granted) {
    throw new Error("端末のカレンダーへのアクセス許可が必要です。");
  }
  const cal = await resolveTakufuDeviceCalendar();

  let syncedMap: Record<string, string> = {};
  try {
    const raw = Storage.getItemSync(SYNCED_EVENT_MAP_KEY);
    if (raw) syncedMap = JSON.parse(raw) as Record<string, string>;
  } catch {
    syncedMap = {};
  }

  const confirmed = events.filter((e) => e.status !== "poll");
  let added = 0;

  for (const ev of confirmed) {
    const sig = `${ev.date}|${ev.startTime}|${ev.endTime}|${ev.title}`;
    if (syncedMap[ev.id] === sig) continue;

    const startEpoch = jstEpoch(ev.date, ev.startTime);
    let endEpoch = jstEpoch(ev.date, ev.endTime);
    if (endEpoch <= startEpoch) endEpoch += 24 * 3600;

    const tb = ev.tableId ? state.tables[ev.tableId] : undefined;
    const sc = ev.scenarioId ? state.scenarios[ev.scenarioId] : undefined;
    const title = tb ? `[${tb.name}] ${ev.title}` : ev.title;
    const notes = [sc ? `シナリオ: ${sc.title}` : "", ev.note ?? ""].filter(Boolean).join("\n");

    await cal.createEvent({
      title,
      startDate: new Date(startEpoch * 1000),
      endDate: new Date(endEpoch * 1000),
      timeZone: "Asia/Tokyo",
      notes,
      alarms: [{ relativeOffset: -60 }],
    });
    syncedMap[ev.id] = sig;
    added++;
  }

  Storage.setItemSync(SYNCED_EVENT_MAP_KEY, JSON.stringify(syncedMap));
  return { added, total: confirmed.length };
}
