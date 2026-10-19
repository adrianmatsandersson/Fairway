import type { ClockFormat } from "./preferences";

function formatClockTime(hour: number, minute: number, clockFormat: ClockFormat): string {
  if (clockFormat === "24h") {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const suffix = hour < 12 ? "AM" : "PM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatForecastHour(value: string, clockFormat: ClockFormat): string {
  const match = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return clockFormat === "24h"
    ? formatClockTime(hour, 0, clockFormat)
    : `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatForecastDateTime(value: string, clockFormat: ClockFormat): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
  ].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  ) {
    return value;
  }
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return `${dateLabel} · ${formatClockTime(hour, minute, clockFormat)}`;
}
