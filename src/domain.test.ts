import { describe, expect, it } from "vitest";
import { distanceKm } from "./domain";
import {
  formatDeviceLocalDateTime,
  formatLocalDateTime,
  localDateTimeToInstant,
  validateLocalDateTime,
} from "./forecastTime";

describe("distanceKm", () => {
  it("returns zero for the same coordinates", () => {
    expect(distanceKm(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  describe("device-local forecast time", () => {
    it("formats the device-local date and time in canonical minute precision", () => {
      const date = new Date(0);
      date.setFullYear(2025, 0, 1);
      date.setHours(3, 7, 42, 500);
      const pad = (value: number) => String(value).padStart(2, "0");

      expect(formatDeviceLocalDateTime(date)).toBe(
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
      );
    });

    it("formats an instant in a course timezone without changing the instant", () => {
      expect(formatLocalDateTime(new Date("2025-01-01T12:00:00.000Z"), "America/Los_Angeles"))
        .toBe("2025-01-01T04:00");
    });

    it("converts a local input to an instant without parsing it as host-independent text", () => {
      const expected = new Date(0);
      expected.setFullYear(2099, 5, 10);
      expected.setHours(12, 34, 0, 0);
      expect(localDateTimeToInstant("2099-06-10T12:34")).toBe(expected.toISOString());
    });

    it("rejects times before the current minute and accepts the current minute", () => {
      const now = new Date(0);
      now.setFullYear(2025, 0, 1);
      now.setHours(12, 30, 45, 0);
      expect(validateLocalDateTime("2025-01-01T12:29", now).error).toContain("current or in the future");
      expect(validateLocalDateTime("2025-01-01T12:30", now).error).toBeUndefined();
    });

    it("rejects malformed and calendar-invalid local date/time values", () => {
      expect(localDateTimeToInstant("2025-02-30T12:00")).toBeUndefined();
      expect(localDateTimeToInstant("2025-01-01")).toBeUndefined();
    });
  });

  it("calculates great-circle distance in kilometers", () => {
    // Roughly 111 km per degree of latitude.
    expect(distanceKm(0, 0, 1, 0)).toBeCloseTo(111.2, 0);
  });

  it("handles longitude across the international date line", () => {
    expect(distanceKm(0, 179.5, 0, -179.5)).toBeCloseTo(111.2, 0);
  });
});
