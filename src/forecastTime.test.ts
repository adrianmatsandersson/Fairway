import { describe, expect, it } from "vitest";
import {
  formatDeviceLocalDateTime,
  validateLocalDateTime,
  validateLocalDateTimeFormat,
} from "./forecastTime";

describe("local tee-time validation", () => {
  it("accepts Now at the current displayed minute", () => {
    const now = new Date("2026-10-19T08:57:45.000Z");
    const selected = formatDeviceLocalDateTime(now);

    expect(validateLocalDateTime(selected, now)).toEqual({
      instant: expect.any(String),
    });
  });

  it("rejects a past tee time when the date or time selection is validated", () => {
    expect(
      validateLocalDateTime("2020-06-10T12:30", new Date("2026-10-19T10:00:00.000Z")),
    ).toEqual({ error: "Choose a date and time that is current or in the future." });
  });

  it("accepts a previously valid instant at delayed submission without rechecking staleness", () => {
    const selectedAt = new Date("2020-06-10T10:29:45.000Z");
    const selectedValue = formatDeviceLocalDateTime(selectedAt);
    expect(validateLocalDateTime(selectedValue, selectedAt).instant).toBeDefined();

    const delayedSubmission = validateLocalDateTimeFormat(selectedValue);
    expect(delayedSubmission.error).toBeUndefined();
    expect(delayedSubmission.instant).toBeDefined();
  });

  it("still rejects malformed and invalid calendar values", () => {
    expect(validateLocalDateTimeFormat("not-a-dateT12:30").error).toBe("Enter a valid date and time.");
    expect(validateLocalDateTimeFormat("2026-02-30T12:30").error).toBe("Enter a valid date and time.");
  });
});
