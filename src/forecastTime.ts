const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const isoInstantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Formats an instant as an HTML datetime-local value in the requested timezone. */
export function formatLocalDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

/** Formats a date in the device's local timezone at the input's minute precision. */
export function formatDeviceLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Minute-precision local inputs are current for the whole displayed minute. */
export function isInstantBeforeCurrentMinute(
  instantEpoch: number,
  nowEpoch = Date.now(),
): boolean {
  return Math.floor(instantEpoch / 60_000) < Math.floor(nowEpoch / 60_000);
}

/**
 * Converts a device-local datetime input to an ISO instant without parsing a
 * timezone-free string. Date setters apply the browser's local timezone; the
 * round-trip rejects calendar normalization and nonexistent DST-gap times.
 */
export function localDateTimeToInstant(value: string): string | undefined {
  const match = localDateTimePattern.exec(value);
  if (!match) return undefined;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return undefined;

  // Starting from a known local date and using setFullYear avoids Date's
  // special 1900 offset for constructor years 0–99.
  const local = new Date(0);
  local.setFullYear(year, month - 1, day);
  local.setHours(hour, minute, 0, 0);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    return undefined;
  }
  return local.toISOString();
}

export function validateLocalDateTime(
  value: string,
  now = new Date(),
): { instant?: string; error?: string } {
  const validation = validateLocalDateTimeFormat(value);
  if (validation.error || !validation.instant) return validation;
  if (isInstantBeforeCurrentMinute(Date.parse(validation.instant), now.getTime())) {
    return { error: "Choose a date and time that is current or in the future." };
  }
  return validation;
}

/** Validates local input syntax, calendar validity, and DST gaps without checking staleness. */
export function validateLocalDateTimeFormat(
  value: string,
): { instant?: string; error?: string } {
  if (!value) return {};
  const instant = localDateTimeToInstant(value);
  if (!instant) {
    return {
      error: validLocalDateTimeShape(value)
        ? "That local time does not exist because of a daylight-saving clock change."
        : "Enter a valid date and time.",
    };
  }
  return { instant };
}

/** Validates the minute-precision HTML datetime-local shape and calendar date. */
export function validLocalDateTimeShape(value: string): boolean {
  const match = localDateTimePattern.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (hour > 23 || minute > 59) return false;
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(0, 0, 0, 0);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Returns a valid epoch for an ISO instant (not a timezone-free local value). */
export function parseIsoInstant(value: string): number | undefined {
  if (!isoInstantPattern.test(value)) return undefined;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return undefined;
  const canonical = value.replace(
    /\.(\d{1,3})Z$|Z$/,
    (_match, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  if (new Date(epoch).toISOString() !== canonical) return undefined;
  return epoch;
}
