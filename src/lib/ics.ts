/** RFC 5545 iCalendar (.ics) 生成および Google カレンダー URL ヘルパー */

import { JST_OFFSET, download, jstEpoch } from "./format";

export interface IcsEventInput {
  uid: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  description?: string;
}

export interface GoogleCalendarEventInput {
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  details?: string;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatUtcStamp(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return (
    String(d.getUTCFullYear()).padStart(4, "0") +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0") +
    "Z"
  );
}

function formatJstLocal(tsSec: number): string {
  const d = new Date((tsSec + JST_OFFSET) * 1000);
  return (
    String(d.getUTCFullYear()).padStart(4, "0") +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") +
    "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") +
    String(d.getUTCSeconds()).padStart(2, "0")
  );
}

function resolveRangeEpoch(date: string, startTime: string, endTime: string): { start: number; end: number } {
  const start = jstEpoch(date, startTime);
  let end = jstEpoch(date, endTime);
  if (end <= start) {
    end += 24 * 3600;
  }
  return { start, end };
}

/** RFC 5545 準拠の VCALENDAR 文字列を生成する（CRLF 改行・エスケープ済み） */
export function buildIcsCalendar(events: IcsEventInput[], calendarName = "卓譜 卓予定"): string {
  const nowStamp = formatUtcStamp(Math.floor(Date.now() / 1000));
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Takufu//TRPG Session Calendar//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const ev of events) {
    const { start, end } = resolveRangeEpoch(ev.date, ev.startTime, ev.endTime);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeIcsText(ev.uid)}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;TZID=Asia/Tokyo:${formatJstLocal(start)}`);
    lines.push(`DTEND;TZID=Asia/Tokyo:${formatJstLocal(end)}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(ev.description)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function icsDataUrl(icsText: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText)}`;
}

export function downloadIcs(filename: string, icsText: string): void {
  download(filename, icsText, "text/calendar;charset=utf-8");
}

export function googleCalendarUrl(ev: GoogleCalendarEventInput): string {
  const { start, end } = resolveRangeEpoch(ev.date, ev.startTime, ev.endTime);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${formatUtcStamp(start)}/${formatUtcStamp(end)}`,
  });
  if (ev.details) {
    params.set("details", ev.details);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
