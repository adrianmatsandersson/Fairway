import type { ClockFormat } from "./preferences";

export interface ClockInputParts {
  hour: string;
  minute: string;
  period: "AM" | "PM" | "";
}

export interface ClockInputOptions {
  hours: string[];
  showPeriod: boolean;
}

export type ClockInputPart = "hour" | "minute" | "period";

/** Returns the visible hour choices and whether the UI needs an AM/PM select. */
export function getClockInputOptions(clockFormat: ClockFormat): ClockInputOptions {
  return clockFormat === "24h"
    ? {
        hours: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")),
        showPeriod: false,
      }
    : {
        hours: Array.from({ length: 12 }, (_, hour) => String(hour + 1)),
        showPeriod: true,
      };
}

/** Maps the canonical 24-hour HH:mm value to the visible select values. */
export function getClockInputParts(
  value: string,
  clockFormat: ClockFormat,
): ClockInputParts {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour: "", minute: "", period: "" };
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (hour24 > 23 || minute > 59) return { hour: "", minute: "", period: "" };

  return clockFormat === "24h"
    ? { hour: match[1], minute: match[2], period: "" }
    : {
        hour: String(hour24 % 12 || 12),
        minute: match[2],
        period: hour24 < 12 ? "AM" : "PM",
      };
}

/**
 * Updates one visible select value and returns canonical 24-hour HH:mm.
 * Choosing any part of an empty time initializes the other parts to 12:00 AM
 * (or 00:00 in 24-hour mode), keeping the stored value complete and valid.
 */
export function updateClockInputValue(
  currentValue: string,
  clockFormat: ClockFormat,
  part: ClockInputPart,
  value: string,
): string {
  const current = getClockInputParts(currentValue, clockFormat);
  const parts = {
    hour: current.hour || (clockFormat === "12h" ? "12" : "00"),
    minute: current.minute || "00",
    period: current.period === "PM" ? "PM" as const : "AM" as const,
  };

  if (part === "hour") parts.hour = value;
  else if (part === "minute") parts.minute = value;
  else if (value === "AM" || value === "PM") parts.period = value;

  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < (clockFormat === "12h" ? 1 : 0) ||
    hour > (clockFormat === "12h" ? 12 : 23) ||
    minute < 0 ||
    minute > 59
  ) {
    return currentValue;
  }

  const hour24 =
    clockFormat === "24h"
      ? hour
      : (hour % 12) + (parts.period === "PM" ? 12 : 0);
  if (hour24 < 0 || hour24 > 23) return currentValue;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
