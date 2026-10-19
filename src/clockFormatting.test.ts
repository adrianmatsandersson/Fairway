import { describe, expect, it } from "vitest";
import { formatForecastDateTime, formatForecastHour } from "./clockFormatting";

describe("forecast clock formatting", () => {
  it("formats hourly labels in 24-hour and 12-hour styles", () => {
    expect(formatForecastHour("2025-01-01T00:00", "24h")).toBe("00:00");
    expect(formatForecastHour("2025-01-01T13:00", "24h")).toBe("13:00");
    expect(formatForecastHour("2025-01-01T00:00", "12h")).toBe("12 AM");
    expect(formatForecastHour("2025-01-01T13:00", "12h")).toBe("1 PM");
  });

  it("formats the current course-local date and time in the selected clock style", () => {
    expect(formatForecastDateTime("2025-01-01T13:05", "24h")).toContain("13:05");
    expect(formatForecastDateTime("2025-01-01T13:05", "12h")).toContain("1:05 PM");
    expect(formatForecastDateTime("invalid", "12h")).toBe("invalid");
  });
});
